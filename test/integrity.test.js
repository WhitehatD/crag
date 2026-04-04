'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { computeHash, normalizeForHash, readFrontmatter, writeFrontmatter, isModified, yamlScalar } = require('../src/update/integrity');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n  integrity.js');

// --- computeHash ---

test('computeHash is deterministic', () => {
  assert.strictEqual(computeHash('hello'), computeHash('hello'));
});

test('computeHash produces different output for different input', () => {
  assert.notStrictEqual(computeHash('a'), computeHash('b'));
});

test('computeHash normalizes CRLF to LF', () => {
  const lf = 'line1\nline2\n';
  const crlf = 'line1\r\nline2\r\n';
  assert.strictEqual(computeHash(lf), computeHash(crlf));
});

test('normalizeForHash preserves LF-only content', () => {
  assert.strictEqual(normalizeForHash('a\nb\n'), 'a\nb\n');
});

test('normalizeForHash handles empty string', () => {
  assert.strictEqual(normalizeForHash(''), '');
});

// --- yamlScalar ---

test('yamlScalar leaves simple strings bare', () => {
  assert.strictEqual(yamlScalar('simple'), 'simple');
  assert.strictEqual(yamlScalar('with-dashes'), 'with-dashes');
  assert.strictEqual(yamlScalar('abc123'), 'abc123');
});

test('yamlScalar quotes strings with colons', () => {
  assert.strictEqual(yamlScalar('key: value'), '"key: value"');
});

test('yamlScalar quotes strings with special chars', () => {
  assert.ok(yamlScalar('has#hash').startsWith('"'));
  assert.ok(yamlScalar('has|pipe').startsWith('"'));
  assert.ok(yamlScalar('has*star').startsWith('"'));
});

test('yamlScalar quotes YAML boolean-like values', () => {
  assert.strictEqual(yamlScalar('yes'), '"yes"');
  assert.strictEqual(yamlScalar('true'), '"true"');
  assert.strictEqual(yamlScalar('null'), '"null"');
  assert.strictEqual(yamlScalar('no'), '"no"');
});

test('yamlScalar quotes number-like strings', () => {
  assert.strictEqual(yamlScalar('42'), '"42"');
  assert.strictEqual(yamlScalar('3.14'), '"3.14"');
});

test('yamlScalar uses block scalar for multi-line values', () => {
  const result = yamlScalar('line1\nline2');
  assert.ok(result.startsWith('|\n'));
  assert.ok(result.includes('  line1'));
  assert.ok(result.includes('  line2'));
});

test('yamlScalar escapes backslash and quote', () => {
  assert.strictEqual(yamlScalar('a\\b"c'), '"a\\\\b\\"c"');
});

// --- readFrontmatter / writeFrontmatter round-trip ---

test('readFrontmatter parses version and hash', () => {
  const tmp = path.join(os.tmpdir(), `crag-test-${Date.now()}.md`);
  fs.writeFileSync(tmp, '---\nname: test\nversion: 1.2.3\nsource_hash: abc123\n---\n\nBody content\n');
  try {
    const fm = readFrontmatter(tmp);
    assert.strictEqual(fm.version, '1.2.3');
    assert.strictEqual(fm.source_hash, 'abc123');
    assert.strictEqual(fm.name, 'test');
    assert.ok(fm.body.includes('Body content'));
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('readFrontmatter returns null for missing file', () => {
  assert.strictEqual(readFrontmatter('/nonexistent/path/xyz.md'), null);
});

test('readFrontmatter handles file without frontmatter', () => {
  const tmp = path.join(os.tmpdir(), `crag-test-nofm-${Date.now()}.md`);
  fs.writeFileSync(tmp, 'Just plain markdown\n');
  try {
    const fm = readFrontmatter(tmp);
    assert.strictEqual(fm.version, null);
    assert.strictEqual(fm.source_hash, null);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('writeFrontmatter updates existing fields', () => {
  const tmp = path.join(os.tmpdir(), `crag-test-wfm-${Date.now()}.md`);
  fs.writeFileSync(tmp, '---\nname: test\nversion: 0.1.0\n---\nBody\n');
  try {
    writeFrontmatter(tmp, { version: '0.2.0' });
    const fm = readFrontmatter(tmp);
    assert.strictEqual(fm.version, '0.2.0');
    assert.ok(fm.body.includes('Body'));
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('writeFrontmatter adds new fields', () => {
  const tmp = path.join(os.tmpdir(), `crag-test-wfm-add-${Date.now()}.md`);
  fs.writeFileSync(tmp, '---\nname: test\n---\nBody\n');
  try {
    writeFrontmatter(tmp, { version: '0.1.0', source_hash: 'deadbeef' });
    const fm = readFrontmatter(tmp);
    assert.strictEqual(fm.version, '0.1.0');
    assert.strictEqual(fm.source_hash, 'deadbeef');
  } finally {
    fs.unlinkSync(tmp);
  }
});

// --- isModified ---

test('isModified returns true when hash is missing (conservative)', () => {
  const tmp = path.join(os.tmpdir(), `crag-test-nohash-${Date.now()}.md`);
  fs.writeFileSync(tmp, '---\nname: test\nversion: 0.1.0\n---\nBody\n');
  try {
    assert.strictEqual(isModified(tmp), true);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('isModified returns false when hash matches body', () => {
  const tmp = path.join(os.tmpdir(), `crag-test-hmatch-${Date.now()}.md`);
  // The body as readFrontmatter parses it: everything after '---\n'
  const body = 'Body content\n';
  const hash = computeHash(body);
  fs.writeFileSync(tmp, `---\nname: test\nsource_hash: ${hash}\n---\n${body}`);
  try {
    assert.strictEqual(isModified(tmp), false);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('isModified returns true when body was changed', () => {
  const tmp = path.join(os.tmpdir(), `crag-test-hdiff-${Date.now()}.md`);
  const origBody = 'Original\n';
  const origHash = computeHash(origBody);
  fs.writeFileSync(tmp, `---\nname: test\nsource_hash: ${origHash}\n---\nModified body\n`);
  try {
    assert.strictEqual(isModified(tmp), true);
  } finally {
    fs.unlinkSync(tmp);
  }
});

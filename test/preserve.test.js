'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { preserveCustomSections, MD_START, MD_END, COMMENT_START, COMMENT_END } = require('../src/compile/preserve');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-preserve-'));
  const file = path.join(dir, 'test.md');
  if (content !== undefined) fs.writeFileSync(file, content);
  return { file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

console.log('\n  compile/preserve.js');

// --- Marker constants ---

test('exports marker constants', () => {
  assert.strictEqual(MD_START, '<!-- crag:auto-start -->');
  assert.strictEqual(MD_END, '<!-- crag:auto-end -->');
  assert.strictEqual(COMMENT_START, '# crag:auto-start');
  assert.strictEqual(COMMENT_END, '# crag:auto-end');
});

// --- New file (no existing file) ---

test('new file: wraps content in markdown markers', () => {
  const { file, cleanup } = tmpFile();
  try {
    const result = preserveCustomSections(file, 'generated content', 'markdown');
    assert.ok(result.startsWith(MD_START));
    assert.ok(result.includes('generated content'));
    assert.ok(result.includes(MD_END));
  } finally { cleanup(); }
});

test('new file: wraps content in comment markers', () => {
  const { file, cleanup } = tmpFile();
  try {
    const result = preserveCustomSections(file, 'generated content', 'comment');
    assert.ok(result.startsWith(COMMENT_START));
    assert.ok(result.includes('generated content'));
    assert.ok(result.includes(COMMENT_END));
  } finally { cleanup(); }
});

// --- Existing file without markers ---

test('existing file without markers: returns new wrapped content', () => {
  const { file, cleanup } = tmpFile('hand-written content\n');
  try {
    const result = preserveCustomSections(file, 'new generated', 'markdown');
    assert.ok(result.includes(MD_START));
    assert.ok(result.includes('new generated'));
    assert.ok(result.includes(MD_END));
    // Does NOT include the old hand-written content (legacy file, no markers)
    assert.ok(!result.includes('hand-written content'));
  } finally { cleanup(); }
});

// --- Existing file with markers: preserves user sections ---

test('preserves content BEFORE auto markers', () => {
  const existing = `# My custom header\nSome user notes\n${MD_START}\nold generated\n${MD_END}\n`;
  const { file, cleanup } = tmpFile(existing);
  try {
    const result = preserveCustomSections(file, 'new generated', 'markdown');
    assert.ok(result.includes('# My custom header'));
    assert.ok(result.includes('Some user notes'));
    assert.ok(result.includes('new generated'));
    assert.ok(!result.includes('old generated'));
  } finally { cleanup(); }
});

test('preserves content AFTER auto markers', () => {
  const existing = `${MD_START}\nold generated\n${MD_END}\n\n# User footer\nCustom rules\n`;
  const { file, cleanup } = tmpFile(existing);
  try {
    const result = preserveCustomSections(file, 'new generated', 'markdown');
    assert.ok(result.includes('# User footer'));
    assert.ok(result.includes('Custom rules'));
    assert.ok(result.includes('new generated'));
    assert.ok(!result.includes('old generated'));
  } finally { cleanup(); }
});

test('preserves content BEFORE and AFTER auto markers', () => {
  const existing = `# Header\n${MD_START}\nold\n${MD_END}\n# Footer\n`;
  const { file, cleanup } = tmpFile(existing);
  try {
    const result = preserveCustomSections(file, 'new', 'markdown');
    assert.ok(result.includes('# Header'));
    assert.ok(result.includes('# Footer'));
    assert.ok(result.includes('new'));
    assert.ok(!result.includes('\nold\n'));
  } finally { cleanup(); }
});

// --- Comment style markers ---

test('comment style: preserves user sections around comment markers', () => {
  const existing = `# User preamble\n${COMMENT_START}\nold script\n${COMMENT_END}\n# User postamble\n`;
  const { file, cleanup } = tmpFile(existing);
  try {
    const result = preserveCustomSections(file, 'new script', 'comment');
    assert.ok(result.includes('# User preamble'));
    assert.ok(result.includes('# User postamble'));
    assert.ok(result.includes('new script'));
    assert.ok(!result.includes('old script'));
  } finally { cleanup(); }
});

// --- Edge case: directory at path ---

test('directory at path: returns wrapped content without error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-preserve-dir-'));
  const target = path.join(dir, 'subdir');
  fs.mkdirSync(target);
  try {
    const result = preserveCustomSections(target, 'content', 'markdown');
    assert.ok(result.includes(MD_START));
    assert.ok(result.includes('content'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- Edge case: only start marker, no end marker ---

test('only start marker present: returns new wrapped content (legacy)', () => {
  const existing = `${MD_START}\nincomplete\n`;
  const { file, cleanup } = tmpFile(existing);
  try {
    const result = preserveCustomSections(file, 'fresh', 'markdown');
    assert.ok(result.includes(MD_START));
    assert.ok(result.includes('fresh'));
    assert.ok(result.includes(MD_END));
  } finally { cleanup(); }
});

// --- Idempotency ---

test('double-apply produces same result', () => {
  const { file, cleanup } = tmpFile();
  try {
    const first = preserveCustomSections(file, 'content', 'markdown');
    fs.writeFileSync(file, first);
    const second = preserveCustomSections(file, 'content', 'markdown');
    assert.strictEqual(first, second);
  } finally { cleanup(); }
});

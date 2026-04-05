'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mineDocGates, isGateCandidate } = require('../src/analyze/doc-mining');

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

function mkFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-doc-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

console.log('\n  analyze/doc-mining.js');

test('isGateCandidate: accepts known gate commands', () => {
  assert.ok(isGateCandidate('make test'));
  assert.ok(isGateCandidate('cargo test'));
  assert.ok(isGateCandidate('bundle exec rspec'));
  assert.ok(isGateCandidate('composer test'));
  assert.ok(isGateCandidate('mix test'));
  assert.ok(isGateCandidate('./gradlew test'));
  assert.ok(isGateCandidate('uv run pytest'));
});

test('isGateCandidate: rejects non-commands', () => {
  assert.ok(!isGateCandidate('random text'));
  assert.ok(!isGateCandidate('install'));
  assert.ok(!isGateCandidate(''));
  assert.ok(!isGateCandidate('a '.repeat(100)));
});

test('mineDocGates: extracts from CONTRIBUTING.md code fence', () => {
  const dir = mkFixture({
    'CONTRIBUTING.md': `# Contributing

Before submitting a PR, run:

\`\`\`bash
make test
make lint
\`\`\`

Done.`,
  });
  const gates = mineDocGates(dir);
  const cmds = gates.map(g => g.command);
  assert.ok(cmds.includes('make test'));
  assert.ok(cmds.includes('make lint'));
});

test('mineDocGates: extracts from inline backticks', () => {
  const dir = mkFixture({
    'CONTRIBUTING.md': `Run \`cargo test\` and \`cargo clippy -- -D warnings\` before pushing.`,
  });
  const gates = mineDocGates(dir);
  const cmds = gates.map(g => g.command);
  assert.ok(cmds.includes('cargo test'));
  assert.ok(cmds.includes('cargo clippy -- -D warnings'));
});

test('mineDocGates: strips shell prompts', () => {
  const dir = mkFixture({
    'CONTRIBUTING.md': '```\n$ npm test\n```',
  });
  const gates = mineDocGates(dir);
  assert.ok(gates.some(g => g.command === 'npm test'));
});

test('mineDocGates: includes source file', () => {
  const dir = mkFixture({
    'CONTRIBUTING.md': '```\nmake test\n```',
  });
  const gates = mineDocGates(dir);
  assert.strictEqual(gates[0].source, 'CONTRIBUTING.md');
});

test('mineDocGates: dedupes across files', () => {
  const dir = mkFixture({
    'CONTRIBUTING.md': '```\nmake test\n```',
    '.github/PULL_REQUEST_TEMPLATE.md': '```\nmake test\n```',
  });
  const gates = mineDocGates(dir);
  const testGates = gates.filter(g => g.command === 'make test');
  assert.strictEqual(testGates.length, 1);
});

test('mineDocGates: ignores non-command text in backticks', () => {
  const dir = mkFixture({
    'CONTRIBUTING.md': 'The `foo` function does `bar`.',
  });
  const gates = mineDocGates(dir);
  assert.strictEqual(gates.length, 0);
});

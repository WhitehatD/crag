'use strict';

const assert = require('assert');
const { extractRunCommands, isGateCommand } = require('../src/governance/yaml-run');

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

console.log('\n  governance/yaml-run.js');

// --- extractRunCommands ---

test('inline run step', () => {
  const yaml = `
jobs:
  test:
    steps:
      - run: npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test']);
});

test('block scalar literal (run: |)', () => {
  const yaml = `
      - run: |
          npm test
          npm run build
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test', 'npm run build']);
});

test('block scalar folded (run: >-)', () => {
  const yaml = `
      - run: >-
          npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test']);
});

test('skips comments inside block', () => {
  const yaml = `
      - run: |
          # this is a comment
          npm test
          # another comment
          npm run lint
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test', 'npm run lint']);
});

test('strips surrounding quotes from inline form', () => {
  const yaml = `
      - run: "npm test"
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test']);
});

test('returns empty for yaml without run steps', () => {
  const yaml = `
jobs:
  test:
    runs-on: ubuntu-latest
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, []);
});

test('multiple run blocks', () => {
  const yaml = `
      - run: npm ci
      - run: npm test
      - run: |
          npm run build
          npm run lint
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm ci', 'npm test', 'npm run build', 'npm run lint']);
});

test('handles empty content', () => {
  assert.deepStrictEqual(extractRunCommands(''), []);
  assert.deepStrictEqual(extractRunCommands('\n\n\n'), []);
});

test('handles CRLF line endings', () => {
  const yaml = '      - run: npm test\r\n      - run: npm run build\r\n';
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, ['npm test', 'npm run build']);
});

// --- isGateCommand ---

test('recognizes common test and lint commands', () => {
  assert.ok(isGateCommand('npm test'));
  assert.ok(isGateCommand('npm run test'));
  assert.ok(isGateCommand('cargo test'));
  assert.ok(isGateCommand('go test ./...'));
  assert.ok(isGateCommand('pytest'));
  assert.ok(isGateCommand('npx eslint .'));
  assert.ok(isGateCommand('npx biome check .'));
  assert.ok(isGateCommand('cargo clippy -- -D warnings'));
});

test('recognizes build and type-check commands', () => {
  assert.ok(isGateCommand('tsc --noEmit'));
  assert.ok(isGateCommand('cargo build'));
  assert.ok(isGateCommand('go build ./...'));
  assert.ok(isGateCommand('./gradlew test'));
  assert.ok(isGateCommand('mvn verify'));
});

test('recognizes docker build and compose', () => {
  assert.ok(isGateCommand('docker build .'));
  assert.ok(isGateCommand('docker compose up -d'));
});

test('rejects shell utilities and unrelated commands', () => {
  assert.ok(!isGateCommand('echo hello'));
  assert.ok(!isGateCommand('cd src'));
  assert.ok(!isGateCommand('rm file.txt'));
  assert.ok(!isGateCommand('git log'));
  assert.ok(!isGateCommand('mkdir foo'));
  assert.ok(!isGateCommand('export PATH=/usr/bin'));
});

'use strict';

const assert = require('assert');
const { diff, normalizeCmd, extractRunCommands, isGateCommand } = require('../src/commands/diff');

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

console.log('\n  commands/diff.js');

// --- Module surface ---

test('exports diff, normalizeCmd, extractRunCommands, isGateCommand', () => {
  assert.strictEqual(typeof diff, 'function');
  assert.strictEqual(typeof normalizeCmd, 'function');
  assert.strictEqual(typeof extractRunCommands, 'function');
  assert.strictEqual(typeof isGateCommand, 'function');
});

// --- normalizeCmd: alias rewriting ---

test('normalizeCmd: npm test ⇔ npm run test', () => {
  assert.strictEqual(normalizeCmd('npm test'), normalizeCmd('npm run test'));
});

test('normalizeCmd: npm start ⇔ npm run start', () => {
  assert.strictEqual(normalizeCmd('npm start'), normalizeCmd('npm run start'));
});

test('normalizeCmd: npm stop ⇔ npm run stop', () => {
  assert.strictEqual(normalizeCmd('npm stop'), normalizeCmd('npm run stop'));
});

test('normalizeCmd: npm install stays as-is', () => {
  assert.strictEqual(normalizeCmd('npm install'), 'npm install');
});

test('normalizeCmd: npm ci stays as-is', () => {
  assert.strictEqual(normalizeCmd('npm ci'), 'npm ci');
});

test('normalizeCmd: ./gradlew ⇔ gradlew', () => {
  assert.strictEqual(normalizeCmd('./gradlew test'), normalizeCmd('gradlew test'));
});

test('normalizeCmd: ./mvnw ⇔ mvnw', () => {
  assert.strictEqual(normalizeCmd('./mvnw compile'), normalizeCmd('mvnw compile'));
});

test('normalizeCmd: lowercases all input', () => {
  assert.strictEqual(normalizeCmd('NPM TEST'), normalizeCmd('npm test'));
});

test('normalizeCmd: collapses multiple spaces', () => {
  assert.strictEqual(normalizeCmd('npm  test'), normalizeCmd('npm test'));
});

test('normalizeCmd: trims leading/trailing whitespace', () => {
  assert.strictEqual(normalizeCmd('  npm test  '), normalizeCmd('npm test'));
});

test('normalizeCmd: different commands remain different', () => {
  assert.notStrictEqual(normalizeCmd('npm test'), normalizeCmd('cargo test'));
});

// --- extractRunCommands: YAML parsing ---

test('extractRunCommands: inline run step', () => {
  const yaml = `
    steps:
      - run: npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm test'));
});

test('extractRunCommands: block scalar `run: |`', () => {
  const yaml = `
    steps:
      - run: |
          npm install
          npm test
          npm run build
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm install'));
  assert.ok(cmds.includes('npm test'));
  assert.ok(cmds.includes('npm run build'));
});

test('extractRunCommands: block scalar `run: >-`', () => {
  const yaml = `
    steps:
      - run: >-
          npm
          test
`;
  const cmds = extractRunCommands(yaml);
  // Folded scalar produces one logical line — we extract each physical line here
  assert.ok(cmds.length >= 1);
});

test('extractRunCommands: skips comments inside block', () => {
  const yaml = `
    steps:
      - run: |
          # setup step
          npm install
          # test step
          npm test
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm install'));
  assert.ok(cmds.includes('npm test'));
  assert.ok(!cmds.some(c => c.startsWith('#')));
});

test('extractRunCommands: strips surrounding quotes on inline', () => {
  const yaml = `
    steps:
      - run: "npm test"
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm test'));
});

test('extractRunCommands: returns empty for yaml without run steps', () => {
  const yaml = `
    name: noop
    on: push
    jobs:
      hello:
        runs-on: ubuntu-latest
`;
  const cmds = extractRunCommands(yaml);
  assert.deepStrictEqual(cmds, []);
});

test('extractRunCommands: multiple run blocks', () => {
  const yaml = `
    steps:
      - run: npm install
      - run: |
          npm test
          npm run build
      - run: npm publish
`;
  const cmds = extractRunCommands(yaml);
  assert.ok(cmds.includes('npm install'));
  assert.ok(cmds.includes('npm test'));
  assert.ok(cmds.includes('npm run build'));
  assert.ok(cmds.includes('npm publish'));
});

// --- isGateCommand: command classification ---

test('isGateCommand: recognizes common test commands', () => {
  assert.ok(isGateCommand('npm test'));
  assert.ok(isGateCommand('npm run test'));
  assert.ok(isGateCommand('cargo test'));
  assert.ok(isGateCommand('go test ./...'));
  assert.ok(isGateCommand('pytest'));
});

test('isGateCommand: recognizes lint commands', () => {
  assert.ok(isGateCommand('npx eslint .'));
  assert.ok(isGateCommand('npx biome check .'));
  assert.ok(isGateCommand('cargo clippy'));
  assert.ok(isGateCommand('ruff check'));
});

test('isGateCommand: rejects non-gate commands', () => {
  assert.ok(!isGateCommand('echo hello'));
  assert.ok(!isGateCommand('cd /tmp'));
  assert.ok(!isGateCommand('mkdir foo'));
  assert.ok(!isGateCommand('git log'));
});

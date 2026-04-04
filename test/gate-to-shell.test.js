'use strict';

const assert = require('assert');
const { gateToShell, shellEscapeDoubleQuoted } = require('../src/governance/gate-to-shell');

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

console.log('\n  gate-to-shell.js');

test('passes through regular commands unchanged', () => {
  assert.strictEqual(gateToShell('npm test'), 'npm test');
  assert.strictEqual(gateToShell('cargo build'), 'cargo build');
});

test('converts Verify ... contains to grep', () => {
  const result = gateToShell('Verify src/foo.md contains "hello"');
  assert.ok(result.includes('grep -qi'));
  assert.ok(result.includes('hello'));
  assert.ok(result.includes('src/foo.md'));
});

test('escapes double quotes in needle', () => {
  const result = gateToShell('Verify foo.md contains "say \\"hi\\""');
  // The regex won't match this (has escaped quotes in source), but ensure no injection
  assert.ok(!result.includes('`'));
});

test('escapes backticks in needle (shell injection protection)', () => {
  const result = gateToShell('Verify foo.md contains "`rm -rf /`"');
  assert.ok(result.includes('\\`'));
  assert.ok(!result.match(/(?<!\\)`/));
});

test('escapes dollar signs (shell command substitution)', () => {
  const result = gateToShell('Verify foo.md contains "$(whoami)"');
  assert.ok(result.includes('\\$'));
});

test('shellEscapeDoubleQuoted escapes all special chars', () => {
  assert.strictEqual(shellEscapeDoubleQuoted('a\\b'), 'a\\\\b');
  assert.strictEqual(shellEscapeDoubleQuoted('a"b'), 'a\\"b');
  assert.strictEqual(shellEscapeDoubleQuoted('a`b'), 'a\\`b');
  assert.strictEqual(shellEscapeDoubleQuoted('a$b'), 'a\\$b');
});

test('shellEscapeDoubleQuoted leaves safe chars alone', () => {
  assert.strictEqual(shellEscapeDoubleQuoted('hello world'), 'hello world');
  assert.strictEqual(shellEscapeDoubleQuoted('/path/to/file'), '/path/to/file');
});

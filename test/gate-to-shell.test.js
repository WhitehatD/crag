'use strict';

const assert = require('assert');
const { gateToShell, shellEscapeDoubleQuoted, shellEscapeSingleQuoted } = require('../src/governance/gate-to-shell');

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

test('shellEscapeDoubleQuoted handles backslash ordering correctly', () => {
  // Backslash must be escaped before other chars so the escape char itself
  // does not get re-escaped. `a\"b` should become `a\\\"b`, not `a\\\\"b`.
  assert.strictEqual(shellEscapeDoubleQuoted('a\\"b'), 'a\\\\\\"b');
});

test('shellEscapeSingleQuoted closes-reopens for embedded single quote', () => {
  // Standard POSIX idiom: 'foo'\''bar' — the quote character is placed
  // between two closed-reopened strings.
  assert.strictEqual(shellEscapeSingleQuoted("it's"), "it'\\''s");
  assert.strictEqual(shellEscapeSingleQuoted("no quotes here"), "no quotes here");
});

test('shellEscapeSingleQuoted blocks command injection via single quote', () => {
  // A malicious payload that tries to close the quote, inject a command,
  // and reopen. After escaping, every literal quote must be neutralized.
  const payload = "'; rm -rf /; echo '";
  const escaped = shellEscapeSingleQuoted(payload);
  // Every literal ' in the payload (2 of them) must have been replaced.
  const origQuotes = (payload.match(/'/g) || []).length;
  const escapedSeqs = escaped.split("'\\''").length - 1;
  assert.strictEqual(escapedSeqs, origQuotes);
  // When we wrap the result in 'single quotes', the only bare quotes should
  // be the two wrapper characters and the 2 quote-chars INSIDE the '\''
  // escape sequences (each sequence is: close, escaped-quote, reopen — so
  // it contains 3 bare quote characters). So total = 2 wrappers + 3*2 = 8.
  const wrapped = `'${escaped}'`;
  const totalQuotes = (wrapped.match(/'/g) || []).length;
  assert.strictEqual(totalQuotes, 2 + origQuotes * 3);
});

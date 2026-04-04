'use strict';

const assert = require('assert');
const { compareVersions } = require('../src/update/version-check');

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

console.log('\n  version-check.js');

test('compareVersions — equal', () => {
  assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
  assert.strictEqual(compareVersions('0.2.0', '0.2.0'), 0);
});

test('compareVersions — major', () => {
  assert.ok(compareVersions('2.0.0', '1.9.9') > 0);
  assert.ok(compareVersions('1.0.0', '2.0.0') < 0);
});

test('compareVersions — minor', () => {
  assert.ok(compareVersions('1.2.0', '1.1.9') > 0);
  assert.ok(compareVersions('1.1.0', '1.2.0') < 0);
});

test('compareVersions — patch', () => {
  assert.ok(compareVersions('1.0.2', '1.0.1') > 0);
  assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
});

test('compareVersions — prerelease < release', () => {
  assert.ok(compareVersions('1.0.0-beta', '1.0.0') < 0);
  assert.ok(compareVersions('1.0.0', '1.0.0-beta') > 0);
});

test('compareVersions — prerelease lexical order', () => {
  assert.ok(compareVersions('1.0.0-alpha', '1.0.0-beta') < 0);
  assert.ok(compareVersions('1.0.0-rc1', '1.0.0-rc2') < 0);
});

test('compareVersions — missing patch defaults to 0', () => {
  assert.strictEqual(compareVersions('1.0', '1.0.0'), 0);
});

test('compareVersions — handles numeric strings robustly', () => {
  assert.strictEqual(compareVersions('0.2.0', '0.2.0'), 0);
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0);
});

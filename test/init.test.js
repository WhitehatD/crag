'use strict';

const assert = require('assert');
const os = require('os');
const { resolveHomeDir } = require('../src/commands/init');

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

console.log('\n  commands/init.js');

test('resolveHomeDir returns os.homedir() on normal systems', () => {
  // On the dev machine and all CI platforms, os.homedir() returns a non-empty
  // string, so resolveHomeDir should match it.
  const home = resolveHomeDir();
  assert.strictEqual(typeof home, 'string');
  assert.ok(home.length > 0);
  assert.strictEqual(home, os.homedir());
});

test('resolveHomeDir never returns undefined', () => {
  // Regression for the crash when HOME and USERPROFILE are both unset:
  // path.join(undefined, ...) throws ERR_INVALID_ARG_TYPE. resolveHomeDir
  // must always return a usable string.
  const home = resolveHomeDir();
  assert.notStrictEqual(home, undefined);
  assert.notStrictEqual(home, null);
});

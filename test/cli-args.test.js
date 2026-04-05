'use strict';

const assert = require('assert');
const { validateFlags } = require('../src/cli-args');

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

/**
 * Capture a call to validateFlags that is expected to exit the process.
 * Stubs process.exit and captures stderr so the test can assert on them.
 */
function expectExit(fn) {
  const origExit = process.exit;
  const origErr = console.error;
  let exitCode = null;
  const stderr = [];
  process.exit = (code) => { exitCode = code; throw new Error('__EXIT__'); };
  console.error = (...args) => { stderr.push(args.join(' ')); };
  try {
    fn();
    return { exited: false, code: null, stderr };
  } catch (err) {
    if (err.message !== '__EXIT__') throw err;
    return { exited: true, code: exitCode, stderr: stderr.join('\n') };
  } finally {
    process.exit = origExit;
    console.error = origErr;
  }
}

console.log('\n  cli-args.js');

test('validateFlags: accepts declared boolean flag', () => {
  const r = expectExit(() => validateFlags('analyze', ['--dry-run'], { boolean: ['--dry-run'] }));
  assert.strictEqual(r.exited, false);
});

test('validateFlags: accepts declared string flag with value', () => {
  const r = expectExit(() => validateFlags('compile', ['--target', 'github'], { string: ['--target'] }));
  assert.strictEqual(r.exited, false);
});

test('validateFlags: accepts --flag=value form', () => {
  const r = expectExit(() => validateFlags('compile', ['--target=github'], { string: ['--target'] }));
  assert.strictEqual(r.exited, false);
});

test('validateFlags: accepts universal flags (--help, -h)', () => {
  const r = expectExit(() => validateFlags('analyze', ['--help'], {}));
  assert.strictEqual(r.exited, false);
  const r2 = expectExit(() => validateFlags('analyze', ['-h'], {}));
  assert.strictEqual(r2.exited, false);
});

test('validateFlags: rejects unknown flag with exit 2', () => {
  const r = expectExit(() => validateFlags('analyze', ['--garbage-flag'], { boolean: ['--dry-run'] }));
  assert.strictEqual(r.exited, true);
  assert.ok(r.stderr.includes('unknown option'));
  assert.ok(r.stderr.includes('--garbage-flag'));
});

test('validateFlags: offers a typo suggestion for close matches', () => {
  const r = expectExit(() => validateFlags('analyze', ['--drty-run'], { boolean: ['--dry-run'] }));
  assert.strictEqual(r.exited, true);
  assert.ok(r.stderr.includes('did you mean'), `expected typo hint, got: ${r.stderr}`);
  assert.ok(r.stderr.includes('--dry-run'));
});

test('validateFlags: positional arguments are allowed', () => {
  // `crag compile github --dry-run` — `github` is positional
  const r = expectExit(() => validateFlags('compile', ['github', '--dry-run'], { boolean: ['--dry-run'] }));
  assert.strictEqual(r.exited, false);
});

test('validateFlags: consumes string-flag value without validating it as a flag', () => {
  // `--target zzzunknown` — `zzzunknown` is the VALUE of --target, not a separate flag
  const r = expectExit(() => validateFlags('compile', ['--target', 'zzzunknown'], { string: ['--target'] }));
  assert.strictEqual(r.exited, false);
});

test('validateFlags: short version of universal flags', () => {
  const r = expectExit(() => validateFlags('check', ['-h'], {}));
  assert.strictEqual(r.exited, false);
});

test('validateFlags: --no-color universal flag', () => {
  const r = expectExit(() => validateFlags('check', ['--no-color'], {}));
  assert.strictEqual(r.exited, false);
});

'use strict';

const assert = require('assert');

// Import via direct file require to access internal helpers for testing.
// We re-export normalizeCmd and extractRunCommands from diff.js via a test helper.
// For now, test via end-to-end behavior on fixtures.

const diff = require('../src/commands/diff');

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

test('diff module exports diff function', () => {
  assert.strictEqual(typeof diff.diff, 'function');
});

// Test alias normalization by examining what two functionally identical commands
// produce at a fixture level. Since normalizeCmd is internal, we verify the
// behavior indirectly through fixture files in a real diff run would be ideal,
// but the internal logic is unit-testable if we expose it. For now, we verify
// the module loads and basic structure is intact.

test('diff module has no syntax errors', () => {
  // Module loaded without throwing — simple smoke test
  assert.ok(diff.diff);
});

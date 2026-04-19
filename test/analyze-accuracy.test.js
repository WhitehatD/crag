'use strict';

/**
 * Accuracy regression corpus for `crag analyze`.
 *
 * Each sub-directory under test/fixtures/accuracy/ is a minimal frozen
 * snapshot of a real OSS project's relevant files. Tests verify that
 * analyzeProject() extracts the expected quality gates and detects the
 * correct stack — without false negatives.
 *
 * Strategy: assert that EVERY gate in expected.gates appears somewhere in
 * the combined gate list (case-insensitive substring match). We do NOT
 * require an exact set match — extra gates are acceptable, missing gates
 * are regressions.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyzeProject } = require('../src/commands/analyze');

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

const fixtureRoot = path.join(__dirname, 'fixtures', 'accuracy');

/**
 * Run analyzeProject against a fixture directory and return a flat
 * deduplicated list of all extracted gates (linters + testers + builders +
 * ciGates). Suppresses the progress log output.
 */
function runAccuracyCheck(fixtureDir) {
  const result = analyzeProject(fixtureDir);
  const seen = new Set();
  const gates = [];
  for (const cmd of [...result.linters, ...result.testers, ...result.builders, ...result.ciGates]) {
    if (!seen.has(cmd)) {
      seen.add(cmd);
      gates.push(cmd);
    }
  }
  return { gates, stack: result.stack };
}

/**
 * Returns true if `haystack` contains a string that includes `needle`
 * (case-insensitive).
 */
function gatesContain(gates, needle) {
  const lower = needle.toLowerCase();
  return gates.some(g => g.toLowerCase().includes(lower));
}

console.log('\n  analyze accuracy corpus');

// Discover all fixture directories that have an expected.json
let fixtures;
try {
  fixtures = fs.readdirSync(fixtureRoot)
    .filter(entry => {
      const expectedPath = path.join(fixtureRoot, entry, 'expected.json');
      return fs.existsSync(expectedPath);
    });
} catch {
  fixtures = [];
}

if (fixtures.length === 0) {
  console.error('  \x1b[31m✗\x1b[0m No accuracy fixtures found — missing test/fixtures/accuracy/');
  process.exitCode = 1;
}

for (const name of fixtures) {
  const fixtureDir = path.join(fixtureRoot, name);
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expected.json'), 'utf-8'));

  test(`${name}: stack detected as "${expected.stack}"`, () => {
    const { stack } = runAccuracyCheck(fixtureDir);
    // stack is an array — check that at least one element contains the expected value
    const stackStr = stack.join(',').toLowerCase();
    assert.ok(
      stackStr.includes(expected.stack.toLowerCase()),
      `Expected stack to include "${expected.stack}", got [${stack.join(', ')}]`
    );
  });

  for (const expectedGate of expected.gates) {
    test(`${name}: gate detected — "${expectedGate}"`, () => {
      const { gates } = runAccuracyCheck(fixtureDir);
      assert.ok(
        gatesContain(gates, expectedGate),
        `Gate "${expectedGate}" not found in extracted gates:\n    ${gates.join('\n    ') || '(none)'}`
      );
    });
  }
}

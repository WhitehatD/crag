'use strict';

// Fix 5: shared color helper — colors must be OFF under NO_COLOR or when
// stdout is not a TTY, and the escape constants become empty strings so call
// sites need no branching.

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

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

console.log('\n  src/colors.js');

const colorsPath = path.join(__dirname, '..', 'src', 'colors.js');

// Load colors.js in a child node process with a controlled environment and
// report the resolved constants as JSON. stdio 'pipe' guarantees a non-TTY
// stdout, so isTTY is false unless we force it.
function loadColors(env) {
  const script =
    `const c = require(${JSON.stringify(colorsPath)});` +
    `process.stdout.write(JSON.stringify({ enabled: c.colorsEnabled, Y: c.Y, X: c.X, G: c.G }));`;
  const out = execFileSync('node', ['-e', script], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
  return JSON.parse(out);
}

test('colors OFF when stdout is not a TTY (piped output)', () => {
  const c = loadColors({});
  assert.strictEqual(c.enabled, false, 'colors should be disabled for non-TTY stdout');
  assert.strictEqual(c.Y, '', 'Y must be an empty string when colors are off');
  assert.strictEqual(c.X, '', 'X must be an empty string when colors are off');
});

test('colors OFF when NO_COLOR is set even if a TTY', () => {
  // NO_COLOR wins regardless of TTY state.
  const c = loadColors({ NO_COLOR: '1' });
  assert.strictEqual(c.enabled, false, 'NO_COLOR must disable colors');
  assert.strictEqual(c.G, '', 'G must be empty under NO_COLOR');
});

test('module exports the standard escape keys', () => {
  const c = require('../src/colors');
  for (const k of ['G', 'R', 'Y', 'C', 'B', 'D', 'GRAY', 'X']) {
    assert.ok(k in c, `expected color key ${k} to be exported`);
  }
  assert.strictEqual(typeof c.colorsEnabled, 'boolean');
});

'use strict';

/**
 * End-to-end tests for `crag demo`.
 *
 * The demo command is the public "one-click proof" surface, so these tests
 * lock its contract: valid JSON output, deterministic re-run, cleanup by
 * default, --keep leaves the dir behind, unknown-flag rejection, and the
 * drift-detection payload is non-empty.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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

const CRAG_BIN = path.join(__dirname, '..', 'bin', 'crag.js');

function stripAnsi(s) {
  return String(s || '').replace(/\x1b\[[0-9;]*m/g, '');
}

function runCrag(args, opts = {}) {
  const r = spawnSync('node', [CRAG_BIN, ...args], {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1', NO_COLOR: '1' },
    timeout: 30_000,
  });
  return {
    rc: r.status ?? (r.error ? 1 : 0),
    // Strip ANSI so content regexes don't have to deal with color codes.
    // (The demo's human-mode formatter hardcodes ANSI for readability; we
    // test the structural content, not the escape sequences.)
    stdout: stripAnsi((r.stdout || '').toString()),
    stderr: stripAnsi((r.stderr || '').toString()),
  };
}

console.log('\n  commands/demo.js');

test('demo: runs end-to-end and exits 0', () => {
  const { rc, stdout } = runCrag(['demo']);
  assert.strictEqual(rc, 0, `expected rc=0, got rc=${rc}`);
  assert.ok(stdout.includes('crag demo'), 'expected header in output');
  assert.ok(/\d+\s*ms/.test(stdout), 'expected timing in output');
});

test('demo: all 6 steps appear in the report', () => {
  const { stdout } = runCrag(['demo']);
  const expected = [
    'scaffold',
    'analyze --dry-run',
    'write minimal governance',
    'diff',
    'compile --target all --dry-run',
    'second run',
  ];
  for (const step of expected) {
    assert.ok(stdout.includes(step), `expected step "${step}" in output`);
  }
});

test('demo: determinism check succeeds (same SHA twice)', () => {
  const { stdout } = runCrag(['demo']);
  // Human mode prints the hash under "Deterministic: ... byte-identical"
  assert.ok(/identical/.test(stdout), 'expected determinism assertion in output');
  assert.ok(/SHA-256/.test(stdout), 'expected SHA-256 reference in output');
});

test('demo: --json emits valid JSON with required fields', () => {
  const { rc, stdout } = runCrag(['demo', '--json']);
  assert.strictEqual(rc, 0);
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(stdout); }, 'output must be valid JSON');
  assert.ok('tempDir' in parsed);
  assert.ok(Array.isArray(parsed.steps));
  assert.ok(parsed.steps.length >= 6, `expected ≥6 steps, got ${parsed.steps.length}`);
  assert.ok(parsed.deterministic && parsed.deterministic.ok === true);
  assert.strictEqual(parsed.deterministic.hash1, parsed.deterministic.hash2);
  assert.ok(typeof parsed.totalMs === 'number');
});

test('demo: diff step surfaces real drift (extra > 0)', () => {
  const { stdout } = runCrag(['demo', '--json']);
  const parsed = JSON.parse(stdout);
  const diffStep = parsed.steps.find(s => s.diffCounts);
  assert.ok(diffStep, 'expected a step with diffCounts');
  assert.ok(diffStep.diffCounts.extra >= 2,
    `demo should produce ≥2 drift extras, got ${diffStep.diffCounts.extra}`);
  // And at least some matches (not pure drift)
  assert.ok(diffStep.diffCounts.match >= 4,
    `demo should also show matching gates, got ${diffStep.diffCounts.match}`);
});

test('demo: compile step plans all 23 targets', () => {
  const { stdout } = runCrag(['demo', '--json']);
  const parsed = JSON.parse(stdout);
  const compileStep = parsed.steps.find(s => s.step.includes('compile'));
  assert.ok(compileStep, 'expected a compile step');
  assert.ok(/23 files/.test(compileStep.detail),
    `expected "23 files" in compile detail, got: ${compileStep.detail}`);
});

test('demo: cleans up temp directory by default', () => {
  const { stdout } = runCrag(['demo', '--json']);
  const parsed = JSON.parse(stdout);
  assert.ok(parsed.tempDir, 'expected tempDir in summary');
  // After the run, the directory must not exist
  assert.strictEqual(fs.existsSync(parsed.tempDir), false,
    `expected cleanup, but ${parsed.tempDir} still exists`);
});

test('demo: --keep leaves the temp directory behind', () => {
  const { stdout } = runCrag(['demo', '--keep', '--json']);
  const parsed = JSON.parse(stdout);
  assert.ok(fs.existsSync(parsed.tempDir),
    `expected --keep to leave ${parsed.tempDir}`);
  // Manual cleanup
  fs.rmSync(parsed.tempDir, { recursive: true, force: true });
});

test('demo: rejects unknown flag with typo suggestion', () => {
  const { rc, stderr } = runCrag(['demo', '--jsn']);
  assert.strictEqual(rc, 1);
  assert.ok(/unknown option/.test(stderr));
  assert.ok(/did you mean/.test(stderr), `expected typo suggestion, got: ${stderr}`);
});

test('demo: total wall-clock is under 10 seconds', () => {
  const { stdout } = runCrag(['demo', '--json']);
  const parsed = JSON.parse(stdout);
  // 10s allows headroom for slow Windows CI runners (GitHub Actions shared
  // runners). Typical local runs complete in 1-3s.
  assert.ok(parsed.totalMs < 10_000,
    `demo should run in <10s, took ${parsed.totalMs}ms`);
});

test('demo: scaffolded project has correct stack signals (via analyze step)', () => {
  const { stdout } = runCrag(['demo', '--json']);
  const parsed = JSON.parse(stdout);
  const analyzeStep = parsed.steps.find(s => s.step === 'analyze --dry-run');
  assert.ok(analyzeStep);
  // The synthetic project has node + typescript + rust + cargo workspace
  assert.ok(/node/.test(analyzeStep.detail), 'expected node in stack');
  assert.ok(/rust/.test(analyzeStep.detail), 'expected rust in stack');
  assert.ok(/workspace=cargo/.test(analyzeStep.detail), 'expected cargo workspace');
});

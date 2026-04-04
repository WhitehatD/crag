'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runChecks, CORE_CHECKS, OPTIONAL_CHECKS } = require('../src/commands/check');

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-check-test-'));
  try {
    fn(dir);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

console.log('\n  check.js');

test('runChecks reports all core missing in empty directory', () => {
  withTempDir((dir) => {
    const report = runChecks(dir);
    assert.strictEqual(report.missing, CORE_CHECKS.length);
    assert.strictEqual(report.complete, false);
    assert.strictEqual(report.core.length, CORE_CHECKS.length);
    for (const c of report.core) {
      assert.strictEqual(c.present, false);
    }
  });
});

test('runChecks detects a single core file', () => {
  withTempDir((dir) => {
    // Create one of the core files and verify it's detected.
    const target = path.join(dir, '.claude', 'governance.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '# test');

    const report = runChecks(dir);
    const gov = report.core.find((c) => c.file.includes('governance.md'));
    assert.strictEqual(gov.present, true);
    assert.strictEqual(report.missing, CORE_CHECKS.length - 1);
  });
});

test('runChecks reports complete when all core files exist', () => {
  withTempDir((dir) => {
    for (const [rel] of CORE_CHECKS) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, 'placeholder');
    }
    const report = runChecks(dir);
    assert.strictEqual(report.missing, 0);
    assert.strictEqual(report.complete, true);
  });
});

test('runChecks reports optional files independently from core', () => {
  withTempDir((dir) => {
    // Create one optional file; core still missing.
    const [rel] = OPTIONAL_CHECKS[0];
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'placeholder');

    const report = runChecks(dir);
    assert.strictEqual(report.complete, false);
    assert.strictEqual(report.optional[0].present, true);
  });
});

test('runChecks report shape is stable (snapshot-style)', () => {
  withTempDir((dir) => {
    const report = runChecks(dir);
    assert.strictEqual(typeof report.cwd, 'string');
    assert.ok(Array.isArray(report.core));
    assert.ok(Array.isArray(report.optional));
    assert.strictEqual(typeof report.missing, 'number');
    assert.strictEqual(typeof report.total, 'number');
    assert.strictEqual(typeof report.complete, 'boolean');
    for (const c of report.core) {
      assert.strictEqual(typeof c.file, 'string');
      assert.strictEqual(typeof c.name, 'string');
      assert.strictEqual(typeof c.present, 'boolean');
    }
  });
});

test('CORE_CHECKS and OPTIONAL_CHECKS are well-formed', () => {
  assert.ok(CORE_CHECKS.length > 0);
  assert.ok(OPTIONAL_CHECKS.length > 0);
  for (const entry of CORE_CHECKS) {
    assert.strictEqual(entry.length, 2);
    assert.strictEqual(typeof entry[0], 'string');
    assert.strictEqual(typeof entry[1], 'string');
  }
});

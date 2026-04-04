'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncSkills, isTrustedSource } = require('../src/update/skill-sync');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-skill-sync-test-'));
  const origLog = console.log;
  console.log = () => {};
  try {
    fn(dir);
  } finally {
    console.log = origLog;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

console.log('\n  skill-sync.js');

// The actual shipped skill files — these are what the trusted-source checker
// validates against.
const REAL_PRE_START = path.join(__dirname, '..', 'src', 'skills', 'pre-start-context.md');
const REAL_POST_START = path.join(__dirname, '..', 'src', 'skills', 'post-start-validation.md');

// --- isTrustedSource: security-critical symlink/path protection ---

test('isTrustedSource accepts real shipped skill files', () => {
  assert.strictEqual(isTrustedSource(REAL_PRE_START), true);
  assert.strictEqual(isTrustedSource(REAL_POST_START), true);
});

test('isTrustedSource rejects non-existent files', () => {
  const fake = path.join(__dirname, '..', 'src', 'skills', 'does-not-exist.md');
  assert.strictEqual(isTrustedSource(fake), false);
});

test('isTrustedSource rejects files outside src/skills/', () => {
  // package.json is a regular file, not a symlink, but it's not inside src/skills/
  const pkg = path.join(__dirname, '..', 'package.json');
  assert.strictEqual(isTrustedSource(pkg), false);
});

test('isTrustedSource rejects a path with ..', () => {
  const traversal = path.join(__dirname, '..', 'src', 'skills', '..', '..', 'package.json');
  assert.strictEqual(isTrustedSource(traversal), false);
});

test('isTrustedSource rejects symlinks pointing into src/skills', () => {
  // Create a symlink inside a temp dir that points to a real skill.
  // Symlinks count as untrusted even if the target is legitimate.
  withTempDir((dir) => {
    const link = path.join(dir, 'fake-skill.md');
    try {
      fs.symlinkSync(REAL_PRE_START, link);
    } catch (err) {
      // Symlinks require admin on Windows — skip test silently if denied.
      if (err.code === 'EPERM' || err.code === 'ENOSYS') return;
      throw err;
    }
    assert.strictEqual(isTrustedSource(link), false);
  });
});

test('isTrustedSource rejects a directory', () => {
  const skillsDir = path.join(__dirname, '..', 'src', 'skills');
  assert.strictEqual(isTrustedSource(skillsDir), false);
});

// --- syncSkills: basic dry-run behavior (never touches disk) ---

test('syncSkills dry-run does not write files', () => {
  withTempDir((dir) => {
    const result = syncSkills(dir, { dryRun: true });
    // Dry run should report the skills as "to install" but not create them.
    assert.ok(Array.isArray(result.updated));
    const installPath = path.join(dir, '.claude', 'skills', 'pre-start-context', 'SKILL.md');
    assert.strictEqual(fs.existsSync(installPath), false);
  });
});

test('syncSkills installs when target directory is empty', () => {
  withTempDir((dir) => {
    const result = syncSkills(dir, {});
    assert.ok(result.updated.length >= 1);
    // At least one skill should now exist on disk.
    const installPath = path.join(dir, '.claude', 'skills', 'pre-start-context', 'SKILL.md');
    assert.strictEqual(fs.existsSync(installPath), true);
    // The from field should be "none" for fresh installs.
    const fresh = result.updated.find((u) => u.from === 'none');
    assert.ok(fresh);
  });
});

test('syncSkills does not overwrite current version on repeat', () => {
  withTempDir((dir) => {
    syncSkills(dir, {});
    const result = syncSkills(dir, {});
    // Second run should skip (already current) or report conflict if modified.
    assert.ok(result.skipped.length >= 1 || result.conflicted.length >= 1);
    assert.strictEqual(result.updated.length, 0);
  });
});

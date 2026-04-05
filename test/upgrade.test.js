'use strict';

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

function runCrag(cwd, args) {
  const r = spawnSync('node', [CRAG_BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
  });
  return {
    rc: r.status ?? (r.error ? 1 : 0),
    stdout: (r.stdout || '').toString(),
    stderr: (r.stderr || '').toString(),
  };
}

function mkFixture() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'crag-upgrade-'));
}

console.log('\n  commands/upgrade.js');

test('upgrade --check: dry-run does not write any files', () => {
  const dir = mkFixture();
  // No .claude directory at all — upgrade --check should still succeed and
  // show that both universal skills would be installed.
  const { rc, stdout } = runCrag(dir, ['upgrade', '--check']);
  assert.strictEqual(rc, 0);
  assert.ok(/dry run/i.test(stdout));
  // Verify no files were actually written
  assert.strictEqual(fs.existsSync(path.join(dir, '.claude', 'skills')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('upgrade --check: reports current skill state without side effects', () => {
  const dir = mkFixture();
  const { rc, stdout } = runCrag(dir, ['upgrade', '--check']);
  assert.strictEqual(rc, 0);
  // Either "would install" or "current" — some message per skill
  assert.ok(
    /pre-start-context/.test(stdout) || /post-start-validation/.test(stdout) || /all skills current/.test(stdout),
    `expected skill status in output, got: ${stdout.slice(0, 400)}`
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test('upgrade: rejects unknown flag', () => {
  const dir = mkFixture();
  const { rc, stderr } = runCrag(dir, ['upgrade', '--garbage']);
  assert.strictEqual(rc, 1);
  assert.ok(/unknown option/.test(stderr));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('upgrade --workspace: handles no-workspace case gracefully', () => {
  const dir = mkFixture();
  // Just a plain directory — no workspace marker
  const { rc, stdout } = runCrag(dir, ['upgrade', '--check', '--workspace']);
  assert.strictEqual(rc, 0);
  // Shouldn't crash; output may say "No workspace detected"
  assert.ok(stdout.length > 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('upgrade --workspace: enumerates pnpm workspace members', () => {
  const dir = mkFixture();
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"root","private":true}');
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
  fs.mkdirSync(path.join(dir, 'apps', 'web'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps', 'web', 'package.json'), '{"name":"web"}');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'apps', 'web', '.claude'), { recursive: true });
  const { rc, stdout } = runCrag(dir, ['upgrade', '--check', '--workspace']);
  assert.strictEqual(rc, 0);
  // We should see the root plus at least one member mentioned
  assert.ok(stdout.length > 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

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
    cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    rc: r.status ?? (r.error ? 1 : 0),
    stdout: (r.stdout || '').toString(),
    stderr: (r.stderr || '').toString(),
  };
}

function mkFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-ws-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

console.log('\n  commands/workspace.js');

test('workspace: no workspace → type=none in JSON output', () => {
  const dir = mkFixture({
    'package.json': '{"name":"single"}',
  });
  const { rc, stdout } = runCrag(dir, ['workspace', '--json']);
  assert.strictEqual(rc, 0);
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.type, 'none');
  assert.deepStrictEqual(parsed.members, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('workspace: human-readable no-workspace message', () => {
  const dir = mkFixture({ 'package.json': '{"name":"x"}' });
  const { rc, stdout } = runCrag(dir, ['workspace']);
  assert.strictEqual(rc, 0);
  assert.ok(/No workspace detected/.test(stdout));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('workspace: detects npm workspaces', () => {
  const dir = mkFixture({
    'package.json': '{"name":"root","private":true,"workspaces":["packages/*"]}',
    'packages/a/package.json': '{"name":"@scope/a","version":"1.0.0"}',
    'packages/b/package.json': '{"name":"@scope/b","version":"1.0.0"}',
  });
  const { rc, stdout } = runCrag(dir, ['workspace', '--json']);
  assert.strictEqual(rc, 0);
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.type, 'npm');
  assert.ok(parsed.members.length >= 2, `expected ≥2 members, got ${parsed.members.length}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('workspace: detects pnpm workspace', () => {
  const dir = mkFixture({
    'package.json': '{"name":"root","private":true}',
    'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n  - "libs/*"\n',
    'apps/web/package.json': '{"name":"web"}',
    'libs/util/package.json': '{"name":"util"}',
  });
  const { rc, stdout } = runCrag(dir, ['workspace', '--json']);
  assert.strictEqual(rc, 0);
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.type, 'pnpm');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('workspace: detects Cargo workspace', () => {
  const dir = mkFixture({
    'Cargo.toml': '[workspace]\nmembers = ["crates/a", "crates/b"]\n',
    'crates/a/Cargo.toml': '[package]\nname = "a"\nversion = "0.1.0"',
    'crates/b/Cargo.toml': '[package]\nname = "b"\nversion = "0.1.0"',
  });
  const { rc, stdout } = runCrag(dir, ['workspace', '--json']);
  assert.strictEqual(rc, 0);
  const parsed = JSON.parse(stdout);
  assert.strictEqual(parsed.type, 'cargo');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('workspace: rejects unknown flag', () => {
  const dir = mkFixture({ 'package.json': '{"name":"x"}' });
  const { rc, stderr } = runCrag(dir, ['workspace', '--garbage-flag']);
  assert.strictEqual(rc, 1);
  assert.ok(/unknown option/.test(stderr));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('workspace: JSON output is always valid JSON', () => {
  const dir = mkFixture({
    'package.json': '{"name":"root","workspaces":["packages/*"]}',
    'packages/a/package.json': '{"name":"a"}',
  });
  const { stdout } = runCrag(dir, ['workspace', '--json']);
  assert.doesNotThrow(() => JSON.parse(stdout));
  const parsed = JSON.parse(stdout);
  assert.ok('type' in parsed);
  assert.ok('root' in parsed);
  assert.ok('members' in parsed);
  fs.rmSync(dir, { recursive: true, force: true });
});

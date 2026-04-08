'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const CRAG_BIN = path.join(__dirname, '..', 'bin', 'crag.js');

function runCrag(args, opts = {}) {
  const r = spawnSync('node', [CRAG_BIN, ...args], {
    encoding: 'utf-8',
    timeout: 10000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1', ...opts.env },
    ...opts,
  });
  return {
    rc: r.status ?? (r.error ? 1 : 0),
    stdout: (r.stdout || '').toString(),
    stderr: (r.stderr || '').toString(),
  };
}

console.log('\n  commands/sync.js');

// ── detectRepo ──────────────────────────────────────────────────────────

test('detectRepo: parses SSH remote', () => {
  const { detectRepo } = require('../src/commands/sync');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:WhitehatD/crag.git'], { cwd: dir, stdio: 'ignore' });
    const repo = detectRepo(dir);
    assert.deepStrictEqual(repo, { owner: 'WhitehatD', repo: 'crag' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectRepo: parses HTTPS remote', () => {
  const { detectRepo } = require('../src/commands/sync');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/octocat/hello-world.git'], { cwd: dir, stdio: 'ignore' });
    const repo = detectRepo(dir);
    assert.deepStrictEqual(repo, { owner: 'octocat', repo: 'hello-world' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectRepo: HTTPS without .git suffix', () => {
  const { detectRepo } = require('../src/commands/sync');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/octocat/hello-world'], { cwd: dir, stdio: 'ignore' });
    const repo = detectRepo(dir);
    assert.deepStrictEqual(repo, { owner: 'octocat', repo: 'hello-world' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectRepo: returns null for non-GitHub remote', () => {
  const { detectRepo } = require('../src/commands/sync');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'https://gitlab.com/foo/bar.git'], { cwd: dir, stdio: 'ignore' });
    const repo = detectRepo(dir);
    assert.strictEqual(repo, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectRepo: returns null for no remote', () => {
  const { detectRepo } = require('../src/commands/sync');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const repo = detectRepo(dir);
    assert.strictEqual(repo, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectRepo: returns null for non-git directory', () => {
  const { detectRepo } = require('../src/commands/sync');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    const repo = detectRepo(dir);
    assert.strictEqual(repo, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── CLI integration ─────────────────────────────────────────────────────

test('sync: requires auth (exits with error when not logged in)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:test/repo.git'], { cwd: dir, stdio: 'ignore' });
    const { rc, stderr } = runCrag(['sync', '--status'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'), `expected auth error, got: ${stderr.slice(0, 200)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sync --push: requires auth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const { rc, stderr } = runCrag(['sync', '--push'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sync --pull: requires auth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-sync-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
    const { rc, stderr } = runCrag(['sync', '--pull'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sync: rejects unknown flags', () => {
  const { rc, stderr } = runCrag(['sync', '--garbage']);
  assert.strictEqual(rc, 1);
  assert.ok(/unknown option/.test(stderr));
});

test('help text includes crag sync', () => {
  const { rc, stdout } = runCrag(['help']);
  assert.strictEqual(rc, 0);
  assert.ok(stdout.includes('crag sync'), 'help should mention crag sync');
});

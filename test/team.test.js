'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

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
    ...opts,
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1', ...(opts.env || {}) },
  });
  return {
    rc: r.status ?? (r.error ? 1 : 0),
    stdout: (r.stdout || '').toString(),
    stderr: (r.stderr || '').toString(),
  };
}

console.log('\n  commands/team.js');

// ── help ────────────────────────────────────────────────────────────────

test('team --help: prints usage', () => {
  const { rc, stdout } = runCrag(['team', '--help']);
  assert.strictEqual(rc, 0);
  assert.ok(stdout.includes('crag team create'), `expected create in help, got: ${stdout.slice(0, 300)}`);
  assert.ok(stdout.includes('crag team join'));
  assert.ok(stdout.includes('crag team members'));
  assert.ok(stdout.includes('crag team invite'));
  assert.ok(stdout.includes('crag team leave'));
});

test('team: unknown subcommand prints usage and exits 1', () => {
  const { rc, stdout } = runCrag(['team', 'nonsense']);
  assert.strictEqual(rc, 1);
  assert.ok(stdout.includes('crag team'));
});

// ── auth required ───────────────────────────────────────────────────────

test('team: requires auth (no creds)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  try {
    const { rc, stderr } = runCrag(['team'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'), `expected auth error, got: ${stderr.slice(0, 200)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('team create: requires auth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  try {
    const { rc, stderr } = runCrag(['team', 'create', 'myteam'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('team join: requires auth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  try {
    const { rc, stderr } = runCrag(['team', 'join', 'abc123'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('team members: requires auth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  try {
    const { rc, stderr } = runCrag(['team', 'members'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('team invite: requires auth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  try {
    const { rc, stderr } = runCrag(['team', 'invite'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('team leave: requires auth', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  try {
    const { rc, stderr } = runCrag(['team', 'leave'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('not logged in'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── arg validation ──────────────────────────────────────────────────────

test('team create: requires name argument', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  const credDir = path.join(dir, '.crag');
  fs.mkdirSync(credDir, { recursive: true });
  fs.writeFileSync(path.join(credDir, 'credentials.json'), JSON.stringify({
    token: 'fake', user: 'test',
  }));
  try {
    const { rc, stderr } = runCrag(['team', 'create'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('team name required'), `expected name error, got: ${stderr.slice(0, 200)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('team join: requires code argument', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-team-'));
  const credDir = path.join(dir, '.crag');
  fs.mkdirSync(credDir, { recursive: true });
  fs.writeFileSync(path.join(credDir, 'credentials.json'), JSON.stringify({
    token: 'fake', user: 'test',
  }));
  try {
    const { rc, stderr } = runCrag(['team', 'join'], {
      cwd: dir,
      env: { HOME: dir, USERPROFILE: dir },
    });
    assert.strictEqual(rc, 1);
    assert.ok(stderr.includes('invite code required'), `expected code error, got: ${stderr.slice(0, 200)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('help text includes crag team', () => {
  const { rc, stdout } = runCrag(['help']);
  assert.strictEqual(rc, 0);
  assert.ok(stdout.includes('crag team'), 'help should mention crag team');
});

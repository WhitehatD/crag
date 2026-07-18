'use strict';

/**
 * Deterministic session lifecycle — `crag session-start` / `session-end` /
 * `crag hooks install` (design laws 1-2: prompts suggest, hooks enforce).
 *
 * Pins the load-bearing contracts:
 *  - --hook mode emits the EXACT Claude Code SessionStart hook JSON on stdout.
 *  - --hook mode with a dead daemon is SILENT and exits 0 (fail-open — a
 *    broken hook must never break the user's session).
 *  - plain mode with a dead daemon prints the friendly hint and exits 1.
 *  - hooks install MERGES into .claude/settings.json (a clobber is a bug).
 */

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

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const CRAG_BIN = path.join(__dirname, '..', 'bin', 'crag.js');
// A port with nothing listening — connection refused, instantly.
const DEAD_URL = 'http://127.0.0.1:1';

function runCrag(args, env = {}) {
  const r = spawnSync('node', [CRAG_BIN, ...args], {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1', NO_COLOR: '1', ...env },
  });
  return {
    rc: r.status ?? (r.error ? 1 : 0),
    stdout: (r.stdout || '').toString(),
    stderr: (r.stderr || '').toString(),
  };
}

console.log('\n  commands/session.js + commands/hooks.js (deterministic lifecycle)');

// ── pure units ──────────────────────────────────────────────────────────

test('renderContextMarkdown: full payload renders every section, no ANSI', () => {
  const { renderContextMarkdown } = require('../src/commands/session');
  const md = renderContextMarkdown({
    overview: {
      trust_score: { value: 0.5, verified: 1, active_claims: 2 },
      counts: { insights: 3, principles: 1, claims: 2 },
      today: { captured: 1, verified: 0, promoted: 0 },
    },
    needs_you_top: [{ id: 'x', kind: 't2_disposition', title: 'T', why: 'W' }],
    needs_you_total: 4,
    rules_stale_count: 2,
    last_session: { date: '2026-07-16', accomplished: 'A', next_steps: 'N' },
  });
  assert.ok(md.startsWith('## crag session context'));
  assert.ok(md.includes('Trust: 50%'));
  assert.ok(md.includes('T — W'));
  assert.ok(md.includes('4 total'));
  assert.ok(md.includes('2 compiled rule(s)'));
  assert.ok(md.includes('Last session (2026-07-16): A'));
  assert.ok(md.includes('Next steps: N'));
  assert.ok(!md.includes('\x1b['), 'context markdown must be ANSI-free (injected into agent context)');
});

test('renderContextMarkdown: empty payload degrades to dashes/zeros', () => {
  const { renderContextMarkdown } = require('../src/commands/session');
  const md = renderContextMarkdown({ overview: {}, needs_you_top: [] });
  assert.ok(md.includes('Trust: —'));
  assert.ok(md.includes('Needs you: 0 (all clear)'));
  assert.ok(!md.includes('Last session'));
});

test('hookJson: emits the exact Claude Code SessionStart hook shape', () => {
  const { hookJson } = require('../src/commands/session');
  const parsed = JSON.parse(hookJson('CTX'));
  assert.deepStrictEqual(parsed, {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'CTX' },
  });
});

// ── mergeHooks (the clobber guard) ──────────────────────────────────────

test('mergeHooks: fresh object gains both events', () => {
  const { mergeHooks, START_CMD, END_CMD } = require('../src/commands/hooks');
  const { settings, changed } = mergeHooks({});
  assert.strictEqual(changed, true);
  assert.strictEqual(settings.hooks.SessionStart[0].hooks[0].command, START_CMD);
  assert.strictEqual(settings.hooks.SessionEnd[0].hooks[0].command, END_CMD);
});

test('mergeHooks: preserves unrelated keys, events, and existing entries', () => {
  const { mergeHooks } = require('../src/commands/hooks');
  const existing = {
    permissions: { deny: ['Bash(rm -rf *)'] },
    env: { FOO: 'bar' },
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] }],
      SessionStart: [{ hooks: [{ type: 'command', command: 'echo mine' }] }],
    },
  };
  const { settings, changed } = mergeHooks(existing);
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(settings.permissions, { deny: ['Bash(rm -rf *)'] });
  assert.deepStrictEqual(settings.env, { FOO: 'bar' });
  assert.strictEqual(settings.hooks.PreToolUse[0].hooks[0].command, 'guard.sh');
  // existing SessionStart entry kept, crag entry appended
  assert.strictEqual(settings.hooks.SessionStart.length, 2);
  assert.strictEqual(settings.hooks.SessionStart[0].hooks[0].command, 'echo mine');
});

test('mergeHooks: idempotent — second merge reports changed=false', () => {
  const { mergeHooks } = require('../src/commands/hooks');
  const first = mergeHooks({});
  const second = mergeHooks(first.settings);
  assert.strictEqual(second.changed, false);
  assert.strictEqual(second.settings.hooks.SessionStart.length, 1);
});

// ── installHooks on disk ────────────────────────────────────────────────

test('installHooks: creates settings.json when absent; merge-safe when present', () => {
  const { installHooks } = require('../src/commands/hooks');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-hooks-'));
  try {
    const r1 = installHooks(dir);
    assert.strictEqual(r1.created, true);
    const s1 = JSON.parse(fs.readFileSync(r1.path, 'utf-8'));
    assert.ok(s1.hooks.SessionStart && s1.hooks.SessionEnd);
    // Second run: unchanged.
    const r2 = installHooks(dir);
    assert.strictEqual(r2.changed, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── CLI behavior: fail-open vs friendly hint ────────────────────────────

test('session-start --hook with dead daemon: SILENT, exit 0 (fail-open)', () => {
  const r = runCrag(['session-start', '--hook'], { CRAG_ANCHOR_URL: DEAD_URL });
  assert.strictEqual(r.rc, 0, `expected exit 0, got ${r.rc}: ${r.stderr}`);
  assert.strictEqual(r.stdout.trim(), '', `expected empty stdout, got: ${r.stdout}`);
});

test('session-end --hook with dead daemon: SILENT, exit 0 (fail-open)', () => {
  const r = runCrag(['session-end', '--hook'], { CRAG_ANCHOR_URL: DEAD_URL });
  assert.strictEqual(r.rc, 0, `expected exit 0, got ${r.rc}: ${r.stderr}`);
  assert.strictEqual(r.stdout.trim(), '', `expected empty stdout, got: ${r.stdout}`);
});

test('session-start plain with dead daemon: friendly hint, exit 1', () => {
  const r = runCrag(['session-start'], { CRAG_ANCHOR_URL: DEAD_URL });
  assert.strictEqual(r.rc, 1);
  assert.ok(r.stderr.includes('crag memory up'), `expected down-hint, got: ${r.stderr}`);
});

test('session-end plain with dead daemon: friendly hint, exit 1', () => {
  const r = runCrag(['session-end'], { CRAG_ANCHOR_URL: DEAD_URL });
  assert.strictEqual(r.rc, 1);
  assert.ok(r.stderr.includes('crag memory up'), `expected down-hint, got: ${r.stderr}`);
});

// ── CLI behavior against a live (mock) daemon ───────────────────────────

const START_PAYLOAD = {
  ok: true,
  overview: {
    trust_score: { value: 0.667, verified: 2, active_claims: 3 },
    counts: { insights: 5, principles: 2, claims: 3 },
    today: { captured: 1, verified: 0, promoted: 1 },
  },
  needs_you_top: [{ id: 'disposition:1', kind: 't2_disposition', title: 'Approve me', why: 'T2.' }],
  needs_you_total: 1,
  rules_stale_count: 0,
  last_session: { date: '2026-07-16', accomplished: 'shipped', next_steps: null },
};
const END_PAYLOAD = { ok: true, recorded: true, captured_today: 3, verified_today: 1, promoted_today: 2 };

// The mock daemon MUST run out-of-process: runCrag uses spawnSync, which blocks
// this process's event loop, so an in-process http server could never accept the
// child's connection. We write a tiny server script to a tempfile, spawn it, and
// read its bound port from stdout.
const { spawn } = require('child_process');

function startMockDaemon() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mockd-'));
  const script = path.join(dir, 'mockd.js');
  fs.writeFileSync(script, `
const http = require('http');
const START = ${JSON.stringify(START_PAYLOAD)};
const END = ${JSON.stringify(END_PAYLOAD)};
const srv = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/session/start')) return res.end(JSON.stringify(START));
    if (req.url.startsWith('/session/end')) return res.end(JSON.stringify(END));
    res.statusCode = 404; res.end('{}');
  });
});
srv.listen(0, '127.0.0.1', () => process.stdout.write('PORT=' + srv.address().port + '\\n'));
`);
  const child = spawn('node', [script], { stdio: ['ignore', 'pipe', 'ignore'] });
  return { child, dir, script };
}

function waitForPort(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('mock daemon did not report a port')), timeoutMs);
    child.stdout.on('data', (c) => {
      buf += c.toString();
      const m = buf.match(/PORT=(\d+)/);
      if (m) { clearTimeout(t); resolve(Number(m[1])); }
    });
  });
}

(async () => {
  const { child, dir } = startMockDaemon();
  const port = await waitForPort(child);
  const url = `http://127.0.0.1:${port}`;

  await testAsync('session-start --hook: stdout is EXACTLY the SessionStart hook JSON', async () => {
    const r = runCrag(['session-start', '--hook'], { CRAG_ANCHOR_URL: url });
    assert.strictEqual(r.rc, 0, r.stderr);
    const parsed = JSON.parse(r.stdout.trim()); // single JSON line, nothing else
    assert.strictEqual(parsed.hookSpecificOutput.hookEventName, 'SessionStart');
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Trust: 67%'), ctx);
    assert.ok(ctx.includes('Approve me'), ctx);
  });

  await testAsync('session-start plain: human block with trust + last session', async () => {
    const r = runCrag(['session-start'], { CRAG_ANCHOR_URL: url });
    assert.strictEqual(r.rc, 0, r.stderr);
    assert.ok(r.stdout.includes('Trust: 67%'), r.stdout);
    assert.ok(r.stdout.includes('Last session (2026-07-16): shipped'), r.stdout);
  });

  await testAsync('session-end plain: prints the payoff line', async () => {
    const r = runCrag(['session-end'], { CRAG_ANCHOR_URL: url });
    assert.strictEqual(r.rc, 0, r.stderr);
    assert.ok(r.stdout.includes('captured 3 lessons'), r.stdout);
    assert.ok(r.stdout.includes('1 verified'), r.stdout);
    assert.ok(r.stdout.includes('2 promoted'), r.stdout);
    assert.ok(r.stdout.includes('crag why'), r.stdout);
  });

  await testAsync('session-end --hook against live daemon: still silent, exit 0', async () => {
    const r = runCrag(['session-end', '--hook'], { CRAG_ANCHOR_URL: url });
    assert.strictEqual(r.rc, 0, r.stderr);
    assert.strictEqual(r.stdout.trim(), '');
  });

  try { child.kill(); } catch { /* already gone */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
})();

// ── determinism boundary ────────────────────────────────────────────────

test('boundary: nothing under src/compile/ references the lifecycle files', () => {
  const compileDir = path.join(__dirname, '..', 'src', 'compile');
  for (const f of fs.readdirSync(compileDir).filter((x) => x.endsWith('.js'))) {
    const content = fs.readFileSync(path.join(compileDir, f), 'utf-8');
    assert.ok(!content.includes('commands/session'), `${f} must not import commands/session`);
    assert.ok(!content.includes('commands/hooks'), `${f} must not import commands/hooks`);
    assert.ok(!content.includes('cockpit-client'), `${f} must not import cockpit-client`);
  }
});

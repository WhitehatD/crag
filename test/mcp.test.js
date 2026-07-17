'use strict';

// crag-mcp gateway — public/private boundary + protocol + wiring tests.
// See docs/mcp.md and docs/closed-loop.md rev 5/11 for the design.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

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

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n  src/mcp/ — crag-mcp gateway');

const repoRoot = path.join(__dirname, '..');
const cragBin = path.join(repoRoot, 'bin', 'crag.js');
const cragMcpBin = path.join(repoRoot, 'bin', 'crag-mcp.js');

// ---------------------------------------------------------------------------
// stdio-rpc helpers
// ---------------------------------------------------------------------------

const { makeRequest, makeResult, makeError, makeNotification, ErrorCodes } = require('../src/mcp/stdio-rpc');

test('stdio-rpc: makeRequest/makeResult/makeError produce valid JSON-RPC 2.0 shapes', () => {
  const req = makeRequest(1, 'tools/list', {});
  assert.strictEqual(req.jsonrpc, '2.0');
  assert.strictEqual(req.id, 1);
  assert.strictEqual(req.method, 'tools/list');

  const res = makeResult(1, { ok: true });
  assert.deepStrictEqual(res, { jsonrpc: '2.0', id: 1, result: { ok: true } });

  const err = makeError(1, ErrorCodes.METHOD_NOT_FOUND, 'nope');
  assert.strictEqual(err.error.code, ErrorCodes.METHOD_NOT_FOUND);

  const notif = makeNotification('notifications/initialized', {});
  assert.ok(!('id' in notif), 'notifications must not carry an id');
});

// ---------------------------------------------------------------------------
// config.js — federation is opt-in and generic
// ---------------------------------------------------------------------------

const { loadMemoryConfig, normalizeConfig } = require('../src/mcp/config');

test('config: returns null when nothing is configured', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mcp-cfg-'));
  const prev = process.env.CRAG_MEMORY_MCP;
  delete process.env.CRAG_MEMORY_MCP;
  try {
    assert.strictEqual(loadMemoryConfig(scratch), null);
  } finally {
    if (prev !== undefined) process.env.CRAG_MEMORY_MCP = prev;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('config: env var JSON object (stdio form) is parsed and normalized', () => {
  const prev = process.env.CRAG_MEMORY_MCP;
  process.env.CRAG_MEMORY_MCP = JSON.stringify({ command: 'node', args: ['server.js'] });
  try {
    const cfg = loadMemoryConfig(os.tmpdir());
    assert.strictEqual(cfg.kind, 'stdio');
    assert.strictEqual(cfg.command, 'node');
    assert.deepStrictEqual(cfg.args, ['server.js']);
  } finally {
    if (prev === undefined) delete process.env.CRAG_MEMORY_MCP;
    else process.env.CRAG_MEMORY_MCP = prev;
  }
});

test('config: bare URL shorthand normalizes to http kind', () => {
  const prev = process.env.CRAG_MEMORY_MCP;
  process.env.CRAG_MEMORY_MCP = 'https://example.invalid/mcp';
  try {
    const cfg = loadMemoryConfig(os.tmpdir());
    assert.strictEqual(cfg.kind, 'http');
    assert.strictEqual(cfg.url, 'https://example.invalid/mcp');
  } finally {
    if (prev === undefined) delete process.env.CRAG_MEMORY_MCP;
    else process.env.CRAG_MEMORY_MCP = prev;
  }
});

test('config: .crag/mcp.json in cwd is read when env is absent', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mcp-cfg-'));
  const prev = process.env.CRAG_MEMORY_MCP;
  delete process.env.CRAG_MEMORY_MCP;
  fs.mkdirSync(path.join(scratch, '.crag'));
  fs.writeFileSync(path.join(scratch, '.crag', 'mcp.json'), JSON.stringify({ url: 'https://example.invalid/mcp' }));
  try {
    const cfg = loadMemoryConfig(scratch);
    assert.strictEqual(cfg.kind, 'http');
  } finally {
    if (prev !== undefined) process.env.CRAG_MEMORY_MCP = prev;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('config: malformed .crag/mcp.json fails soft to null, never throws', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mcp-cfg-'));
  const prev = process.env.CRAG_MEMORY_MCP;
  delete process.env.CRAG_MEMORY_MCP;
  fs.mkdirSync(path.join(scratch, '.crag'));
  fs.writeFileSync(path.join(scratch, '.crag', 'mcp.json'), '{not valid json');
  try {
    assert.strictEqual(loadMemoryConfig(scratch), null);
  } finally {
    if (prev !== undefined) process.env.CRAG_MEMORY_MCP = prev;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('config: no product-specific defaults — normalizeConfig never invents a URL/command', () => {
  assert.strictEqual(normalizeConfig({}), null);
  assert.strictEqual(normalizeConfig({ foo: 'bar' }), null);
});

// ---------------------------------------------------------------------------
// federation.js — graceful absence + generic proxying (no live backend)
// ---------------------------------------------------------------------------

const { buildFederation } = require('../src/mcp/federation');

asyncTest('federation: resolves to zero tools when unconfigured', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mcp-fed-'));
  const prev = process.env.CRAG_MEMORY_MCP;
  delete process.env.CRAG_MEMORY_MCP;
  try {
    const fed = await buildFederation(scratch);
    assert.deepStrictEqual(fed.tools, []);
    assert.strictEqual(fed.adapter, null);
  } finally {
    if (prev !== undefined) process.env.CRAG_MEMORY_MCP = prev;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// governance-tools.js — wraps the real CLI, never reimplements it
// ---------------------------------------------------------------------------

asyncTest('governance-tools: crag.status reports governanceFound:false outside any project', async () => {
  const { toolStatus } = require('../src/mcp/governance-tools');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mcp-status-'));
  try {
    const result = await toolStatus({ cwd: scratch });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.governanceFound, false);
    assert.strictEqual(result.isError, false);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

asyncTest('governance-tools: crag.audit on a project with no governance.md returns the CLI\'s structured error, not a crash', async () => {
  const { toolAudit } = require('../src/mcp/governance-tools');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mcp-audit-'));
  try {
    const result = await toolAudit({ cwd: scratch });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.error, 'no governance.md found');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Full protocol: spawn crag-mcp, speak MCP over stdio, verify clean exit.
// ---------------------------------------------------------------------------

function runMcpServer(messages, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cragMcpBin], { cwd: cwd || repoRoot });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => {
      const lines = out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
      resolve({ code, lines, stderr: err });
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
    setTimeout(() => child.stdin.end(), 1000);
  });
}

asyncTest('server: initialize handshake returns protocolVersion + serverInfo.name "crag"', async () => {
  const pkg = require(path.join(repoRoot, 'package.json'));
  const { code, lines } = await runMcpServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
  ]);
  assert.strictEqual(code, 0, 'server must exit 0 on stdin close');
  const initMsg = lines.find((l) => l.id === 1);
  assert.strictEqual(initMsg.result.serverInfo.name, 'crag');
  assert.strictEqual(initMsg.result.serverInfo.version, pkg.version);
});

asyncTest('server: tools/list exposes exactly the 3 governance tools when unconfigured', async () => {
  const { lines } = await runMcpServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]);
  const listMsg = lines.find((l) => l.id === 2);
  const names = listMsg.result.tools.map((t) => t.name).sort();
  assert.deepStrictEqual(names, ['crag.audit', 'crag.compile', 'crag.status']);
});

asyncTest('server: tools/call crag.status returns structured content for an unset cwd', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-mcp-server-'));
  try {
    const { lines } = await runMcpServer([
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'crag.status', arguments: { cwd: scratch } } },
    ], scratch);
    const callMsg = lines.find((l) => l.id === 2);
    assert.strictEqual(callMsg.result.isError, false);
    const parsed = JSON.parse(callMsg.result.content[0].text);
    assert.strictEqual(parsed.governanceFound, false);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

asyncTest('server: tools/call on an unknown tool returns a JSON-RPC error, not a crash', async () => {
  const { lines, code } = await runMcpServer([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'crag.nonexistent', arguments: {} } },
  ]);
  assert.strictEqual(code, 0);
  const callMsg = lines.find((l) => l.id === 2);
  assert.ok(callMsg.error, 'expected a JSON-RPC error for an unknown tool');
  assert.strictEqual(callMsg.error.code, ErrorCodes.METHOD_NOT_FOUND);
});

// ---------------------------------------------------------------------------
// Determinism boundary: the pure compile core must not know src/mcp/ exists.
// ---------------------------------------------------------------------------

test('boundary: nothing under src/compile/ imports src/mcp/', () => {
  const compileDir = path.join(repoRoot, 'src', 'compile');
  const files = fs.readdirSync(compileDir).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const content = fs.readFileSync(path.join(compileDir, f), 'utf-8');
    assert.ok(!content.includes('mcp/'), `${f} must not reference src/mcp/`);
  }
});

test('boundary: `crag --version` still reports the package version (pure CLI path unaffected)', () => {
  const out = execFileSync('node', [cragBin, '--version'], { encoding: 'utf-8', cwd: repoRoot });
  const pkg = require(path.join(repoRoot, 'package.json'));
  assert.ok(out.includes(pkg.version), `expected version ${pkg.version} in output: ${out}`);
});

test('boundary: no private/user-specific strings anywhere under src/ or bin/', () => {
  const bannedPatterns = [/alexc/i, /playground\/brain/i, /headroom-venv/i, /46\.62\./, /ciocandco/i];
  const dirs = [path.join(repoRoot, 'src'), path.join(repoRoot, 'bin')];
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf-8');
        for (const pat of bannedPatterns) {
          if (pat.test(content)) offenders.push(`${full} matches ${pat}`);
        }
      }
    }
  }
  for (const d of dirs) walk(d);
  assert.deepStrictEqual(offenders, [], `boundary violation(s): ${offenders.join('; ')}`);
});

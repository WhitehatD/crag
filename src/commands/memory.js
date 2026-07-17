'use strict';

/**
 * `crag memory` — lifecycle surface for the crag-engine memory backend.
 *
 *   crag memory up        Start the engine daemon (crag-engine, pip/docker
 *                         install) and wire this repo's .crag/mcp.json.
 *   crag memory status    Reachability + corpus stats of the configured backend.
 *   crag memory down      Stop the engine daemon (delegates to crag-engine).
 *   crag memory register  Write .crag/mcp.json only (no daemon lifecycle).
 *
 * NOT part of the deterministic compile path: like `crag mcp` and
 * `crag distill`, this command is the opt-in bridge layer. Nothing under
 * src/compile/ imports this file, and it imports nothing from src/compile/.
 * The determinism guarantee of `crag compile` / `crag audit` (offline mode)
 * is untouched — the engine is an OPT-IN backend that this command manages.
 *
 * The engine itself (crag-engine) is a separate install:
 *   pip install crag-engine        (or the docker image)
 * `crag memory up` shells out to the `crag-engine` CLI when present and
 * fails with actionable install instructions when not. crag stays
 * zero-dependency — no python, no engine code, is vendored here.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateFlags } = require('../cli-args');
const { cliError, EXIT_USER } = require('../cli-errors');

const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8786';
const HEALTH_TIMEOUT_MS = 3000;
const UP_WAIT_TOTAL_MS = 90000; // model load on first boot can take ~60s
const UP_POLL_INTERVAL_MS = 1500;

/**
 * Resolve the engine's REST base URL (for /health + /stats probes):
 * env CRAG_ENGINE_URL > default loopback. NOTE this is the daemon's REST
 * surface, distinct from the MCP config in .crag/mcp.json (which describes
 * how MCP clients — crag-mcp federation, crag distill — reach the backend's
 * MCP server, usually stdio `crag-engine mcp`).
 */
function engineUrl() {
  return process.env.CRAG_ENGINE_URL || DEFAULT_ENGINE_URL;
}

/** GET <url><path> with a hard timeout. Returns parsed JSON or null. */
async function getJson(base, p, timeoutMs = HEALTH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base.replace(/\/$/, '') + p, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Is the `crag-engine` CLI installed and on PATH? Returns its version or null. */
function engineCliVersion() {
  const probe = spawnSync('crag-engine', ['--version'], {
    encoding: 'utf-8', timeout: 10000, shell: process.platform === 'win32',
  });
  if (probe.error || probe.status !== 0) return null;
  return String(probe.stdout || '').trim() || 'unknown';
}

/**
 * Write .crag/mcp.json in the EXACT shape src/mcp/config.js loadMemoryConfig
 * expects: a top-level `{command, args}` (stdio MCP backend) — the standard
 * wiring for a pip-installed engine is `{"command":"crag-engine","args":["mcp"]}`.
 * Idempotent; refuses to clobber a DIFFERENT existing config unless --force.
 */
const STDIO_CONFIG = { command: 'crag-engine', args: ['mcp'] };

function registerConfig(cwd, force) {
  const dir = path.join(cwd, '.crag');
  const cfgPath = path.join(dir, 'mcp.json');
  let existing = null;
  try { existing = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch { /* absent/invalid */ }

  if (existing && (existing.command || existing.url)) {
    const same = existing.command === STDIO_CONFIG.command
      && JSON.stringify(existing.args || []) === JSON.stringify(STDIO_CONFIG.args);
    if (!same && !force) {
      cliError(
        `.crag/mcp.json already configures a memory backend (` +
        `${existing.command ? `command: ${existing.command}` : `url: ${existing.url}`}) — ` +
        `re-run with --force to overwrite with the crag-engine stdio config.`, EXIT_USER);
    }
    if (same) return cfgPath; // already correctly wired
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(STDIO_CONFIG, null, 2) + '\n', 'utf-8');
  return cfgPath;
}

const INSTALL_HINT = `crag-engine is not installed (the \`crag-engine\` CLI is not on PATH).

  Install it:
    pip install crag-engine          # local daemon (recommended)
  or run the docker image — see the crag-engine README.

  Then re-run: crag memory up`;

async function up(cwd, args) {
  const url = engineUrl(cwd);

  // Already running? Then just make sure the repo is wired.
  const pre = await getJson(url, '/health');
  if (pre && pre.ok) {
    const cfgPath = registerConfig(cwd, args.includes('--force'));
    console.log(`  engine already running at ${url} (version ${pre.version || '?'})`);
    console.log(`  wired: ${path.relative(cwd, cfgPath)}`);
    printMcpHint();
    return;
  }

  const version = engineCliVersion();
  if (!version) cliError(INSTALL_HINT, EXIT_USER);

  console.log(`  starting crag-engine (${version}) ...`);
  const start = spawnSync('crag-engine', ['up', '--detach'], {
    encoding: 'utf-8', timeout: 60000, shell: process.platform === 'win32',
  });
  if (start.error || start.status !== 0) {
    cliError(`crag-engine up failed: ${(start.stderr || start.error && start.error.message || 'unknown error').trim()}`, EXIT_USER);
  }

  // Poll /health until the model is loaded (first boot downloads/loads ~60s).
  const deadline = Date.now() + UP_WAIT_TOTAL_MS;
  process.stdout.write('  waiting for /health ');
  while (Date.now() < deadline) {
    const h = await getJson(url, '/health');
    if (h && h.ok) {
      process.stdout.write('\n');
      const cfgPath = registerConfig(cwd, args.includes('--force'));
      console.log(`  engine up at ${url} (version ${h.version || '?'}, model_loaded=${h.model_loaded === true})`);
      console.log(`  wired: ${path.relative(cwd, cfgPath)}`);
      printMcpHint();
      return;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, UP_POLL_INTERVAL_MS));
  }
  process.stdout.write('\n');
  cliError(`engine did not become healthy at ${url} within ${UP_WAIT_TOTAL_MS / 1000}s — check \`crag-engine logs\`.`, EXIT_USER);
}

async function status(cwd) {
  const url = engineUrl(cwd);
  const cfgPath = path.join(cwd, '.crag', 'mcp.json');
  const wired = fs.existsSync(cfgPath);

  const h = await getJson(url, '/health');
  if (!h || !h.ok) {
    console.log(`  engine: DOWN (${url})`);
    console.log(`  wired:  ${wired ? '.crag/mcp.json present' : 'not wired (run \`crag memory up\`)'}`);
    process.exitCode = 1;
    return;
  }
  const stats = await getJson(url, '/stats');
  console.log(`  engine: UP at ${url}`);
  console.log(`  version: ${h.version || '?'}   model_loaded: ${h.model_loaded === true}`);
  if (stats && typeof stats === 'object') {
    const ic = stats.insight_counts || {};
    const n = (v) => (typeof v === 'number' ? v : '?');
    console.log(`  corpus: ${n(ic.active)} active insights / ${n(ic.principles)} principles`);
  }
  console.log(`  wired:  ${wired ? '.crag/mcp.json present' : 'not wired (run \`crag memory up\`)'}`);
}

function down() {
  const version = engineCliVersion();
  if (!version) cliError(INSTALL_HINT, EXIT_USER);
  const stop = spawnSync('crag-engine', ['down'], {
    encoding: 'utf-8', timeout: 60000, shell: process.platform === 'win32',
  });
  if (stop.error || stop.status !== 0) {
    cliError(`crag-engine down failed: ${(stop.stderr || stop.error && stop.error.message || 'unknown error').trim()}`, EXIT_USER);
  }
  console.log('  engine stopped.');
}

function printMcpHint() {
  console.log(`
  Memory tools are now available through the crag-mcp gateway:
    claude mcp add crag crag-mcp
  Verified principles compile into governance with:
    crag distill`);
}

async function memory(args) {
  validateFlags('memory', args, { boolean: ['--force'], string: ['--url'] });
  const cwd = process.cwd();
  const sub = (args.find((a) => !a.startsWith('-')) || 'status').toLowerCase();

  const urlFlagIdx = args.findIndex((a) => a === '--url' || a.startsWith('--url='));
  if (urlFlagIdx !== -1) {
    const v = args[urlFlagIdx].includes('=')
      ? args[urlFlagIdx].split('=')[1]
      : args[urlFlagIdx + 1];
    if (v) process.env.CRAG_ENGINE_URL = v;
  }

  if (sub === 'up') return up(cwd, args);
  if (sub === 'status') return status(cwd);
  if (sub === 'down') return down();
  if (sub === 'register') {
    const cfgPath = registerConfig(cwd, args.includes('--force'));
    console.log(`  wired: ${path.relative(cwd, cfgPath)} (stdio: crag-engine mcp)`);
    return;
  }
  cliError(`unknown subcommand \`${sub}\` — expected up | status | down | register`, EXIT_USER);
}

module.exports = { memory, engineUrl, registerConfig };

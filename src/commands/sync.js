'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { validateFlags } = require('../cli-args');
const { cliError, cliWarn, EXIT_USER, requireGovernance, readFileOrExit } = require('../cli-errors');
const { requireAuth, readCredentials } = require('../cloud/auth');
const { apiRequest } = require('../cloud/client');
const { parseGovernance } = require('../governance/parse');
const { engineUrl, getJson, printDownHint } = require('./cockpit-client');

/**
 * crag sync — synchronize governance.md and verified-memory with crag cloud.
 *
 * Subcommands:
 *   crag sync              Show sync status (default)
 *   crag sync --push       Push local governance to cloud
 *   crag sync --pull       Pull governance from cloud
 *   crag sync --status     Show sync status (explicit)
 *   crag sync --memory     Push a verified-memory snapshot (trust + rules) to cloud
 *   crag sync --force      Force overwrite on conflict (with --push or --pull)
 *   crag sync --json       Machine-readable output (with --memory)
 */
async function sync(args) {
  validateFlags('sync', args, {
    boolean: ['--push', '--pull', '--status', '--memory', '--force', '--json'],
  });

  if (args.includes('--memory')) return syncMemory(args);
  if (args.includes('--push')) return syncPush(args);
  if (args.includes('--pull')) return syncPull(args);
  return syncStatus();
}

/**
 * Detect GitHub owner/repo from the git remote URL.
 * Returns { owner, repo } or null.
 */
function detectRepo(cwd) {
  let remote;
  try {
    remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }

  // git@github.com:owner/repo.git
  const ssh = remote.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  // https://github.com/owner/repo.git
  const https = remote.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return { owner: https[1], repo: https[2] };

  return null;
}

function getBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function getHeadSha(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function localHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function repoOrExit(cwd) {
  const repo = detectRepo(cwd);
  if (!repo) {
    cliError('could not detect GitHub repo from git remote. Sync requires a GitHub-hosted repository.', EXIT_USER);
  }
  return repo;
}

// ── push ────────────────────────────────────────────────────────────────

/**
 * Run `crag audit --json` as a subprocess and return the parsed report.
 *
 * We shell out instead of calling audit.js directly because audit.js
 * prints to stdout and calls process.exit() when drift is found, which
 * would terminate sync too. Returns null on failure so push can degrade
 * gracefully — we still upload governance even if audit can't run.
 *
 * Uses spawnSync instead of execFileSync to avoid a libuv UV_HANDLE_CLOSING
 * assertion crash on Windows (Node.js bug with execFileSync + piped stdio).
 * Resolves the crag entry point via require.resolve so it works regardless
 * of whether crag was installed globally, via npx, or locally.
 */
function captureAuditReport(cwd) {
  try {
    // Resolve the actual crag.js entry point — works for global installs,
    // local node_modules, and npx alike. Avoids Windows .cmd wrapper issues.
    const cragEntry = path.resolve(__dirname, '../../bin/crag.js');
    const result = spawnSync(process.execPath, [cragEntry, 'audit', '--json'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1', NO_COLOR: '1' },
      timeout: 30_000,
      windowsHide: true,
    });
    const out = (result.stdout || '').trim();
    if (out) {
      try { return JSON.parse(out); } catch { /* not JSON */ }
    }
    return null;
  } catch {
    return null;
  }
}

async function syncPush(args) {
  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const force = args.includes('--force');
  const cwd = process.cwd();
  const creds = requireAuth();
  const govPath = requireGovernance(cwd);
  const repo = repoOrExit(cwd);

  console.log(`\n  ${B}crag sync --push${X}\n`);
  console.log(`  ${D}Repo${X}  ${repo.owner}/${repo.repo}`);

  const content = readFileOrExit(fs, govPath, 'governance.md');
  const parsed = parseGovernance(content);
  const branch = getBranch(cwd);

  // Capture an audit report so the dashboard can show live drift counts.
  // Best-effort: if audit fails for any reason we push governance alone.
  const auditReport = captureAuditReport(cwd);
  const auditPayload = auditReport && auditReport.summary ? {
    stale: auditReport.summary.stale || 0,
    drift: auditReport.summary.drift || 0,
    extra: auditReport.summary.extra || 0,
    missing: auditReport.summary.missing || 0,
    report: auditReport,
  } : undefined;

  const payload = {
    repo: { owner: repo.owner, name: repo.repo },
    governance: content,
    commitSha: getHeadSha(cwd),
    force,
    ...(auditPayload ? { audit: auditPayload } : {}),
  };

  try {
    const result = await apiRequest('POST', '/api/sync/push', {
      token: creds.token,
      body: payload,
    });

    console.log(`  ${G}\u2713${X} Pushed governance to cloud`);
    if (result.snapshotId) console.log(`  ${D}Snapshot${X}  ${result.snapshotId.slice(0, 8)}`);
    console.log(`  ${D}Changed${X}   ${result.contentChanged ? 'yes' : 'no (content identical)'}`);
    if (auditPayload) {
      const total = auditPayload.stale + auditPayload.drift + auditPayload.extra + auditPayload.missing;
      if (total === 0) {
        console.log(`  ${D}Audit${X}     ${G}\u2713${X} no drift`);
      } else {
        const parts = [];
        if (auditPayload.stale)   parts.push(`${auditPayload.stale} stale`);
        if (auditPayload.drift)   parts.push(`${auditPayload.drift} drift`);
        if (auditPayload.extra)   parts.push(`${auditPayload.extra} extra`);
        if (auditPayload.missing) parts.push(`${auditPayload.missing} missing`);
        console.log(`  ${D}Audit${X}     ${parts.join(' \u00B7 ')}`);
      }
    }
    console.log('');
  } catch (err) {
    if (err.status === 409 && !force) {
      cliError('remote governance is newer. Use --force to overwrite, or --pull first.', EXIT_USER);
    }
    cliError(`push failed: ${err.message}`, EXIT_USER);
  }
}

// ── pull ────────────────────────────────────────────────────────────────

async function syncPull(args) {
  const G = '\x1b[32m'; const Y = '\x1b[33m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const force = args.includes('--force');
  const cwd = process.cwd();
  const creds = requireAuth();
  const repo = repoOrExit(cwd);

  console.log(`\n  ${B}crag sync --pull${X}\n`);
  console.log(`  ${D}Repo${X}  ${repo.owner}/${repo.repo}`);

  let result;
  try {
    result = await apiRequest('GET', `/api/sync/pull?repo=${repo.owner}/${repo.repo}`, {
      token: creds.token,
    });
  } catch (err) {
    if (err.status === 404) {
      const Y = '\x1b[33m'; const D = '\x1b[2m'; const X = '\x1b[0m';
      console.log(`  ${Y}\u25cb${X} No governance found on cloud for this repo.`);
      console.log(`  ${D}Run:${X} crag sync --push ${D}to upload first.${X}\n`);
      return;
    }
    cliError(`pull failed: ${err.message}`, EXIT_USER);
  }

  if (!result.governance) {
    console.log(`  ${Y}\u25cb${X} No governance found on cloud for this repo.`);
    console.log(`  ${D}Run:${X} crag sync --push ${D}to upload first.${X}\n`);
    return;
  }

  const govPath = path.join(cwd, '.claude', 'governance.md');
  const existing = fs.existsSync(govPath) ? fs.readFileSync(govPath, 'utf-8') : null;

  if (existing && existing === result.governance) {
    console.log(`  ${G}\u2713${X} Already up to date.`);
    if (result.version) console.log(`  ${D}Version${X}  ${result.version}`);
    console.log('');
    return;
  }

  if (existing && !force) {
    cliWarn('local governance.md differs from cloud. Use --force to overwrite.');
    console.log(`  ${D}Or manually merge with:${X} crag diff\n`);
    process.exit(EXIT_USER);
  }

  const { atomicWrite } = require('../compile/atomic-write');
  atomicWrite(govPath, result.governance);

  console.log(`  ${G}\u2713${X} Pulled governance from cloud`);
  if (result.version) console.log(`  ${D}Version${X}     ${result.version}`);
  if (result.updated_by) console.log(`  ${D}Updated by${X}  ${result.updated_by}`);
  console.log('');
}

// ── status ──────────────────────────────────────────────────────────────

async function syncStatus() {
  const G = '\x1b[32m'; const Y = '\x1b[33m';
  const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const cwd = process.cwd();
  const creds = requireAuth();
  const repo = repoOrExit(cwd);

  console.log(`\n  ${B}crag sync${X} ${D}\u2014 status${X}\n`);
  console.log(`  ${D}Repo${X}    ${repo.owner}/${repo.repo}`);
  console.log(`  ${D}User${X}    ${creds.user}`);

  let result;
  try {
    result = await apiRequest('GET', `/api/sync/status?repo=${repo.owner}/${repo.repo}`, {
      token: creds.token,
    });
  } catch (err) {
    cliError(`sync status failed: ${err.message}`, EXIT_USER);
  }

  console.log(`  ${D}Cloud${X}   ${result.synced ? `synced (${result.gateCount} gates)` : 'not synced'}`);
  if (result.lastSyncedAt) console.log(`  ${D}Synced${X}  ${result.lastSyncedAt}`);

  // Compare local hash vs cloud hash
  const govPath = path.join(cwd, '.claude', 'governance.md');
  if (fs.existsSync(govPath) && result.latestHash) {
    const local = fs.readFileSync(govPath, 'utf-8');
    const localFull = crypto.createHash('sha256').update(local).digest('hex');
    const lh = localFull.slice(0, 12);
    const cloudShort = result.latestHash.length > 12 ? result.latestHash.slice(0, 12) : result.latestHash;
    if (localFull === result.latestHash || lh === cloudShort) {
      console.log(`  ${G}\u2713${X} In sync`);
    } else {
      console.log(`  ${Y}!${X} Local differs from cloud`);
      console.log(`    ${D}Local${X}  ${lh}  ${D}Cloud${X}  ${cloudShort}`);
    }
  } else if (!result.synced) {
    console.log(`  ${Y}\u25cb${X} Not yet synced \u2014 run: crag sync --push`);
  }

  console.log('');
}

// ── memory ──────────────────────────────────────────────────────────────

/**
 * A stable per-machine identifier, derived WITHOUT any new dependency:
 * sha256(hostname + os-username + first non-zero MAC), truncated to 16 hex
 * chars. Not cryptographically sensitive — just enough entropy to tell two
 * machines apart for "latest per (org, user, device)" in a future cloud UI.
 * Falls back gracefully if a sandbox has no network interfaces or userInfo.
 */
function deviceId() {
  let mac = '';
  const ifaces = os.networkInterfaces() || {};
  outer:
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.mac && iface.mac !== '00:00:00:00:00:00') { mac = iface.mac; break outer; }
    }
  }
  let username = '';
  try { username = os.userInfo().username || ''; } catch { /* sandboxes without a user db */ }
  const seed = `${os.hostname()}:${username}:${mac}`;
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

/**
 * crag sync --memory — push a verified-memory snapshot to crag cloud.
 *
 * Reads the LOCAL crag-anchor daemon's GET /overview + GET /rules (the same
 * aggregate endpoints `crag status` / `crag why` already consume — see
 * cockpit-client.js) and POSTs a compact snapshot to POST /api/memory/snapshot,
 * authenticated with the same bearer token every other cloud command uses.
 *
 * The cloud is never able to reach back to 127.0.0.1:8786 itself (browsers
 * block HTTPS -> HTTP-localhost as mixed content) — this command is the SEND
 * half of that bridge. Engine reachability is checked BEFORE auth so a dead
 * daemon always produces the `crag memory up` hint, regardless of login state.
 *
 * NOTE on exit style below: once a fetch() to the engine has SUCCEEDED, the
 * global undici agent pools a keep-alive socket. On Windows, a subsequent
 * *forced* process.exit() (what cliError()/requireAuth() do) can race that
 * socket's async-handle teardown and crash with `Assertion failed:
 * !(handle->flags & UV_HANDLE_CLOSING)` — the same libuv class of bug this
 * file already routes around for spawnSync in captureAuditReport(). So past
 * this point we set process.exitCode + return instead of calling
 * requireAuth()/cliError(), letting the event loop drain the socket
 * naturally. The early engine-down exits above are unaffected (no successful
 * fetch has happened yet there, so no pooled socket exists to race).
 */
async function syncMemory(args) {
  const asJson = args.includes('--json');
  const url = engineUrl();

  const overviewResp = await getJson(url, '/overview');
  if (!overviewResp || !overviewResp.ok) return memoryEngineDown(url, asJson);

  const rulesResp = await getJson(url, '/rules');
  if (!rulesResp || !rulesResp.ok) return memoryEngineDown(url, asJson);

  const creds = readCredentials();
  if (!creds || !creds.token) return memorySoftError('not logged in. Run crag login first.', asJson);

  const overview = {
    trust_score: overviewResp.trust_score,
    counts: overviewResp.counts,
    today: overviewResp.today,
    generated_at: overviewResp.generated_at || new Date().toISOString(),
  };
  const rules = Array.isArray(rulesResp.rules) ? rulesResp.rules.map((r) => ({
    principle_id: r.principle_id,
    text: r.text,
    confidence: r.confidence,
    project: r.project,
    claim_health: r.claim_health,
    stale: r.stale,
  })) : [];
  const device = { device_id: deviceId(), hostname: os.hostname() };

  let result;
  try {
    result = await apiRequest('POST', '/api/memory/snapshot', {
      token: creds.token,
      body: { overview, rules, device },
    });
  } catch (err) {
    return memorySoftError(`memory push failed: ${err.message}`, asJson);
  }

  if (asJson) {
    console.log(JSON.stringify({ ok: true, ...result, ruleCount: rules.length }));
    return;
  }

  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const trust = overview.trust_score;
  const pct = trust && typeof trust.value === 'number' ? `${Math.round(trust.value * 100)}%` : '\u2014';

  console.log(`\n  ${B}crag sync --memory${X}\n`);
  console.log(`  ${G}\u2713${X} pushed snapshot: trust ${pct}, ${rules.length} rule${rules.length === 1 ? '' : 's'}`);
  if (result && result.snapshotId) console.log(`  ${D}Snapshot${X}  ${String(result.snapshotId).slice(0, 8)}`);
  console.log(`  ${D}Device${X}    ${device.hostname} (${device.device_id.slice(0, 8)})`);
  console.log('');
}

function memoryEngineDown(url, asJson) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: 'engine_unreachable' }));
  else printDownHint(url);
  process.exit(EXIT_USER); // safe: no successful fetch has happened yet, nothing pooled to race
}

/**
 * Non-forced failure path for syncMemory — see the NOTE above syncMemory()
 * for why this doesn't call cliError()/process.exit() directly once an
 * engine fetch has already succeeded. Same message format as cliError().
 */
function memorySoftError(message, asJson) {
  if (asJson) console.log(JSON.stringify({ ok: false, error: message }));
  else console.error(`  \x1b[31m\u2717\x1b[0m Error: ${message}`);
  process.exitCode = EXIT_USER;
}

module.exports = { sync, detectRepo, deviceId };

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { validateFlags } = require('../cli-args');
const { cliError, cliWarn, EXIT_USER, requireGovernance, readFileOrExit } = require('../cli-errors');
const { requireAuth } = require('../cloud/auth');
const { apiRequest } = require('../cloud/client');
const { parseGovernance } = require('../governance/parse');

/**
 * crag sync — synchronize governance.md with crag cloud.
 *
 * Subcommands:
 *   crag sync              Show sync status (default)
 *   crag sync --push       Push local governance to cloud
 *   crag sync --pull       Pull governance from cloud
 *   crag sync --status     Show sync status (explicit)
 *   crag sync --force      Force overwrite on conflict (with --push or --pull)
 */
async function sync(args) {
  validateFlags('sync', args, {
    boolean: ['--push', '--pull', '--status', '--force'],
  });

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

  const payload = {
    repo: { owner: repo.owner, name: repo.repo },
    governance: content,
    commitSha: getHeadSha(cwd),
    force,
  };

  try {
    const result = await apiRequest('POST', '/api/sync/push', {
      token: creds.token,
      body: payload,
    });

    console.log(`  ${G}\u2713${X} Pushed governance to cloud`);
    if (result.snapshotId) console.log(`  ${D}Snapshot${X}  ${result.snapshotId.slice(0, 8)}`);
    console.log(`  ${D}Changed${X}   ${result.contentChanged ? 'yes' : 'no (content identical)'}`);
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
    const lh = localHash(local);
    const cloudShort = result.latestHash.slice(0, 12);
    if (lh === cloudShort) {
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

module.exports = { sync, detectRepo };

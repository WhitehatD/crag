#!/usr/bin/env node
'use strict';

/**
 * Drift Leaderboard — audit 100 top repos with crag.
 *
 * Usage:
 *   node benchmarks/run-leaderboard.js              # run all 100
 *   node benchmarks/run-leaderboard.js --limit 5    # test with 5
 *   node benchmarks/run-leaderboard.js --resume     # resume interrupted run
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ───────────────────────────────────────────────────────

const REPOS_FILE = path.join(__dirname, 'repos-100.txt');
const CRAG = path.join(__dirname, '..', 'bin', 'crag.js');
const REPOS_DIR = path.join(__dirname, 'leaderboard-repos');
const RESULTS_FILE = path.join(__dirname, 'leaderboard.json');
const PARTIAL_FILE = path.join(__dirname, 'leaderboard.jsonl');
const REPORT_FILE = path.join(__dirname, 'leaderboard.md');
const CLONE_TIMEOUT = 120_000;  // 2 min for large repos
const CRAG_TIMEOUT = 60_000;    // 1 min per crag command

// AI config files to check for in each repo
const AI_CONFIG_FILES = [
  '.cursorrules',
  '.cursor/rules',
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.clinerules',
  '.continuerules',
  '.windsurf',
  '.rules',
  '.amazonq',
  '.github/copilot-instructions.md',
];

// ── Parse args ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const resume = args.includes('--resume');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── Load repo list ───────────────────────────────────────────────

const allRepos = fs.readFileSync(REPOS_FILE, 'utf-8')
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && !l.startsWith('#'));

const repos = allRepos.slice(0, Math.min(allRepos.length, limit));

// ── Load previous results for --resume ───────────────────────────

const done = new Set();
let results = [];

if (resume && fs.existsSync(RESULTS_FILE)) {
  try {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
    for (const r of results) done.add(r.repo);
    console.log(`  Resuming: ${done.size} repos already completed.\n`);
  } catch {
    console.log('  Warning: could not parse existing leaderboard.json, starting fresh.\n');
    results = [];
  }
} else if (resume && fs.existsSync(PARTIAL_FILE)) {
  // Try recovering from JSONL partial results
  try {
    const lines = fs.readFileSync(PARTIAL_FILE, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      const entry = JSON.parse(line);
      if (!done.has(entry.repo)) {
        results.push(entry);
        done.add(entry.repo);
      }
    }
    console.log(`  Resuming from JSONL: ${done.size} repos recovered.\n`);
  } catch {
    console.log('  Warning: could not parse leaderboard.jsonl, starting fresh.\n');
    results = [];
  }
}

// ── Ensure repos dir ─────────────────────────────────────────────

if (!fs.existsSync(REPOS_DIR)) fs.mkdirSync(REPOS_DIR, { recursive: true });

// ── Helpers ──────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf-8',
      timeout: opts.timeout || 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return { ok: true, stdout, stderr: '', code: 0 };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      code: err.status || 1,
    };
  }
}

function runCrag(cragArgs, cwd) {
  return run(process.execPath, [CRAG, ...cragArgs], {
    cwd,
    timeout: CRAG_TIMEOUT,
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
  });
}

function getStars(repo) {
  try {
    const stdout = execFileSync('gh', ['api', `repos/${repo}`, '--jq', '.stargazers_count'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return parseInt(stdout.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function detectAIConfigs(repoDir) {
  const found = [];
  for (const f of AI_CONFIG_FILES) {
    const fullPath = path.join(repoDir, f);
    if (fs.existsSync(fullPath)) {
      found.push(f);
    }
  }
  return found;
}

function calcScore(drift) {
  // Only count genuinely meaningful drift axes:
  //   drift  = gate references tool that doesn't exist (always real)
  //   extra  = CI has commands not in governance (always real)
  // Exclude from scoring:
  //   stale  = existing files older than freshly-generated governance.md (tautological)
  //   missing = has .github/workflows but no crag-compiled gates.yml (tautological)
  let score = 100;
  score -= (drift.drift || 0) * 15;
  score -= (drift.extra || 0) * 5;
  return Math.max(0, score);
}

function formatStars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return String(n);
}

function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows sometimes holds file handles briefly — retry once
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* give up silently */ }
  }
}

function appendPartial(entry) {
  fs.appendFileSync(PARTIAL_FILE, JSON.stringify(entry) + '\n');
}

// ── Main loop ────────────────────────────────────────────────────

console.log(`\n  Drift Leaderboard: ${repos.length} repos\n`);

const G = '\x1b[32m';
const R = '\x1b[31m';
const Y = '\x1b[33m';
const D = '\x1b[2m';
const X = '\x1b[0m';

let processed = 0;
let skipped = 0;
let failed = 0;

for (let i = 0; i < repos.length; i++) {
  const repo = repos[i];
  const idx = `[${i + 1}/${repos.length}]`;

  // Skip if already done (--resume)
  if (done.has(repo)) {
    process.stdout.write(`  ${D}${idx} ${repo} — already done, skipping${X}\n`);
    skipped++;
    continue;
  }

  const repoName = repo.replace('/', '__');
  const repoDir = path.join(REPOS_DIR, repoName);

  // Clean up any leftover from a previous interrupted run
  rmrf(repoDir);

  const entry = {
    repo,
    stars: 0,
    stack: '',
    gates: 0,
    drift: { stale: 0, drift: 0, extra: 0, missing: 0, total: 0 },
    aiConfigs: [],
    aiConfigCount: 0,
    score: 100,
    error: null,
    timestamp: new Date().toISOString(),
  };

  // Step 1: Clone
  const cloneResult = run('git', [
    'clone', '--depth', '1', '--filter=blob:none', '--single-branch',
    `https://github.com/${repo}.git`, repoDir,
  ], { timeout: CLONE_TIMEOUT });

  if (!cloneResult.ok) {
    entry.error = `clone failed: ${cloneResult.stderr.slice(0, 200)}`;
    process.stdout.write(`  ${R}${idx} ${repo} — clone failed${X}\n`);
    results.push(entry);
    appendPartial(entry);
    failed++;
    rmrf(repoDir);
    continue;
  }

  // Step 2: Detect existing AI configs (before crag touches anything)
  entry.aiConfigs = detectAIConfigs(repoDir);
  entry.aiConfigCount = entry.aiConfigs.length;

  // Step 3: Get stars
  entry.stars = getStars(repo);

  // Step 4: Analyze
  const analyzeResult = runCrag(['analyze', '--no-install-skills'], repoDir);
  if (!analyzeResult.ok) {
    entry.error = `analyze failed: ${analyzeResult.stderr.slice(0, 200)}`;
    process.stdout.write(`  ${Y}${idx} ${repo} — analyze failed${X}\n`);
    results.push(entry);
    appendPartial(entry);
    failed++;
    rmrf(repoDir);
    continue;
  }

  // Extract stack and gate count from governance.md
  const govPath = path.join(repoDir, '.claude', 'governance.md');
  if (fs.existsSync(govPath)) {
    const gov = fs.readFileSync(govPath, 'utf-8');
    const stackMatch = gov.match(/- Stack:\s*(.+)/);
    if (stackMatch) entry.stack = stackMatch[1].trim();
    // Count gate lines (lines starting with "- " under ## Gates sections)
    const gateLines = gov.match(/^- .+$/gm);
    if (gateLines) entry.gates = gateLines.length;
  }

  // Step 5: Audit
  const auditResult = runCrag(['audit', '--json'], repoDir);
  if (auditResult.stdout.trim().startsWith('{')) {
    try {
      const auditData = JSON.parse(auditResult.stdout.trim());
      if (auditData.summary) {
        entry.drift = {
          stale: auditData.summary.stale || 0,
          drift: auditData.summary.drift || 0,
          extra: auditData.summary.extra || 0,
          missing: auditData.summary.missing || 0,
          total: auditData.summary.total || 0,
        };
      }
    } catch { /* malformed JSON — leave drift at defaults */ }
  }

  // Step 6: Calculate score
  entry.score = calcScore(entry.drift);
  if (entry.aiConfigCount > 0) entry.score = Math.min(100, entry.score + 10);

  // Log progress
  const statusIcon = entry.drift.total === 0 ? `${G}\u2713` : `${Y}!`;
  const aiTag = entry.aiConfigCount > 0 ? ` ${entry.aiConfigCount} AI configs` : '';
  process.stdout.write(
    `  ${statusIcon}${X} ${idx} ${repo.padEnd(40)} ${entry.gates} gates, ${entry.drift.total} drift${aiTag}\n`
  );

  results.push(entry);
  appendPartial(entry);
  processed++;

  // Cleanup
  rmrf(repoDir);
}

// ── Write final results ──────────────────────────────────────────

// Sort by score descending, then gates descending
results.sort((a, b) => b.score - a.score || b.gates - a.gates);

fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));

// ── Generate markdown report ─────────────────────────────────────

const totalRepos = results.filter(r => !r.error).length;
const failedRepos = results.filter(r => r.error).length;
// Genuine drift: only count drift (phantom gates) + extra (CI commands missing from governance)
const realDriftRepos = results.filter(r => !r.error && ((r.drift.drift || 0) + (r.drift.extra || 0)) > 0).length;
const withAIConfigs = results.filter(r => !r.error && r.aiConfigCount > 0).length;
const zeroAI = results.filter(r => !r.error && r.aiConfigCount === 0).length;
const totalGates = results.reduce((sum, r) => sum + r.gates, 0);
const realDriftPct = totalRepos > 0 ? ((realDriftRepos / totalRepos) * 100).toFixed(0) : 0;
const aiAdoptPct = totalRepos > 0 ? ((withAIConfigs / totalRepos) * 100).toFixed(0) : 0;
const zeroAIPct = totalRepos > 0 ? ((zeroAI / totalRepos) * 100).toFixed(0) : 0;

// Read crag version from package.json
let cragVersion = '?';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
  cragVersion = pkg.version;
} catch {}

const lines = [];
lines.push('# Drift Leaderboard \u2014 100 Top Repos Audited');
lines.push('');
lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
lines.push(`**crag version:** ${cragVersion}`);
lines.push(`**Pipeline:** clone \u2192 analyze \u2192 audit per repo`);
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`| Metric | Value |`);
lines.push(`|---|---|`);
lines.push(`| Repos audited | **${totalRepos}** |`);
lines.push(`| Clone/analyze failures | **${failedRepos}** |`);
lines.push(`| Repos with genuine drift | **${realDriftRepos} (${realDriftPct}%)** |`);
lines.push(`| AI config adoption | **${withAIConfigs} (${aiAdoptPct}%)** |`);
lines.push(`| Repos with zero AI config | **${zeroAI} (${zeroAIPct}%)** |`);
lines.push(`| Total gates inferred | **${totalGates.toLocaleString()}** |`);
lines.push(`| Mean gates per repo | **${totalRepos > 0 ? (totalGates / totalRepos).toFixed(1) : 0}** |`);
lines.push('');
lines.push('## Leaderboard');
lines.push('');
lines.push('| # | Repo | Stars | Stack | Gates | Real Drift | AI Configs | Score |');
lines.push('|---|---|---|---|---|---|---|---|');

const successResults = results.filter(r => !r.error);
for (let i = 0; i < successResults.length; i++) {
  const r = successResults[i];
  const starsStr = formatStars(r.stars);
  const stackShort = r.stack.split(', ').slice(0, 3).join(', ') + (r.stack.split(', ').length > 3 ? '...' : '');
  const aiStr = r.aiConfigs.length > 0 ? r.aiConfigs.join(', ') : '\u2014';
  const realDrift = (r.drift.drift || 0) + (r.drift.extra || 0);
  lines.push(`| ${i + 1} | ${r.repo} | ${starsStr} | ${stackShort} | ${r.gates} | ${realDrift} | ${aiStr} | ${r.score} |`);
}

if (failedRepos > 0) {
  lines.push('');
  lines.push('## Failed Repos');
  lines.push('');
  lines.push('| Repo | Error |');
  lines.push('|---|---|');
  for (const r of results.filter(r => r.error)) {
    lines.push(`| ${r.repo} | ${r.error.slice(0, 100)} |`);
  }
}

// Key findings
lines.push('');
lines.push('## Key Findings');
lines.push('');
lines.push(`1. **${aiAdoptPct}% of repos now have AI config files** \u2014 CLAUDE.md, AGENTS.md, .cursorrules, or copilot-instructions. Adoption is real.`);
lines.push(`2. **${zeroAIPct}% still have zero AI config** \u2014 AI agents working on these repos get zero project-specific guidance.`);
lines.push(`3. **${realDriftPct}% have genuine governance drift** \u2014 quality gates referencing commands that don\u2019t exist, or CI running checks not captured in governance.`);
lines.push(`4. **${totalGates.toLocaleString()} total gates inferred** across ${totalRepos} repos, averaging ${totalRepos > 0 ? (totalGates / totalRepos).toFixed(1) : 0} per repo.`);

// Top 5 by gates
const top5 = successResults.slice().sort((a, b) => b.gates - a.gates).slice(0, 5);
lines.push(`5. **Highest gate counts:** ${top5.map(r => `${r.repo} (${r.gates})`).join(', ')}`);

// Repos with most drift
const worstDrift = successResults.filter(r => r.drift.total > 0).sort((a, b) => b.drift.total - a.drift.total).slice(0, 5);
if (worstDrift.length > 0) {
  lines.push(`6. **Most drift:** ${worstDrift.map(r => `${r.repo} (${r.drift.total} issues)`).join(', ')}`);
}

// AI config adoption
const withAI = successResults.filter(r => r.aiConfigCount > 0);
if (withAI.length > 0) {
  lines.push(`7. **AI config breakdown:** ${withAI.length} of ${totalRepos} repos have at least one AI config file.`);
  const configCounts = {};
  for (const r of withAI) {
    for (const c of r.aiConfigs) {
      configCounts[c] = (configCounts[c] || 0) + 1;
    }
  }
  const sorted = Object.entries(configCounts).sort((a, b) => b[1] - a[1]);
  lines.push(`   Most common: ${sorted.slice(0, 5).map(([name, count]) => `${name} (${count})`).join(', ')}`);
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('Generated by [crag](https://github.com/WhitehatD/crag) \u2014 one governance.md, every AI tool.');
lines.push('');

fs.writeFileSync(REPORT_FILE, lines.join('\n'));

// ── Summary ───────────────────────────────────────────────────��──

console.log(`\n  ${G}Done.${X} ${processed} processed, ${skipped} skipped, ${failed} failed.\n`);
console.log(`  Results: ${path.relative(process.cwd(), RESULTS_FILE)}`);
console.log(`  Report:  ${path.relative(process.cwd(), REPORT_FILE)}\n`);

// Clean up partial file on successful completion
if (failed === 0 && fs.existsSync(PARTIAL_FILE)) {
  fs.unlinkSync(PARTIAL_FILE);
}

// Exit with error if any failures
if (failed > 0) process.exit(1);

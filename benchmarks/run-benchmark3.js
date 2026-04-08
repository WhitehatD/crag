#!/usr/bin/env node
'use strict';

/**
 * Benchmark harness for crag Phase 1 features.
 * Runs analyze, compile, audit, and diff on each repo in repos3/.
 * Captures results as structured JSON for report generation.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPOS_DIR = path.join(__dirname, 'repos3');
const CRAG = path.join(__dirname, '..', 'bin', 'crag.js');
const RESULTS_FILE = path.join(__dirname, 'raw3', 'results.json');

// Ensure output dir
const rawDir = path.join(__dirname, 'raw3');
if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });

function runCrag(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [CRAG, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
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

// Get list of repos
const repos = fs.readdirSync(REPOS_DIR)
  .filter(d => fs.statSync(path.join(REPOS_DIR, d)).isDirectory())
  .sort();

console.log(`\nBenchmark: ${repos.length} repos in repos3/\n`);

const results = [];
let passed = 0;
let failed = 0;

for (const repo of repos) {
  const repoDir = path.join(REPOS_DIR, repo);
  const entry = {
    repo,
    analyze: null,
    compile: null,
    audit: null,
    diff: null,
    errors: [],
    stack: null,
    gates: 0,
    targets: 0,
    auditIssues: 0,
  };

  // Step 1: Analyze
  const analyzeResult = runCrag(['analyze', '--dry-run'], repoDir);
  entry.analyze = { ok: analyzeResult.ok, code: analyzeResult.code };
  if (!analyzeResult.ok) {
    entry.errors.push({ step: 'analyze', stderr: analyzeResult.stderr.slice(0, 500) });
  }

  // Step 1b: Actually write governance for compile/audit
  const analyzeWrite = runCrag(['analyze', '--no-install-skills'], repoDir);
  if (!analyzeWrite.ok) {
    entry.errors.push({ step: 'analyze-write', stderr: analyzeWrite.stderr.slice(0, 500) });
  }

  // Extract stack from governance
  const govPath = path.join(repoDir, '.claude', 'governance.md');
  if (fs.existsSync(govPath)) {
    const gov = fs.readFileSync(govPath, 'utf-8');
    const stackMatch = gov.match(/- Stack:\s*(.+)/);
    if (stackMatch) entry.stack = stackMatch[1].trim();
    const gateLines = gov.match(/^- .+$/gm);
    if (gateLines) entry.gates = gateLines.length;
  }

  // Step 2: Compile all
  const compileResult = runCrag(['compile', '--target', 'all', '--dry-run'], repoDir);
  entry.compile = { ok: compileResult.ok, code: compileResult.code };
  if (!compileResult.ok) {
    entry.errors.push({ step: 'compile', stderr: compileResult.stderr.slice(0, 500) });
  } else {
    // Count targets from dry-run output
    const planLines = (compileResult.stdout.match(/plan /g) || []).length;
    entry.targets = planLines;
  }

  // Step 2b: Actually write compile targets
  const compileWrite = runCrag(['compile', '--target', 'all'], repoDir);
  if (!compileWrite.ok) {
    entry.errors.push({ step: 'compile-write', stderr: compileWrite.stderr.slice(0, 500) });
  }

  // Step 3: Audit
  const auditResult = runCrag(['audit', '--json'], repoDir);
  entry.audit = { ok: auditResult.ok, code: auditResult.code };
  if (auditResult.stdout.trim().startsWith('{')) {
    try {
      const auditData = JSON.parse(auditResult.stdout.trim());
      entry.auditIssues = auditData.summary ? auditData.summary.total : 0;
      entry.auditDetails = auditData.summary || {};
    } catch { /* malformed JSON */ }
  }

  // Step 4: Diff
  const diffResult = runCrag(['diff'], repoDir);
  entry.diff = { ok: diffResult.ok, code: diffResult.code };
  if (!diffResult.ok) {
    entry.errors.push({ step: 'diff', stderr: diffResult.stderr.slice(0, 500) });
  }

  // Status
  const allOk = entry.analyze.ok && entry.compile.ok;
  if (allOk) {
    passed++;
    process.stdout.write(`  \x1b[32m\u2713\x1b[0m ${repo.padEnd(30)} ${(entry.stack || '?').padEnd(30)} ${entry.gates} gates\n`);
  } else {
    failed++;
    const failSteps = entry.errors.map(e => e.step).join(', ');
    process.stdout.write(`  \x1b[31m\u2717\x1b[0m ${repo.padEnd(30)} FAIL: ${failSteps}\n`);
  }

  results.push(entry);

  // Clean up generated files to not pollute repos
  try {
    const cleanFiles = [
      '.claude/governance.md',
      'AGENTS.md', 'GEMINI.md', '.clinerules', '.continuerules', '.rules',
      '.cursor/rules/governance.mdc',
      '.github/copilot-instructions.md',
      '.windsurf/rules/governance.md',
      '.amazonq/rules/governance.md',
      '.github/workflows/gates.yml',
      '.husky/pre-commit',
      '.pre-commit-config.yaml',
    ];
    for (const f of cleanFiles) {
      const full = path.join(repoDir, f);
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
    // Remove created dirs if empty
    for (const d of ['.claude', '.cursor/rules', '.cursor', '.windsurf/rules', '.windsurf', '.amazonq/rules', '.amazonq']) {
      const full = path.join(repoDir, d);
      try { if (fs.existsSync(full) && fs.readdirSync(full).length === 0) fs.rmdirSync(full); } catch {}
    }
  } catch {}
}

// Summary
console.log(`\n  ${passed} passed, ${failed} failed out of ${repos.length}\n`);

// Write results
fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
console.log(`  Results written to ${path.relative(process.cwd(), RESULTS_FILE)}\n`);

// Error summary
const errorRepos = results.filter(r => r.errors.length > 0);
if (errorRepos.length > 0) {
  console.log('  Error details:');
  for (const r of errorRepos) {
    console.log(`    ${r.repo}:`);
    for (const e of r.errors) {
      const msg = e.stderr.split('\n').filter(l => l.trim()).slice(0, 3).join(' | ');
      console.log(`      [${e.step}] ${msg}`);
    }
  }
  console.log('');
}

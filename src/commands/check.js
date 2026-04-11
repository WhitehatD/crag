'use strict';

const fs = require('fs');
const path = require('path');
const { EXIT_USER } = require('../cli-errors');
const { validateFlags } = require('../cli-args');

const CORE_CHECKS = [
  ['.claude/skills/pre-start-context/SKILL.md', 'Pre-start skill (universal)'],
  ['.claude/skills/post-start-validation/SKILL.md', 'Post-start skill (universal)'],
  ['.claude/governance.md', 'Governance rules'],
  ['.claude/hooks/sandbox-guard.sh', 'Sandbox guard hook'],
  ['.claude/settings.local.json', 'Settings with hooks'],
];

const OPTIONAL_CHECKS = [
  ['.claude/hooks/drift-detector.sh', 'Drift detector hook'],
  ['.claude/hooks/circuit-breaker.sh', 'Circuit breaker hook'],
  ['.claude/agents/test-runner.md', 'Test runner agent'],
  ['.claude/agents/security-reviewer.md', 'Security reviewer agent'],
  ['.claude/ci-playbook.md', 'CI playbook'],
  ['.claude/.session-name', 'Session name (remote access)'],
  ['.claude/hooks/pre-compact-snapshot.sh', 'Pre-compact hook (MemStack)'],
  ['.claude/hooks/post-compact-recovery.sh', 'Post-compact hook (MemStack)'],
  ['.claude/rules/knowledge.md', 'MemStack knowledge rule'],
  ['.claude/rules/diary.md', 'MemStack diary rule'],
  ['.claude/rules/echo.md', 'MemStack echo rule'],
];

/**
 * Probe the filesystem and return a structured report of crag infrastructure.
 * Exported for testing — the CLI wraps this and prints.
 */
function runChecks(cwd, options = {}) {
  const { governanceOnly = false } = options;
  // In governance-only mode, we only care whether governance.md exists.
  // This is the post-`crag analyze` sanity check — users who ran analyze
  // haven't installed skills/hooks and shouldn't be told "3 files missing"
  // for infrastructure they didn't ask for.
  const activeChecks = governanceOnly
    ? CORE_CHECKS.filter(([file]) => file === '.claude/governance.md')
    : CORE_CHECKS;
  const core = activeChecks.map(([file, name]) => ({
    file,
    name,
    present: fs.existsSync(path.join(cwd, file)),
  }));
  const optional = OPTIONAL_CHECKS.map(([file, name]) => ({
    file,
    name,
    present: fs.existsSync(path.join(cwd, file)),
  }));
  const missing = core.filter((c) => !c.present).length;
  return {
    cwd,
    mode: governanceOnly ? 'governance-only' : 'full',
    core,
    optional,
    missing,
    total: core.length,
    complete: missing === 0,
  };
}

function check(args = []) {
  validateFlags('check', args, { boolean: ['--json', '--governance-only'] });
  const cwd = process.cwd();
  const governanceOnly = args.includes('--governance-only');
  const report = runChecks(cwd, { governanceOnly });

  // --json: machine-readable output, no colors, no prose
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.complete) process.exit(EXIT_USER);
    return;
  }

  console.log(`\n  Checking crag infrastructure in ${cwd}\n`);

  console.log(`  Core:`);
  for (const c of report.core) {
    const icon = c.present ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`    ${icon} ${c.name}`);
  }

  console.log(`\n  Optional:`);
  for (const o of report.optional) {
    const icon = o.present ? '\x1b[32m✓\x1b[0m' : '\x1b[90m○\x1b[0m';
    console.log(`    ${icon} ${o.name}`);
  }

  console.log(`\n  ${report.total - report.missing}/${report.total} core files present.`);
  if (report.missing > 0) {
    console.log(`  Run 'crag compile --target scaffold' to generate missing files.\n`);
    printUpgradeNudge(cwd);
    process.exit(EXIT_USER);
  } else {
    console.log(`  Infrastructure complete.\n`);
    printUpgradeNudge(cwd);
  }
}

/**
 * If any installed skills are behind the bundled version, print a styled
 * update-available banner. Silent when all skills are current.
 */
function printUpgradeNudge(cwd) {
  let syncSkills;
  try {
    ({ syncSkills } = require('../update/skill-sync'));
  } catch {
    return; // skill-sync unavailable — skip silently
  }

  const result = syncSkills(cwd, { dryRun: true });
  if (result.updated.length === 0) return;

  const width = 54;
  const border = '─'.repeat(width - 2);
  const pad = (s) => {
    const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
    return s + ' '.repeat(Math.max(0, width - 4 - visible.length));
  };

  console.log(`  \x1b[33m┌─ crag update available ${'─'.repeat(width - 26)}┐\x1b[0m`);
  for (const item of result.updated) {
    console.log(`  \x1b[33m│\x1b[0m  ${pad(`${item.name}: ${item.from} → ${item.to}`)}\x1b[33m│\x1b[0m`);
  }
  console.log(`  \x1b[33m│\x1b[0m  ${pad('Run: crag upgrade')}\x1b[33m│\x1b[0m`);
  console.log(`  \x1b[33m└${border}┘\x1b[0m\n`);
}

module.exports = { check, runChecks, CORE_CHECKS, OPTIONAL_CHECKS };

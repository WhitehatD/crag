'use strict';

/**
 * crag doctor — deep diagnostic command.
 *
 * Where `crag check` verifies file presence, `crag doctor` validates
 * content, governance integrity, skill currency, hook validity, drift,
 * and environment. It's the command you run when something feels off
 * and you need a second opinion about your crag setup.
 *
 * Each check returns one of three statuses:
 *   pass  (green ✓)  — everything is correct
 *   warn  (yellow !) — advisory, non-blocking
 *   fail  (red ✗)    — blocks a clean crag setup, needs fixing
 *
 * Exit codes:
 *   0 — no failures (warnings allowed)
 *   1 — one or more failures
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { parseGovernance, flattenGates } = require('../governance/parse');
const { detectBranchStrategy, countFeatureBranches, detectCommitConvention, classifyGitCommitConvention } = require('../governance/drift-utils');
const { isModified, readFrontmatter } = require('../update/integrity');
const { detectWorkspace } = require('../workspace/detect');
const { enumerateMembers } = require('../workspace/enumerate');
const { EXIT_USER, EXIT_INTERNAL } = require('../cli-errors');
const { validateFlags } = require('../cli-args');

const G = '\x1b[32m';  // green
const Y = '\x1b[33m';  // yellow
const R = '\x1b[31m';  // red
const D = '\x1b[2m';   // dim
const B = '\x1b[1m';   // bold
const X = '\x1b[0m';   // reset

const ICON_PASS = `${G}\u2713${X}`;
const ICON_WARN = `${Y}!${X}`;
const ICON_FAIL = `${R}\u2717${X}`;

/**
 * CLI entry point.
 *
 * Flags:
 *   --json      Machine-readable output
 *   --ci        Skip checks that require runtime infrastructure (skills,
 *               hooks, file presence). Useful in CI where .claude/ is
 *               either absent or freshly generated via `crag analyze`.
 *   --strict    Treat warnings as failures (exit 1 on any warn).
 *   --workspace Run doctor on every workspace member that has `.claude/`,
 *               plus the root. Aggregates pass/warn/fail counts across
 *               members and exits non-zero if ANY member failed.
 */
function doctor(args) {
  validateFlags('doctor', args, {
    boolean: ['--json', '--ci', '--strict', '--workspace'],
  });
  const cwd = process.cwd();
  const jsonOutput = args.includes('--json');
  const ciMode = args.includes('--ci');
  const strict = args.includes('--strict');
  const workspace = args.includes('--workspace');

  // Workspace mode: run diagnostics on root + every member. Emits one
  // combined report (JSON) or prints per-member sections (human).
  if (workspace) {
    const { reports, combined } = runWorkspaceDiagnostics(cwd, { ciMode });
    const exitCode = computeExitCode(combined, strict);

    if (jsonOutput) {
      console.log(JSON.stringify({ mode: 'workspace', reports, combined }, null, 2));
      process.exit(exitCode);
    }

    for (const r of reports) {
      printReport(r, { ciMode, strict });
    }
    printWorkspaceSummary(combined);
    process.exit(exitCode);
  }

  const report = runDiagnostics(cwd, { ciMode });
  const exitCode = computeExitCode(report, strict);

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(exitCode);
  }

  printReport(report, { ciMode, strict });
  process.exit(exitCode);
}

/**
 * Run doctor across a workspace.
 *
 * Always includes the root (cwd). Then, if the root is a workspace, runs
 * against each enumerated member. Members without a `.claude/` directory
 * are skipped — there's nothing for doctor to check in them.
 *
 * Returns { reports: Report[], combined: CombinedCounts }.
 */
function runWorkspaceDiagnostics(cwd, options = {}) {
  const reports = [];
  const rootReport = runDiagnostics(cwd, options);
  reports.push(rootReport);

  const ws = detectWorkspace(cwd);
  if (ws.type !== 'none') {
    const members = enumerateMembers(ws);
    for (const m of members) {
      if (!m.hasClaude) continue; // nothing for doctor to see in this member
      const memberReport = runDiagnostics(m.path, options);
      reports.push(memberReport);
    }
  }

  const combined = reports.reduce(
    (acc, r) => ({
      cwd,
      pass: acc.pass + r.pass,
      warn: acc.warn + r.warn,
      fail: acc.fail + r.fail,
      memberCount: acc.memberCount + 1,
      ciMode: r.ciMode,
    }),
    { cwd, pass: 0, warn: 0, fail: 0, memberCount: 0, ciMode: options.ciMode || false }
  );

  return { reports, combined };
}

function computeExitCode(report, strict) {
  if (report.fail > 0) return 1;
  if (strict && report.warn > 0) return 1;
  return 0;
}

/**
 * Run all diagnostics and return a structured report.
 * Exported for testing.
 *
 * When `ciMode` is true, skips sections that rely on runtime infrastructure
 * (Infrastructure, Skills, Hooks) — those checks require files that only
 * exist on a developer's machine or after `crag init`/`crag compile`, not
 * in a bare CI runner.
 */
function runDiagnostics(cwd, options = {}) {
  const { ciMode = false } = options;

  const sections = ciMode ? [
    diagnoseGovernance(cwd),
    diagnoseDrift(cwd),
    diagnoseSecurity(cwd),
    diagnoseEnvironment(cwd),
  ] : [
    diagnoseInfrastructure(cwd),
    diagnoseGovernance(cwd),
    diagnoseSkills(cwd),
    diagnoseHooks(cwd),
    diagnoseDrift(cwd),
    diagnoseSecurity(cwd),
    diagnoseEnvironment(cwd),
  ];

  let pass = 0, warn = 0, fail = 0;
  for (const section of sections) {
    for (const check of section.checks) {
      if (check.status === 'pass') pass++;
      else if (check.status === 'warn') warn++;
      else if (check.status === 'fail') fail++;
    }
  }

  return { cwd, sections, pass, warn, fail, ciMode };
}

// ============================================================================
// Section: Infrastructure
// ============================================================================

function diagnoseInfrastructure(cwd) {
  const checks = [];
  const CORE = [
    ['.claude/skills/pre-start-context/SKILL.md', 'Pre-start skill'],
    ['.claude/skills/post-start-validation/SKILL.md', 'Post-start skill'],
    ['.claude/governance.md', 'Governance file'],
    ['.claude/hooks/sandbox-guard.sh', 'Sandbox guard hook'],
    ['.claude/settings.local.json', 'Settings with hooks'],
  ];
  const OPTIONAL = [
    ['.claude/hooks/drift-detector.sh', 'Drift detector (optional)'],
    ['.claude/hooks/circuit-breaker.sh', 'Circuit breaker (optional)'],
    ['.claude/agents/test-runner.md', 'Test runner agent (optional)'],
    ['.claude/agents/security-reviewer.md', 'Security reviewer agent (optional)'],
    ['.claude/ci-playbook.md', 'CI playbook (optional)'],
  ];

  for (const [file, name] of CORE) {
    const present = fs.existsSync(path.join(cwd, file));
    checks.push({
      name,
      status: present ? 'pass' : 'fail',
      detail: present ? null : `missing: ${file}`,
      fix: present ? null : `run 'crag compile --target scaffold'`,
    });
  }

  for (const [file, name] of OPTIONAL) {
    const present = fs.existsSync(path.join(cwd, file));
    checks.push({
      name,
      status: present ? 'pass' : 'warn',
      detail: present ? null : `missing: ${file}`,
      fix: null,
    });
  }

  return { title: 'Infrastructure', checks };
}

// ============================================================================
// Section: Governance integrity
// ============================================================================

function diagnoseGovernance(cwd) {
  const checks = [];
  const govPath = path.join(cwd, '.claude', 'governance.md');

  if (!fs.existsSync(govPath)) {
    checks.push({
      name: 'governance.md exists',
      status: 'fail',
      detail: '.claude/governance.md not found',
      fix: `run 'crag analyze' to generate one`,
    });
    return { title: 'Governance', checks };
  }

  let content;
  try {
    content = fs.readFileSync(govPath, 'utf-8');
  } catch (err) {
    checks.push({
      name: 'governance.md readable',
      status: 'fail',
      detail: `cannot read: ${err.message}`,
      fix: 'check file permissions',
    });
    return { title: 'Governance', checks };
  }

  // Parse
  const parsed = parseGovernance(content);
  const warnings = parsed.warnings || [];
  checks.push({
    name: 'parses cleanly',
    status: warnings.length === 0 ? 'pass' : 'warn',
    detail: warnings.length === 0 ? null : `${warnings.length} parser warning${warnings.length === 1 ? '' : 's'}: ${warnings[0]}${warnings.length > 1 ? '...' : ''}`,
    fix: warnings.length > 0 ? 'review parser warnings in governance.md structure' : null,
  });

  // Required sections
  const requiredSections = ['Identity', 'Gates', 'Branch Strategy', 'Security'];
  for (const section of requiredSections) {
    const present = new RegExp(`^##\\s+${section}`, 'm').test(content);
    checks.push({
      name: `has ${section} section`,
      status: present ? 'pass' : 'fail',
      detail: present ? null : `missing ## ${section}`,
      fix: present ? null : `add a '## ${section}' section to governance.md`,
    });
  }

  // Gate count
  const gates = flattenGates(parsed.gates);
  const gateCount = Object.values(gates).flat().length;
  checks.push({
    name: 'has gate commands',
    status: gateCount > 0 ? 'pass' : 'fail',
    detail: `${gateCount} gate${gateCount === 1 ? '' : 's'} declared`,
    fix: gateCount === 0 ? 'add gate commands under ### Lint / ### Test / ### Build' : null,
  });

  // Project identity
  checks.push({
    name: 'project identity set',
    status: parsed.name ? 'pass' : 'warn',
    detail: parsed.name ? `name: ${parsed.name}` : 'no project name in - Project:',
    fix: parsed.name ? null : `add '- Project: <name>' under ## Identity`,
  });

  return { title: 'Governance', checks };
}

// ============================================================================
// Section: Skill currency
// ============================================================================

function diagnoseSkills(cwd) {
  const checks = [];
  const skills = ['pre-start-context', 'post-start-validation'];

  for (const skill of skills) {
    const skillPath = path.join(cwd, '.claude', 'skills', skill, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      checks.push({
        name: `${skill} installed`,
        status: 'fail',
        detail: `${skillPath} missing`,
        fix: `run 'crag upgrade' to install`,
      });
      continue;
    }

    const parsed = readFrontmatter(skillPath);
    if (!parsed || !parsed.version) {
      checks.push({
        name: `${skill} frontmatter`,
        status: 'warn',
        detail: parsed ? 'no version field in frontmatter' : 'no frontmatter found',
        fix: `run 'crag upgrade --force' to refresh`,
      });
      continue;
    }

    // Self-integrity check: does the installed body hash match the stored
    // source_hash? (isModified returns true when body was locally modified
    // OR when the hash is missing)
    const modified = isModified(skillPath);

    checks.push({
      name: `${skill} v${parsed.version}`,
      status: modified ? 'warn' : 'pass',
      detail: modified ? 'locally modified since install (body hash differs from source_hash)' : 'integrity verified',
      fix: modified ? `run 'crag upgrade --check' to see what changed, or 'crag upgrade --force' to reset` : null,
    });
  }

  return { title: 'Skills', checks };
}

// ============================================================================
// Section: Hooks
// ============================================================================

function diagnoseHooks(cwd) {
  const checks = [];
  const hooksDir = path.join(cwd, '.claude', 'hooks');

  if (!fs.existsSync(hooksDir)) {
    checks.push({
      name: 'hooks directory',
      status: 'warn',
      detail: '.claude/hooks/ does not exist',
      fix: `run 'crag compile --target scaffold' to generate`,
    });
    return { title: 'Hooks', checks };
  }

  // Sandbox guard is the most important hook
  const sandboxPath = path.join(hooksDir, 'sandbox-guard.sh');
  if (fs.existsSync(sandboxPath)) {
    const content = fs.readFileSync(sandboxPath, 'utf-8');
    const hasShebang = content.startsWith('#!');
    // The rtk-hook-version marker must live near the top for rtk to see it.
    // rtk scans the first 20 lines — widened from 5 to match rtk's actual
    // behavior and to accommodate hooks that have a license header block.
    const RTK_MARKER_WINDOW = 20;
    const hasRtkMarker = /#\s*rtk-hook-version:/m.test(content.split('\n').slice(0, RTK_MARKER_WINDOW).join('\n'));

    checks.push({
      name: 'sandbox-guard.sh installed',
      status: hasShebang ? 'pass' : 'fail',
      detail: hasShebang ? null : 'missing shebang line (#!/usr/bin/env bash)',
      fix: hasShebang ? null : `run 'crag compile --target scaffold --force' to regenerate`,
    });

    checks.push({
      name: 'sandbox-guard has rtk-hook-version marker',
      status: hasRtkMarker ? 'pass' : 'warn',
      detail: hasRtkMarker ? null : `# rtk-hook-version marker not in first ${RTK_MARKER_WINDOW} lines (causes "Hook outdated" warnings)`,
      fix: hasRtkMarker ? null : `add '# rtk-hook-version: 3' near the top of the hook file`,
    });

    // On Unix, check executable bit
    if (process.platform !== 'win32') {
      try {
        const stat = fs.statSync(sandboxPath);
        const executable = (stat.mode & 0o111) !== 0;
        checks.push({
          name: 'sandbox-guard executable',
          status: executable ? 'pass' : 'fail',
          detail: executable ? null : `mode ${(stat.mode & 0o777).toString(8)} (not executable)`,
          fix: executable ? null : `run 'chmod +x .claude/hooks/sandbox-guard.sh'`,
        });
      } catch { /* skip */ }
    }
  } else {
    checks.push({
      name: 'sandbox-guard.sh installed',
      status: 'fail',
      detail: 'no sandbox-guard.sh (hard-block of destructive commands is disabled)',
      fix: `run 'crag compile --target scaffold' to generate the hook`,
    });
  }

  // Settings references hooks
  const settingsPath = path.join(cwd, '.claude', 'settings.local.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const hasHooks = settings.hooks && typeof settings.hooks === 'object' && Object.keys(settings.hooks).length > 0;
      checks.push({
        name: 'settings.local.json wires hooks',
        status: hasHooks ? 'pass' : 'warn',
        detail: hasHooks ? `${Object.keys(settings.hooks).length} hook event(s) configured` : 'no hooks section — hooks will not fire',
        fix: hasHooks ? null : `run 'crag compile --target scaffold' to wire hooks into settings`,
      });

      // Check for hardcoded paths in the `hooks` section only. User-local
      // permissions allowlist (`permissions.allow`) can legitimately contain
      // machine-specific paths like /c/Users/... and should not be flagged.
      if (hasHooks) {
        const hookJson = JSON.stringify(settings.hooks);
        const hookHardcoded = /[A-Z]:[\\/]|\/home\/|\/Users\//.test(hookJson);
        if (hookHardcoded) {
          checks.push({
            name: 'hook commands use $CLAUDE_PROJECT_DIR',
            status: 'warn',
            detail: 'hardcoded absolute paths in hooks section — prefer $CLAUDE_PROJECT_DIR',
            fix: `replace hardcoded paths in settings.local.json hooks with $CLAUDE_PROJECT_DIR/...`,
          });
        }
      }
    } catch (err) {
      checks.push({
        name: 'settings.local.json valid JSON',
        status: 'fail',
        detail: `parse error: ${err.message}`,
        fix: `check syntax of .claude/settings.local.json`,
      });
    }
  }

  return { title: 'Hooks', checks };
}

// ============================================================================
// Section: Drift (reuses crag diff logic)
// ============================================================================

function diagnoseDrift(cwd) {
  const checks = [];
  const govPath = path.join(cwd, '.claude', 'governance.md');
  if (!fs.existsSync(govPath)) {
    return { title: 'Drift', checks: [{ name: 'drift check skipped', status: 'warn', detail: 'no governance.md', fix: null }] };
  }

  const content = fs.readFileSync(govPath, 'utf-8');

  // Branch strategy alignment — detect from the `## Branch Strategy` section
  // rather than the whole file so unrelated prose ("feature branches in each
  // sub-repo") doesn't override a workspace wrapper's actual trunk-based
  // policy. Within that section, the FIRST keyword to appear wins: this
  // matches the human reading order where the opening bullet states the rule.
  const govBranchStrategy = detectBranchStrategy(content);

  if (govBranchStrategy) {
    try {
      const branches = execSync('git branch -a --format="%(refname:short)"', {
        cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const featureBranches = countFeatureBranches(branches);
      const actualStrategy = featureBranches.length > 2 ? 'feature-branches' : 'trunk-based';

      checks.push({
        name: 'branch strategy matches git',
        status: actualStrategy === govBranchStrategy ? 'pass' : 'warn',
        detail: actualStrategy === govBranchStrategy
          ? `${govBranchStrategy} (${featureBranches.length} feature branches)`
          : `governance says ${govBranchStrategy}, git shows ${actualStrategy}`,
        fix: actualStrategy === govBranchStrategy ? null
          : `update governance.md to '${actualStrategy === 'trunk-based' ? 'Trunk-based development' : 'Feature branches'}'`,
      });
    } catch (err) {
      // Not a git repo, git unavailable, or command timed out. Surface as a
      // warning instead of silent skip so users know the check didn't run.
      const isTimeout = err && (err.code === 'ETIMEDOUT' || /timed?\s*out/i.test(String(err.message)));
      const isNotGit = err && (err.code === 'ENOENT' || /not a git repo/i.test(String(err.message)));
      if (!isNotGit) {
        checks.push({
          name: 'branch strategy matches git',
          status: 'warn',
          detail: isTimeout ? 'git command timed out (5s) — likely huge repo' : `git command failed: ${err.message}`,
          fix: isTimeout ? 'inspect `git branch -a` manually and update governance.md if needed' : null,
        });
      }
    }
  }

  // Commit convention alignment
  const govConvention = detectCommitConvention(content);

  if (govConvention) {
    try {
      const log = execSync('git log --oneline -20', { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      const lines = log.trim().split('\n');
      const actual = classifyGitCommitConvention(log);
      const conventional = lines.filter(l => /\b(feat|fix|docs|chore|style|refactor|test|build|ci|perf|revert)[\(:!]/.test(l));

      checks.push({
        name: 'commit convention matches git',
        status: actual === govConvention ? 'pass' : 'warn',
        detail: actual === govConvention ? `${govConvention} (${conventional.length}/${lines.length} recent commits match)` : `governance says ${govConvention}, git shows ${actual}`,
        fix: actual === govConvention ? null : `update governance.md to '${actual === 'conventional' ? 'Conventional commits' : 'Free-form commits'}'`,
      });
    } catch { /* skip */ }
  }

  return { title: 'Drift', checks };
}

// ============================================================================
// Section: Security smoke
// ============================================================================

function diagnoseSecurity(cwd) {
  const checks = [];

  // governance.md should not contain literal secrets
  const govPath = path.join(cwd, '.claude', 'governance.md');
  if (fs.existsSync(govPath)) {
    const content = fs.readFileSync(govPath, 'utf-8');
    const SECRET_PATTERNS = [
      { pattern: /sk_live_[a-zA-Z0-9]{16,}/, label: 'Stripe live secret key' },
      { pattern: /sk_test_[a-zA-Z0-9]{16,}/, label: 'Stripe test secret key' },
      { pattern: /AKIA[A-Z0-9]{16}/, label: 'AWS access key ID' },
      { pattern: /ghp_[a-zA-Z0-9]{36}/, label: 'GitHub personal access token' },
      { pattern: /gho_[a-zA-Z0-9]{36}/, label: 'GitHub OAuth token' },
      { pattern: /ghu_[a-zA-Z0-9]{36}/, label: 'GitHub user token' },
      { pattern: /xox[baprs]-[a-zA-Z0-9-]{10,}/, label: 'Slack token' },
      { pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/, label: 'Private key' },
    ];
    const leaks = [];
    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(content)) leaks.push(label);
    }

    checks.push({
      name: 'governance.md secret-free',
      status: leaks.length === 0 ? 'pass' : 'fail',
      detail: leaks.length === 0 ? null : `found: ${leaks.join(', ')}`,
      fix: leaks.length === 0 ? null : 'remove the secret and rotate it immediately',
    });
  }

  // Root-level .env files should not be tracked in git. This is the most
  // common place for real secret leaks. Subdirectory .env files are typically
  // build config (React CRA PUBLIC_URL, Vite VITE_*), monorepo package
  // overrides, or test fixtures — too many legitimate uses to flag blindly.
  // For those, rely on the secret-pattern scan below if they ever matter.
  try {
    const tracked = execSync('git ls-files', {
      cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const files = tracked.split('\n');

    // Only flag root-level .env / .env.local / .env.production (not sample).
    const risky = files.filter(f => /^\.env(\.local|\.production)?$/.test(f));

    checks.push({
      name: 'root .env files not tracked',
      status: risky.length === 0 ? 'pass' : 'fail',
      detail: risky.length === 0 ? null : `tracked: ${risky.join(', ')}`,
      fix: risky.length === 0 ? null : `git rm --cached ${risky[0]} && add to .gitignore, then rotate any secrets inside`,
    });
  } catch { /* skip — not a git repo */ }

  return { title: 'Security', checks };
}

// ============================================================================
// Section: Environment
// ============================================================================

function diagnoseEnvironment(cwd) {
  const checks = [];

  // Node version
  const nodeVersion = process.version;
  checks.push({
    name: 'node version',
    status: 'pass',
    detail: nodeVersion,
    fix: null,
  });

  // crag's own engines requirement
  try {
    const cragPkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    const required = cragPkg.engines && cragPkg.engines.node;
    if (required) {
      const minMatch = required.match(/>=\s*(\d+)/);
      if (minMatch) {
        const minMajor = parseInt(minMatch[1], 10);
        const currentMajor = parseInt(nodeVersion.replace(/^v/, '').split('.')[0], 10);
        checks.push({
          name: `node >= ${minMajor}`,
          status: currentMajor >= minMajor ? 'pass' : 'fail',
          detail: currentMajor >= minMajor ? null : `installed v${currentMajor}, need >= ${minMajor}`,
          fix: currentMajor >= minMajor ? null : `upgrade Node.js to version ${minMajor} or later`,
        });
      }
    }
  } catch { /* skip */ }

  // Git presence
  try {
    const gitVersion = execSync('git --version', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    checks.push({ name: 'git available', status: 'pass', detail: gitVersion, fix: null });
  } catch {
    checks.push({ name: 'git available', status: 'fail', detail: 'git not on PATH', fix: 'install git' });
  }

  return { title: 'Environment', checks };
}

// ============================================================================
// Output
// ============================================================================

function printReport(report, { ciMode = false, strict = false } = {}) {
  const modeLabel = ciMode ? ' (--ci mode)' : '';
  console.log(`\n  ${B}crag doctor${X}${modeLabel} — ${report.cwd}\n`);

  for (const section of report.sections) {
    console.log(`  ${B}${section.title}${X}`);
    for (const check of section.checks) {
      const icon = check.status === 'pass' ? ICON_PASS
        : check.status === 'warn' ? ICON_WARN
        : ICON_FAIL;
      console.log(`    ${icon} ${check.name}${check.detail ? ` ${D}— ${check.detail}${X}` : ''}`);
      if (check.fix && check.status !== 'pass') {
        console.log(`      ${D}fix:${X} ${check.fix}`);
      }
    }
    console.log();
  }

  // Summary
  const total = report.pass + report.warn + report.fail;
  const summary = `  ${report.pass}/${total} pass, ${report.warn} warn, ${report.fail} fail`;
  if (report.fail > 0) {
    console.log(`${R}${B}${summary}${X}\n`);
  } else if (report.warn > 0) {
    console.log(`${Y}${B}${summary}${X}\n`);
  } else {
    console.log(`${G}${B}${summary}${X}\n`);
  }
}

/**
 * Print a per-workspace summary after all individual reports have been
 * printed. Shows the combined pass/warn/fail counts across the root and
 * every member that was inspected.
 */
function printWorkspaceSummary(combined) {
  const total = combined.pass + combined.warn + combined.fail;
  const msg = `  Workspace total — ${combined.pass}/${total} pass, ${combined.warn} warn, ${combined.fail} fail (${combined.memberCount} target${combined.memberCount === 1 ? '' : 's'})`;
  if (combined.fail > 0) console.log(`${R}${B}${msg}${X}\n`);
  else if (combined.warn > 0) console.log(`${Y}${B}${msg}${X}\n`);
  else console.log(`${G}${B}${msg}${X}\n`);
}

module.exports = {
  doctor,
  runDiagnostics,
  runWorkspaceDiagnostics,
};

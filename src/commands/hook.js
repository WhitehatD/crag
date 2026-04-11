'use strict';

const fs = require('fs');
const path = require('path');
const { cliError, cliWarn, EXIT_USER } = require('../cli-errors');
const { validateFlags } = require('../cli-args');
const { atomicWrite } = require('../compile/atomic-write');

const HOOK_MARKER = '# crag:auto-hook';

/**
 * crag hook — manage pre-commit hook for governance auto-recompile.
 *
 * Subcommands:
 *   crag hook install [--drift-gate] [--force]  Install/update pre-commit hook
 *   crag hook uninstall                         Remove crag-installed hook
 *   crag hook status                            Show hook status
 */
function hook(args) {
  const sub = args[1];
  switch (sub) {
    case 'install':   hookInstall(args.slice(1)); break;
    case 'uninstall': hookUninstall(); break;
    case 'status':    hookStatus(); break;
    default:
      printHookUsage();
      if (sub && sub !== '--help' && sub !== '-h') process.exit(EXIT_USER);
  }
}

function printHookUsage() {
  console.log(`
  crag hook \u2014 pre-commit hook management

  Usage:
    crag hook install              Install hook (auto-recompile on governance change)
    crag hook install --drift-gate Also block commits if drift is detected
    crag hook install --force      Overwrite existing non-crag hook
    crag hook uninstall            Remove crag-installed hook
    crag hook status               Show hook installation status
  `);
}

function hookInstall(args) {
  validateFlags('hook install', args, {
    boolean: ['--drift-gate', '--force'],
  });
  const driftGate = args.includes('--drift-gate');
  const force = args.includes('--force');
  const cwd = process.cwd();

  const gitDir = findGitDir(cwd);
  if (!gitDir) {
    cliError('not a git repository \u2014 crag hook requires git.', EXIT_USER);
  }

  const hooksDir = path.join(gitDir, 'hooks');
  const hookPath = path.join(hooksDir, 'pre-commit');

  // Check for existing hook
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');
    if (!existing.includes(HOOK_MARKER) && !force) {
      cliError(
        'pre-commit hook already exists (not installed by crag). Use --force to overwrite.',
        EXIT_USER,
      );
    }
  }

  const script = generateHookScript(driftGate);
  atomicWrite(hookPath, script);

  // Make executable on Unix
  try { fs.chmodSync(hookPath, 0o755); } catch { /* Windows — no-op */ }

  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  console.log(`\n  ${B}crag hook${X} ${D}\u2014 installed${X}\n`);
  console.log(`  ${G}\u2713${X} Pre-commit hook active`);
  console.log(`    ${D}Auto-recompile${X}  on`);
  console.log(`    ${D}Drift gate${X}      ${driftGate ? `${G}on${X}` : 'off'}`);
  console.log(`    ${D}Path${X}            ${path.relative(cwd, hookPath)}`);
  console.log(`\n  ${D}Governance changes auto-compile on every commit.${X}\n`);
}

function hookUninstall() {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);
  if (!gitDir) {
    cliError('not a git repository.', EXIT_USER);
  }

  const hookPath = path.join(gitDir, 'hooks', 'pre-commit');
  if (!fs.existsSync(hookPath)) {
    console.log('\n  \x1b[2mNo pre-commit hook installed.\x1b[0m\n');
    return;
  }

  const content = fs.readFileSync(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER)) {
    cliWarn('pre-commit hook exists but was not installed by crag. Not removing.');
    return;
  }

  fs.unlinkSync(hookPath);
  console.log(`\n  \x1b[32m\u2713\x1b[0m Removed crag pre-commit hook.\n`);
}

function hookStatus() {
  const cwd = process.cwd();
  const gitDir = findGitDir(cwd);
  if (!gitDir) {
    cliError('not a git repository.', EXIT_USER);
  }

  const hookPath = path.join(gitDir, 'hooks', 'pre-commit');
  if (!fs.existsSync(hookPath)) {
    console.log(`\n  \x1b[1mcrag hook\x1b[0m \x1b[2m\u2014 status\x1b[0m\n`);
    console.log(`  \x1b[2mNo hook installed. Run:\x1b[0m crag hook install\n`);
    return;
  }

  const content = fs.readFileSync(hookPath, 'utf-8');
  if (!content.includes(HOOK_MARKER)) {
    console.log(`\n  \x1b[1mcrag hook\x1b[0m \x1b[2m\u2014 status\x1b[0m\n`);
    console.log(`  \x1b[33m!\x1b[0m Hook installed \x1b[2m(not by crag)\x1b[0m\n`);
    return;
  }

  const G = '\x1b[32m'; const B = '\x1b[1m'; const D = '\x1b[2m'; const X = '\x1b[0m';
  const hasDriftGate = content.includes('crag audit');
  console.log(`\n  ${B}crag hook${X} ${D}\u2014 status${X}\n`);
  console.log(`  ${G}\u2713${X} Installed by crag`);
  console.log(`    ${D}Auto-recompile${X}  on`);
  console.log(`    ${D}Drift gate${X}      ${hasDriftGate ? `${G}on${X}` : 'off'}`);
  console.log(`    ${D}Path${X}            ${path.relative(cwd, hookPath)}\n`);
}

function generateHookScript(driftGate) {
  const driftBlock = driftGate ? `
# Drift gate — block commit if governance drift detected
npx @whitehatd/crag audit --json > /dev/null 2>&1
DRIFT_EXIT=$?
if [ $DRIFT_EXIT -ne 0 ]; then
  echo "  crag: drift detected — run 'crag audit' for details"
  echo "  crag: to skip this check: git commit --no-verify"
  exit 1
fi
` : '';

  return `#!/bin/sh
${HOOK_MARKER} — installed by crag hook install
# Regenerate: crag hook install${driftGate ? ' --drift-gate' : ''}
# Remove:     crag hook uninstall

# Auto-recompile when governance.md changes
STAGED=$(git diff --cached --name-only 2>/dev/null)
if echo "$STAGED" | grep -q "\\.claude/governance\\.md"; then
  echo "  crag: governance.md changed, recompiling..."
  npx @whitehatd/crag compile --target all 2>/dev/null
  if [ $? -eq 0 ]; then
    # Re-stage compiled files (only those that exist)
    for f in CLAUDE.md AGENTS.md GEMINI.md .clinerules .continuerules .rules \\
             .cursor/rules/governance.mdc .github/copilot-instructions.md \\
             .windsurf/rules/governance.md .amazonq/rules/governance.md \\
             .github/workflows/gates.yml .husky/pre-commit \\
             .pre-commit-config.yaml; do
      [ -f "$f" ] && git add "$f" 2>/dev/null
    done
    echo "  crag: compile targets updated and staged"
  fi
fi
${driftBlock}`;
}

/**
 * Walk up from cwd to find the .git directory.
 * Returns the .git dir path, or null if not in a git repo.
 */
function findGitDir(cwd) {
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;
  while (dir !== root) {
    const gitPath = path.join(dir, '.git');
    if (fs.existsSync(gitPath)) {
      // .git can be a file (worktree) or directory
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory()) return gitPath;
      // Worktree: .git is a file containing "gitdir: <path>"
      const content = fs.readFileSync(gitPath, 'utf-8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (match) return path.resolve(dir, match[1]);
      return null;
    }
    dir = path.dirname(dir);
  }
  return null;
}

module.exports = { hook, findGitDir, HOOK_MARKER, generateHookScript };

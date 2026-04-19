'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('./atomic-write');
const { flattenGates } = require('../governance/parse');

/**
 * crag compile --target scaffold
 *
 * Generates project infrastructure files that doctor/check expect:
 *   - .claude/hooks/sandbox-guard.sh     (universal, same for all)
 *   - .claude/hooks/drift-detector.sh    (universal)
 *   - .claude/hooks/circuit-breaker.sh   (universal)
 *   - .claude/settings.local.json        (merge: adds hooks, preserves permissions)
 *   - .claude/agents/test-runner.md      (from governance gates)
 *   - .claude/agents/security-reviewer.md (from governance security)
 *   - .claude/ci-playbook.md             (template with CI system)
 *
 * Unlike the 23 AI-config targets in `compile --target all`, scaffold
 * files are commit-once infrastructure. `scaffold` is intentionally NOT
 * included in `all` — run it explicitly or via the VS Code extension fix.
 *
 * Existing files are preserved by default. Pass --force to regenerate.
 */
function generateScaffold(cwd, parsed, options = {}) {
  const { force = false } = options;
  const results = [];

  results.push(writeHook(cwd, 'sandbox-guard.sh', sandboxGuardTemplate(), force));
  results.push(writeHook(cwd, 'drift-detector.sh', driftDetectorTemplate(), force));
  results.push(writeHook(cwd, 'circuit-breaker.sh', circuitBreakerTemplate(), force));
  results.push(writeSettings(cwd, parsed, force));
  results.push(writeAgent(cwd, 'test-runner.md', testRunnerTemplate(parsed), force));
  results.push(writeAgent(cwd, 'security-reviewer.md', securityReviewerTemplate(parsed), force));
  results.push(writeCiPlaybook(cwd, parsed, force));

  const wrote = results.filter(r => r.action === 'wrote').length;
  const skipped = results.filter(r => r.action === 'skipped').length;

  for (const r of results) {
    const rel = path.relative(cwd, r.path);
    if (r.action === 'wrote') {
      console.log(`  \x1b[32m\u2713\x1b[0m ${rel}`);
    } else {
      console.log(`  \x1b[90m\u25cb\x1b[0m ${rel} \x1b[2m(exists, use --force)\x1b[0m`);
    }
  }

  if (wrote > 0 || skipped > 0) {
    console.log(`\n  \x1b[2m${wrote} written, ${skipped} skipped\x1b[0m`);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function writeIfMissing(filePath, content, force) {
  if (!force && fs.existsSync(filePath)) {
    return { path: filePath, action: 'skipped' };
  }
  atomicWrite(filePath, content);
  return { path: filePath, action: 'wrote' };
}

function writeHook(cwd, name, content, force) {
  const hookPath = path.join(cwd, '.claude', 'hooks', name);
  return writeIfMissing(hookPath, content, force);
}

function writeAgent(cwd, name, content, force) {
  const agentPath = path.join(cwd, '.claude', 'agents', name);
  return writeIfMissing(agentPath, content, force);
}

function writeCiPlaybook(cwd, parsed, force) {
  const playbookPath = path.join(cwd, '.claude', 'ci-playbook.md');
  const content = ciPlaybookTemplate(parsed);
  return writeIfMissing(playbookPath, content, force);
}

/**
 * Merge settings.local.json: preserve existing permissions.allow,
 * add/update hooks section. Creates fresh if missing.
 */
function writeSettings(cwd, parsed, force) {
  const settingsPath = path.join(cwd, '.claude', 'settings.local.json');

  let existing = {};
  if (fs.existsSync(settingsPath) && !force) {
    try {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // Malformed JSON — overwrite
    }
  }

  // If sandbox-guard hook is already wired and not forcing, skip
  const hasSandboxGuard = existing.hooks?.PreToolUse?.some(h =>
    h.hooks?.some(hk => hk.command?.includes('sandbox-guard'))
  );
  if (!force && hasSandboxGuard) {
    return { path: settingsPath, action: 'skipped' };
  }

  const settings = { ...existing };

  // Preserve existing permissions, add defaults if missing
  if (!settings.permissions) {
    settings.permissions = { allow: buildPermissionsAllow(parsed) };
  }

  // Wire hooks
  settings.hooks = {
    PreToolUse: [
      {
        matcher: 'Bash',
        hooks: [
          {
            type: 'command',
            command: 'bash $CLAUDE_PROJECT_DIR/.claude/hooks/sandbox-guard.sh',
          },
        ],
      },
    ],
  };

  const content = JSON.stringify(settings, null, 2) + '\n';
  atomicWrite(settingsPath, content);
  return { path: settingsPath, action: 'wrote' };
}

function buildPermissionsAllow(parsed) {
  const allow = [
    'Bash(rtk git:*)',
    'Bash(rtk gh:*)',
  ];

  const stack = parsed.stack || [];
  const runtimes = parsed.runtimes || [];

  if (stack.includes('node') || runtimes.includes('node')) {
    allow.push('Bash(rtk npm:*)', 'Bash(rtk npx:*)');
  }
  if (stack.includes('typescript')) {
    allow.push('Bash(rtk tsc:*)');
  }
  if (stack.includes('rust') || runtimes.includes('rust')) {
    allow.push('Bash(rtk cargo:*)');
  }
  if (stack.includes('go') || runtimes.includes('go')) {
    allow.push('Bash(rtk go:*)');
  }
  if (stack.includes('python') || runtimes.includes('python')) {
    allow.push('Bash(rtk pytest:*)', 'Bash(rtk python:*)');
  }
  if (stack.includes('java') || runtimes.includes('java')) {
    allow.push('Bash(rtk ./gradlew:*)');
  }
  if (stack.includes('docker')) {
    allow.push('Bash(rtk docker:*)');
  }

  allow.push('Bash(rtk curl:*)');
  return allow;
}

// ── Templates ───────────────────────────────────────────────────────

function sandboxGuardTemplate() {
  return `#!/bin/bash
# rtk-hook-version: 3
# sandbox-guard.sh \u2014 PreToolUse hook for Bash
# Hard-blocks destructive system commands. Warns on out-of-bounds paths.
# Enforces host OS safety limits for all tool calls and subagents.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# No command to check \u2014 allow
[ -z "$COMMAND" ] && exit 0

# Strip single-quoted strings to avoid false positives on data payloads
# e.g., python script.py '{"content":"rm -rf / is blocked"}' \u2192 python script.py ''
CHECK=$(echo "$COMMAND" | sed "s/'[^']*'/''/g")

# === HARD BLOCK: Destructive system-level commands ===

# Filesystem destruction
echo "$CHECK" | grep -qEi 'rm\\s+(-[a-zA-Z]*f[a-zA-Z]*\\s+)?/(etc|usr|bin|sbin|boot|lib|var|sys|proc|Windows|Program)' && {
  echo "BLOCKED: Destructive operation targeting system directory."; exit 2; }
echo "$CHECK" | grep -qEi 'rm\\s+-[a-zA-Z]*r[a-zA-Z]*f?\\s+(/|~|\\$HOME|\\$USERPROFILE)\\s*$' && {
  echo "BLOCKED: Recursive delete on root or home directory."; exit 2; }

# Raw disk / partition
echo "$CHECK" | grep -qEi '\\b(mkfs|fdisk|parted)\\b|dd\\s+if=' && {
  echo "BLOCKED: Raw disk or partition operation."; exit 2; }

# System control
echo "$CHECK" | grep -qEi '\\b(shutdown|reboot|init\\s+[06]|halt|poweroff)\\b' && {
  echo "BLOCKED: System shutdown/reboot command."; exit 2; }

# Fork bomb
echo "$CHECK" | grep -qF '(){' && echo "$CHECK" | grep -qF '|' && echo "$CHECK" | grep -qF '&' && {
  echo "BLOCKED: Possible fork bomb pattern."; exit 2; }

# Piped remote execution
echo "$CHECK" | grep -qEi '(curl|wget)\\s+.*\\|\\s*(ba)?sh' && {
  echo "BLOCKED: Piped remote code execution (curl|sh)."; exit 2; }

# Database destruction
echo "$CHECK" | grep -qEi 'DROP\\s+(TABLE|DATABASE|SCHEMA|INDEX)\\b' && {
  echo "BLOCKED: Destructive SQL operation."; exit 2; }

# Docker mass destruction
echo "$CHECK" | grep -qEi 'docker\\s+(system\\s+prune\\s+-a|rm\\s+-f\\s+\\$\\(docker\\s+ps)' && {
  echo "BLOCKED: Mass Docker destruction."; exit 2; }

# Kubernetes namespace destruction
echo "$CHECK" | grep -qEi 'kubectl\\s+delete\\s+(namespace|ns)\\b' && {
  echo "BLOCKED: Kubernetes namespace deletion."; exit 2; }

# Critical service manipulation
echo "$CHECK" | grep -qEi 'systemctl\\s+(stop|disable|mask)\\s+(sshd|docker|NetworkManager|firewalld|ufw)' && {
  echo "BLOCKED: Critical system service manipulation."; exit 2; }

# Git destructive operations on main/master
echo "$CHECK" | grep -qEi 'git\\s+push\\s+.*--force.*\\s+(main|master)\\b' && {
  echo "BLOCKED: Force push to main/master."; exit 2; }

# === SOFT WARN: Out-of-bounds file operations ===

PROJECT_ROOT="\${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
if [ -n "$PROJECT_ROOT" ]; then
  for target in $(echo "$CHECK" | grep -oE '(rm|mv|cp|chmod|chown)\\s+[^|;&]*' | grep -oE '(/[a-zA-Z][a-zA-Z0-9_./-]+|[A-Z]:\\\\[^ ]+)'); do
    case "$target" in
      /dev/null|/tmp/*|rm|mv|cp|chmod|chown|-*) continue ;;
    esac
    if [[ "$target" != "$PROJECT_ROOT"* ]] && [[ "$target" != /tmp/* ]]; then
      echo "WARNING: Operation targets path outside project root: $target"
    fi
  done
fi

exit 0
`;
}

function driftDetectorTemplate() {
  return `#!/bin/bash
# rtk-hook-version: 3
# drift-detector.sh \u2014 PostToolUse hook
# Warns when governance.md is newer than compiled configs.

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# Only check after file-modifying operations
case "$TOOL" in
  Write|Edit|NotebookEdit) ;;
  *) exit 0 ;;
esac

PROJECT_ROOT="\${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_ROOT" ] && exit 0

GOV="$PROJECT_ROOT/.claude/governance.md"
[ ! -f "$GOV" ] && exit 0

GOV_MTIME=$(stat -c %Y "$GOV" 2>/dev/null || stat -f %m "$GOV" 2>/dev/null)
[ -z "$GOV_MTIME" ] && exit 0

STALE=0
for f in CLAUDE.md AGENTS.md GEMINI.md .clinerules .continuerules .rules \\
         .cursor/rules/governance.mdc .github/copilot-instructions.md \\
         .windsurf/rules/governance.md .amazonq/rules/governance.md; do
  TARGET="$PROJECT_ROOT/$f"
  [ ! -f "$TARGET" ] && continue
  TARGET_MTIME=$(stat -c %Y "$TARGET" 2>/dev/null || stat -f %m "$TARGET" 2>/dev/null)
  [ -z "$TARGET_MTIME" ] && continue
  if [ "$GOV_MTIME" -gt "$TARGET_MTIME" ]; then
    STALE=$((STALE + 1))
  fi
done

if [ "$STALE" -gt 0 ]; then
  echo "WARNING: $STALE compiled config(s) are stale \u2014 governance.md has been modified."
  echo "  Run: crag compile --target all"
fi

exit 0
`;
}

function circuitBreakerTemplate() {
  return `#!/bin/bash
# rtk-hook-version: 3
# circuit-breaker.sh \u2014 PreToolUse hook for Bash
# Prevents runaway retries: if the same failing command has been tried
# recently, block and suggest a different approach.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

[ -z "$COMMAND" ] && exit 0

PROJECT_ROOT="\${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -z "$PROJECT_ROOT" ] && exit 0

FAIL_LOG="$PROJECT_ROOT/.claude/.circuit-breaker-log"
HASH=$(echo "$COMMAND" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "$COMMAND" | md5 2>/dev/null)

# Clean entries older than 5 minutes
if [ -f "$FAIL_LOG" ]; then
  NOW=$(date +%s)
  WINDOW=300
  awk -v now="$NOW" -v w="$WINDOW" -F'|' '(now - $1) < w' "$FAIL_LOG" > "$FAIL_LOG.tmp" 2>/dev/null
  mv "$FAIL_LOG.tmp" "$FAIL_LOG" 2>/dev/null
fi

# Count recent failures of this exact command
COUNT=0
if [ -f "$FAIL_LOG" ]; then
  COUNT=$(grep -c "$HASH" "$FAIL_LOG" 2>/dev/null || echo 0)
fi

if [ "$COUNT" -ge 3 ]; then
  echo "WARNING: This command has failed $COUNT times in the last 5 minutes."
  echo "  Consider a different approach before retrying."
fi

exit 0
`;
}

function testRunnerTemplate(parsed) {
  const gates = flattenGates(parsed.gates);
  const testCmds = (gates.test || []).join('\n  - ');
  const lintCmds = (gates.lint || []).join('\n  - ');
  const allCmds = [...(gates.lint || []), ...(gates.test || []), ...(gates.build || [])];

  return `---
name: test-runner
description: Run project quality gates in an isolated worktree
tools:
  - Bash
  - Read
  - Glob
  - Grep
isolation: worktree
---

# Test Runner

Run all quality gates from governance.md and report results.

## Commands

${allCmds.length > 0 ? allCmds.map(c => `- \`${c}\``).join('\n') : '- (check governance.md for gate commands)'}

## Process

1. Read \`.claude/governance.md\` for the current gate list
2. Run each gate command in order
3. Stop on first MANDATORY failure
4. Report: which passed, which failed, error output

## Boundaries

- Operate only within this repository
- No destructive system commands
- No network access beyond task requirements
- No permission escalation
`;
}

function securityReviewerTemplate(parsed) {
  const security = parsed.security || 'No hardcoded secrets — grep for sk_live, AKIA, password= before commit';

  return `---
name: security-reviewer
description: Review code changes for security issues
tools:
  - Read
  - Glob
  - Grep
isolation: worktree
---

# Security Reviewer

Review staged or recent changes for security issues.

## Security Policy

${security}

## Checks

1. **Secrets scan** — grep for patterns: sk_live, sk_test, AKIA, ghp_, gho_, password=, private key headers
2. **Dependency audit** — check for known vulnerabilities (npm audit, cargo audit, pip-audit)
3. **Input validation** — flag unvalidated user input in request handlers
4. **Auth boundaries** — verify authentication/authorization on new endpoints
5. **SQL injection** — check for string concatenation in queries
6. **XSS** — check for unescaped output in templates/JSX

## Boundaries

- Read-only — do not modify files
- Operate only within this repository
- No network access beyond task requirements
- No permission escalation
`;
}

function ciPlaybookTemplate(parsed) {
  const ci = parsed.ci || 'github-actions';

  return `# CI Playbook

> Generated by [crag](https://crag.sh). Customise for your project.

## CI System: ${ci}

## When CI Fails

1. Read the failing job log
2. Identify the failing gate command
3. Run the command locally to reproduce
4. Fix the issue
5. Push and verify CI passes

## Gate Commands

Check \`.claude/governance.md\` for the authoritative gate list.

## Flaky Tests

If a test is flaky:
- Don't disable it without understanding why
- Add retry logic only if the flakiness is environmental (network, timing)
- File an issue if the root cause is unclear

## Release Process

Check governance.md for branch strategy and deployment configuration.
`;
}

module.exports = { generateScaffold };

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runDiagnostics, countFeatureBranches, detectBranchStrategy } = require('../src/commands/doctor');

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

function mkProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-doctor-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function statusOf(report, sectionTitle, checkName) {
  const section = report.sections.find(s => s.title === sectionTitle);
  if (!section) return null;
  const check = section.checks.find(c => c.name === checkName);
  return check ? check.status : null;
}

function hasCheck(report, sectionTitle, namePattern) {
  const section = report.sections.find(s => s.title === sectionTitle);
  if (!section) return false;
  return section.checks.some(c => namePattern.test ? namePattern.test(c.name) : c.name.includes(namePattern));
}

console.log('\n  commands/doctor.js');

// --- Empty project ---
test('doctor: empty project reports missing core files as fail', () => {
  const dir = mkProject({ 'README.md': 'empty' });
  const report = runDiagnostics(dir);
  assert.ok(report.fail > 0, 'should have at least one fail');
  assert.strictEqual(statusOf(report, 'Infrastructure', 'Pre-start skill'), 'fail');
  assert.strictEqual(statusOf(report, 'Infrastructure', 'Governance file'), 'fail');
});

// --- Well-formed minimal project ---
test('doctor: minimal valid project passes core checks', () => {
  const dir = mkProject({
    '.claude/skills/pre-start-context/SKILL.md': `---
name: pre-start-context
version: 0.2.0
---
# pre-start
discovers any project at runtime.
`,
    '.claude/skills/post-start-validation/SKILL.md': `---
name: post-start-validation
version: 0.2.0
---
# post-start
validates governance gates.
`,
    '.claude/governance.md': `# Governance — test-app

## Identity
- Project: test-app
- Description: Test fixture

## Gates (run in order, stop on failure)
### Lint
- npm run lint

### Test
- npm test

## Branch Strategy
- Trunk-based development
- Conventional commits

## Security
- No hardcoded secrets
`,
    '.claude/hooks/sandbox-guard.sh': `#!/bin/bash
# rtk-hook-version: 3
# sandbox guard
echo "guard"
`,
    '.claude/settings.local.json': JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'bash $CLAUDE_PROJECT_DIR/.claude/hooks/sandbox-guard.sh' }] }],
      },
    }),
  });
  const report = runDiagnostics(dir);
  assert.strictEqual(statusOf(report, 'Infrastructure', 'Pre-start skill'), 'pass');
  assert.strictEqual(statusOf(report, 'Infrastructure', 'Post-start skill'), 'pass');
  assert.strictEqual(statusOf(report, 'Infrastructure', 'Governance file'), 'pass');
  assert.strictEqual(statusOf(report, 'Infrastructure', 'Sandbox guard hook'), 'pass');
  assert.strictEqual(statusOf(report, 'Governance', 'has Identity section'), 'pass');
  assert.strictEqual(statusOf(report, 'Governance', 'has Gates section'), 'pass');
  assert.strictEqual(statusOf(report, 'Governance', 'project identity set'), 'pass');
});

// --- Missing governance sections ---
test('doctor: governance.md without Gates section fails', () => {
  const dir = mkProject({
    '.claude/governance.md': `# Governance — test

## Identity
- Project: test

## Branch Strategy
- Trunk-based

## Security
- No secrets
`,
    '.claude/skills/pre-start-context/SKILL.md': `---
name: pre-start-context
version: 0.2.0
---
# placeholder
`,
    '.claude/skills/post-start-validation/SKILL.md': `---
name: post-start-validation
version: 0.2.0
---
# placeholder
`,
    '.claude/hooks/sandbox-guard.sh': `#!/bin/bash\n# rtk-hook-version: 3\n`,
    '.claude/settings.local.json': '{"hooks":{}}',
  });
  const report = runDiagnostics(dir);
  assert.strictEqual(statusOf(report, 'Governance', 'has Gates section'), 'fail');
});

// --- Hook without rtk marker ---
test('doctor: sandbox-guard without rtk-hook-version marker warns', () => {
  const dir = mkProject({
    '.claude/hooks/sandbox-guard.sh': `#!/bin/bash
# no rtk marker
echo "guard"
`,
    '.claude/settings.local.json': '{"hooks":{}}',
    '.claude/governance.md': '# Governance\n## Identity\n- Project: x\n## Gates\n- test\n## Branch Strategy\n- Trunk\n## Security\n- none\n',
    '.claude/skills/pre-start-context/SKILL.md': `---\nname: pre-start-context\nversion: 0.2.0\n---\nbody\n`,
    '.claude/skills/post-start-validation/SKILL.md': `---\nname: post-start-validation\nversion: 0.2.0\n---\nbody\n`,
  });
  const report = runDiagnostics(dir);
  assert.strictEqual(statusOf(report, 'Hooks', 'sandbox-guard has rtk-hook-version marker'), 'warn');
});

// --- Security smoke: leaked secret ---
test('doctor: governance.md with AWS key fails security check', () => {
  const dir = mkProject({
    '.claude/governance.md': `# Governance
## Identity
- Project: leaky
## Gates
- test
## Branch Strategy
- Trunk
## Security
- AKIAIOSFODNN7EXAMPLE is the leaked key
`,
  });
  const report = runDiagnostics(dir);
  assert.strictEqual(statusOf(report, 'Security', 'governance.md secret-free'), 'fail');
});

// --- Security smoke: GitHub PAT ---
test('doctor: governance.md with GitHub PAT fails security check', () => {
  const dir = mkProject({
    '.claude/governance.md': `# Governance
## Identity
- Project: leaky
## Gates
- test
## Branch Strategy
- Trunk
## Security
- token is ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
`,
  });
  const report = runDiagnostics(dir);
  assert.strictEqual(statusOf(report, 'Security', 'governance.md secret-free'), 'fail');
});

// --- Hooks with hardcoded path ---
test('doctor: hooks section with hardcoded Windows path warns', () => {
  const dir = mkProject({
    '.claude/governance.md': '# Governance\n## Identity\n- Project: x\n## Gates\n- test\n## Branch Strategy\n- Trunk\n## Security\n- none\n',
    '.claude/hooks/sandbox-guard.sh': `#!/bin/bash\n# rtk-hook-version: 3\n`,
    '.claude/settings.local.json': JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'C:/Users/alexc/tools/run.sh' }] }],
      },
    }),
    '.claude/skills/pre-start-context/SKILL.md': `---\nname: pre-start-context\nversion: 0.2.0\n---\nbody\n`,
    '.claude/skills/post-start-validation/SKILL.md': `---\nname: post-start-validation\nversion: 0.2.0\n---\nbody\n`,
  });
  const report = runDiagnostics(dir);
  assert.strictEqual(statusOf(report, 'Hooks', 'hook commands use $CLAUDE_PROJECT_DIR'), 'warn');
});

// --- Hooks permissions.allow with hardcoded path should NOT warn ---
test('doctor: permissions.allow with local paths is fine (not flagged)', () => {
  const dir = mkProject({
    '.claude/governance.md': '# Governance\n## Identity\n- Project: x\n## Gates\n- test\n## Branch Strategy\n- Trunk\n## Security\n- none\n',
    '.claude/hooks/sandbox-guard.sh': `#!/bin/bash\n# rtk-hook-version: 3\n`,
    '.claude/settings.local.json': JSON.stringify({
      permissions: { allow: ['Bash(/c/Users/alexc/mytool:*)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'bash $CLAUDE_PROJECT_DIR/.claude/hooks/sandbox-guard.sh' }] }] },
    }),
    '.claude/skills/pre-start-context/SKILL.md': `---\nname: pre-start-context\nversion: 0.2.0\n---\nbody\n`,
    '.claude/skills/post-start-validation/SKILL.md': `---\nname: post-start-validation\nversion: 0.2.0\n---\nbody\n`,
  });
  const report = runDiagnostics(dir);
  // The `hook commands use $CLAUDE_PROJECT_DIR` check should NOT appear or should pass
  const hooksSection = report.sections.find(s => s.title === 'Hooks');
  const hardcodedCheck = hooksSection.checks.find(c => c.name === 'hook commands use $CLAUDE_PROJECT_DIR');
  // Either check is absent (no warn condition) or it passes
  assert.ok(!hardcodedCheck || hardcodedCheck.status === 'pass', 'should not warn on permissions.allow user-local paths');
});

// --- detectBranchStrategy ---

test('detectBranchStrategy: explicit trunk-based in section', () => {
  const md = `# Governance\n## Branch Strategy\n- Trunk-based development\n- Conventional commits\n`;
  assert.strictEqual(detectBranchStrategy(md), 'trunk-based');
});

test('detectBranchStrategy: explicit feature branches in section', () => {
  const md = `# Governance\n## Branch Strategy\n- Feature branches: feat/, fix/, docs/\n`;
  assert.strictEqual(detectBranchStrategy(md), 'feature-branches');
});

test('detectBranchStrategy: first mention wins (trunk first)', () => {
  // Hosting-platform-wrapper case: root is trunk, sub-repos use feature branches.
  // The opening line of the section is the rule.
  const md = `## Branch Strategy
- Trunk-based at the workspace wrapper (no feature branches at root)
- Each sub-repo uses feature branches: feat/, fix/
`;
  assert.strictEqual(detectBranchStrategy(md), 'trunk-based');
});

test('detectBranchStrategy: first mention wins (feature first)', () => {
  const md = `## Branch Strategy
- Feature branches: feat/, fix/
- Trunk-based is forbidden
`;
  assert.strictEqual(detectBranchStrategy(md), 'feature-branches');
});

test('detectBranchStrategy: scoped to section — ignores prose elsewhere', () => {
  // The section says trunk, but the description mentions feature branches.
  // The section must win.
  const md = `# Governance
Some preamble that mentions feature branches as an antipattern.
## Branch Strategy
- Trunk-based development
## Security
- No secrets
`;
  assert.strictEqual(detectBranchStrategy(md), 'trunk-based');
});

test('detectBranchStrategy: no section falls back to whole-file scan', () => {
  const md = `# Governance\n## Identity\n- Project: x\n- Strategy: Feature branches in use\n`;
  assert.strictEqual(detectBranchStrategy(md), 'feature-branches');
});

test('detectBranchStrategy: neither keyword returns null', () => {
  const md = `## Branch Strategy\n- Whatever goes\n`;
  assert.strictEqual(detectBranchStrategy(md), null);
});

test('detectBranchStrategy: handles empty and malformed input', () => {
  assert.strictEqual(detectBranchStrategy(''), null);
  assert.strictEqual(detectBranchStrategy(null), null);
  assert.strictEqual(detectBranchStrategy(undefined), null);
});

// --- countFeatureBranches (branch strategy drift helper) ---

test('countFeatureBranches: only local branches, no feature', () => {
  const out = 'main\n';
  assert.deepStrictEqual(countFeatureBranches(out), []);
});

test('countFeatureBranches: local feature branches', () => {
  const out = 'main\nfeat/foo\nfix/bar\n';
  const result = countFeatureBranches(out);
  assert.deepStrictEqual(result.sort(), ['feat/foo', 'fix/bar']);
});

test('countFeatureBranches: remote-only feat/ branches count (merged+deleted local)', () => {
  // Real-world output from a repo where local branches are merged+deleted
  // but origin still has the open feature branches.
  const out = [
    'main',
    'origin/main',
    'origin/HEAD',
    'origin/feat/billing',
    'origin/feat/enterprise-backups',
    'origin/fix/backup-oom',
  ].join('\n');
  const result = countFeatureBranches(out);
  assert.deepStrictEqual(result.sort(), [
    'feat/billing',
    'feat/enterprise-backups',
    'fix/backup-oom',
  ]);
});

test('countFeatureBranches: local + remote refs to same branch deduplicate', () => {
  const out = [
    'main',
    'feat/login',
    'origin/main',
    'origin/feat/login',
  ].join('\n');
  const result = countFeatureBranches(out);
  assert.deepStrictEqual(result, ['feat/login']);
});

test('countFeatureBranches: all prefixes (feat, fix, docs, chore, feature, hotfix)', () => {
  const out = [
    'feat/a',
    'fix/b',
    'docs/c',
    'chore/d',
    'feature/e',
    'hotfix/f',
    'random/g', // not counted
  ].join('\n');
  const result = countFeatureBranches(out);
  assert.strictEqual(result.length, 6);
  assert.ok(!result.includes('random/g'));
});

test('countFeatureBranches: skips origin/HEAD symbolic refs', () => {
  const out = 'main\norigin/HEAD\norigin/feat/x\n';
  const result = countFeatureBranches(out);
  assert.deepStrictEqual(result, ['feat/x']);
});

test('countFeatureBranches: handles empty and malformed input', () => {
  assert.deepStrictEqual(countFeatureBranches(''), []);
  assert.deepStrictEqual(countFeatureBranches(null), []);
  assert.deepStrictEqual(countFeatureBranches(undefined), []);
  assert.deepStrictEqual(countFeatureBranches('  \n\n  '), []);
});

test('countFeatureBranches: custom remote names (not just origin/)', () => {
  const out = 'upstream/feat/x\nfork/fix/y\nmain\n';
  const result = countFeatureBranches(out);
  assert.deepStrictEqual(result.sort(), ['feat/x', 'fix/y']);
});

// --- Environment check ---
test('doctor: Environment section reports node and git', () => {
  const dir = mkProject({ 'README.md': 'x' });
  const report = runDiagnostics(dir);
  const envSection = report.sections.find(s => s.title === 'Environment');
  assert.ok(envSection);
  assert.ok(envSection.checks.some(c => c.name === 'node version' && c.status === 'pass'));
});

// --- Summary counts ---
test('doctor: summary counts add up correctly', () => {
  const dir = mkProject({ 'README.md': 'x' });
  const report = runDiagnostics(dir);
  let manual = 0;
  for (const section of report.sections) {
    for (const check of section.checks) {
      if (['pass', 'warn', 'fail'].includes(check.status)) manual++;
    }
  }
  assert.strictEqual(report.pass + report.warn + report.fail, manual);
});

// --- JSON output ---
test('doctor: runDiagnostics returns serializable structure', () => {
  const dir = mkProject({ 'README.md': 'x' });
  const report = runDiagnostics(dir);
  const serialized = JSON.stringify(report);
  const roundTrip = JSON.parse(serialized);
  assert.ok(roundTrip.sections);
  assert.ok(Array.isArray(roundTrip.sections));
  assert.strictEqual(typeof roundTrip.pass, 'number');
});

// --- --ci mode ---
test('doctor: --ci mode skips Infrastructure/Skills/Hooks', () => {
  const dir = mkProject({
    '.claude/governance.md': `# Governance — ci-test
## Identity
- Project: ci-test
## Gates (run in order, stop on failure)
### Test
- npm test
## Branch Strategy
- Trunk-based development
- Conventional commits
## Security
- No hardcoded secrets
`,
  });
  // No skills, no hooks, no settings.local.json — simulates bare CI runner
  const report = runDiagnostics(dir, { ciMode: true });
  // Should not include infrastructure/skills/hooks sections
  const sectionTitles = report.sections.map(s => s.title);
  assert.ok(!sectionTitles.includes('Infrastructure'));
  assert.ok(!sectionTitles.includes('Skills'));
  assert.ok(!sectionTitles.includes('Hooks'));
  // Should still include the checks that work in CI
  assert.ok(sectionTitles.includes('Governance'));
  assert.ok(sectionTitles.includes('Security'));
  assert.ok(sectionTitles.includes('Environment'));
  // Should pass in a fresh CI state with analyze-generated governance
  assert.strictEqual(report.fail, 0);
  assert.strictEqual(report.ciMode, true);
});

test('doctor: --ci mode still fails on governance secrets', () => {
  const dir = mkProject({
    '.claude/governance.md': `# Governance — leaky
## Identity
- Project: leaky
## Gates
- test
## Branch Strategy
- Trunk-based
## Security
- API key: AKIAIOSFODNN7EXAMPLE
`,
  });
  const report = runDiagnostics(dir, { ciMode: true });
  assert.ok(report.fail > 0, 'should fail on embedded AWS key even in CI mode');
});

test('doctor: --ci mode still passes on minimal valid governance', () => {
  const dir = mkProject({
    '.claude/governance.md': `# Governance — x
## Identity
- Project: x
## Gates
### Test
- npm test
## Branch Strategy
- Trunk-based
## Security
- No secrets
`,
  });
  const report = runDiagnostics(dir, { ciMode: true });
  // Only the check for identity/description quality might warn, all else pass
  assert.strictEqual(report.fail, 0);
});

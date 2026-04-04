'use strict';

const fs = require('fs');
const path = require('path');

function check() {
  const cwd = process.cwd();
  const checks = [
    ['.claude/skills/pre-start-context/SKILL.md', 'Pre-start skill (universal)'],
    ['.claude/skills/post-start-validation/SKILL.md', 'Post-start skill (universal)'],
    ['.claude/governance.md', 'Governance rules'],
    ['.claude/hooks/drift-detector.sh', 'Drift detector hook'],
    ['.claude/hooks/circuit-breaker.sh', 'Circuit breaker hook'],
    ['.claude/agents/test-runner.md', 'Test runner agent'],
    ['.claude/agents/security-reviewer.md', 'Security reviewer agent'],
    ['.claude/ci-playbook.md', 'CI playbook'],
    ['.claude/settings.local.json', 'Settings with hooks'],
  ];

  const optional = [
    ['.claude/.session-name', 'Session name (remote access)'],
    ['.claude/hooks/pre-compact-snapshot.sh', 'Pre-compact hook (MemStack)'],
    ['.claude/hooks/post-compact-recovery.sh', 'Post-compact hook (MemStack)'],
    ['.claude/rules/knowledge.md', 'MemStack knowledge rule'],
    ['.claude/rules/diary.md', 'MemStack diary rule'],
    ['.claude/rules/echo.md', 'MemStack echo rule'],
  ];

  console.log(`\n  Checking crag infrastructure in ${cwd}\n`);

  console.log(`  Core:`);
  let missing = 0;
  for (const [file, name] of checks) {
    const exists = fs.existsSync(path.join(cwd, file));
    const icon = exists ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`    ${icon} ${name}`);
    if (!exists) missing++;
  }

  console.log(`\n  Optional:`);
  for (const [file, name] of optional) {
    const exists = fs.existsSync(path.join(cwd, file));
    const icon = exists ? '\x1b[32m✓\x1b[0m' : '\x1b[90m○\x1b[0m';
    console.log(`    ${icon} ${name}`);
  }

  console.log(`\n  ${checks.length - missing}/${checks.length} core files present.`);
  if (missing > 0) {
    console.log(`  Run 'crag init' to generate missing files.\n`);
  } else {
    console.log(`  Infrastructure complete.\n`);
  }
}

module.exports = { check };

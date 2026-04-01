#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const AGENT_SRC = path.join(SRC, 'scaffold-agent.md');
const PRE_START_SRC = path.join(SRC, 'skills', 'pre-start-context.md');
const POST_START_SRC = path.join(SRC, 'skills', 'post-start-validation.md');
const GLOBAL_AGENT_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'agents');
const GLOBAL_AGENT_PATH = path.join(GLOBAL_AGENT_DIR, 'scaffold-project.md');

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
  scaffold-cli — Self-maintaining Claude Code infrastructure

  Usage:
    scaffold init       Interview → generate governance, hooks, agents
    scaffold check      Verify infrastructure is complete
    scaffold install    Install agent globally for /scaffold-project
    scaffold version    Show version

  Architecture:
    Universal skills (ship with scaffold-cli, same for every project):
      pre-start-context     discovers any project at runtime
      post-start-validation validates using governance gates

    Generated per-project (from your interview answers):
      governance.md         your rules, quality bar, policies
      hooks/                drift detector, circuit breaker, compaction
      agents/               test-runner, security-reviewer, scanners
      settings.local.json   permissions + hook wiring

  The skills read governance.md and adapt. Nothing is hardcoded.
  `);
}

function install() {
  if (!fs.existsSync(GLOBAL_AGENT_DIR)) {
    fs.mkdirSync(GLOBAL_AGENT_DIR, { recursive: true });
  }
  fs.copyFileSync(AGENT_SRC, GLOBAL_AGENT_PATH);
  console.log(`  Installed scaffold-project agent to ${GLOBAL_AGENT_PATH}`);
  console.log(`  Run /scaffold-project from any Claude Code session.`);
}

function installSkills(targetDir) {
  const skillDirs = [
    path.join(targetDir, '.claude', 'skills', 'pre-start-context'),
    path.join(targetDir, '.claude', 'skills', 'post-start-validation'),
    path.join(targetDir, '.agents', 'workflows'),
  ];

  for (const dir of skillDirs) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  // Copy skills
  fs.copyFileSync(PRE_START_SRC, path.join(targetDir, '.claude', 'skills', 'pre-start-context', 'SKILL.md'));
  fs.copyFileSync(POST_START_SRC, path.join(targetDir, '.claude', 'skills', 'post-start-validation', 'SKILL.md'));

  // Workflow copies (remove name: line)
  for (const [src, name] of [[PRE_START_SRC, 'pre-start-context.md'], [POST_START_SRC, 'post-start-validation.md']]) {
    const content = fs.readFileSync(src, 'utf-8').replace(/^name:.*\n/m, '');
    fs.writeFileSync(path.join(targetDir, '.agents', 'workflows', name), content);
  }

  console.log(`  Installed universal skills to ${targetDir}`);
}

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

  console.log(`\n  Checking scaffold infrastructure in ${cwd}\n`);

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
    console.log(`  Run 'scaffold init' to generate missing files.\n`);
  } else {
    console.log(`  Infrastructure complete.\n`);
  }
}

function init() {
  try {
    execSync('claude --version', { stdio: 'ignore' });
  } catch {
    console.error('  Error: Claude Code CLI not found.');
    process.exit(1);
  }

  const cwd = process.cwd();

  // Install universal skills first
  console.log(`\n  Installing universal skills...`);
  installSkills(cwd);

  // Install agent globally if needed
  if (!fs.existsSync(GLOBAL_AGENT_PATH)) {
    install();
  }

  console.log(`\n  Starting scaffold interview...\n`);
  console.log(`  Claude Code will ask about your project.`);
  console.log(`  It generates: governance.md, hooks, agents, settings.`);
  console.log(`  The universal skills are already installed.\n`);

  const claude = spawn('claude', ['--agent', 'scaffold-project'], {
    stdio: 'inherit',
    shell: true,
  });

  claude.on('exit', (code) => {
    if (code === 0) {
      console.log(`\n  Scaffold complete. Run 'scaffold check' to verify.`);
    }
  });
}

switch (command) {
  case 'init':    init(); break;
  case 'install': install(); break;
  case 'check':   check(); break;
  case 'version': case '--version': case '-v':
    console.log(`  scaffold-cli v${require('../package.json').version}`);
    break;
  case 'help': case '--help': case '-h': case undefined:
    printUsage(); break;
  default:
    console.error(`  Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}

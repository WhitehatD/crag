#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const AGENT_PATH = path.join(__dirname, '..', 'src', 'scaffold-agent.md');
const GLOBAL_AGENT_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.claude',
  'agents'
);
const GLOBAL_AGENT_PATH = path.join(GLOBAL_AGENT_DIR, 'scaffold-project.md');

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
  scaffold-cli — Generate self-maintaining Claude Code infrastructure

  Usage:
    scaffold init          Interview + generate .claude/ for current project
    scaffold install       Install the agent globally (~/.claude/agents/)
    scaffold check         Verify generated infrastructure is intact
    scaffold version       Show version

  How it works:
    1. Run 'scaffold init' in your project directory
    2. Claude Code launches with the scaffold agent
    3. Answer questions about your stack, deployment, quality bar
    4. Complete .claude/ infrastructure is generated
    5. Every instruction classified as Discovery or Governance
    6. Workflows self-correct across sessions

  Requirements:
    - Claude Code CLI installed and authenticated
  `);
}

function install() {
  if (!fs.existsSync(GLOBAL_AGENT_DIR)) {
    fs.mkdirSync(GLOBAL_AGENT_DIR, { recursive: true });
  }
  fs.copyFileSync(AGENT_PATH, GLOBAL_AGENT_PATH);
  console.log(`  Installed scaffold-project agent to ${GLOBAL_AGENT_PATH}`);
  console.log(`  You can now run /scaffold-project from any Claude Code session.`);
}

function check() {
  const cwd = process.cwd();
  const checks = [
    ['.claude/skills/pre-start-context/SKILL.md', 'Pre-start skill'],
    ['.claude/skills/post-start-validation/SKILL.md', 'Post-start skill'],
    ['.claude/hooks/drift-detector.sh', 'Drift detector hook'],
    ['.claude/hooks/circuit-breaker.sh', 'Circuit breaker hook'],
    ['.claude/agents/test-runner.md', 'Test runner agent'],
    ['.claude/agents/security-reviewer.md', 'Security reviewer agent'],
    ['.claude/ci-playbook.md', 'CI playbook'],
    ['.claude/.session-name', 'Session name'],
    ['.claude/settings.local.json', 'Settings with hooks'],
  ];

  console.log(`\n  Checking scaffold infrastructure in ${cwd}\n`);
  let missing = 0;
  for (const [file, name] of checks) {
    const exists = fs.existsSync(path.join(cwd, file));
    const status = exists ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${status} ${name} (${file})`);
    if (!exists) missing++;
  }
  console.log(`\n  ${checks.length - missing}/${checks.length} files present.`);
  if (missing > 0) {
    console.log(`  Run 'scaffold init' to generate missing files.\n`);
  } else {
    console.log(`  Infrastructure complete.\n`);
  }
}

function init() {
  // Check if Claude Code is available
  try {
    execSync('claude --version', { stdio: 'ignore' });
  } catch {
    console.error('  Error: Claude Code CLI not found. Install it first.');
    console.error('  https://docs.anthropic.com/en/docs/claude-code');
    process.exit(1);
  }

  // Install agent globally if not already there
  if (!fs.existsSync(GLOBAL_AGENT_PATH)) {
    install();
  }

  console.log(`\n  Starting scaffold interview...\n`);
  console.log(`  Claude Code will ask about your project.`);
  console.log(`  Answer the questions — it generates your .claude/ infrastructure.\n`);

  // Launch Claude Code with the scaffold agent
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
  case 'init':
    init();
    break;
  case 'install':
    install();
    break;
  case 'check':
    check();
    break;
  case 'version':
  case '--version':
  case '-v':
    console.log(`  scaffold-cli v${require('../package.json').version}`);
    break;
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    printUsage();
    break;
  default:
    console.error(`  Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}

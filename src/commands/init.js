'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');
const AGENT_SRC = path.join(SRC, 'scaffold-agent.md');
const PRE_START_SRC = path.join(SRC, 'skills', 'pre-start-context.md');
const POST_START_SRC = path.join(SRC, 'skills', 'post-start-validation.md');
const GLOBAL_AGENT_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'agents');
const GLOBAL_AGENT_PATH = path.join(GLOBAL_AGENT_DIR, 'scaffold-project.md');

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

function init() {
  const cwd = process.cwd();

  // Pre-flight: check claude CLI
  try {
    execSync('claude --version', { stdio: 'ignore', timeout: 5000 });
  } catch {
    console.error('  Error: Claude Code CLI not found (or did not respond in 5s).');
    console.error('  Install: https://claude.com/claude-code');
    process.exit(1);
  }

  // Pre-flight: warn if not a git repo (non-blocking, just informative)
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    console.warn('  \x1b[33m!\x1b[0m Warning: not a git repository.');
    console.warn('    scaffold-cli works best in git repos (branch inference, commit conventions,');
    console.warn('    discovery cache keyed by commit hash). Run: git init');
  }

  // Pre-flight: warn if existing governance.md would be overwritten by interview
  const existingGov = path.join(cwd, '.claude', 'governance.md');
  if (fs.existsSync(existingGov)) {
    console.warn('  \x1b[33m!\x1b[0m Warning: .claude/governance.md already exists.');
    console.warn('    The interview will suggest changes; review before saving.');
    console.warn('    To update skills only without interview, use: scaffold upgrade');
  }

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
  console.log(`  >>> Type "go" and press Enter to start the interview <<<\n`);

  const claude = spawn('claude', ['--agent', 'scaffold-project'], {
    stdio: 'inherit',
    shell: true,
  });

  claude.on('error', (err) => {
    console.error(`\n  Error launching claude: ${err.message}`);
    process.exit(1);
  });

  claude.on('exit', (code, signal) => {
    if (code === 0) {
      console.log(`\n  Scaffold complete. Run 'scaffold check' to verify.`);
    } else if (signal) {
      console.error(`\n  Scaffold interview terminated by signal: ${signal}`);
      process.exit(1);
    } else if (code !== null) {
      console.error(`\n  Scaffold interview exited with code ${code}`);
      process.exit(code);
    }
  });
}

module.exports = { init, install, installSkills };

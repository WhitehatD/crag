'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { cliError, EXIT_USER, EXIT_INTERNAL } = require('../cli-errors');

const SRC = path.join(__dirname, '..');
const AGENT_SRC = path.join(SRC, 'crag-agent.md');
const PRE_START_SRC = path.join(SRC, 'skills', 'pre-start-context.md');
const POST_START_SRC = path.join(SRC, 'skills', 'post-start-validation.md');

// Use os.homedir() as the authoritative source — fall back only if it returns
// empty (extremely rare, e.g. stripped-down containers). Never pass undefined
// to path.join, which throws ERR_INVALID_ARG_TYPE.
function resolveHomeDir() {
  const h = os.homedir();
  if (h && h.length > 0) return h;
  return process.env.HOME || process.env.USERPROFILE || os.tmpdir();
}

const GLOBAL_AGENT_DIR = path.join(resolveHomeDir(), '.claude', 'agents');
const GLOBAL_AGENT_PATH = path.join(GLOBAL_AGENT_DIR, 'crag-project.md');

function install() {
  try {
    if (!fs.existsSync(GLOBAL_AGENT_DIR)) {
      fs.mkdirSync(GLOBAL_AGENT_DIR, { recursive: true });
    }
    fs.copyFileSync(AGENT_SRC, GLOBAL_AGENT_PATH);
    console.log(`  Installed crag-project agent to ${GLOBAL_AGENT_PATH}`);
    console.log(`  Run /crag-project from any Claude Code session.`);
  } catch (err) {
    cliError(`failed to install global agent: ${err.message}`, EXIT_INTERNAL);
  }
}

function installSkills(targetDir) {
  try {
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
  } catch (err) {
    cliError(`failed to install skills: ${err.message}`, EXIT_INTERNAL);
  }
}

function init() {
  const cwd = process.cwd();

  // Pre-flight: check claude CLI
  try {
    execSync('claude --version', { stdio: 'ignore', timeout: 5000 });
  } catch {
    console.error('  Error: Claude Code CLI not found (or did not respond in 5s).');
    console.error('  Install: https://claude.com/claude-code');
    process.exit(EXIT_USER);
  }

  // Pre-flight: warn if not a git repo (non-blocking, just informative)
  if (!fs.existsSync(path.join(cwd, '.git'))) {
    console.warn('  \x1b[33m!\x1b[0m Warning: not a git repository.');
    console.warn('    crag works best in git repos (branch inference, commit conventions,');
    console.warn('    discovery cache keyed by commit hash). Run: git init');
  }

  // Pre-flight: warn if existing governance.md would be overwritten by interview
  const existingGov = path.join(cwd, '.claude', 'governance.md');
  if (fs.existsSync(existingGov)) {
    console.warn('  \x1b[33m!\x1b[0m Warning: .claude/governance.md already exists.');
    console.warn('    The interview will suggest changes; review before saving.');
    console.warn('    To update skills only without interview, use: crag upgrade');
  }

  // Install universal skills first
  console.log(`\n  Installing universal skills...`);
  installSkills(cwd);

  // Install agent globally if needed
  if (!fs.existsSync(GLOBAL_AGENT_PATH)) {
    install();
  }

  console.log(`\n  Starting crag interview...\n`);
  console.log(`  Claude Code will ask about your project.`);
  console.log(`  It generates: governance.md, hooks, agents, settings.`);
  console.log(`  The universal skills are already installed.\n`);
  console.log(`  >>> Type "go" and press Enter to start the interview <<<\n`);

  // On Windows, `shell: true` defaults to cmd.exe which can't always resolve
  // the `claude` binary the way PowerShell / Git Bash can. Use an explicit
  // shell path on Windows (bash from Git for Windows is the common install).
  const spawnOpts = {
    stdio: 'inherit',
    shell: process.platform === 'win32' ? (process.env.SHELL || 'bash') : true,
  };
  const claude = spawn('claude', ['--agent', 'crag-project'], spawnOpts);

  claude.on('error', (err) => {
    console.error(`\n  Error launching claude: ${err.message}`);
    process.exit(EXIT_USER);
  });

  claude.on('exit', (code, signal) => {
    if (code === 0) {
      console.log(`\n  crag setup complete. Run 'crag check' to verify.`);
    } else if (signal) {
      console.error(`\n  Interview terminated by signal: ${signal}`);
      process.exit(EXIT_USER);
    } else if (code !== null) {
      console.error(`\n  Interview exited with code ${code}`);
      process.exit(code);
    }
  });
}

module.exports = { init, install, installSkills, resolveHomeDir };

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
    scaffold compile    Compile governance.md → CI workflows, git hooks
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
  console.log(`  >>> Type "go" and press Enter to start the interview <<<\n`);

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

// --- Governance Compiler ---

function parseGovernance(content) {
  const result = { name: '', description: '', gates: {}, runtimes: [] };

  const nameMatch = content.match(/- Project:\s*(.+)/);
  if (nameMatch) result.name = nameMatch[1].trim();

  const descMatch = content.match(/- Description:\s*(.+)/);
  if (descMatch) result.description = descMatch[1].trim();

  // Extract the Gates section (ends at next ## heading or EOF)
  const gatesMatch = content.match(/## Gates[^\n]*\n([\s\S]*?)(?=\n## [^#]|$)/);
  if (gatesMatch) {
    let section = 'default';
    for (const line of gatesMatch[1].split('\n')) {
      const sub = line.match(/^### (.+)/);
      if (sub) {
        section = sub[1].trim().toLowerCase();
        result.gates[section] = [];
      } else if (line.match(/^\s*- [^[\s]/) && line.trim() !== '-') {
        const cmd = line.replace(/^\s*- /, '').trim();
        if (cmd) {
          if (!result.gates[section]) result.gates[section] = [];
          result.gates[section].push(cmd);
        }
      }
    }
  }

  // Detect runtimes from gate commands
  const allCmds = Object.values(result.gates).flat().join(' ');
  if (/\b(node|npm|npx|eslint|prettier|biome|vitest|jest|next)\b/.test(allCmds)) result.runtimes.push('node');
  if (/\b(cargo|rustc|clippy|rustfmt)\b/.test(allCmds)) result.runtimes.push('rust');
  if (/\b(python|pip|pytest|ruff|mypy|django)\b/.test(allCmds)) result.runtimes.push('python');
  if (/\b(java|gradle|gradlew|maven|mvn)\b/.test(allCmds)) result.runtimes.push('java');
  if (/\bgo (build|test|vet|lint)\b/.test(allCmds)) result.runtimes.push('go');
  if (/\bdocker\b/.test(allCmds)) result.runtimes.push('docker');

  return result;
}

function gateToShell(cmd) {
  // Convert human-readable "Verify <file> contains <string>" to grep
  const verify = cmd.match(/^Verify\s+(\S+)\s+contains\s+["']([^"']+)["']$/i);
  if (verify) return `grep -qi "${verify[2]}" "${verify[1]}"`;
  return cmd;
}

function generateGitHubActions(cwd, parsed) {
  const dir = path.join(cwd, '.github', 'workflows');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let setupSteps = '';
  if (parsed.runtimes.includes('node')) {
    setupSteps += '      - name: Setup Node.js\n';
    setupSteps += '        uses: actions/setup-node@v4\n';
    setupSteps += "        with:\n          node-version: '22'\n";
    setupSteps += '      - run: npm ci\n';
  }
  if (parsed.runtimes.includes('rust')) {
    setupSteps += '      - name: Setup Rust\n';
    setupSteps += '        uses: dtolnay/rust-toolchain@stable\n';
  }
  if (parsed.runtimes.includes('python')) {
    setupSteps += '      - name: Setup Python\n';
    setupSteps += '        uses: actions/setup-python@v5\n';
    setupSteps += "        with:\n          python-version: '3.12'\n";
    setupSteps += '      - run: pip install -r requirements.txt 2>/dev/null || true\n';
  }
  if (parsed.runtimes.includes('java')) {
    setupSteps += '      - name: Setup Java\n';
    setupSteps += '        uses: actions/setup-java@v4\n';
    setupSteps += "        with:\n          distribution: temurin\n          java-version: '21'\n";
  }
  if (parsed.runtimes.includes('go')) {
    setupSteps += '      - name: Setup Go\n';
    setupSteps += '        uses: actions/setup-go@v5\n';
    setupSteps += "        with:\n          go-version: '1.22'\n";
  }

  let gateSteps = '';
  for (const [section, cmds] of Object.entries(parsed.gates)) {
    for (const cmd of cmds) {
      const shell = gateToShell(cmd);
      const label = cmd.length > 60 ? cmd.substring(0, 57) + '...' : cmd;
      gateSteps += `      - name: "${section}: ${label.replace(/"/g, '\\"')}"\n`;
      gateSteps += `        run: ${shell}\n`;
    }
  }

  const yaml = [
    '# Generated from governance.md by scaffold-cli',
    '# Regenerate: scaffold compile --target github',
    'name: Governance Gates',
    '',
    'on:',
    '  push:',
    '    branches: [main, master]',
    '  pull_request:',
    '    branches: [main, master]',
    '',
    'jobs:',
    '  gates:',
    '    name: Governance Gates',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    setupSteps + gateSteps,
  ].join('\n');

  const outPath = path.join(dir, 'gates.yml');
  fs.writeFileSync(outPath, yaml);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

function generateHusky(cwd, parsed) {
  const dir = path.join(cwd, '.husky');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let body = '';
  for (const [section, cmds] of Object.entries(parsed.gates)) {
    body += `# ${section}\n`;
    for (const cmd of cmds) {
      body += `${gateToShell(cmd)}\n`;
    }
    body += '\n';
  }

  const script = [
    '#!/bin/sh',
    '# Generated from governance.md by scaffold-cli',
    '# Regenerate: scaffold compile --target husky',
    '',
    body.trim(),
    '',
  ].join('\n');

  const outPath = path.join(dir, 'pre-commit');
  fs.writeFileSync(outPath, script);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

function generatePreCommitConfig(cwd, parsed) {
  const allCmds = Object.values(parsed.gates).flat();

  let hooks = '';
  allCmds.forEach((cmd, i) => {
    const id = `gate-${i + 1}`;
    const name = cmd.length > 50 ? cmd.substring(0, 47) + '...' : cmd;
    hooks += `      - id: ${id}\n`;
    hooks += `        name: "${name.replace(/"/g, '\\"')}"\n`;
    const shell = gateToShell(cmd);
    hooks += `        entry: bash -c '${shell.replace(/'/g, "'\\''")}'\n`;
    hooks += '        language: system\n';
    hooks += '        pass_filenames: false\n';
    hooks += '        always_run: true\n';
  });

  const yaml = [
    '# Generated from governance.md by scaffold-cli',
    '# Regenerate: scaffold compile --target pre-commit',
    'repos:',
    '  - repo: local',
    '    hooks:',
    hooks.trimEnd(),
    '',
  ].join('\n');

  const outPath = path.join(cwd, '.pre-commit-config.yaml');
  fs.writeFileSync(outPath, yaml);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

function compile() {
  const targetIdx = args.indexOf('--target');
  const target = targetIdx !== -1 ? args[targetIdx + 1] : args[1];
  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');

  if (!fs.existsSync(govPath)) {
    console.error('  Error: No .claude/governance.md found. Run scaffold init first.');
    process.exit(1);
  }

  const content = fs.readFileSync(govPath, 'utf-8');
  const parsed = parseGovernance(content);
  const gateCount = Object.values(parsed.gates).flat().length;

  if (!target || target === 'list') {
    console.log(`\n  Governance compiler — ${parsed.name || 'unnamed project'}`);
    console.log(`  Found ${gateCount} gate(s) in ${Object.keys(parsed.gates).length} section(s)\n`);
    console.log('  Targets:');
    console.log('    scaffold compile --target github      .github/workflows/gates.yml');
    console.log('    scaffold compile --target husky       .husky/pre-commit');
    console.log('    scaffold compile --target pre-commit  .pre-commit-config.yaml');
    console.log('    scaffold compile --target all         All of the above\n');
    return;
  }

  const targets = target === 'all' ? ['github', 'husky', 'pre-commit'] : [target];

  console.log(`\n  Compiling governance.md → ${targets.join(', ')}`);
  console.log(`  ${gateCount} gates, ${parsed.runtimes.length} runtimes detected\n`);

  for (const t of targets) {
    switch (t) {
      case 'github': generateGitHubActions(cwd, parsed); break;
      case 'husky': generateHusky(cwd, parsed); break;
      case 'pre-commit': generatePreCommitConfig(cwd, parsed); break;
      default:
        console.error(`  Unknown target: ${t}`);
        console.error('  Valid targets: github, husky, pre-commit, all');
        process.exit(1);
    }
  }

  console.log('\n  Done. Governance is now executable infrastructure.\n');
}

switch (command) {
  case 'init':    init(); break;
  case 'install': install(); break;
  case 'check':   check(); break;
  case 'compile': compile(); break;
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

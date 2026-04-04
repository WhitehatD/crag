'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { detectWorkspace } = require('../workspace/detect');
const { enumerateMembers } = require('../workspace/enumerate');

/**
 * crag analyze — generate governance.md from existing project without interview.
 * Reads CI configs, package manifests, linter configs, git history.
 */
function analyze(args) {
  const dryRun = args.includes('--dry-run');
  const workspace = args.includes('--workspace');
  const merge = args.includes('--merge');
  const cwd = process.cwd();

  console.log(`\n  Analyzing project in ${cwd}...\n`);

  const analysis = analyzeProject(cwd);

  if (workspace) {
    const ws = detectWorkspace(cwd);
    if (ws.type !== 'none') {
      const members = enumerateMembers(ws);
      console.log(`  Workspace detected: ${ws.type} (${members.length} members)\n`);
      analysis.workspace = { type: ws.type, members: [] };

      for (const member of members) {
        const memberAnalysis = analyzeProject(member.path);
        analysis.workspace.members.push({ name: member.name, ...memberAnalysis });
      }
    }
  }

  const governance = generateGovernance(analysis, cwd);

  if (dryRun) {
    console.log('  --- DRY RUN (would generate) ---\n');
    console.log(governance);
    console.log('  --- END DRY RUN ---\n');
    return;
  }

  const govPath = path.join(cwd, '.claude', 'governance.md');
  const govDir = path.dirname(govPath);
  if (!fs.existsSync(govDir)) fs.mkdirSync(govDir, { recursive: true });

  if (fs.existsSync(govPath) && !merge) {
    const backupPath = govPath + '.bak.' + Date.now();
    fs.copyFileSync(govPath, backupPath);
    console.log(`  Backed up existing governance to ${path.basename(backupPath)}`);
  }

  if (merge && fs.existsSync(govPath)) {
    console.log('  Merge mode: preserving existing governance, appending new gates');
    const existing = fs.readFileSync(govPath, 'utf-8');
    const mergedContent = mergeWithExisting(existing, governance);
    fs.writeFileSync(govPath, mergedContent);
  } else {
    fs.writeFileSync(govPath, governance);
  }

  console.log(`  \x1b[32m✓\x1b[0m Generated ${path.relative(cwd, govPath)}`);
  console.log(`\n  Review the file — sections marked "# Inferred" should be verified.`);
  console.log(`  Run 'crag check' to verify infrastructure.\n`);
}

function analyzeProject(dir) {
  const result = {
    name: path.basename(dir),
    description: '',
    stack: [],
    gates: [],
    linters: [],
    formatters: [],
    testers: [],
    builders: [],
    branchStrategy: 'unknown',
    commitConvention: 'unknown',
    deployment: [],
    ci: null,
    ciGates: [],
  };

  // Detect stack from manifests
  detectStack(dir, result);

  // Extract gates from CI
  extractCIGates(dir, result);

  // Extract gates from package.json scripts
  extractPackageScripts(dir, result);

  // Detect linters
  detectLinters(dir, result);

  // Detect deployment
  detectDeployment(dir, result);

  // Infer branch strategy and commit convention from git
  inferGitPatterns(dir, result);

  return result;
}

function detectStack(dir, result) {
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    result.stack.push('node');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
      result.name = pkg.name || result.name;
      result.description = pkg.description || '';

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) result.stack.push('next.js');
      if (deps.react && !deps.next) result.stack.push('react');
      if (deps.vue) result.stack.push('vue');
      if (deps.svelte) result.stack.push('svelte');
      if (deps.express) result.stack.push('express');
      if (deps.fastify) result.stack.push('fastify');
      if (deps.typescript) result.stack.push('typescript');
    } catch { /* skip */ }
  }
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) result.stack.push('rust');
  if (fs.existsSync(path.join(dir, 'go.mod'))) result.stack.push('go');
  if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'setup.py'))) result.stack.push('python');
  if (fs.existsSync(path.join(dir, 'build.gradle.kts')) || fs.existsSync(path.join(dir, 'build.gradle'))) result.stack.push('java/gradle');
  if (fs.existsSync(path.join(dir, 'pom.xml'))) result.stack.push('java/maven');
  if (fs.existsSync(path.join(dir, 'Dockerfile'))) result.stack.push('docker');
}

function extractCIGates(dir, result) {
  // GitHub Actions
  const workflowDir = path.join(dir, '.github', 'workflows');
  if (fs.existsSync(workflowDir)) {
    result.ci = 'github-actions';
    try {
      // Walk workflow dir recursively to catch nested workflows
      const walk = (d) => {
        const out = [];
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) out.push(...walk(full));
          else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) out.push(full);
        }
        return out;
      };
      for (const file of walk(workflowDir)) {
        const content = fs.readFileSync(file, 'utf-8');
        for (const cmd of extractRunCommands(content)) {
          if (isGateCommand(cmd)) result.ciGates.push(cmd);
        }
      }
    } catch { /* skip */ }
  }

  // GitLab CI
  if (fs.existsSync(path.join(dir, '.gitlab-ci.yml'))) {
    result.ci = 'gitlab-ci';
  }

  // Jenkins
  if (fs.existsSync(path.join(dir, 'Jenkinsfile'))) {
    result.ci = 'jenkins';
  }
}

/**
 * Extract commands from YAML `run:` steps, handling both inline and block-scalar forms:
 *   run: npm test
 *   run: |
 *     npm test
 *     npm build
 *   run: >-
 *     npm test
 */
function extractRunCommands(content) {
  const commands = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(\s*)-?\s*run:\s*(.*)$/);
    if (!m) continue;

    const baseIndent = m[1].length;
    const rest = m[2].trim();

    // Block scalar: | or |- or |+ or > or >- or >+
    if (/^[|>][+-]?\s*$/.test(rest)) {
      // Collect following lines with greater indent
      const blockLines = [];
      for (let j = i + 1; j < lines.length; j++) {
        const ln = lines[j];
        if (ln.trim() === '') { blockLines.push(''); continue; }
        const indentMatch = ln.match(/^(\s*)/);
        if (indentMatch[1].length <= baseIndent) break;
        blockLines.push(ln.slice(baseIndent + 2));
      }
      for (const bl of blockLines) {
        const trimmed = bl.trim();
        if (trimmed && !trimmed.startsWith('#')) commands.push(trimmed);
      }
    } else if (rest && !rest.startsWith('#')) {
      // Inline: remove surrounding quotes if any
      commands.push(rest.replace(/^["']|["']$/g, ''));
    }
  }

  return commands;
}

function extractPackageScripts(dir, result) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const scripts = pkg.scripts || {};

    const scriptMap = {
      test: 'testers',
      lint: 'linters',
      build: 'builders',
      format: 'formatters',
      typecheck: 'builders',
      check: 'linters',
    };

    for (const [key, category] of Object.entries(scriptMap)) {
      if (scripts[key]) {
        result[category].push(`npm run ${key}`);
      }
    }

    // Also check for specific patterns
    if (scripts['lint:fix']) result.formatters.push('npm run lint:fix');
    if (scripts['format:check']) result.linters.push('npm run format:check');
  } catch { /* skip */ }
}

function detectLinters(dir, result) {
  const linterConfigs = [
    ['.eslintrc', 'eslint'], ['.eslintrc.js', 'eslint'], ['.eslintrc.json', 'eslint'], ['.eslintrc.cjs', 'eslint'],
    ['eslint.config.js', 'eslint'], ['eslint.config.mjs', 'eslint'], ['eslint.config.cjs', 'eslint'],
    ['biome.json', 'biome'], ['biome.jsonc', 'biome'],
    ['.prettierrc', 'prettier'], ['.prettierrc.js', 'prettier'], ['.prettierrc.json', 'prettier'],
    ['prettier.config.js', 'prettier'], ['prettier.config.mjs', 'prettier'],
    ['ruff.toml', 'ruff'], ['.ruff.toml', 'ruff'],
    ['clippy.toml', 'clippy'], ['.clippy.toml', 'clippy'],
    ['rustfmt.toml', 'rustfmt'], ['.rustfmt.toml', 'rustfmt'],
    ['tsconfig.json', 'typescript'],
    ['.mypy.ini', 'mypy'], ['mypy.ini', 'mypy'],
  ];

  for (const [file, tool] of linterConfigs) {
    if (fs.existsSync(path.join(dir, file))) {
      if (!result.linters.includes(tool)) result.linters.push(tool);
    }
  }

  // Build/task file detection
  const taskFiles = ['Makefile', 'Taskfile.yml', 'justfile'];
  for (const file of taskFiles) {
    if (fs.existsSync(path.join(dir, file))) {
      result.builders.push(`${file} detected`);
    }
  }
}

function detectDeployment(dir, result) {
  if (fs.existsSync(path.join(dir, 'Dockerfile'))) result.deployment.push('docker');
  if (fs.existsSync(path.join(dir, 'docker-compose.yml')) || fs.existsSync(path.join(dir, 'docker-compose.yaml'))) result.deployment.push('docker-compose');
  if (fs.existsSync(path.join(dir, 'vercel.json')) || fs.existsSync(path.join(dir, '.vercel'))) result.deployment.push('vercel');
  if (fs.existsSync(path.join(dir, 'fly.toml'))) result.deployment.push('fly.io');
  if (fs.existsSync(path.join(dir, 'netlify.toml'))) result.deployment.push('netlify');
  if (fs.existsSync(path.join(dir, 'render.yaml'))) result.deployment.push('render');

  // Kubernetes
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && (entry.name === 'k8s' || entry.name === 'kubernetes' || entry.name === 'deploy')) {
        result.deployment.push('kubernetes');
        break;
      }
    }
  } catch { /* skip */ }

  // Terraform
  try {
    const entries = fs.readdirSync(dir);
    if (entries.some(f => f.endsWith('.tf'))) result.deployment.push('terraform');
  } catch { /* skip */ }
}

function inferGitPatterns(dir, result) {
  try {
    const log = execSync('git log --oneline --all -50', { cwd: dir, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = log.trim().split('\n');

    // Detect conventional commits
    const conventional = lines.filter(l => /\b(feat|fix|docs|chore|style|refactor|test|build|ci|perf|revert)[\(:!]/.test(l));
    result.commitConvention = conventional.length > lines.length * 0.3 ? 'conventional' : 'free-form';

    // Detect branch strategy
    const branches = execSync('git branch -a --format="%(refname:short)"', { cwd: dir, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const branchList = branches.trim().split('\n');
    const featureBranches = branchList.filter(b => /^(feat|fix|docs|chore|feature|hotfix|release)\//.test(b));
    result.branchStrategy = featureBranches.length > 2 ? 'feature-branches' : 'trunk-based';
  } catch {
    result.branchStrategy = 'unknown';
    result.commitConvention = 'unknown';
  }
}

function isGateCommand(cmd) {
  const gatePatterns = [
    /npm (run |ci|test|install)/, /npx /, /node /,
    /cargo (test|build|check|clippy)/, /rustfmt/,
    /go (test|build|vet)/, /golangci-lint/,
    /pytest/, /python -m/, /ruff/, /mypy/, /flake8/,
    /gradle/, /mvn /, /maven/,
    /eslint/, /biome/, /prettier/, /tsc/,
    /docker (build|compose)/, /make /, /just /,
  ];
  return gatePatterns.some(p => p.test(cmd));
}

function generateGovernance(analysis, cwd) {
  const sections = [];

  // Identity
  sections.push(`# Governance — ${analysis.name}`);
  sections.push(`# Inferred by crag analyze — review and adjust as needed\n`);
  sections.push('## Identity');
  sections.push(`- Project: ${analysis.name}`);
  if (analysis.description) sections.push(`- Description: ${analysis.description}`);
  sections.push(`- Stack: ${analysis.stack.join(', ') || 'unknown'}`);
  sections.push('');

  // Gates
  sections.push('## Gates (run in order, stop on failure)');

  // Group gates by type
  const allGates = new Set();

  // From linters
  if (analysis.linters.length > 0) {
    sections.push('### Lint');
    for (const linter of analysis.linters) {
      let cmd;
      switch (linter) {
        case 'eslint': cmd = 'npx eslint . --max-warnings 0'; break;
        case 'biome': cmd = 'npx biome check .'; break;
        case 'ruff': cmd = 'ruff check .'; break;
        case 'clippy': cmd = 'cargo clippy -- -D warnings'; break;
        case 'mypy': cmd = 'mypy .'; break;
        case 'typescript': cmd = 'npx tsc --noEmit'; break;
        default: cmd = null;
      }
      if (cmd && !allGates.has(cmd)) {
        sections.push(`- ${cmd}`);
        allGates.add(cmd);
      }
    }
    sections.push('');
  }

  // From testers
  if (analysis.testers.length > 0) {
    sections.push('### Test');
    for (const tester of analysis.testers) {
      if (!allGates.has(tester)) {
        sections.push(`- ${tester}`);
        allGates.add(tester);
      }
    }
    sections.push('');
  }

  // From builders
  if (analysis.builders.length > 0) {
    sections.push('### Build');
    for (const builder of analysis.builders) {
      if (!builder.includes('detected') && !allGates.has(builder)) {
        sections.push(`- ${builder}`);
        allGates.add(builder);
      }
    }
    sections.push('');
  }

  // From CI gates (if not already covered)
  const uniqueCiGates = analysis.ciGates.filter(g => !allGates.has(g));
  if (uniqueCiGates.length > 0) {
    sections.push('### CI (inferred from workflow)');
    for (const gate of uniqueCiGates) {
      sections.push(`- ${gate}`);
    }
    sections.push('');
  }

  // Rust-specific gates
  if (analysis.stack.includes('rust')) {
    if (!allGates.has('cargo test')) {
      sections.push('### Rust');
      sections.push('- cargo test');
      sections.push('- cargo clippy -- -D warnings');
      sections.push('');
    }
  }

  // Go-specific gates
  if (analysis.stack.includes('go')) {
    if (!allGates.has('go test ./...')) {
      sections.push('### Go');
      sections.push('- go test ./...');
      sections.push('- go vet ./...');
      sections.push('');
    }
  }

  // Node.js syntax check for CLI projects
  if (analysis.stack.includes('node') && !analysis.stack.includes('next.js') && !analysis.stack.includes('react')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
      if (pkg.bin) {
        const binFiles = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
        sections.push('### Syntax');
        for (const bin of binFiles) {
          sections.push(`- node --check ${bin}`);
        }
        sections.push('');
      }
    } catch { /* skip */ }
  }

  // Branch Strategy
  sections.push('## Branch Strategy');
  sections.push(`- ${analysis.branchStrategy === 'feature-branches' ? 'Feature branches (feat/, fix/, docs/)' : 'Trunk-based development'}`);
  sections.push(`- ${analysis.commitConvention === 'conventional' ? 'Conventional commits' : 'Free-form commits'}`);
  sections.push('- Commit trailer: Co-Authored-By: Claude <noreply@anthropic.com>');
  sections.push('');

  // Security
  sections.push('## Security');
  sections.push('- No hardcoded secrets — grep for sk_live, AKIA, password= before commit');
  sections.push('');

  // Autonomy
  sections.push('## Autonomy');
  sections.push('- Auto-commit after gates pass');
  sections.push('');

  // Deployment
  if (analysis.deployment.length > 0) {
    sections.push('## Deployment');
    sections.push(`- Target: ${analysis.deployment.join(', ')}`);
    if (analysis.ci) sections.push(`- CI: ${analysis.ci}`);
    sections.push('');
  }

  return sections.join('\n') + '\n';
}

function mergeWithExisting(existing, generated) {
  // Simple merge: keep existing content, append new sections that don't exist
  const existingSections = new Set();
  for (const match of existing.matchAll(/^## (.+)$/gm)) {
    existingSections.add(match[1].trim().toLowerCase());
  }

  // Walk the generated file and collect new sections in their original order.
  // Each new section becomes a self-contained block: the heading line plus all
  // following lines until the next heading or EOF.
  const newBlocks = [];
  const genLines = generated.split('\n');
  let currentBlock = null;
  let blockIsNew = false;

  for (const line of genLines) {
    const sectionMatch = line.match(/^## (.+)$/);
    if (sectionMatch) {
      // Flush previous block if it was new
      if (currentBlock && blockIsNew) {
        newBlocks.push(currentBlock.trimEnd());
      }
      // Start new block
      const section = sectionMatch[1].trim().toLowerCase();
      blockIsNew = !existingSections.has(section);
      currentBlock = blockIsNew ? line + '\n' : null;
    } else if (blockIsNew && currentBlock !== null) {
      currentBlock += line + '\n';
    }
  }
  // Flush final block
  if (currentBlock && blockIsNew) {
    newBlocks.push(currentBlock.trimEnd());
  }

  if (newBlocks.length > 0) {
    return existing.trimEnd() +
      '\n\n# --- Inferred additions (review) ---\n\n' +
      newBlocks.join('\n\n') +
      '\n';
  }
  return existing;
}

module.exports = { analyze, analyzeProject, isGateCommand, mergeWithExisting };

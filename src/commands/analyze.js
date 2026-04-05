'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { detectWorkspace } = require('../workspace/detect');
const { enumerateMembers } = require('../workspace/enumerate');
const { isGateCommand } = require('../governance/yaml-run');
const { cliWarn, cliError, EXIT_INTERNAL } = require('../cli-errors');
const { detectStack } = require('../analyze/stacks');
const { inferGates } = require('../analyze/gates');
const { normalizeCiGates } = require('../analyze/normalize');
const { extractCiCommands } = require('../analyze/ci-extractors');
const { mineTaskTargets } = require('../analyze/task-runners');
const { mineDocGates } = require('../analyze/doc-mining');

// Directories commonly used for test fixtures and examples in workspaces.
// When analyze auto-wires to workspace detection, these are excluded from
// member enumeration so we don't emit 79 per-fixture sections for vite.
const FIXTURE_DIR_PATTERNS = [
  /^playground$/,
  /^fixtures$/,
  /^examples?$/,
  /^demos?$/,
  /^test-fixtures$/,
  /^__fixtures__$/,
];

/**
 * crag analyze — generate governance.md from existing project without interview.
 */
function analyze(args) {
  const dryRun = args.includes('--dry-run');
  const workspaceFlag = args.includes('--workspace');
  const merge = args.includes('--merge');
  const cwd = process.cwd();

  console.log(`\n  Analyzing project in ${cwd}...\n`);

  const analysis = analyzeProject(cwd);

  // Workspace detection always runs. If a workspace is detected, we either:
  //   (a) emit per-member sections when --workspace is passed, OR
  //   (b) print a hint so the user knows to opt in.
  const ws = detectWorkspace(cwd);
  if (ws.type !== 'none') {
    analysis.workspaceType = ws.type;
    if (workspaceFlag) {
      const members = filterFixtureMembers(enumerateMembers(ws));
      console.log(`  Workspace detected: ${ws.type} (${members.length} real members after fixture filter)\n`);
      analysis.workspace = { type: ws.type, members: [] };
      for (const member of members) {
        const memberAnalysis = analyzeProject(member.path);
        analysis.workspace.members.push({
          name: member.name,
          relativePath: member.relativePath,
          ...memberAnalysis,
        });
      }
    } else {
      console.log(`  Workspace detected: ${ws.type}. Pass --workspace for per-member gates.\n`);
    }
  } else if (analysis.subservices && analysis.subservices.length > 0) {
    // No canonical workspace marker, but recursive stack detection found
    // subservice manifests under src/ / services/ / packages/ / apps/ / etc.
    // Treat as an independent-subservices workspace.
    const count = analysis.subservices.length;
    analysis.workspaceType = 'subservices';
    if (workspaceFlag) {
      console.log(`  Subservices detected: ${count} service${count === 1 ? '' : 's'} across src/ services/ packages/ apps/ directories\n`);
      analysis.workspace = { type: 'subservices', members: [] };
      for (const sub of analysis.subservices) {
        const subPath = path.join(cwd, sub.path);
        const subAnalysis = analyzeProject(subPath);
        analysis.workspace.members.push({
          name: sub.name,
          relativePath: sub.path,
          ...subAnalysis,
        });
      }
    } else {
      console.log(`  Subservices detected: ${count} service${count === 1 ? '' : 's'}. Pass --workspace for per-service gates.\n`);
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
  try {
    if (!fs.existsSync(govDir)) fs.mkdirSync(govDir, { recursive: true });

    if (fs.existsSync(govPath) && !merge) {
      const backupPath = govPath + '.bak.' + Date.now();
      try {
        fs.copyFileSync(govPath, backupPath);
        console.log(`  Backed up existing governance to ${path.basename(backupPath)}`);
      } catch (err) {
        cliWarn(`could not create backup (continuing anyway): ${err.message}`);
      }
    }

    if (merge && fs.existsSync(govPath)) {
      console.log('  Merge mode: preserving existing governance, appending new gates');
      const existing = fs.readFileSync(govPath, 'utf-8');
      const mergedContent = mergeWithExisting(existing, governance);
      fs.writeFileSync(govPath, mergedContent);
    } else {
      fs.writeFileSync(govPath, governance);
    }
  } catch (err) {
    cliError(`failed to write ${path.relative(cwd, govPath)}: ${err.message}`, EXIT_INTERNAL);
  }

  console.log(`  \x1b[32m✓\x1b[0m Generated ${path.relative(cwd, govPath)}`);
  console.log(`\n  Review the file — sections marked "# Inferred" should be verified.`);
  console.log(`  Run 'crag check' to verify infrastructure.\n`);
}

/**
 * Filter out test fixture directories from workspace member lists.
 * These directories (playground/, fixtures/, etc.) contain dozens of one-off
 * test setups that should not each get their own governance section.
 */
function filterFixtureMembers(members) {
  return members.filter(m => {
    const parts = m.relativePath.split(/[\\/]/);
    return !parts.some(p => FIXTURE_DIR_PATTERNS.some(rx => rx.test(p)));
  });
}

function analyzeProject(dir) {
  const result = {
    name: path.basename(dir),
    description: '',
    stack: [],
    linters: [],
    formatters: [],
    testers: [],
    builders: [],
    branchStrategy: 'unknown',
    commitConvention: 'unknown',
    deployment: [],
    ci: null,
    ciGates: [],
    advisories: [],
    docGates: [],
    taskTargets: { make: [], task: [], just: [] },
  };

  // Stack detection (languages, frameworks, package managers)
  detectStack(dir, result);

  // CI system detection + raw command extraction (all supported CI systems)
  const ci = extractCiCommands(dir);
  result.ci = ci.system;
  result.ciGates = normalizeCiGates(ci.commands.filter(c => isGateCommand(c)));

  // Task runner target mining
  result.taskTargets = mineTaskTargets(dir);

  // Gate inference per language/runtime (consumes _manifests)
  inferGates(dir, result);

  // Emit explicit gates for mined task targets
  emitTaskRunnerGates(result);

  // Documentation-based gate mining (advisory)
  result.docGates = mineDocGates(dir);

  // Legacy deployment detection
  detectDeployment(dir, result);

  // Git-derived branch strategy + commit convention
  inferGitPatterns(dir, result);

  // Carry advisories collected during gate inference (hadolint, actionlint)
  if (result._advisories) {
    result.advisories.push(...result._advisories);
    delete result._advisories;
  }
  // Promote subservices (from recursive stack detection) to a public field
  // so analyze command can print a hint and --workspace can enumerate them.
  if (result._manifests && result._manifests.subservices) {
    result.subservices = result._manifests.subservices;
  }
  // Drop the internal manifests attachment before returning
  delete result._manifests;

  return result;
}

function emitTaskRunnerGates(result) {
  const { make, task, just } = result.taskTargets;
  for (const target of make) {
    // Canonical gate name: use `make X` literally
    const cmd = `make ${target}`;
    if (isTestTarget(target)) addUnique(result.testers, cmd);
    else if (isLintTarget(target)) addUnique(result.linters, cmd);
    else if (isBuildTarget(target)) addUnique(result.builders, cmd);
  }
  for (const target of task) {
    const cmd = `task ${target}`;
    if (isTestTarget(target)) addUnique(result.testers, cmd);
    else if (isLintTarget(target)) addUnique(result.linters, cmd);
    else if (isBuildTarget(target)) addUnique(result.builders, cmd);
  }
  for (const target of just) {
    const cmd = `just ${target}`;
    if (isTestTarget(target)) addUnique(result.testers, cmd);
    else if (isLintTarget(target)) addUnique(result.linters, cmd);
    else if (isBuildTarget(target)) addUnique(result.builders, cmd);
  }
}

function addUnique(arr, item) {
  if (!arr.includes(item)) arr.push(item);
}

const TEST_TARGETS = new Set(['test', 'tests', 'spec', 'check', 'ci', 'verify', 'validate']);
const LINT_TARGETS = new Set(['lint', 'format', 'fmt', 'style', 'typecheck', 'type-check', 'types']);
const BUILD_TARGETS = new Set(['build', 'compile']);
const isTestTarget = (t) => TEST_TARGETS.has(t);
const isLintTarget = (t) => LINT_TARGETS.has(t);
const isBuildTarget = (t) => BUILD_TARGETS.has(t);

function detectDeployment(dir, result) {
  if (fs.existsSync(path.join(dir, 'Dockerfile'))) result.deployment.push('docker');
  if (fs.existsSync(path.join(dir, 'docker-compose.yml')) ||
      fs.existsSync(path.join(dir, 'docker-compose.yaml')) ||
      fs.existsSync(path.join(dir, 'compose.yml')) ||
      fs.existsSync(path.join(dir, 'compose.yaml'))) result.deployment.push('docker-compose');
  if (fs.existsSync(path.join(dir, 'vercel.json')) || fs.existsSync(path.join(dir, '.vercel'))) result.deployment.push('vercel');
  if (fs.existsSync(path.join(dir, 'fly.toml'))) result.deployment.push('fly.io');
  if (fs.existsSync(path.join(dir, 'netlify.toml'))) result.deployment.push('netlify');
  if (fs.existsSync(path.join(dir, 'render.yaml'))) result.deployment.push('render');
  if (fs.existsSync(path.join(dir, 'railway.json')) || fs.existsSync(path.join(dir, 'railway.toml'))) result.deployment.push('railway');
  if (fs.existsSync(path.join(dir, 'wrangler.toml'))) result.deployment.push('cloudflare-workers');
  if (fs.existsSync(path.join(dir, 'app.yaml'))) result.deployment.push('gcp-app-engine');
  if (fs.existsSync(path.join(dir, 'serverless.yml')) || fs.existsSync(path.join(dir, 'serverless.yaml'))) result.deployment.push('serverless-framework');
  if (fs.existsSync(path.join(dir, 'template.yaml')) || fs.existsSync(path.join(dir, 'template.yml'))) result.deployment.push('aws-sam');

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && (entry.name === 'k8s' || entry.name === 'kubernetes' || entry.name === 'deploy' || entry.name === 'manifests')) {
        result.deployment.push('kubernetes');
        break;
      }
    }
  } catch { /* skip */ }

  try {
    const entries = fs.readdirSync(dir);
    if (entries.some(f => f.endsWith('.tf'))) result.deployment.push('terraform');
  } catch { /* skip */ }

  if (fs.existsSync(path.join(dir, 'Chart.yaml'))) result.deployment.push('helm');
  if (fs.existsSync(path.join(dir, 'Pulumi.yaml')) || fs.existsSync(path.join(dir, 'Pulumi.yml'))) result.deployment.push('pulumi');
  if (fs.existsSync(path.join(dir, 'ansible.cfg'))) result.deployment.push('ansible');
}

function inferGitPatterns(dir, result) {
  try {
    const log = execSync('git log --oneline --all -50', { cwd: dir, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = log.trim().split('\n');

    const conventional = lines.filter(l => /\b(feat|fix|docs|chore|style|refactor|test|build|ci|perf|revert)[\(:!]/.test(l));
    result.commitConvention = conventional.length > lines.length * 0.3 ? 'conventional' : 'free-form';

    const branches = execSync('git branch -a --format="%(refname:short)"', { cwd: dir, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const branchList = branches.trim().split('\n');
    const featureBranches = branchList.filter(b => /^(feat|fix|docs|chore|feature|hotfix|release)\//.test(b));
    result.branchStrategy = featureBranches.length > 2 ? 'feature-branches' : 'trunk-based';
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      cliWarn(`could not detect git patterns in ${path.basename(dir)}: ${err.message}`);
    }
    result.branchStrategy = 'unknown';
    result.commitConvention = 'unknown';
  }
}

function generateGovernance(analysis, cwd) {
  const sections = [];

  sections.push(`# Governance — ${analysis.name}`);
  sections.push(`# Inferred by crag analyze — review and adjust as needed\n`);
  sections.push('## Identity');
  sections.push(`- Project: ${analysis.name}`);
  if (analysis.description) sections.push(`- Description: ${analysis.description}`);
  sections.push(`- Stack: ${analysis.stack.join(', ') || 'unknown'}`);
  if (analysis.workspaceType) sections.push(`- Workspace: ${analysis.workspaceType}`);
  sections.push('');

  sections.push('## Gates (run in order, stop on failure)');

  const allGates = new Set();

  // Lint
  if (analysis.linters.length > 0) {
    sections.push('### Lint');
    for (const cmd of analysis.linters) {
      if (!allGates.has(cmd)) {
        sections.push(`- ${cmd}`);
        allGates.add(cmd);
      }
    }
    sections.push('');
  }

  // Test
  if (analysis.testers.length > 0) {
    sections.push('### Test');
    for (const cmd of analysis.testers) {
      if (!allGates.has(cmd)) {
        sections.push(`- ${cmd}`);
        allGates.add(cmd);
      }
    }
    sections.push('');
  }

  // Build
  if (analysis.builders.length > 0) {
    sections.push('### Build');
    for (const cmd of analysis.builders) {
      if (!allGates.has(cmd)) {
        sections.push(`- ${cmd}`);
        allGates.add(cmd);
      }
    }
    sections.push('');
  }

  // CI — only include gates not already captured by language inference
  const uniqueCiGates = analysis.ciGates.filter(g => !allGates.has(g));
  if (uniqueCiGates.length > 0) {
    sections.push('### CI (inferred from workflow)');
    for (const gate of uniqueCiGates) {
      sections.push(`- ${gate}`);
      allGates.add(gate);
    }
    sections.push('');
  }

  // Documentation-derived gates (advisory — need user confirmation)
  const newDocGates = (analysis.docGates || [])
    .filter(g => !allGates.has(g.command));
  if (newDocGates.length > 0) {
    sections.push('### Contributor docs (ADVISORY — confirm before enforcing)');
    for (const { command, source } of newDocGates) {
      sections.push(`- ${command}  # from ${source}`);
      allGates.add(command);
    }
    sections.push('');
  }

  // Workspace members — per-member gates
  if (analysis.workspace && analysis.workspace.members.length > 0) {
    for (const member of analysis.workspace.members) {
      if (member.linters.length === 0 && member.testers.length === 0 && member.builders.length === 0) continue;
      const pathAnnotation = member.relativePath ? ` (path: ${member.relativePath.replace(/\\/g, '/')})` : '';
      sections.push(`### ${member.name}${pathAnnotation}`);
      for (const cmd of [...member.linters, ...member.testers, ...member.builders]) {
        sections.push(`- ${cmd}`);
      }
      sections.push('');
    }
  }

  // Advisories
  if (analysis.advisories && analysis.advisories.length > 0) {
    sections.push('## Advisories (informational, not enforced)');
    for (const a of analysis.advisories) {
      sections.push(`- ${a}  # [ADVISORY]`);
    }
    sections.push('');
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
    sections.push(`- Target: ${[...new Set(analysis.deployment)].join(', ')}`);
    if (analysis.ci) sections.push(`- CI: ${analysis.ci}`);
    sections.push('');
  }

  return sections.join('\n') + '\n';
}

function mergeWithExisting(existing, generated) {
  const existingSections = new Set();
  for (const match of existing.matchAll(/^## (.+)$/gm)) {
    existingSections.add(match[1].trim().toLowerCase());
  }

  const newBlocks = [];
  const genLines = generated.split('\n');
  let currentBlock = null;
  let blockIsNew = false;

  for (const line of genLines) {
    const sectionMatch = line.match(/^## (.+)$/);
    if (sectionMatch) {
      if (currentBlock && blockIsNew) {
        newBlocks.push(currentBlock.trimEnd());
      }
      const section = sectionMatch[1].trim().toLowerCase();
      blockIsNew = !existingSections.has(section);
      currentBlock = blockIsNew ? line + '\n' : null;
    } else if (blockIsNew && currentBlock !== null) {
      currentBlock += line + '\n';
    }
  }
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

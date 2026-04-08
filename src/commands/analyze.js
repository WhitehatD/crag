'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { detectWorkspace } = require('../workspace/detect');
const { enumerateMembers } = require('../workspace/enumerate');
const { isGateCommand } = require('../governance/yaml-run');
const { cliWarn, cliError, EXIT_INTERNAL } = require('../cli-errors');
const { validateFlags } = require('../cli-args');
const { detectStack } = require('../analyze/stacks');
const { inferGates } = require('../analyze/gates');
const { normalizeCiGates } = require('../analyze/normalize');
const { extractCiCommands } = require('../analyze/ci-extractors');
const { mineTaskTargets } = require('../analyze/task-runners');
const {
  mineKeyDirectories, mineArchitecture, mineTestingProfile, mineCodeStyle,
  mineImportConventions, mineDependencyPolicy, mineAntiPatterns, mineFrameworkConventions,
} = require('../analyze/project-mining');
const { mineDocGates } = require('../analyze/doc-mining');
const { normalizeCmd } = require('./diff');
const { drainMalformedJsonFiles } = require('../analyze/stacks');

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
  validateFlags('analyze', args, {
    boolean: ['--dry-run', '--workspace', '--merge', '--no-install-skills'],
  });
  const dryRun = args.includes('--dry-run');
  const workspaceFlag = args.includes('--workspace');
  const merge = args.includes('--merge');
  const noInstallSkills = args.includes('--no-install-skills');
  const cwd = process.cwd();

  // Guard: refuse to analyze inside a known-AI-infra subdirectory.
  // When a user cds into `.claude/`, `.buildkite/`, `.github/`, etc. and
  // runs `crag analyze`, the previous behavior was to treat the subdir as
  // its own project (Stack: unknown, Project: <subdir-basename>). That's
  // almost always wrong — the user meant to analyze the enclosing repo.
  const INFRA_SUBDIRS = new Set([
    '.claude', '.buildkite', '.github', '.gitlab',
    '.cursor', '.vscode', '.idea', '.husky',
  ]);
  const base = path.basename(cwd);
  if (INFRA_SUBDIRS.has(base)) {
    const parent = path.dirname(cwd);
    cliWarn(`you are inside '${base}/' — this looks like a tooling subdirectory, not a project root.`);
    cliWarn(`  if you meant to analyze the parent repo, run: (cd "${parent}" && crag analyze)`);
    cliWarn(`  continuing anyway; pass --dry-run to preview without writing.`);
  }

  console.log(`\n  Analyzing ${path.basename(cwd)}...\n`);

  const analysis = analyzeProject(cwd, { progress: true });

  // Surface any manifest files that failed JSON.parse. These are silent
  // failures in safeJson(); users should know if their root package.json
  // is broken because downstream gate inference will miss it.
  const malformed = drainMalformedJsonFiles();
  for (const [file, reason] of malformed) {
    cliWarn(`malformed JSON in ${path.relative(cwd, file)} — crag could not read it`);
    cliWarn(`  reason: ${reason}`);
    cliWarn(`  gate inference for this manifest was skipped.`);
  }

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

  // Surface an empty-gates warning so users know the file they're about to
  // write will fail downstream. Detected when analyze found zero lint/test/
  // build/CI gates and there's no placeholder in the generated content.
  const totalGates =
    analysis.linters.length + analysis.testers.length + analysis.builders.length + analysis.ciGates.length;
  if (totalGates === 0) {
    cliWarn(`no gates detected — crag could not infer any quality checks from this project.`);
    cliWarn(`  the generated governance.md will include a placeholder under '### Test'.`);
    cliWarn(`  edit it manually or run 'crag init' for an interactive walkthrough.`);
  }

  const govPath = path.join(cwd, '.claude', 'governance.md');
  const govDir = path.dirname(govPath);
  try {
    if (!fs.existsSync(govDir)) fs.mkdirSync(govDir, { recursive: true });

    if (fs.existsSync(govPath) && !merge) {
      rotateBackups(govPath);
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

  // Auto-install the universal skills so `crag check` / `crag doctor` can
  // succeed after analyze. Previously users had to run `crag init` (which
  // requires Claude CLI and launches an interactive interview) just to get
  // the skills installed. The skills are static, universal, and zero-risk
  // to copy — there's no reason to gate them behind the interview.
  if (!noInstallSkills) {
    try {
      const { installSkills } = require('./init');
      installSkills(cwd);
    } catch (err) {
      cliWarn(`could not install universal skills: ${err.message}`);
      cliWarn(`  governance.md was written; run 'crag init' to install skills interactively.`);
    }
  }

  console.log(`  \x1b[32m✓\x1b[0m Generated ${path.relative(cwd, govPath)}`);
  console.log(`\n  Review the file — sections marked "# Inferred" should be verified.`);
  console.log(`  Run 'crag check' to verify infrastructure.\n`);
}

/**
 * Cap backup files at a small number so re-running `crag analyze` doesn't
 * pile up hundreds of `governance.md.bak.<epochMs>` files. Keeps the 3 most
 * recent backups; deletes the rest.
 */
function rotateBackups(govPath) {
  try {
    const dir = path.dirname(govPath);
    const base = path.basename(govPath);
    const newBackup = govPath + '.bak.' + Date.now();
    fs.copyFileSync(govPath, newBackup);
    console.log(`  Backed up existing governance to ${path.basename(newBackup)}`);

    // Find all backups and keep the 3 newest (including the one just created).
    const backups = fs.readdirSync(dir)
      .filter(f => f.startsWith(base + '.bak.'))
      .map(f => ({ name: f, path: path.join(dir, f), mtime: safeMtime(path.join(dir, f)) }))
      .sort((a, b) => b.mtime - a.mtime); // newest first

    const KEEP = 3;
    for (let i = KEEP; i < backups.length; i++) {
      try { fs.unlinkSync(backups[i].path); } catch { /* best effort */ }
    }
  } catch (err) {
    cliWarn(`could not create backup (continuing anyway): ${err.message}`);
  }
}

function safeMtime(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch { return 0; }
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

/**
 * Sanitize a directory basename for use as a project name.
 *
 * Drops leading non-alphanumerics (`- Leyoda` → `Leyoda`), trims surrounding
 * whitespace, and collapses internal whitespace runs. Leaves interior dashes
 * and underscores intact (`my-cool-project` stays as-is). If the result is
 * empty (pathological input like `---` or `   `), falls back to the literal
 * basename so `crag analyze` never produces an empty `- Project:` line.
 */
function sanitizeProjectName(basename) {
  if (typeof basename !== 'string') return String(basename || 'unnamed');
  const trimmed = basename.trim().replace(/^[^A-Za-z0-9]+/, '').replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : basename;
}

function analyzeProject(dir, opts = {}) {
  const log = opts.progress ? (msg) => console.log(msg) : () => {};

  const result = {
    name: sanitizeProjectName(path.basename(dir)),
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

  // Per-file discovery output: show WHAT crag read and WHAT it understood
  const G_ = '\x1b[32m';
  const C_ = '\x1b[36m';
  const D_ = '\x1b[2m';
  const Y_ = '\x1b[33m';
  const B_ = '\x1b[1m';
  const X_ = '\x1b[0m';
  const manifests = result._manifests || {};

  // Report each discovered file → what it told us
  if (manifests.packageJson) {
    const frameworks = result.stack.filter(s => ['react', 'next.js', 'vue', 'svelte', 'angular', 'express', 'fastify', 'hono', 'solid'].includes(s));
    const fwStr = frameworks.length > 0 ? ` ${D_}\u2192${X_} ${C_}${frameworks.join(`${X_} ${D_}\u00b7${X_} ${C_}`)}${X_}` : '';
    log(`  ${D_}\u2192${X_} package.json       ${C_}node${X_}${result.stack.includes('typescript') ? ` ${D_}\u00b7${X_} ${C_}typescript${X_}` : ''}${fwStr}`);
  }
  if (fs.existsSync(path.join(dir, 'go.mod'))) {
    log(`  ${D_}\u2192${X_} go.mod             ${C_}go${X_}`);
  }
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    log(`  ${D_}\u2192${X_} Cargo.toml         ${C_}rust${X_}${manifests.cargoWorkspace ? ` ${D_}(workspace)${X_}` : ''}`);
  }
  if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'setup.py'))) {
    const runner = manifests.pythonRunner ? ` ${D_}\u00b7${X_} ${C_}${manifests.pythonRunner}${X_}` : '';
    log(`  ${D_}\u2192${X_} ${fs.existsSync(path.join(dir, 'pyproject.toml')) ? 'pyproject.toml' : 'setup.py'}     ${C_}python${X_}${runner}`);
  }
  if (fs.existsSync(path.join(dir, 'build.gradle')) || fs.existsSync(path.join(dir, 'build.gradle.kts'))) {
    log(`  ${D_}\u2192${X_} build.gradle       ${C_}java/gradle${X_}`);
  }
  if (fs.existsSync(path.join(dir, 'pom.xml'))) {
    log(`  ${D_}\u2192${X_} pom.xml            ${C_}java/maven${X_}`);
  }
  if (fs.existsSync(path.join(dir, 'Package.swift'))) {
    log(`  ${D_}\u2192${X_} Package.swift      ${C_}swift${X_}`);
  }
  if (fs.existsSync(path.join(dir, 'mix.exs'))) {
    log(`  ${D_}\u2192${X_} mix.exs            ${C_}elixir${X_}`);
  }
  if (result.stack.includes('dotnet')) {
    log(`  ${D_}\u2192${X_} *.csproj           ${C_}dotnet${X_}`);
  }
  if (result.stack.includes('docker')) {
    log(`  ${D_}\u2192${X_} Dockerfile         ${C_}docker${X_}`);
  }

  // CI system detection + raw command extraction (all supported CI systems)
  const ci = extractCiCommands(dir);
  result.ci = ci.system;
  result.ciGates = normalizeCiGates(ci.commands.filter(c => isGateCommand(c)));
  if (ci.system) {
    log(`  ${D_}\u2192${X_} ${ci.system === 'github-actions' ? '.github/workflows/' : ci.system}  ${D_}${ci.commands.length} commands parsed${X_}`);
  }

  // Task runner target mining
  result.taskTargets = mineTaskTargets(dir);

  // Gate inference per language/runtime (consumes _manifests)
  inferGates(dir, result);

  // Emit explicit gates for mined task targets
  emitTaskRunnerGates(result);

  const gateCount = result.linters.length + result.testers.length + result.builders.length + result.ciGates.length;
  if (gateCount > 0) {
    log(`  ${G_}\u2713${X_} ${B_}${Y_}${gateCount}${X_} quality gates extracted`);
  }

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
    log(`  \x1b[32m\u2713\x1b[0m Services   \x1b[1m\x1b[33m${result.subservices.length}\x1b[0m \x1b[2mdetected\x1b[0m`);
  }

  // Mine project metadata BEFORE dropping _manifests (miners need the data)
  result.keyDirs = mineKeyDirectories(dir);
  result.architecture = mineArchitecture(dir, result);
  result.testingProfile = mineTestingProfile(dir, result);
  result.codeStyle = mineCodeStyle(dir);
  result.importConventions = mineImportConventions(dir, result);
  result.dependencyPolicy = mineDependencyPolicy(dir, result);
  result.antiPatterns = mineAntiPatterns(result);
  result.frameworkConventions = mineFrameworkConventions(dir, result);

  // Progress: mining results
  if (result.testingProfile && result.testingProfile.framework) {
    log(`  \x1b[32m\u2713\x1b[0m Testing    \x1b[2m${result.testingProfile.framework}${result.testingProfile.layout ? ' \u00b7 ' + result.testingProfile.layout : ''}\x1b[0m`);
  }
  if (result.codeStyle && (result.codeStyle.formatter || result.codeStyle.linter)) {
    const parts = [];
    if (result.codeStyle.indent) parts.push(result.codeStyle.indent);
    if (result.codeStyle.formatter) parts.push(result.codeStyle.formatter);
    if (result.codeStyle.linter) parts.push(result.codeStyle.linter);
    if (parts.length > 0) log(`  \x1b[32m\u2713\x1b[0m Style      \x1b[2m${parts.join(' \u00b7 ')}\x1b[0m`);
  }
  if (result.antiPatterns && result.antiPatterns.length > 0) {
    log(`  \x1b[32m\u2713\x1b[0m Rules      \x1b[2m${result.antiPatterns.length} anti-patterns\x1b[0m`);
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

  // `allGates` holds the raw command strings already emitted so we don't
  // write the same command twice in one section. `canonicalSet` holds
  // normalized forms (via normalizeCmd: lowercased, quote-stripped, npm-run
  // aliased) so we also catch `npm test` vs `npm run test` duplicates
  // across sections — previously both slipped through and chalk's
  // governance.md had both under ### Test and ### CI.
  const allGates = new Set();
  const canonicalSet = new Set();
  const addGate = (cmd) => {
    const canon = normalizeCmd(cmd);
    if (canonicalSet.has(canon) || allGates.has(cmd)) return false;
    canonicalSet.add(canon);
    allGates.add(cmd);
    return true;
  };

  // Detect the no-gates case early so we can emit a placeholder instead of
  // a totally empty Gates section (which trips downstream parsers and fails
  // `crag doctor`, `crag compile`, etc.). `true` is a shell no-op that
  // succeeds — it keeps governance.md parseable and downstream tools happy
  // without pretending a real gate exists.
  const totalGates =
    analysis.linters.length + analysis.testers.length + analysis.builders.length + (analysis.ciGates || []).length;
  if (totalGates === 0) {
    sections.push('### Test');
    sections.push('- true  # TODO: crag could not detect a gate — replace with your real test command (e.g. `pytest`, `go test ./...`, `cargo test`, `make test`)');
    sections.push('');
    addGate('true');
  }

  // Lint
  const lintLines = [];
  for (const cmd of analysis.linters) {
    if (addGate(cmd)) lintLines.push(`- ${cmd}`);
  }
  if (lintLines.length > 0) {
    sections.push('### Lint', ...lintLines, '');
  }

  // Test
  const testLines = [];
  for (const cmd of analysis.testers) {
    if (addGate(cmd)) testLines.push(`- ${cmd}`);
  }
  if (testLines.length > 0) {
    sections.push('### Test', ...testLines, '');
  }

  // Build
  const buildLines = [];
  for (const cmd of analysis.builders) {
    if (addGate(cmd)) buildLines.push(`- ${cmd}`);
  }
  if (buildLines.length > 0) {
    sections.push('### Build', ...buildLines, '');
  }

  // CI — only include gates not already captured by language inference.
  // Dedup via normalizeCmd so `npm test` from CI doesn't collide with
  // `npm run test` that inferNodeGates already added.
  const ciLines = [];
  for (const gate of analysis.ciGates) {
    if (addGate(gate)) ciLines.push(`- ${gate}`);
  }
  if (ciLines.length > 0) {
    sections.push('### CI (inferred from workflow)', ...ciLines, '');
  }

  // Documentation-derived gates (advisory — need user confirmation)
  const docLines = [];
  for (const { command, source } of (analysis.docGates || [])) {
    if (addGate(command)) docLines.push(`- ${command}  # from ${source}`);
  }
  if (docLines.length > 0) {
    sections.push('### Contributor docs (ADVISORY — confirm before enforcing)', ...docLines, '');
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

  // Architecture
  if (analysis.architecture && analysis.architecture.type) {
    sections.push('## Architecture');
    const a = analysis.architecture;
    let typeLine = `- Type: ${a.type}`;
    if (a.workspaceLayout) typeLine += ` (${a.workspaceLayout})`;
    sections.push(typeLine);
    if (a.entryPoints.length > 0) sections.push(`- Entry: ${a.entryPoints.join(', ')}`);
    if (a.services.length > 0) sections.push(`- Services: ${a.services.join(', ')}`);
    sections.push('');
  }

  // Key Directories
  if (analysis.keyDirs && analysis.keyDirs.length > 0) {
    sections.push('## Key Directories');
    for (const d of analysis.keyDirs) {
      sections.push(`- \`${d.dir}\` — ${d.role}`);
    }
    sections.push('');
  }

  // Testing
  if (analysis.testingProfile && analysis.testingProfile.framework) {
    sections.push('## Testing');
    const t = analysis.testingProfile;
    sections.push(`- Framework: ${t.framework}`);
    sections.push(`- Layout: ${t.layout}`);
    if (t.namingPattern) sections.push(`- Naming: ${t.namingPattern}`);
    if (t.hasSnapshots) sections.push('- Snapshot testing: yes');
    if (t.hasCoverage) sections.push('- Coverage: configured');
    sections.push('');
  }

  // Code Style
  const cs = analysis.codeStyle;
  if (cs && (cs.indent || cs.formatter || cs.linter)) {
    sections.push('## Code Style');
    if (cs.indent) sections.push(`- Indent: ${cs.indent}`);
    if (cs.lineLength) sections.push(`- Line length: ${cs.lineLength}`);
    if (cs.formatter) sections.push(`- Formatter: ${cs.formatter}`);
    if (cs.linter) sections.push(`- Linter: ${cs.linter}`);
    sections.push('');
  }

  // Dependencies
  const dp = analysis.dependencyPolicy;
  if (dp && dp.packageManager) {
    sections.push('## Dependencies');
    sections.push(`- Package manager: ${dp.packageManager}${dp.lockfile ? ` (${dp.lockfile})` : ''}`);
    for (const [eng, ver] of Object.entries(dp.engines || {})) {
      sections.push(`- ${eng.charAt(0).toUpperCase() + eng.slice(1)}: ${ver}`);
    }
    sections.push('');
  }

  // Import Conventions
  const ic = analysis.importConventions;
  if (ic && ic.moduleSystem) {
    sections.push('## Import Conventions');
    sections.push(`- Module system: ${ic.moduleSystem}`);
    if (ic.tsModule) sections.push(`- TypeScript module: ${ic.tsModule}`);
    if (ic.pathAliases.length > 0) sections.push(`- Path aliases: ${ic.pathAliases.join(', ')}`);
    sections.push('');
  }

  // Anti-Patterns
  if (analysis.antiPatterns && analysis.antiPatterns.length > 0) {
    sections.push('## Anti-Patterns');
    sections.push('');
    sections.push('Do not:');
    for (const p of analysis.antiPatterns) {
      sections.push(`- ${p}`);
    }
    sections.push('');
  }

  // Framework Conventions
  const fc = analysis.frameworkConventions;
  if (fc && fc.framework) {
    sections.push('## Framework Conventions');
    sections.push(`- ${fc.framework}${fc.version ? ` ${fc.version}` : ''}${fc.routing ? ` (${fc.routing})` : ''}`);
    for (const c of fc.conventions) {
      sections.push(`- ${c}`);
    }
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

module.exports = { analyze, analyzeProject, sanitizeProjectName, isGateCommand, mergeWithExisting };

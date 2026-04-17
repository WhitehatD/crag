'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseGovernance, flattenGates, flattenGatesRich } = require('../governance/parse');
const { extractRunCommands, isGateCommand, stripYamlQuotes } = require('../governance/yaml-run');
const { extractCiCommands } = require('../analyze/ci-extractors');
const { normalizeCiGates } = require('../analyze/normalize');
const { detectBranchStrategy, classifyGitBranchStrategy, detectCommitConvention, classifyGitCommitConvention } = require('../governance/drift-utils');
const { cliError, EXIT_USER, EXIT_INTERNAL, readFileOrExit, requireGovernance } = require('../cli-errors');
const { validateFlags } = require('../cli-args');

/**
 * crag diff — compare governance.md against codebase reality.
 *
 * Flags:
 *   --ci    Exit non-zero when drift, missing, or extra gates are found.
 *           Designed for CI pipelines — add as a step triggered on CI file changes.
 *   --json  Print results as JSON. Exits non-zero on issues (like --ci).
 */
function diff(args) {
  validateFlags('diff', args, {
    boolean: ['--ci', '--json'],
  });
  const ciMode = args.includes('--ci');
  const jsonMode = args.includes('--json');
  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');

  requireGovernance(cwd);

  const content = readFileOrExit(fs, govPath, 'governance.md');
  const parsed = parseGovernance(content);
  if (parsed.warnings && parsed.warnings.length > 0 && !jsonMode) {
    for (const w of parsed.warnings) console.warn(`  \x1b[33m!\x1b[0m ${w}`);
  }
  const flat = flattenGates(parsed.gates);

  if (!jsonMode) console.log(`\n  Governance vs Reality — ${parsed.name || 'project'}\n`);

  const results = { match: 0, drift: 0, missing: 0, extra: 0 };

  // Check each gate command, respecting path-scoped sections.
  // In monorepos, `### Frontend (path: frontend/)` gates should be checked
  // against the subdirectory, not the project root.
  const rich = flattenGatesRich(parsed.gates);
  for (const gate of rich) {
    const checkDir = gate.path ? path.join(cwd, gate.path) : cwd;
    const check = checkGateReality(checkDir, gate.cmd);
    if (!jsonMode) {
      const icon = check.status === 'match' ? '\x1b[32mMATCH\x1b[0m'
        : check.status === 'drift' ? '\x1b[33mDRIFT\x1b[0m'
        : '\x1b[31mMISSING\x1b[0m';
      const prefix = gate.path ? `[${gate.path}] ` : '';
      console.log(`  ${icon}   ${prefix}${gate.cmd}`);
      if (check.detail) console.log(`          ${check.detail}`);
    }
    results[check.status]++;
  }

  // Check for CI gates not in governance. Deduplicates across workflows so
  // the same command appearing in 5 different .yml files is reported once.
  const ciGates = extractCIGateCommands(cwd);
  const govCommands = Object.values(flat).flat();
  const reportedExtras = new Set();
  for (const ciGate of ciGates) {
    const normalized = normalizeCmd(ciGate);
    if (reportedExtras.has(normalized)) continue; // already reported
    if (!govCommands.some(g => normalizeCmd(g) === normalized)) {
      if (!jsonMode) {
        console.log(`  \x1b[36mEXTRA\x1b[0m   ${ciGate}`);
        console.log(`          In CI workflow but not in governance`);
      }
      results.extra++;
      reportedExtras.add(normalized);
    }
  }

  // Check branch strategy
  checkBranchStrategy(cwd, content, results);

  // Check commit convention
  checkCommitConvention(cwd, content, results);

  // Summary
  const issues = results.drift + results.missing + results.extra;
  const total = results.match + issues;

  if (jsonMode) {
    console.log(JSON.stringify(results));
    if (issues > 0) process.exit(EXIT_USER);
    return;
  }

  console.log(`\n  ${results.match} match, ${results.drift} drift, ${results.missing} missing, ${results.extra} extra (${total} total)\n`);

  if (ciMode && issues > 0) {
    process.exit(EXIT_USER);
  }
}

// Binary→package mapping for tools where the CLI name differs from the npm
// package name (e.g. `npx biome` installs from `@biomejs/biome`).
const BINARY_PKG_ALIASES = {
  biome: '@biomejs/biome',
  tsc: 'typescript',
  tsup: 'tsup',
  svelte: 'svelte',
  astro: '@astrojs/cli',
};

function checkGateReality(cwd, cmd) {
  // Commands containing shell/CI variables (${...}, $VAR) are CI infrastructure,
  // not verifiable as local quality gates. Skip them.
  if (/\$\{?\w+\}?/.test(cmd)) return { status: 'match', detail: null };

  // Check if the tool referenced in the command actually exists
  const toolChecks = [
    { pattern: /^npx\s+(\w[\w-]*)/, check: (tool) => {
      // In monorepos, tools like tsc live in workspace packages, not root.
      // Check both root deps and workspace package.json files.
      if (hasNpmDep(cwd, tool) || hasNpmBin(cwd, tool)) return true;
      // Check scoped-package aliases (binary name ≠ npm package name)
      const alias = BINARY_PKG_ALIASES[tool];
      if (alias && hasNpmDep(cwd, alias)) return true;
      return false;
    }},
    { pattern: /^npm\s+run\s+(\w[\w-]*)/, check: (script) => hasNpmScript(cwd, script) },
    { pattern: /^node\s+--check\s+(.+)/, check: (file) => fs.existsSync(path.join(cwd, file.trim())) },
    // node <file> — skip flags (--flag) before capturing the file argument
    { pattern: /^node\s+(?:--\S+\s+)*(\S+\.(?:js|mjs|cjs|ts|mts))/, check: (file) => fs.existsSync(path.join(cwd, file.replace(/^['"]|['"]$/g, ''))) },
    { pattern: /^cargo\s+/, check: () => fs.existsSync(path.join(cwd, 'Cargo.toml')) },
    { pattern: /^go\s+/, check: () => fs.existsSync(path.join(cwd, 'go.mod')) },
    { pattern: /^(\.\/)?gradlew\s+/, check: () => fs.existsSync(path.join(cwd, 'gradlew')) || fs.existsSync(path.join(cwd, 'gradlew.bat')) },
    { pattern: /^pytest/, check: () => fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py')) },
    { pattern: /^ruff\s+/, check: () => fs.existsSync(path.join(cwd, 'ruff.toml')) || fs.existsSync(path.join(cwd, '.ruff.toml')) || fs.existsSync(path.join(cwd, 'pyproject.toml')) },
    // Python runner commands (uv run, poetry run, etc.) — valid if pyproject.toml exists
    { pattern: /^(?:uv|poetry|pdm|hatch|rye|pipenv)\s+run\s+/, check: () => fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py')) },
    // Make / task / just — valid if any build system config exists.
    // Autotools projects have Makefile.in or configure but no Makefile until ./configure runs.
    { pattern: /^make\s+/, check: () => fs.existsSync(path.join(cwd, 'Makefile')) || fs.existsSync(path.join(cwd, 'GNUmakefile')) || fs.existsSync(path.join(cwd, 'makefile')) || fs.existsSync(path.join(cwd, 'Makefile.in')) || fs.existsSync(path.join(cwd, 'configure')) || fs.existsSync(path.join(cwd, 'configure.ac')) || fs.existsSync(path.join(cwd, 'CMakeLists.txt')) },
    { pattern: /^task\s+/, check: () => fs.existsSync(path.join(cwd, 'Taskfile.yml')) || fs.existsSync(path.join(cwd, 'Taskfile.yaml')) },
    { pattern: /^just\s+/, check: () => fs.existsSync(path.join(cwd, 'justfile')) || fs.existsSync(path.join(cwd, 'Justfile')) },
    // Elixir
    { pattern: /^mix\s+/, check: () => fs.existsSync(path.join(cwd, 'mix.exs')) },
    // Ruby
    { pattern: /^bundle\s+exec\s+/, check: () => fs.existsSync(path.join(cwd, 'Gemfile')) },
    // PHP
    { pattern: /^composer\s+/, check: () => fs.existsSync(path.join(cwd, 'composer.json')) },
    { pattern: /^vendor\/bin\//, check: () => fs.existsSync(path.join(cwd, 'composer.json')) },
    // .NET
    { pattern: /^dotnet\s+/, check: () => {
      if (fs.existsSync(path.join(cwd, 'Directory.Build.props'))) return true;
      try { return fs.readdirSync(cwd).some(f => f.endsWith('.csproj') || f.endsWith('.fsproj') || f.endsWith('.sln') || f.endsWith('.slnx')); } catch { return false; }
    }},
    // Swift
    { pattern: /^swift\s+/, check: () => fs.existsSync(path.join(cwd, 'Package.swift')) },
    // CMake
    { pattern: /^cmake\s+/, check: () => fs.existsSync(path.join(cwd, 'CMakeLists.txt')) },
    { pattern: /^ctest\s+/, check: () => fs.existsSync(path.join(cwd, 'CMakeLists.txt')) },
    // Zig
    { pattern: /^zig\s+/, check: () => fs.existsSync(path.join(cwd, 'build.zig')) },
    // Docker
    { pattern: /^docker\s+compose/, check: () => true }, // docker compose commands are CI orchestration, assume valid
    { pattern: /^docker\s+/, check: () => fs.existsSync(path.join(cwd, 'Dockerfile')) || fs.existsSync(path.join(cwd, 'docker-compose.yml')) || fs.existsSync(path.join(cwd, 'docker-compose.yaml')) },
  ];

  // Verify commands
  const verifyMatch = cmd.match(/^Verify\s+(\S+)\s+contains\s+/i);
  if (verifyMatch) {
    const file = verifyMatch[1];
    if (!fs.existsSync(path.join(cwd, file))) {
      return { status: 'missing', detail: `File ${file} does not exist` };
    }
    return { status: 'match', detail: null };
  }

  for (const { pattern, check } of toolChecks) {
    const m = cmd.match(pattern);
    if (m) {
      if (check(m[1])) return { status: 'match', detail: null };

      // Monorepo fallback: if the tool isn't at root, scan immediate
      // subdirectories (backend/, frontend/, services/*, packages/*, etc.).
      // This handles projects where governance gates reference tools that
      // live in workspace members without path-scoped sections.
      if (checkSubdirs(cwd, cmd)) return { status: 'match', detail: null };

      return { status: 'drift', detail: `Tool or dependency not found for: ${cmd}` };
    }
  }

  // Unknown command — assume match (can't verify)
  return { status: 'match', detail: null };
}

/**
 * Monorepo fallback: check if any workspace member directory has the tool.
 * Scans 2 levels deep to handle packages/foo/package.json, apps/bar/go.mod, etc.
 * Returns true on the first match.
 */
function checkSubdirs(rootCwd, cmd) {
  const dirs = getWorkspaceDirs(rootCwd);
  for (const subCwd of dirs) {
    // npx <tool> — check subdir's deps or .bin
    const npxM = cmd.match(/^npx\s+(\w[\w-]*)/);
    if (npxM) {
      const tool = npxM[1];
      if (hasNpmDep(subCwd, tool) || hasNpmBin(subCwd, tool)) return true;
      const alias = BINARY_PKG_ALIASES[tool];
      if (alias && hasNpmDep(subCwd, alias)) return true;
    }
    // npm run <script>
    const npmRunM = cmd.match(/^npm\s+run\s+(\w[\w-]*)/);
    if (npmRunM && hasNpmScript(subCwd, npmRunM[1])) return true;
    // gradlew
    if (/^(\.\/)?gradlew\s+/.test(cmd) && (fs.existsSync(path.join(subCwd, 'gradlew')) || fs.existsSync(path.join(subCwd, 'gradlew.bat')))) return true;
    // cargo
    if (/^cargo\s+/.test(cmd) && fs.existsSync(path.join(subCwd, 'Cargo.toml'))) return true;
    // go
    if (/^go\s+/.test(cmd) && fs.existsSync(path.join(subCwd, 'go.mod'))) return true;
    // pytest / uv run pytest / poetry run pytest
    if (/(?:^|\s)pytest/.test(cmd) && (fs.existsSync(path.join(subCwd, 'pyproject.toml')) || fs.existsSync(path.join(subCwd, 'setup.py')))) return true;
    // ruff / uv run ruff
    if (/(?:^|\s)ruff\s+/.test(cmd) && (fs.existsSync(path.join(subCwd, 'ruff.toml')) || fs.existsSync(path.join(subCwd, '.ruff.toml')) || fs.existsSync(path.join(subCwd, 'pyproject.toml')))) return true;
    // dotnet
    if (/^dotnet\s+/.test(cmd) && (fs.existsSync(path.join(subCwd, 'Directory.Build.props')) || hasFileWithExt(subCwd, '.csproj') || hasFileWithExt(subCwd, '.fsproj') || hasFileWithExt(subCwd, '.sln'))) return true;
    // mix (Elixir)
    if (/^mix\s+/.test(cmd) && fs.existsSync(path.join(subCwd, 'mix.exs'))) return true;
    // bundle exec (Ruby)
    if (/^bundle\s+exec\s+/.test(cmd) && fs.existsSync(path.join(subCwd, 'Gemfile'))) return true;
    // composer / vendor/bin (PHP)
    if (/^(composer|vendor\/bin)/.test(cmd) && fs.existsSync(path.join(subCwd, 'composer.json'))) return true;
    // uv run / poetry run / pdm run (Python runners)
    if (/^(uv|poetry|pdm|hatch|rye|pipenv)\s+run\s+/.test(cmd) && fs.existsSync(path.join(subCwd, 'pyproject.toml'))) return true;
  }
  return false;
}

/**
 * Check if a directory has any file with the given extension.
 * Used for .csproj, .fsproj, .sln detection.
 */
function hasFileWithExt(dir, ext) {
  try {
    return fs.readdirSync(dir).some(f => f.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Get workspace member directories (2 levels deep).
 * Level 1: immediate children (backend/, frontend/, src/, lib/, etc.)
 * Level 2: children of common workspace parent dirs (packages/foo/, apps/bar/, etc.)
 * Returns absolute paths. Cached per root dir.
 */
const _subdirCache = new Map();
function getWorkspaceDirs(rootCwd) {
  if (_subdirCache.has(rootCwd)) return _subdirCache.get(rootCwd);
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', '__pycache__', 'vendor', 'coverage']);
  const dirs = [];

  const listDirs = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !skip.has(e.name) && !e.name.startsWith('.'))
        .map(e => path.join(dir, e.name));
    } catch {
      return [];
    }
  };

  // Level 1: immediate children
  const level1 = listDirs(rootCwd);
  dirs.push(...level1);

  // Level 2: children of workspace-like parent directories.
  // Only recurse into dirs that look like workspace containers (no manifest
  // of their own, or are common container names).
  const containerNames = new Set([
    'packages', 'apps', 'libs', 'modules', 'plugins', 'services',
    'tools', 'internal', 'crates', 'sdk', 'examples', 'components',
  ]);
  for (const d of level1) {
    const name = path.basename(d);
    if (containerNames.has(name) || !fs.existsSync(path.join(d, 'package.json'))) {
      const level2 = listDirs(d);
      dirs.push(...level2);
    }
  }

  _subdirCache.set(rootCwd, dirs);
  return dirs;
}

/** Legacy alias for backward compat with tests. */
function getSubdirs(dir) {
  return getWorkspaceDirs(dir).map(d => path.relative(dir, d));
}

function checkBranchStrategy(cwd, content, results) {
  const govStrategy = detectBranchStrategy(content);
  if (!govStrategy) return;

  try {
    const branches = execSync('git branch -a --format="%(refname:short)"', { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const actual = classifyGitBranchStrategy(branches);

    if (actual !== govStrategy) {
      console.log(`  \x1b[33mDRIFT\x1b[0m   Branch strategy: governance says ${govStrategy}, git shows ${actual}`);
      results.drift++;
    } else {
      results.match++;
    }
  } catch { /* skip */ }
}

function checkCommitConvention(cwd, content, results) {
  const govConvention = detectCommitConvention(content);
  if (!govConvention) return;

  try {
    const log = execSync('git log --oneline -20', { cwd, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    const actual = classifyGitCommitConvention(log);

    if (actual !== govConvention) {
      console.log(`  \x1b[33mDRIFT\x1b[0m   Commit convention: governance says ${govConvention}, git shows ${actual}`);
      results.drift++;
    } else {
      results.match++;
    }
  } catch { /* skip */ }
}

function extractCIGateCommands(cwd) {
  // Reuse the analyze-side extractor so diff sees the SAME gates that
  // analyze would propose. This covers all 12 CI systems (GitHub, Forgejo,
  // GitLab, CircleCI, Travis, Azure, Buildkite, Drone, Woodpecker,
  // Bitbucket, Jenkins, Cirrus) in one pass — previously diff only looked
  // at .github/workflows/ which made it invisible on Jenkins/GitLab projects.
  //
  // Use managedCommands (crag-owned files only) so companion workflows like
  // extensions-ci.yml don't produce false-positive CI extras in audit.
  try {
    const ci = extractCiCommands(cwd);
    const source = ci.managedCommands ?? ci.commands;
    // Filter to gate-like commands and normalize noise (dedup, de-matrix,
    // drop install/echo/etc.) so the user sees a signal, not a wall of noise.
    return normalizeCiGates(source.filter(c => isGateCommand(c)));
  } catch {
    return [];
  }
}

/**
 * Return commands from unmanaged GitHub Actions workflow files (those without
 * `# crag:auto-start`). Used by audit to display an informational section
 * that does NOT count toward the issue total.
 * Returns [{ file: string (relative path), commands: string[] }]
 */
function extractUnmanagedCIFiles(cwd) {
  try {
    const ci = extractCiCommands(cwd);
    return (ci.unmanagedSources ?? []).map(s => ({
      file: path.relative(cwd, s.file),
      commands: normalizeCiGates(s.commands.filter(c => isGateCommand(c))),
    })).filter(s => s.commands.length > 0);
  } catch {
    return [];
  }
}

/**
 * Normalize commands to a canonical form for equality comparison.
 * Handles common aliases:
 *   - `npm test` ⇔ `npm run test`
 *   - `npm start` ⇔ `npm run start`
 *   - `./gradlew x` ⇔ `gradlew x`
 *   - `./mvnw x` ⇔ `mvnw x`
 *   - quoted vs unquoted commands: `"npm test"` ⇔ `npm test`
 */
function normalizeCmd(cmd) {
  // Strip YAML-style surrounding quotes first so `"npm test"` compares equal
  // to `npm test`. Apply repeatedly in case of nested wrappers (rare but
  // possible when a workflow has `run: "'npm test'"`).
  let raw = String(cmd);
  let prev;
  do {
    prev = raw;
    raw = stripYamlQuotes(raw.trim());
  } while (raw !== prev);

  let c = raw.replace(/\s+/g, ' ').trim().toLowerCase();

  // Strip trailing shell comments so `make test  # from CONTRIBUTING.md` compares
  // equal to `make test`. Doc-mined gates carry a `# from <path>` annotation that
  // must not affect command identity comparisons.
  c = c.replace(/\s+#.*$/, '');

  // npm lifecycle aliases: `npm <script>` → `npm run <script>` (except reserved verbs)
  const npmMatch = c.match(/^npm\s+(\S+)(\s+.*)?$/);
  if (npmMatch && (npmMatch[1] === 'test' || npmMatch[1] === 'start' || npmMatch[1] === 'stop' || npmMatch[1] === 'restart')) {
    // npm test == npm run test
    c = `npm run ${npmMatch[1]}${npmMatch[2] || ''}`;
  }

  // gradlew aliases: ./gradlew == gradlew
  c = c.replace(/^\.\/gradlew/, 'gradlew');
  c = c.replace(/^\.\/mvnw/, 'mvnw');
  c = c.replace(/^\.\/(\S+)/, '$1'); // any other ./x

  // make parallelism flags: `make -j3 V=1` == `make V=1`
  // -jN only controls parallelism, not what's built/tested.
  c = c.replace(/\s+-j\d+\b/g, '');

  // make variable assignments: `make V=1 test-ci TFLAGS='-j14'` == `make test-ci`
  // These are CI infrastructure (verbosity, parallelism, flag passing) — strip them
  // only for make commands so `npm run test:ci` is unaffected.
  // NOTE: `c` is already lowercased here, so match lowercase key pattern [a-z][a-z0-9_]*.
  if (c.startsWith('make ')) {
    c = c.replace(/\s+[a-z][a-z0-9_]*=(?:'[^']*'|"[^"]*"|\S*)/g, '');
  }

  // pnpm run == npm run for comparison purposes
  c = c.replace(/^pnpm\s+run\s+/, 'npm run ');
  c = c.replace(/^yarn\s+run\s+/, 'npm run ');

  return c;
}

// Memoize package.json reads per cwd — diff runs many checks per call.
const _pkgCache = new Map();
function getPkg(cwd) {
  if (_pkgCache.has(cwd)) return _pkgCache.get(cwd);
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
  } catch { /* missing or malformed */ }
  _pkgCache.set(cwd, pkg);
  return pkg;
}

// Memoize bin directory entries per cwd.
const _binCache = new Map();
function getBins(cwd) {
  if (_binCache.has(cwd)) return _binCache.get(cwd);
  const binDir = path.join(cwd, 'node_modules', '.bin');
  let set;
  try {
    set = new Set(fs.readdirSync(binDir));
  } catch {
    set = new Set();
  }
  _binCache.set(cwd, set);
  return set;
}

function hasNpmDep(cwd, dep) {
  const pkg = getPkg(cwd);
  if (!pkg) return false;
  return !!(pkg.dependencies?.[dep] || pkg.devDependencies?.[dep] || pkg.peerDependencies?.[dep] || pkg.optionalDependencies?.[dep]);
}

function hasNpmBin(cwd, bin) {
  const bins = getBins(cwd);
  return bins.has(bin) || bins.has(bin + '.cmd') || bins.has(bin + '.exe');
}

function hasNpmScript(cwd, script) {
  const pkg = getPkg(cwd);
  return !!(pkg && pkg.scripts?.[script]);
}

function clearCaches() {
  _pkgCache.clear();
  _binCache.clear();
  _subdirCache.clear();
}

module.exports = { diff, normalizeCmd, checkGateReality, extractCIGateCommands, extractUnmanagedCIFiles, clearCaches };


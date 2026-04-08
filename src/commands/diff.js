'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { parseGovernance, flattenGates } = require('../governance/parse');
const { extractRunCommands, isGateCommand, stripYamlQuotes } = require('../governance/yaml-run');
const { extractCiCommands } = require('../analyze/ci-extractors');
const { normalizeCiGates } = require('../analyze/normalize');
const { detectBranchStrategy, classifyGitBranchStrategy, detectCommitConvention, classifyGitCommitConvention } = require('../governance/drift-utils');
const { cliError, EXIT_USER, EXIT_INTERNAL, readFileOrExit, requireGovernance } = require('../cli-errors');
const { validateFlags } = require('../cli-args');

/**
 * crag diff — compare governance.md against codebase reality.
 */
function diff(args) {
  validateFlags('diff', args, {});
  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');

  requireGovernance(cwd);

  const content = readFileOrExit(fs, govPath, 'governance.md');
  const parsed = parseGovernance(content);
  if (parsed.warnings && parsed.warnings.length > 0) {
    for (const w of parsed.warnings) console.warn(`  \x1b[33m!\x1b[0m ${w}`);
  }
  const flat = flattenGates(parsed.gates);

  console.log(`\n  Governance vs Reality — ${parsed.name || 'project'}\n`);

  const results = { match: 0, drift: 0, missing: 0, extra: 0 };

  // Check each gate command
  for (const [section, cmds] of Object.entries(flat)) {
    for (const cmd of cmds) {
      const check = checkGateReality(cwd, cmd);
      const icon = check.status === 'match' ? '\x1b[32mMATCH\x1b[0m'
        : check.status === 'drift' ? '\x1b[33mDRIFT\x1b[0m'
        : '\x1b[31mMISSING\x1b[0m';
      console.log(`  ${icon}   ${cmd}`);
      if (check.detail) console.log(`          ${check.detail}`);
      results[check.status]++;
    }
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
      console.log(`  \x1b[36mEXTRA\x1b[0m   ${ciGate}`);
      console.log(`          In CI workflow but not in governance`);
      results.extra++;
      reportedExtras.add(normalized);
    }
  }

  // Check branch strategy
  checkBranchStrategy(cwd, content, results);

  // Check commit convention
  checkCommitConvention(cwd, content, results);

  // Summary
  const total = results.match + results.drift + results.missing + results.extra;
  console.log(`\n  ${results.match} match, ${results.drift} drift, ${results.missing} missing, ${results.extra} extra (${total} total)\n`);
}

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
      // Also check if typescript is a dep (covers npx tsc --noEmit in workspaces
      // where tsc is available via workspace hoisting)
      if (tool === 'tsc' && (hasNpmDep(cwd, 'typescript') || hasNpmBin(cwd, 'tsc'))) return true;
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
      return { status: 'drift', detail: `Tool or dependency not found for: ${cmd}` };
    }
  }

  // Unknown command — assume match (can't verify)
  return { status: 'match', detail: null };
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
  // analyze would propose. This covers all 10+ CI systems (GitHub, GitLab,
  // CircleCI, Travis, Azure, Buildkite, Drone, Woodpecker, Bitbucket,
  // Jenkins, Cirrus) in one pass — previously diff only looked at
  // .github/workflows/ which made it invisible on Jenkins/GitLab projects.
  try {
    const ci = extractCiCommands(cwd);
    // Filter to gate-like commands and normalize noise (dedup, de-matrix,
    // drop install/echo/etc.) so the user sees a signal, not a wall of noise.
    return normalizeCiGates(ci.commands.filter(c => isGateCommand(c)));
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
}

module.exports = { diff, normalizeCmd, checkGateReality, extractCIGateCommands, clearCaches };


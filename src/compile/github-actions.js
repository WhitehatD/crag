'use strict';

const fs = require('fs');
const path = require('path');
const { gateToShell } = require('../governance/gate-to-shell');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { yamlScalar } = require('../update/integrity');

/**
 * Extract the major Node version from package.json engines.node field.
 * Handles formats: ">=18.0.0", "^18", "18.x", "18.0.0", ">=18 <21".
 * Returns a string like "18" or null if not found.
 */
function detectNodeVersion(cwd) {
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const engines = pkg.engines?.node;
    if (!engines || typeof engines !== 'string') return null;
    const m = engines.match(/(\d+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

/**
 * Detect Python version from pyproject.toml requires-python field.
 */
function detectPythonVersion(cwd) {
  try {
    const pyprojectPath = path.join(cwd, 'pyproject.toml');
    if (!fs.existsSync(pyprojectPath)) return null;
    const content = fs.readFileSync(pyprojectPath, 'utf-8');
    const m = content.match(/requires-python\s*=\s*["'][^0-9]*(\d+\.\d+)/);
    return m ? m[1] : null;
  } catch { return null; }
}

/**
 * Detect Java version from build.gradle.kts or pom.xml.
 */
function detectJavaVersion(cwd) {
  try {
    const gradle = path.join(cwd, 'build.gradle.kts');
    if (fs.existsSync(gradle)) {
      const content = fs.readFileSync(gradle, 'utf-8');
      const m = content.match(/JavaVersion\.VERSION_(\d+)|languageVersion\s*=\s*JavaLanguageVersion\.of\((\d+)\)|jvmToolchain\((\d+)\)/);
      if (m) return m[1] || m[2] || m[3];
    }
    const pom = path.join(cwd, 'pom.xml');
    if (fs.existsSync(pom)) {
      const content = fs.readFileSync(pom, 'utf-8');
      const m = content.match(/<maven\.compiler\.source>(\d+)|<java\.version>(\d+)/);
      if (m) return m[1] || m[2];
    }
  } catch { /* skip */ }
  return null;
}

/**
 * Detect Go version from go.mod.
 */
function detectGoVersion(cwd) {
  try {
    const goMod = path.join(cwd, 'go.mod');
    if (!fs.existsSync(goMod)) return null;
    const content = fs.readFileSync(goMod, 'utf-8');
    const m = content.match(/^go\s+(\d+\.\d+)/m);
    return m ? m[1] : null;
  } catch { return null; }
}

function generateGitHubActions(cwd, parsed) {
  const dir = path.join(cwd, '.github', 'workflows');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Detect versions from project files, fall back to current LTS defaults
  const nodeVersion = detectNodeVersion(cwd) || '22';
  const pythonVersion = detectPythonVersion(cwd) || '3.12';
  const javaVersion = detectJavaVersion(cwd) || '21';
  const goVersion = detectGoVersion(cwd) || '1.22';

  let setupSteps = '';
  if (parsed.runtimes.includes('node')) {
    setupSteps += '      - name: Setup Node.js\n';
    setupSteps += '        uses: actions/setup-node@v4\n';
    setupSteps += `        with:\n          node-version: '${nodeVersion}'\n`;
    setupSteps += '      - run: npm ci\n';
  }
  if (parsed.runtimes.includes('rust')) {
    setupSteps += '      - name: Setup Rust\n';
    setupSteps += '        uses: dtolnay/rust-toolchain@stable\n';
  }
  if (parsed.runtimes.includes('python')) {
    setupSteps += '      - name: Setup Python\n';
    setupSteps += '        uses: actions/setup-python@v5\n';
    setupSteps += `        with:\n          python-version: '${pythonVersion}'\n`;
    // Explicit `shell: bash` so redirects work on Windows runners (which default to cmd.exe).
    setupSteps += '      - name: Install Python deps (best-effort)\n';
    setupSteps += '        shell: bash\n';
    setupSteps += '        run: pip install -r requirements.txt 2>/dev/null || true\n';
  }
  if (parsed.runtimes.includes('java')) {
    setupSteps += '      - name: Setup Java\n';
    setupSteps += '        uses: actions/setup-java@v4\n';
    setupSteps += `        with:\n          distribution: temurin\n          java-version: '${javaVersion}'\n`;
  }
  if (parsed.runtimes.includes('go')) {
    setupSteps += '      - name: Setup Go\n';
    setupSteps += '        uses: actions/setup-go@v5\n';
    setupSteps += `        with:\n          go-version: '${goVersion}'\n`;
  }

  // GHA expression escape for strings inside hashFiles('...'):
  // single quotes are doubled. The value is already validated to be a
  // relative in-repo path by the parser, but we escape defensively.
  const ghaExprEscape = (s) => String(s).replace(/'/g, "''");

  let gateSteps = '';
  for (const gate of flattenGatesRich(parsed.gates)) {
    const shell = gateToShell(gate.cmd);
    const label = gate.cmd.length > 60 ? gate.cmd.substring(0, 57) + '...' : gate.cmd;
    const prefix = gate.classification !== 'MANDATORY' ? `[${gate.classification}] ` : '';
    const condExpr = gate.condition ? ` (if: ${gate.condition})` : '';
    // Route gate.path through yamlScalar — it will quote if the path contains
    // YAML-sensitive characters (colon, #, quotes, etc.).
    const workDir = gate.path ? `\n        working-directory: ${yamlScalar(gate.path)}` : '';
    const contOnErr = (gate.classification === 'OPTIONAL' || gate.classification === 'ADVISORY')
      ? '\n        continue-on-error: true' : '';
    const ifGuard = gate.condition
      ? `\n        if: hashFiles('${ghaExprEscape(gate.condition)}') != ''` : '';
    // Use yamlScalar for the name field so user input can never break the YAML
    // structure even if it contains quotes, newlines, colons, or control chars.
    const stepName = `${prefix}${gate.section}: ${label}${condExpr}`;
    gateSteps += `      - name: ${yamlScalar(stepName)}${ifGuard}${workDir}${contOnErr}\n`;
    gateSteps += `        run: |\n          ${shell.replace(/\n/g, '\n          ')}\n`;
  }

  const yaml = [
    '# Generated from governance.md by crag',
    '# Regenerate: crag compile --target github',
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
  atomicWrite(outPath, yaml);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = {
  generateGitHubActions,
  detectNodeVersion,
  detectPythonVersion,
  detectJavaVersion,
  detectGoVersion,
};

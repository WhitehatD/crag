'use strict';

const fs = require('fs');
const path = require('path');
const { gateToShell } = require('../governance/gate-to-shell');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { yamlScalar } = require('../update/integrity');
const {
  detectNodeVersion,
  detectPythonVersion,
  detectJavaVersion,
  detectGoVersion,
} = require('./github-actions');

/**
 * Generate a Forgejo Actions workflow from governance.md.
 *
 * Forgejo Actions is GitHub Actions-compatible but uses its own action
 * mirrors at https://code.forgejo.org/actions/. Workflows live in
 * .forgejo/workflows/ (or .gitea/workflows/ for legacy Gitea installs).
 */
function generateForgejo(cwd, parsed) {
  const dir = path.join(cwd, '.forgejo', 'workflows');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const nodeVersion = detectNodeVersion(cwd) || '22';
  const pythonVersion = detectPythonVersion(cwd) || '3.12';
  const javaVersion = detectJavaVersion(cwd) || '21';
  const goVersion = detectGoVersion(cwd) || '1.22';

  let setupSteps = '';
  if (parsed.runtimes.includes('node')) {
    setupSteps += '      - name: Setup Node.js\n';
    setupSteps += '        uses: https://code.forgejo.org/actions/setup-node@v4\n';
    setupSteps += `        with:\n          node-version: '${nodeVersion}'\n`;
    setupSteps += '      - run: npm ci\n';
  }
  if (parsed.runtimes.includes('rust')) {
    setupSteps += '      - name: Setup Rust\n';
    setupSteps += '        uses: https://code.forgejo.org/actions/setup-rust@stable\n';
  }
  if (parsed.runtimes.includes('python')) {
    setupSteps += '      - name: Setup Python\n';
    setupSteps += '        uses: https://code.forgejo.org/actions/setup-python@v5\n';
    setupSteps += `        with:\n          python-version: '${pythonVersion}'\n`;
    setupSteps += '      - name: Install Python deps (best-effort)\n';
    setupSteps += '        shell: bash\n';
    setupSteps += '        run: pip install -r requirements.txt 2>/dev/null || true\n';
  }
  if (parsed.runtimes.includes('java')) {
    setupSteps += '      - name: Setup Java\n';
    setupSteps += '        uses: https://code.forgejo.org/actions/setup-java@v4\n';
    setupSteps += `        with:\n          distribution: temurin\n          java-version: '${javaVersion}'\n`;
  }
  if (parsed.runtimes.includes('go')) {
    setupSteps += '      - name: Setup Go\n';
    setupSteps += '        uses: https://code.forgejo.org/actions/setup-go@v5\n';
    setupSteps += `        with:\n          go-version: '${goVersion}'\n`;
  }

  const ghaExprEscape = (s) => String(s).replace(/'/g, "''");

  let gateSteps = '';
  for (const gate of flattenGatesRich(parsed.gates)) {
    const shell = gateToShell(gate.cmd);
    const label = gate.cmd.length > 60 ? gate.cmd.substring(0, 57) + '...' : gate.cmd;
    const prefix = gate.classification !== 'MANDATORY' ? `[${gate.classification}] ` : '';
    const condExpr = gate.condition ? ` (if: ${gate.condition})` : '';
    const workDir = gate.path ? `\n        working-directory: ${yamlScalar(gate.path)}` : '';
    const contOnErr = (gate.classification === 'OPTIONAL' || gate.classification === 'ADVISORY')
      ? '\n        continue-on-error: true' : '';
    const ifGuard = gate.condition
      ? `\n        if: hashFiles('${ghaExprEscape(gate.condition)}') != ''` : '';
    const stepName = `${prefix}${gate.section}: ${label}${condExpr}`;
    gateSteps += `      - name: ${yamlScalar(stepName)}${ifGuard}${workDir}${contOnErr}\n`;
    gateSteps += `        run: |\n          ${shell.replace(/\n/g, '\n          ')}\n`;
  }

  const yaml = [
    '# Generated from governance.md by crag — https://crag.sh',
    '# Regenerate: crag compile --target forgejo',
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
    '      - uses: https://code.forgejo.org/actions/checkout@v4',
    setupSteps + gateSteps,
  ].join('\n');

  const outPath = path.join(dir, 'gates.yml');
  const { preserveCustomSections } = require('./preserve');
  const final = preserveCustomSections(outPath, yaml, 'comment');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);

  // Guard workflow
  const { generateGuardYaml } = require('./github-actions');
  const guardYaml = generateGuardYaml(
    'crag compile --target forgejo',
    'https://code.forgejo.org/actions/checkout@v4',
    'https://code.forgejo.org/actions/setup-node@v4',
    nodeVersion,
  );
  const guardPath = path.join(dir, 'governance-guard.yml');
  const guardFinal = preserveCustomSections(guardPath, guardYaml, 'comment');
  atomicWrite(guardPath, guardFinal);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, guardPath)}`);
}

module.exports = { generateForgejo };

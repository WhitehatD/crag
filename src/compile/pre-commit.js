'use strict';

const fs = require('fs');
const path = require('path');
const { gateToShell } = require('../governance/gate-to-shell');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

function generatePreCommitConfig(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  let hooks = '';
  gates.forEach((gate, i) => {
    const id = `gate-${i + 1}`;
    const prefix = gate.classification !== 'MANDATORY' ? `[${gate.classification}] ` : '';
    const name = `${prefix}${gate.section}: ${gate.cmd}`;
    const truncated = name.length > 60 ? name.substring(0, 57) + '...' : name;

    let shell = gateToShell(gate.cmd);
    if (gate.path) shell = `cd "${gate.path}" && ${shell}`;
    if (gate.condition) shell = `[ -e "${gate.condition}" ] && (${shell}) || true`;
    // For OPTIONAL/ADVISORY: never fail the hook
    if (gate.classification === 'OPTIONAL' || gate.classification === 'ADVISORY') {
      shell = `(${shell}) || echo "[${gate.classification}] failed — continuing"`;
    }

    hooks += `      - id: ${id}\n`;
    hooks += `        name: "${truncated.replace(/"/g, '\\"')}"\n`;
    hooks += `        entry: bash -c '${shell.replace(/'/g, "'\\''")}'\n`;
    hooks += '        language: system\n';
    hooks += '        pass_filenames: false\n';
    hooks += '        always_run: true\n';
  });

  const yaml = [
    '# Generated from governance.md by crag',
    '# Regenerate: crag compile --target pre-commit',
    'repos:',
    '  - repo: local',
    '    hooks:',
    hooks.trimEnd(),
    '',
  ].join('\n');

  const outPath = path.join(cwd, '.pre-commit-config.yaml');
  atomicWrite(outPath, yaml);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generatePreCommitConfig };

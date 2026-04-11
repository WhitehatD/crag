'use strict';

const fs = require('fs');
const path = require('path');
const { gateToShell, shellEscapeDoubleQuoted, shellEscapeSingleQuoted } = require('../governance/gate-to-shell');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { yamlScalar } = require('../update/integrity');

function generatePreCommitConfig(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  let hooks = '';
  gates.forEach((gate, i) => {
    const id = `gate-${i + 1}`;
    const prefix = gate.classification !== 'MANDATORY' ? `[${gate.classification}] ` : '';
    const name = `${prefix}${gate.section}: ${gate.cmd}`;
    const truncated = name.length > 60 ? name.substring(0, 57) + '...' : name;

    let shell = gateToShell(gate.cmd);
    // gate.path and gate.condition come from user-authored governance.md.
    // Parser rejects absolute paths and `..`, but contents still need to be
    // escaped for the surrounding double-quoted shell context.
    if (gate.path) {
      shell = `cd "${shellEscapeDoubleQuoted(gate.path)}" && ${shell}`;
    }
    if (gate.condition) {
      shell = `if [ -e "${shellEscapeDoubleQuoted(gate.condition)}" ]; then ${shell}; fi`;
    }
    // For OPTIONAL/ADVISORY: never fail the hook
    if (gate.classification === 'OPTIONAL' || gate.classification === 'ADVISORY') {
      shell = `(${shell}) || echo "[${gate.classification}] failed — continuing"`;
    }

    hooks += `      - id: ${id}\n`;
    hooks += `        name: ${yamlScalar(truncated)}\n`;
    hooks += `        entry: bash -c '${shellEscapeSingleQuoted(shell)}'\n`;
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
  const { preserveCustomSections } = require('./preserve');
  const final = preserveCustomSections(outPath, yaml, 'comment');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generatePreCommitConfig };

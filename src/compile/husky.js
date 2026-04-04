'use strict';

const fs = require('fs');
const path = require('path');
const { gateToShell, shellEscapeDoubleQuoted } = require('../governance/gate-to-shell');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

function generateHusky(cwd, parsed) {
  const dir = path.join(cwd, '.husky');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Group gates by section for readable output
  const sections = new Map();
  for (const gate of flattenGatesRich(parsed.gates)) {
    if (!sections.has(gate.section)) sections.set(gate.section, []);
    sections.get(gate.section).push(gate);
  }

  let body = '';
  for (const [section, gates] of sections) {
    body += `# ${section}\n`;
    for (const gate of gates) {
      const shell = gateToShell(gate.cmd);
      // Escape path/condition for the double-quoted shell context.
      // The escaper handles \ before " so the replacements don't overlap.
      const quotedPath = gate.path ? shellEscapeDoubleQuoted(gate.path) : null;
      const quotedCond = gate.condition ? shellEscapeDoubleQuoted(gate.condition) : null;

      // Build the core command (with cd if path-scoped)
      const coreCmd = quotedPath ? `(cd "${quotedPath}" && ${shell})` : shell;

      // Build failure handler based on classification
      let onFail;
      if (gate.classification === 'OPTIONAL' || gate.classification === 'ADVISORY') {
        const escLabel = shellEscapeDoubleQuoted(shell);
        onFail = `echo "  [${gate.classification}] Gate failed: ${escLabel}"`;
      } else {
        onFail = 'exit 1';
      }

      // Wrap in conditional if section has `if:` annotation — skip cleanly if file missing
      if (quotedCond) {
        body += `if [ -e "${quotedCond}" ]; then ${coreCmd} || ${onFail}; fi\n`;
      } else {
        body += `${coreCmd} || ${onFail}\n`;
      }
    }
    body += '\n';
  }

  const script = [
    '#!/bin/sh',
    '# Generated from governance.md by crag',
    '# Regenerate: crag compile --target husky',
    'set -e',
    '',
    body.trim(),
    '',
  ].join('\n');

  const outPath = path.join(dir, 'pre-commit');
  atomicWrite(outPath, script);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateHusky };

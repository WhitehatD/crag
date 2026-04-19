'use strict';

const path = require('path');
const { gateToShell } = require('../governance/gate-to-shell');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to Lefthook pre-commit config.
 * Output: lefthook.yml
 *
 * Lefthook is a YAML-based Git hooks manager. Each gate becomes a named
 * command under `pre-commit.commands`. Gates are named gate-0, gate-1, etc.
 * (zero-indexed across all sections).
 *
 * Reference:
 *   https://github.com/evilmartians/lefthook
 */
function generateLefthook(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  let commandsBlock = '';
  if (gates.length === 0) {
    commandsBlock = '  # No gates defined — add them to governance.md\n';
  } else {
    for (let i = 0; i < gates.length; i++) {
      const gate = gates[i];
      const shell = gateToShell(gate.cmd);
      const name = `gate-${i}`;
      commandsBlock += `    ${name}:\n`;
      commandsBlock += `      run: ${shell}\n`;
      if (gate.path) {
        commandsBlock += `      glob: "${gate.path}/**"\n`;
      }
      if (gate.classification === 'OPTIONAL' || gate.classification === 'ADVISORY') {
        commandsBlock += `      fail_text: "[${gate.classification}] gate failed"\n`;
        commandsBlock += `      skip: true\n`;
      }
    }
  }

  const content = `# Generated from governance.md by crag — https://crag.sh
# Regenerate: crag compile --target lefthook
pre-commit:
  commands:
${commandsBlock}`;

  const outPath = path.join(cwd, 'lefthook.yml');
  const final = preserveCustomSections(outPath, content, 'comment');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateLefthook };

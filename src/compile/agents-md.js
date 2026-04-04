'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGates } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

function generateAgentsMd(cwd, parsed) {
  const flat = flattenGates(parsed.gates);

  let gatesSection = '';
  for (const [section, cmds] of Object.entries(flat)) {
    gatesSection += `### ${section.charAt(0).toUpperCase() + section.slice(1)}\n`;
    cmds.forEach((cmd, i) => {
      gatesSection += `${i + 1}. \`${cmd}\`\n`;
    });
    gatesSection += '\n';
  }

  // Extract security section from governance content if available
  const securitySection = parsed.security || 'No hardcoded secrets or API keys in source.';

  const content = [
    '# AGENTS.md',
    '',
    `> Generated from governance.md by crag. Regenerate: \`crag compile --target agents-md\``,
    '',
    `## Project: ${parsed.name || 'Unnamed'}`,
    '',
    parsed.description ? `${parsed.description}\n` : '',
    '## Quality Gates',
    '',
    'All changes must pass these checks before commit:',
    '',
    gatesSection.trim(),
    '',
    '## Coding Standards',
    '',
    `- Runtimes: ${parsed.runtimes.join(', ') || 'auto-detected'}`,
    '- Follow conventional commits (feat:, fix:, docs:, etc.)',
    '- No hardcoded secrets — grep for sk_live, AKIA, password= before commit',
    '',
    '## Architecture',
    '',
    'Run `/pre-start-context` at the start of every session to discover the project stack, load governance rules, and prepare for work.',
    '',
    '## Validation',
    '',
    'Run `/post-start-validation` after completing any task to validate changes, run gates, capture knowledge, and commit.',
    '',
  ].join('\n');

  const outPath = path.join(cwd, 'AGENTS.md');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateAgentsMd };

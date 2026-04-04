'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGates } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

function generateGeminiMd(cwd, parsed) {
  const flat = flattenGates(parsed.gates);

  let gatesList = '';
  let i = 1;
  for (const [section, cmds] of Object.entries(flat)) {
    for (const cmd of cmds) {
      gatesList += `${i}. [${section}] \`${cmd}\`\n`;
      i++;
    }
  }

  const content = [
    '# GEMINI.md',
    '',
    `> Generated from governance.md by crag. Regenerate: \`crag compile --target gemini\``,
    '',
    '## Project Context',
    '',
    `- **Name:** ${parsed.name || 'Unnamed'}`,
    parsed.description ? `- **Description:** ${parsed.description}` : '',
    `- **Runtimes:** ${parsed.runtimes.join(', ') || 'auto-detected'}`,
    '',
    '## Rules',
    '',
    '### Quality Gates',
    '',
    'Run these checks in order before committing any changes:',
    '',
    gatesList.trim(),
    '',
    '### Security',
    '',
    '- Never hardcode secrets, API keys, or credentials in source code',
    '- Grep for sk_live, AKIA, password= before every commit',
    '- Validate all user input at system boundaries',
    '',
    '### Workflow',
    '',
    '- Use conventional commits (feat:, fix:, docs:, chore:, etc.)',
    '- Run quality gates before committing',
    '- Review security implications of all changes',
    '',
  ].join('\n');

  const outPath = path.join(cwd, 'GEMINI.md');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateGeminiMd };

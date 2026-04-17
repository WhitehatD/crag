'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGates } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

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

  const securityBlock = parsed.security
    ? parsed.security
    : '- Never hardcode secrets, API keys, or credentials in source code\n- Grep for sk_live, AKIA, password= before every commit';

  const commitLine = parsed.commitConvention === 'conventional'
    ? `- Conventional commits (feat:, fix:, docs:, chore:, etc.)${parsed.commitTrailer ? `\n- Commit trailer: ${parsed.commitTrailer}` : ''}`
    : '- Follow project commit conventions';

  const content = [
    '# GEMINI.md',
    '',
    `> Generated from governance.md by [crag](https://crag.sh). Regenerate: \`crag compile --target gemini\``,
    '',
    '## Project Context',
    '',
    `- **Name:** ${parsed.name || 'Unnamed'}`,
    parsed.description ? `- **Description:** ${parsed.description}` : null,
    parsed.stack.length > 0 ? `- **Stack:** ${parsed.stack.join(', ')}` : null,
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
    securityBlock,
    '',
    '### Workflow',
    '',
    commitLine,
    '- Run quality gates before committing',
    '- Review security implications of all changes',
    '',
  ].filter(l => l != null).join('\n');

  const outPath = path.join(cwd, 'GEMINI.md');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateGeminiMd };

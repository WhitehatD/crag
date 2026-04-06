'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGates } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

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

  const stackLine = parsed.stack.length > 0
    ? `- Stack: ${parsed.stack.join(', ')}`
    : `- Runtimes: ${parsed.runtimes.join(', ') || 'auto-detected'}`;

  const commitLine = parsed.commitConvention === 'conventional'
    ? `- Conventional commits (feat:, fix:, docs:, etc.)${parsed.commitTrailer ? `\n- Commit trailer: ${parsed.commitTrailer}` : ''}`
    : '- Follow project commit conventions';

  const securityBlock = parsed.security
    ? `## Security\n\n${parsed.security}`
    : '## Security\n\n- No hardcoded secrets — grep for sk_live, AKIA, password= before commit';

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
    stackLine,
    commitLine,
    '',
    securityBlock,
    '',
    '## Workflow',
    '',
    '1. Read `governance.md` at the start of every session — it is the single source of truth.',
    '2. Run all mandatory quality gates before committing.',
    '3. If a gate fails, fix the issue and re-run only the failed gate.',
    '4. Use the project commit conventions for all changes.',
    '',
  ].join('\n');

  const outPath = path.join(cwd, 'AGENTS.md');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateAgentsMd };

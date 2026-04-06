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
    '## Workflow',
    '',
    '1. Read `governance.md` at the start of every session — it is the single source of truth.',
    '2. Run all mandatory quality gates before committing.',
    '3. If a gate fails, fix the issue and re-run only the failed gate.',
    '4. Use conventional commits for all changes.',
    '',
  ].join('\n');

  const outPath = path.join(cwd, 'AGENTS.md');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateAgentsMd };

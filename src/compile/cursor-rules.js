'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGates } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

function generateCursorRules(cwd, parsed) {
  const dir = path.join(cwd, '.cursor', 'rules');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const flat = flattenGates(parsed.gates);

  let gatesList = '';
  for (const [section, cmds] of Object.entries(flat)) {
    gatesList += `\n### ${section.charAt(0).toUpperCase() + section.slice(1)}\n`;
    for (const cmd of cmds) {
      gatesList += `- \`${cmd}\`\n`;
    }
  }

  // Determine globs from runtimes
  const globs = [];
  if (parsed.runtimes.includes('node')) globs.push('"**/*.ts"', '"**/*.tsx"', '"**/*.js"', '"**/*.jsx"');
  if (parsed.runtimes.includes('rust')) globs.push('"**/*.rs"');
  if (parsed.runtimes.includes('python')) globs.push('"**/*.py"');
  if (parsed.runtimes.includes('java')) globs.push('"**/*.java"', '"**/*.kt"');
  if (parsed.runtimes.includes('go')) globs.push('"**/*.go"');
  if (globs.length === 0) globs.push('"**/*"');

  const content = [
    '---',
    `description: Governance rules for ${parsed.name || 'this project'} — quality gates, security, conventions`,
    'globs:',
    ...globs.map(g => `  - ${g}`),
    'alwaysApply: true',
    '---',
    '',
    `# Governance — ${parsed.name || 'Project'}`,
    '',
    `> Generated from governance.md by scaffold-cli. Regenerate: \`scaffold compile --target cursor\``,
    '',
    '## Quality Gates',
    '',
    'Run these checks in order before committing:',
    gatesList.trim(),
    '',
    '## Security',
    '',
    '- No hardcoded secrets — grep for sk_live, AKIA, password= before commit',
    '- Validate all user input at system boundaries',
    '- Use parameterized queries for database access',
    '',
    '## Conventions',
    '',
    '- Follow conventional commits (feat:, fix:, docs:, etc.)',
    `- Runtimes: ${parsed.runtimes.join(', ') || 'auto-detected'}`,
    '',
  ].join('\n');

  const outPath = path.join(dir, 'governance.mdc');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateCursorRules };

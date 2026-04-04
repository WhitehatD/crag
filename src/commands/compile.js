'use strict';

const fs = require('fs');
const path = require('path');
const { parseGovernance, flattenGates } = require('../governance/parse');
const { generateGitHubActions } = require('../compile/github-actions');
const { generateHusky } = require('../compile/husky');
const { generatePreCommitConfig } = require('../compile/pre-commit');
const { generateAgentsMd } = require('../compile/agents-md');
const { generateCursorRules } = require('../compile/cursor-rules');
const { generateGeminiMd } = require('../compile/gemini-md');

function compile(args) {
  const targetIdx = args.indexOf('--target');
  const target = targetIdx !== -1 ? args[targetIdx + 1] : args[1];
  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');

  if (!fs.existsSync(govPath)) {
    console.error('  Error: No .claude/governance.md found. Run scaffold init first.');
    process.exit(1);
  }

  const content = fs.readFileSync(govPath, 'utf-8');
  const parsed = parseGovernance(content);
  const flat = flattenGates(parsed.gates);
  const gateCount = Object.values(flat).flat().length;

  if (!target || target === 'list') {
    console.log(`\n  Governance compiler — ${parsed.name || 'unnamed project'}`);
    console.log(`  Found ${gateCount} gate(s) in ${Object.keys(parsed.gates).length} section(s)\n`);
    console.log('  Targets:');
    console.log('    scaffold compile --target github      .github/workflows/gates.yml');
    console.log('    scaffold compile --target husky       .husky/pre-commit');
    console.log('    scaffold compile --target pre-commit  .pre-commit-config.yaml');
    console.log('    scaffold compile --target agents-md   AGENTS.md');
    console.log('    scaffold compile --target cursor      .cursor/rules/governance.mdc');
    console.log('    scaffold compile --target gemini      GEMINI.md');
    console.log('    scaffold compile --target all         All of the above\n');
    return;
  }

  const allTargets = ['github', 'husky', 'pre-commit', 'agents-md', 'cursor', 'gemini'];
  const targets = target === 'all' ? allTargets : [target];

  console.log(`\n  Compiling governance.md → ${targets.join(', ')}`);
  console.log(`  ${gateCount} gates, ${parsed.runtimes.length} runtimes detected\n`);

  for (const t of targets) {
    switch (t) {
      case 'github': generateGitHubActions(cwd, parsed); break;
      case 'husky': generateHusky(cwd, parsed); break;
      case 'pre-commit': generatePreCommitConfig(cwd, parsed); break;
      case 'agents-md': generateAgentsMd(cwd, parsed); break;
      case 'cursor': generateCursorRules(cwd, parsed); break;
      case 'gemini': generateGeminiMd(cwd, parsed); break;
      default:
        console.error(`  Unknown target: ${t}`);
        console.error(`  Valid targets: ${allTargets.join(', ')}, all`);
        process.exit(1);
    }
  }

  console.log('\n  Done. Governance is now executable infrastructure.\n');
}

module.exports = { compile };

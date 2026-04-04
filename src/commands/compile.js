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
const { generateCopilot } = require('../compile/copilot');
const { generateCline } = require('../compile/cline');
const { generateContinue } = require('../compile/continue');
const { generateWindsurf } = require('../compile/windsurf');
const { generateZed } = require('../compile/zed');
const { generateCody } = require('../compile/cody');

// All supported compile targets in dispatch order.
// Grouped: CI (3) + AI agent native (3) + AI agent extras (6)
const ALL_TARGETS = [
  'github',
  'husky',
  'pre-commit',
  'agents-md',
  'cursor',
  'gemini',
  'copilot',
  'cline',
  'continue',
  'windsurf',
  'zed',
  'cody',
];

function compile(args) {
  const targetIdx = args.indexOf('--target');
  const target = targetIdx !== -1 ? args[targetIdx + 1] : args[1];
  const cwd = process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');

  if (!fs.existsSync(govPath)) {
    console.error('  Error: No .claude/governance.md found. Run crag init first.');
    process.exit(1);
  }

  const content = fs.readFileSync(govPath, 'utf-8');
  const parsed = parseGovernance(content);
  const flat = flattenGates(parsed.gates);
  const gateCount = Object.values(flat).flat().length;

  if (!target || target === 'list') {
    console.log(`\n  crag compile — ${parsed.name || 'unnamed project'}`);
    console.log(`  ${gateCount} gate(s) in ${Object.keys(parsed.gates).length} section(s), ${parsed.runtimes.length} runtime(s) detected\n`);
    console.log('  CI / git hooks:');
    console.log('    crag compile --target github       .github/workflows/gates.yml');
    console.log('    crag compile --target husky        .husky/pre-commit');
    console.log('    crag compile --target pre-commit   .pre-commit-config.yaml\n');
    console.log('  AI coding agents — native formats:');
    console.log('    crag compile --target agents-md    AGENTS.md (Codex, Aider, Factory)');
    console.log('    crag compile --target cursor       .cursor/rules/governance.mdc');
    console.log('    crag compile --target gemini       GEMINI.md\n');
    console.log('  AI coding agents — additional formats:');
    console.log('    crag compile --target copilot      .github/copilot-instructions.md');
    console.log('    crag compile --target cline        .clinerules');
    console.log('    crag compile --target continue     .continuerules');
    console.log('    crag compile --target windsurf     .windsurfrules');
    console.log('    crag compile --target zed          .zed/rules.md');
    console.log('    crag compile --target cody         .sourcegraph/cody-instructions.md\n');
    console.log('  Combined:');
    console.log('    crag compile --target all          All 12 targets at once\n');
    return;
  }

  const targets = target === 'all' ? ALL_TARGETS : [target];

  console.log(`\n  Compiling governance.md → ${targets.join(', ')}`);
  console.log(`  ${gateCount} gates, ${parsed.runtimes.length} runtimes detected\n`);

  for (const t of targets) {
    switch (t) {
      case 'github':     generateGitHubActions(cwd, parsed); break;
      case 'husky':      generateHusky(cwd, parsed); break;
      case 'pre-commit': generatePreCommitConfig(cwd, parsed); break;
      case 'agents-md':  generateAgentsMd(cwd, parsed); break;
      case 'cursor':     generateCursorRules(cwd, parsed); break;
      case 'gemini':     generateGeminiMd(cwd, parsed); break;
      case 'copilot':    generateCopilot(cwd, parsed); break;
      case 'cline':      generateCline(cwd, parsed); break;
      case 'continue':   generateContinue(cwd, parsed); break;
      case 'windsurf':   generateWindsurf(cwd, parsed); break;
      case 'zed':        generateZed(cwd, parsed); break;
      case 'cody':       generateCody(cwd, parsed); break;
      default:
        console.error(`  Unknown target: ${t}`);
        console.error(`  Valid targets: ${ALL_TARGETS.join(', ')}, all, list`);
        process.exit(1);
    }
  }

  console.log('\n  Done. Governance is now executable infrastructure.\n');
}

module.exports = { compile, ALL_TARGETS };

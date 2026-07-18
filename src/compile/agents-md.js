'use strict';

const path = require('path');
const { flattenGates } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Build the shared agent-instruction BODY from parsed governance.
 *
 * This is the single content renderer for the AGENTS.md standard (the
 * Linux-Foundation cross-tool format read natively by Codex, Cursor, Copilot,
 * Gemini CLI, Windsurf, Aider, Zed, and more). The canonical `agents-md`
 * target and every `mirror`-class satellite (src/compile/satellite.js) reuse
 * this function, so the substance can never drift between them — there is
 * exactly one place that turns governance into agent rules.
 *
 * Returns the markdown from "## Project" onward (title + generated-note are
 * supplied by the caller so AGENTS.md and a harness mirror can differ only in
 * their header, never their content).
 */
function buildAgentsMdBody(parsed) {
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

  // Enriched sections from project mining (only include if non-empty)
  const enriched = [];
  if (parsed.architecture && parsed.architecture.trim()) {
    enriched.push('## Architecture', '', parsed.architecture.trim(), '');
  }
  if (parsed.keyDirectories && parsed.keyDirectories.trim()) {
    enriched.push('## Key Directories', '', parsed.keyDirectories.trim(), '');
  }
  if (parsed.testing && parsed.testing.trim()) {
    enriched.push('## Testing', '', parsed.testing.trim(), '');
  }
  if (parsed.codeStyleSection && parsed.codeStyleSection.trim()) {
    enriched.push('## Code Style', '', parsed.codeStyleSection.trim(), '');
  }
  if (parsed.antiPatterns && parsed.antiPatterns.trim()) {
    enriched.push('## Anti-Patterns', '', parsed.antiPatterns.trim(), '');
  }
  if (parsed.frameworkConventions && parsed.frameworkConventions.trim()) {
    enriched.push('## Framework Conventions', '', parsed.frameworkConventions.trim(), '');
  }
  if (parsed.distilledPrinciples && parsed.distilledPrinciples.trim()) {
    enriched.push('## Distilled Principles', '', parsed.distilledPrinciples.trim(), '');
  }

  return [
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
    ...enriched,
    securityBlock,
    '',
    '## Workflow',
    '',
    '1. Read `AGENTS.md` at the start of every session — it is the single source of truth.',
    '2. Run all mandatory quality gates before committing.',
    '3. If a gate fails, fix the issue and re-run only the failed gate.',
    '4. Use the project commit conventions for all changes.',
    '',
  ].join('\n');
}

/**
 * Assemble a complete AGENTS.md-shaped document: title + generated-note +
 * shared body. `opts.title` and `opts.note` let a mirror satellite reuse the
 * exact body under its own heading.
 */
function buildAgentsMdContent(parsed, opts = {}) {
  const title = opts.title || '# AGENTS.md';
  const note = opts.note
    || '> Generated from governance.md by [crag](https://crag.sh). Regenerate: `crag compile --target agents-md`';
  return [title, '', note, '', buildAgentsMdBody(parsed)].join('\n');
}

function generateAgentsMd(cwd, parsed) {
  const content = buildAgentsMdContent(parsed);
  const outPath = path.join(cwd, 'AGENTS.md');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateAgentsMd, buildAgentsMdBody, buildAgentsMdContent };

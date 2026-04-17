'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to Cline rules.
 * Output: .clinerules
 *
 * Cline is a VS Code extension that runs agentic coding loops locally.
 * It reads `.clinerules` at the workspace root automatically.
 *
 * Reference:
 *   https://docs.cline.bot/features/cline-rules
 */
function generateCline(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  const gatesList = gates.length === 0
    ? '- (none defined)'
    : gates
        .map((g) => {
          const tags = [];
          if (g.classification !== 'MANDATORY') tags.push(g.classification);
          if (g.path) tags.push(`path=${g.path}`);
          if (g.condition) tags.push(`if=${g.condition}`);
          const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
          return `- ${g.cmd}${tagStr}`;
        })
        .join('\n');

  const content = `# Cline Rules — ${parsed.name || 'project'}

Generated from governance.md by [crag](https://crag.sh). Regenerate with: \`crag compile --target cline\`

## About this project

${parsed.description || '(No description)'}

${parsed.stack.length > 0 ? `Stack: ${parsed.stack.join(', ')}\n` : ''}Runtimes: ${parsed.runtimes.join(', ') || 'auto-detected'}

## Mandatory behavior

1. Read this file at the start of every session. Read \`governance.md\` for full context.
2. Run all mandatory quality gates before proposing a commit.
3. If a gate fails, attempt an automatic fix (lint/format) with bounded retry (max 2 attempts). If it still fails, escalate to the user.
4. Never modify files outside this repository.
5. Never run destructive system commands (rm -rf /, DROP TABLE, force-push to main, curl|bash).
6. Use conventional commits.

## Quality gates

Run these in order, stop on first MANDATORY failure:

${gatesList}

## Security

${parsed.security || '- Never commit hardcoded secrets (grep for sk_live, sk_test, AKIA, password=)'}

## Workflow

For every task:
1. Read the governance.md file first
2. Understand which files need to change
3. Make minimal, focused changes
4. Run all mandatory gates
5. Commit with a conventional commit message

## Tool context

This project uses **crag** — the governance engine for AI coding agents. https://crag.sh
`;

  const outPath = path.join(cwd, '.clinerules');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateCline };

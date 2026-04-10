'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to Claude Code instructions.
 * Output: CLAUDE.md
 *
 * Claude Code auto-discovers CLAUDE.md at the project root and loads it
 * at the start of every session. It also reads .claude/CLAUDE.md and
 * files in .claude/rules/, but root CLAUDE.md is the standard path.
 *
 * Reference:
 *   https://docs.anthropic.com/en/docs/claude-code
 */
function generateClaude(cwd, parsed) {
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
          return `- \`${g.cmd}\`${tagStr}`;
        })
        .join('\n');

  const commitLine = parsed.commitConvention === 'conventional'
    ? `- Use conventional commits (feat:, fix:, docs:, etc.)${parsed.commitTrailer ? `\n- Commit trailer: \`${parsed.commitTrailer}\`` : ''}`
    : '- Follow project commit conventions';

  const content = `# CLAUDE.md — ${parsed.name || 'project'}

> Generated from governance.md by crag. Regenerate: \`crag compile --target claude\`

${parsed.description || ''}
${parsed.stack.length > 0 ? `\n**Stack:** ${parsed.stack.join(', ')}` : ''}
${parsed.runtimes.length > 0 ? `**Runtimes:** ${parsed.runtimes.join(', ')}` : ''}

## Quality Gates

Run these in order before committing. Stop on first MANDATORY failure:

${gatesList}

## Rules

1. Read \`governance.md\` at the start of every session — it is the single source of truth.
2. Run all mandatory quality gates before committing.
3. If a gate fails, attempt an automatic fix (lint/format) with bounded retry (max 2 attempts). If it still fails, escalate to the user.
4. Never modify files outside this repository.
5. Never run destructive system commands (\`rm -rf /\`, \`DROP TABLE\`, force-push to main).
${commitLine}

## Security

${parsed.security || '- Never commit hardcoded secrets (grep for sk_live, sk_test, AKIA, password=)'}

## Tool Context

This project uses **crag** (https://www.npmjs.com/package/@whitehatd/crag) as its governance engine. The \`governance.md\` file is the authoritative source. Run \`crag audit\` to detect drift and \`crag compile --target all\` to recompile all targets.
`;

  const outPath = path.join(cwd, 'CLAUDE.md');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateClaude };

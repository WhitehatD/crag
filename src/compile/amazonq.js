'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

/**
 * Compile governance.md to Amazon Q Developer rules.
 * Output: .amazonq/rules/governance.md
 *
 * Amazon Q Developer reads project rules from `.amazonq/rules/*.md`.
 * Rules are freeform Markdown loaded as context for chat, inline, and
 * agent interactions in both the IDE extension and CLI.
 *
 * Reference:
 *   https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/context-project-rules.html
 */
function generateAmazonQ(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  const gatesList = gates.length === 0
    ? '- _(none defined — add gates to governance.md)_'
    : gates
        .map((g) => {
          const tags = [];
          if (g.classification !== 'MANDATORY') tags.push(g.classification);
          if (g.path) tags.push(`scope: ${g.path}`);
          if (g.condition) tags.push(`if: ${g.condition}`);
          const tagStr = tags.length > 0 ? ` — ${tags.join(' · ')}` : '';
          return `- \`${g.cmd}\`${tagStr}`;
        })
        .join('\n');

  const content = `# Amazon Q Rules — ${parsed.name || 'project'}

> Generated from governance.md by crag. Regenerate: \`crag compile --target amazonq\`

## About

${parsed.description || '(No description)'}

**Runtimes detected:** ${parsed.runtimes.join(', ') || 'polyglot'}

## How Amazon Q Should Behave on This Project

### Code Generation

1. **Run governance gates before suggesting commits.** The gates below define the quality bar.
2. **Respect classifications:** MANDATORY (default) blocks on failure; OPTIONAL warns; ADVISORY is informational only.
3. **Respect scopes:** Path-scoped gates run from that directory. Conditional gates skip when their file does not exist.
4. **No secrets.** Never generate code containing \`sk_live\`, \`sk_test\`, \`AKIA\`, or plaintext credentials.
5. **Minimal diffs.** Prefer editing existing code over creating new files. Do not refactor unrelated areas.

### Quality Gates

${gatesList}

### Commit Style

Use conventional commits: \`feat(scope): description\`, \`fix(scope): description\`, \`docs: description\`, etc.

### Boundaries

- All file operations must stay within this repository.
- No destructive shell commands (rm -rf above repo root, DROP TABLE without confirmation, force-push to main).
- No new dependencies without an explicit reason.

## Authoritative Source

When these instructions seem to conflict with something in the repo, **\`.claude/governance.md\` is the source of truth**. This file is a compiled view.

---

**Tool:** crag — https://www.npmjs.com/package/@whitehatd/crag
`;

  const outPath = path.join(cwd, '.amazonq', 'rules', 'governance.md');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateAmazonQ };

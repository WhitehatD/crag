'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

/**
 * Compile governance.md to Continue.dev rules.
 * Output: .continuerules (a markdown file) + companion block for config.yaml
 *
 * Continue is an open-source AI code assistant that supports custom rules
 * at the project level. It reads `.continuerules` and project-level
 * `config.yaml` fragments.
 *
 * Reference:
 *   https://docs.continue.dev/customize/deep-dives/rules
 */
function generateContinue(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  const gatesList = gates.length === 0
    ? '  (none defined)'
    : gates
        .map((g) => {
          const tags = [];
          if (g.classification !== 'MANDATORY') tags.push(g.classification);
          if (g.path) tags.push(`path=${g.path}`);
          return `  - ${g.cmd}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
        })
        .join('\n');

  const content = `# Continue Rules — ${parsed.name || 'project'}

> Generated from governance.md by crag. Regenerate: \`crag compile --target continue\`

${parsed.description || ''}

## Project Context

- **Runtimes:** ${parsed.runtimes.join(', ') || 'polyglot'}
- **Governance source:** \`.claude/governance.md\` (single source of truth)

## Coding Rules

Always follow these when generating or modifying code:

1. **Run gates before committing.** Every change must pass the mandatory gates below.
2. **Classifications matter:**
   - \`MANDATORY\` — must pass (default)
   - \`OPTIONAL\` — should pass, warn on failure
   - \`ADVISORY\` — informational only
3. **Path-scoped gates** run from their declared directory.
4. **Conditional gates** only run when their referenced file exists.
5. **No secrets.** Reject any code containing \`sk_live\`, \`sk_test\`, \`AKIA\`, or plaintext passwords.
6. **Conventional commits.** Format: \`<type>(<scope>): <description>\`

## Quality Gates

${gatesList}

## Boundaries

- All file operations stay within this repository
- No destructive shell commands
- No new dependencies without justification
- Prefer editing existing files over creating new ones

## Powered by crag

This rule file is auto-generated from a single \`governance.md\` via **crag** (https://www.npmjs.com/package/@whitehatd/crag) — the bedrock layer for AI coding agents. To update these rules, edit governance.md and re-run \`crag compile --target continue\`.
`;

  const outPath = path.join(cwd, '.continuerules');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateContinue };

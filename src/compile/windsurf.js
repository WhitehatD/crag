'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

/**
 * Compile governance.md to Windsurf rules.
 * Output: .windsurfrules
 *
 * Windsurf (by Codeium) is an AI-native IDE with a Cascade agent mode.
 * It reads `.windsurfrules` at the workspace root for project-level guidance.
 *
 * Reference:
 *   https://docs.windsurf.com/windsurf/cascade/memories#rules
 */
function generateWindsurf(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  const gatesList = gates.length === 0
    ? '(none defined)'
    : gates
        .map((g, i) => {
          const prefix = g.classification !== 'MANDATORY' ? ` [${g.classification}]` : '';
          const scope = g.path ? ` (in ${g.path})` : '';
          return `${i + 1}. \`${g.cmd}\`${scope}${prefix}`;
        })
        .join('\n');

  const content = `# Windsurf Rules — ${parsed.name || 'project'}

Generated from governance.md by crag. Regenerate: \`crag compile --target windsurf\`

## Project

${parsed.description || '(No description)'}

## Runtimes

${parsed.runtimes.join(', ') || 'polyglot — detected at runtime'}

## Cascade Behavior

When Windsurf's Cascade agent operates on this project:

- **Always read governance.md first.** It is the single source of truth for quality gates and policies.
- **Run all mandatory gates before proposing changes.** Stop on first failure.
- **Respect classifications.** OPTIONAL gates warn but don't block. ADVISORY gates are informational.
- **Respect path scopes.** Gates with a \`path:\` annotation must run from that directory.
- **No destructive commands.** Never run rm -rf, dd, DROP TABLE, force-push to main, curl|bash, docker system prune.
- **No secrets.** Reject any code matching \`sk_live\`, \`sk_test\`, \`AKIA\`, or plaintext credentials.
- **Conventional commits.** Every commit must follow \`<type>(<scope>): <description>\`.

## Quality Gates (run in order)

${gatesList}

## Rules of Engagement

1. **Minimal changes.** Don't rewrite files that weren't asked to change.
2. **No new dependencies** without explicit approval.
3. **Prefer editing** existing files over creating new ones.
4. **Always explain** non-obvious changes in commit messages.
5. **Ask before** destructive operations (delete, rename, migrate schema).

---

**Tool:** crag — https://www.npmjs.com/package/@whitehatd/crag
`;

  const outPath = path.join(cwd, '.windsurfrules');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateWindsurf };

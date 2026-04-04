'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');

/**
 * Compile governance.md to GitHub Copilot Workspace instructions.
 * Output: .github/copilot-instructions.md
 *
 * Copilot Workspace reads this file automatically. It's supported by
 * Copilot in VS Code, JetBrains IDEs, Visual Studio, and the Copilot
 * Workspace web experience.
 *
 * Reference:
 *   https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot
 */
function generateCopilot(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  const gatesBlock = gates.length === 0
    ? '_No quality gates defined — add them to governance.md._'
    : gates
        .map((g) => {
          const prefix = g.classification !== 'MANDATORY' ? ` (${g.classification.toLowerCase()})` : '';
          const scope = g.path ? ` in \`${g.path}\`` : '';
          return `- **${g.section}**${scope}${prefix}: \`${g.cmd}\``;
        })
        .join('\n');

  const runtimesBlock = parsed.runtimes.length > 0
    ? parsed.runtimes.join(', ')
    : 'polyglot (detected from files at runtime)';

  const content = `# Copilot Instructions — ${parsed.name || 'project'}

> Generated from governance.md by crag. Regenerate: \`crag compile --target copilot\`

${parsed.description || ''}

## Runtimes

${runtimesBlock}

## Quality Gates

When you propose changes, the following checks must pass before commit:

${gatesBlock}

## Expectations for AI-Assisted Code

1. **Run gates before suggesting a commit.** If you cannot run them (no shell access), explicitly remind the human to run them.
2. **Respect classifications.** \`MANDATORY\` gates must pass. \`OPTIONAL\` gates should pass but may be overridden with a note. \`ADVISORY\` gates are informational only.
3. **Respect workspace paths.** When a gate is scoped to a subdirectory, run it from that directory.
4. **No hardcoded secrets.** Never commit values matching \`sk_live\`, \`sk_test\`, \`AKIA\`, or \`password = "…"\`.
5. **Conventional commits** for all changes.
6. **Conservative changes.** Do not rewrite unrelated files. Do not add new dependencies without explaining why.

## Tool Context

This project uses **crag** (https://www.npmjs.com/package/@whitehatd/crag) as its AI-agent governance layer. The \`governance.md\` file is the authoritative source. If you have shell access, run \`crag check\` to verify the infrastructure and \`crag diff\` to detect drift.
`;

  const outPath = path.join(cwd, '.github', 'copilot-instructions.md');
  atomicWrite(outPath, content);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateCopilot };

'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to CodeRabbit AI code review config.
 * Output: .coderabbit.yaml
 *
 * CodeRabbit reads .coderabbit.yaml and uses path_instructions to inject
 * governance context into every AI review, ensuring quality gates are
 * surfaced during code review.
 *
 * Reference:
 *   https://docs.coderabbit.ai/getting-started/configure-coderabbit/
 */
function generateCoderabbit(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  let instructionsBullets;
  if (gates.length === 0) {
    instructionsBullets = '        # No quality gates defined — add them to governance.md';
  } else {
    instructionsBullets = gates
      .map((g) => `        - \`${g.cmd}\``)
      .join('\n');
  }

  const content = `# Generated from governance.md by crag — https://crag.sh
# Regenerate: crag compile --target coderabbit
version: "2"
language: "en-US"
reviews:
  path_instructions:
    - path: "**/*"
      instructions: |
        Enforce these quality gates from governance.md:
${instructionsBullets}
`;

  const outPath = path.join(cwd, '.coderabbit.yaml');
  const final = preserveCustomSections(outPath, content, 'comment');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateCoderabbit };

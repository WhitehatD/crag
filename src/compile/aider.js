'use strict';

const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to Aider conventions file.
 * Output: CONVENTIONS.md
 *
 * Aider (the AI pair-programming CLI) reads CONVENTIONS.md by default as a
 * conventions file at the project root. Gates are grouped by section.
 *
 * Reference:
 *   https://aider.chat/docs/usage/conventions.html
 */
function generateAider(cwd, parsed) {
  const gates = flattenGatesRich(parsed.gates);

  let gatesBlock;
  if (gates.length === 0) {
    gatesBlock = '<!-- No quality gates defined — add them to governance.md -->';
  } else {
    // Group by section
    const sections = new Map();
    for (const gate of gates) {
      if (!sections.has(gate.section)) sections.set(gate.section, []);
      sections.get(gate.section).push(gate);
    }

    const parts = [];
    for (const [section, sectionGates] of sections) {
      const heading = section.charAt(0).toUpperCase() + section.slice(1);
      const bullets = sectionGates
        .map((g) => {
          const tags = [];
          if (g.classification !== 'MANDATORY') tags.push(g.classification);
          if (g.path) tags.push(`path=${g.path}`);
          if (g.condition) tags.push(`if=${g.condition}`);
          const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
          return `- \`${g.cmd}\`${tagStr}`;
        })
        .join('\n');
      parts.push(`### ${heading}\n${bullets}`);
    }
    gatesBlock = parts.join('\n\n');
  }

  const content = `# Conventions

> Generated from governance.md by [crag](https://crag.sh). Regenerate: \`crag compile --target aider\`

## Quality Gates

${gatesBlock}
`;

  const outPath = path.join(cwd, 'CONVENTIONS.md');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateAider };

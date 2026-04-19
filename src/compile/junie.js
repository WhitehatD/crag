'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to JetBrains Junie guidelines.
 * Output: .junie/guidelines.md
 *
 * Junie (JetBrains AI coding assistant for IntelliJ/IDEA/Rider/etc.) reads
 * .junie/guidelines.md as its project-specific instructions file.
 *
 * Reference:
 *   https://www.jetbrains.com/help/idea/junie.html
 */
function generateJunie(cwd, parsed) {
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
          if (g.classification !== 'MANDATORY') tags.push(`← ${g.classification}`);
          const tagStr = tags.length > 0 ? ` ${tags.join(', ')}` : '';
          return `- \`${g.cmd}\`${tagStr}`;
        })
        .join('\n');
      parts.push(`### ${heading}\n${bullets}`);
    }
    gatesBlock = parts.join('\n\n');
  }

  const stackLine = (parsed.stack && parsed.stack.length > 0)
    ? parsed.stack.join(', ')
    : 'unknown';
  const runtimesLine = (parsed.runtimes && parsed.runtimes.length > 0)
    ? parsed.runtimes.join(', ')
    : 'unknown';

  const content = `# Project Guidelines

> Generated from governance.md by crag — https://crag.sh
> Regenerate: \`crag compile --target junie\`

## Quality Gates

Run these in order. Stop on first mandatory failure.

${gatesBlock}

## Stack

- **Stack:** ${stackLine}
- **Runtimes:** ${runtimesLine}
`;

  const dir = path.join(cwd, '.junie');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outPath = path.join(dir, 'guidelines.md');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateJunie };

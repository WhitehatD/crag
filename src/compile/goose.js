'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to Goose project hints.
 * Output: .goose/GOOSEHINTS
 *
 * Goose (Block's open-source AI agent) reads .goose/GOOSEHINTS as project
 * conventions. Format is plain markdown, similar to CLAUDE.md.
 *
 * Reference:
 *   https://block.github.io/goose/docs/goosehints
 */
function generateGoose(cwd, parsed) {
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

  const content = `# Project Hints

> Generated from governance.md by crag — https://crag.sh
> Regenerate: \`crag compile --target goose\`

## Quality Gates

${gatesBlock}

## Stack

- **Stack:** ${stackLine}
- **Runtimes:** ${runtimesLine}
`;

  const dir = path.join(cwd, '.goose');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outPath = path.join(dir, 'GOOSEHINTS');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateGoose };

'use strict';

const fs = require('fs');
const path = require('path');
const { flattenGatesRich } = require('../governance/parse');
const { atomicWrite } = require('./atomic-write');
const { preserveCustomSections } = require('./preserve');

/**
 * Compile governance.md to AWS Kiro steering document.
 * Output: .kiro/steering/quality-gates.md
 *
 * Kiro uses "steering documents" — markdown files with YAML frontmatter that
 * tell the AI agent what to do. alwaysApply: true means the rules are always
 * active regardless of which files are open.
 *
 * Reference:
 *   https://kiro.dev/docs/steering/
 */
function generateKiro(cwd, parsed) {
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
      parts.push(`## ${heading}\n${bullets}`);
    }
    gatesBlock = parts.join('\n\n');
  }

  const content = `---
description: Quality gates and coding standards from governance.md
alwaysApply: true
---

# Quality Gates

> Generated from governance.md by crag — https://crag.sh
> Regenerate: \`crag compile --target kiro\`

${gatesBlock}
`;

  const dir = path.join(cwd, '.kiro', 'steering');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const outPath = path.join(dir, 'quality-gates.md');
  const final = preserveCustomSections(outPath, content, 'markdown');
  atomicWrite(outPath, final);
  console.log(`  \x1b[32m✓\x1b[0m ${path.relative(cwd, outPath)}`);
}

module.exports = { generateKiro };

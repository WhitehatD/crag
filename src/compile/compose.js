'use strict';

/**
 * compose.js — COMPOSED GOVERNANCE (docs/closed-loop.md REV 2/3).
 *
 * Pure text, zero-dep, NO LLM, NO network — this file must never import the
 * federation/gateway module tree or the distill module tree (see the
 * "determinism boundary" test in test/mcp.test.js). All it does is read up
 * to four already-rendered markdown files off disk and merge them,
 * deterministically, into the single composed artifact `.claude/governance.md`.
 *
 * Sources, in precedence order (highest wins on conflict):
 *   user.src > user.gen > project.src > project.gen
 * (see src/governance/layer-paths.js for where each file lives.)
 *
 * BACKWARD COMPATIBILITY (non-negotiable): if none of the four split
 * files exist, `composeGovernance()` returns null and the caller MUST
 * fall back to reading .claude/governance.md directly, completely
 * unchanged from pre-compose behavior. The split is opt-in / additive.
 */

const fs = require('fs');
const { parseGovernance, flattenGatesRich } = require('../governance/parse');
const { layerPaths, hasSplitSources } = require('../governance/layer-paths');

const DEFAULT_GEN_BUDGET_CHARS = 4000;

const TEXT_SECTIONS = [
  ['branchStrategy', 'Branch Strategy'],
  ['security', 'Security'],
  ['architecture', 'Architecture'],
  ['keyDirectories', 'Key Directories'],
  ['testing', 'Testing'],
  ['codeStyleSection', 'Code Style'],
  ['importConventions', 'Import Conventions'],
  ['dependencyPolicy', 'Dependencies'],
  ['antiPatterns', 'Anti-Patterns'],
  ['frameworkConventions', 'Framework Conventions'],
  ['ciCdWorkflows', 'CI / CD Workflows'],
];

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Merge N text bodies (in precedence order) line-by-line, dropping any
 * line whose trimmed text has already appeared (dedup, first-occurrence /
 * highest-precedence wins). Blank lines are kept for readability but never
 * cause a dedup skip themselves.
 */
function mergeTextLines(bodies) {
  const seen = new Set();
  const out = [];
  for (const body of bodies) {
    if (!body) continue;
    for (const rawLine of body.split('\n')) {
      const key = rawLine.trim();
      if (key === '') {
        out.push('');
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rawLine);
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Merge gate sections (v2 rich shape) across sources in precedence order.
 * Section identity = lowercased section name (matches the parser). Within
 * a section, commands are deduped by exact cmd text — first occurrence
 * (highest precedence) wins and keeps its classification/position;
 * path/condition metadata is taken from whichever source first defines
 * the section.
 */
function mergeGates(gatesRichList) {
  const sections = new Map(); // name -> { path, condition, cmds: Map<cmd, {classification}> }
  const order = [];

  for (const rich of gatesRichList) {
    for (const g of rich) {
      if (!sections.has(g.section)) {
        sections.set(g.section, { path: g.path, condition: g.condition, cmds: new Map() });
        order.push(g.section);
      }
      const entry = sections.get(g.section);
      if (!entry.cmds.has(g.cmd)) {
        entry.cmds.set(g.cmd, { classification: g.classification });
      }
    }
  }

  return order.map((name) => ({
    name,
    path: sections.get(name).path,
    condition: sections.get(name).condition,
    commands: [...sections.get(name).cmds.entries()].map(([cmd, meta]) => ({ cmd, classification: meta.classification })),
  }));
}

function renderGatesBlock(mergedSections) {
  if (mergedSections.length === 0) return '';
  const parts = [];
  for (const sec of mergedSections) {
    if (sec.name !== 'default') {
      const tags = [];
      if (sec.path) tags.push(`path: ${sec.path}`);
      if (sec.condition) tags.push(`if: ${sec.condition}`);
      const tagStr = tags.length > 0 ? ` (${tags.join(', ')})` : '';
      const title = sec.name.charAt(0).toUpperCase() + sec.name.slice(1);
      parts.push(`### ${title}${tagStr}`);
    }
    for (const c of sec.commands) {
      const suffix = c.classification && c.classification !== 'MANDATORY' ? ` # [${c.classification}]` : '';
      parts.push(`- ${c.cmd}${suffix}`);
    }
  }
  return parts.join('\n');
}

/**
 * Extract annotated distilled-principle bullets from a rendered gen body
 * (the "## Distilled Principles" section body of a .gen.md file). Each
 * eligible bullet was written by src/distill/render.js in the shape:
 *   - <text> <!-- principle:<id> confidence:<c> scope:<s> adopted:<d> -->
 * Bullets without a parseable confidence annotation are treated as
 * confidence 0 (sorted last, but never dropped from the corpus — only
 * ranking is affected).
 */
function parseGenBullets(body) {
  if (!body) return [];
  const bullets = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const match = trimmed.match(/<!--\s*principle:(\S+)\s+confidence:([\d.]+|n\/a)[^>]*-->/);
    const confidence = match && match[2] !== 'n/a' ? parseFloat(match[2]) : 0;
    const id = match ? match[1] : null;
    bullets.push({ line: trimmed, id, confidence });
  }
  return bullets;
}

/**
 * Rank distilled-principle bullets by confidence (desc) and apply a total
 * character budget. Returns { kept, overflow } — `kept` preserves the
 * ORIGINAL relative order of the input (not confidence order) so output
 * stays deterministic/stable across runs when nothing changed; `overflow`
 * items go to the Reference Appendix, never a compiled prompt section.
 */
function applyBudget(bullets, budgetChars) {
  const ranked = [...bullets].sort((a, b) => b.confidence - a.confidence);
  const keptSet = new Set();
  let used = 0;
  for (const b of ranked) {
    const cost = b.line.length + 1;
    if (used + cost > budgetChars) continue;
    keptSet.add(b);
    used += cost;
  }
  const kept = bullets.filter((b) => keptSet.has(b));
  const overflow = bullets.filter((b) => !keptSet.has(b));
  return { kept, overflow };
}

function parseOrNull(content) {
  if (content === null || content === undefined) return null;
  return parseGovernance(content);
}

/**
 * Compose the four split-source files (whichever exist) into one
 * governance.md-shaped string, in precedence order, deduped, with the
 * gen-sourced "Distilled Principles" ranked + budget-capped (overflow ->
 * "## Reference Appendix", a heading no compile target ever reads).
 *
 * Returns null if no split sources exist at all (backward-compat no-op —
 * caller must fall back to reading .claude/governance.md directly).
 */
function composeGovernance(cwd, opts = {}) {
  if (!hasSplitSources(cwd)) return null;

  const budgetChars = typeof opts.budgetChars === 'number' ? opts.budgetChars : DEFAULT_GEN_BUDGET_CHARS;
  const paths = layerPaths(cwd);

  // Precedence order: user.src > user.gen > project.src > project.gen
  const sourceOrder = [
    { key: 'userSrc', path: paths.userSrc },
    { key: 'userGen', path: paths.userGen },
    { key: 'projectSrc', path: paths.projectSrc },
    { key: 'projectGen', path: paths.projectGen },
  ];
  const raw = sourceOrder.map((s) => ({ ...s, content: readIfExists(s.path) }));
  const parsedList = raw.map((s) => ({ ...s, parsed: parseOrNull(s.content) }));
  const present = parsedList.filter((s) => s.parsed !== null);

  // 1) Scalar identity fields: first non-empty in precedence order wins.
  const name = present.map((s) => s.parsed.name).find((v) => v) || '';
  const description = present.map((s) => s.parsed.description).find((v) => v) || '';
  const stack = present.map((s) => s.parsed.stack).find((v) => Array.isArray(v) && v.length > 0) || [];
  const commitConvention = present.map((s) => s.parsed.commitConvention).find((v) => v) || '';
  const commitTrailer = present.map((s) => s.parsed.commitTrailer).find((v) => v) || '';

  // 2) Gates: merge across all present sources, in precedence order.
  const gatesRichLists = present.map((s) => flattenGatesRich(s.parsed.gates));
  const mergedGates = mergeGates(gatesRichLists);
  const gatesBlock = renderGatesBlock(mergedGates);

  // 3) Free-text sections: line-level dedup merge, in precedence order.
  const textSectionBlocks = {};
  for (const [field, heading] of TEXT_SECTIONS) {
    const merged = mergeTextLines(present.map((s) => s.parsed[field]));
    if (merged) textSectionBlocks[heading] = merged;
  }

  // 4) Distilled Principles: manual mentions (rare, from a .src file) are
  //    never budgeted; gen-sourced bullets ARE ranked + budget-capped.
  //    Only userGen/projectGen ever populate distilledPrinciples in
  //    practice (distill only ever writes that heading), but the merge
  //    is written generically over "present" sources so a hand-authored
  //    Distilled Principles section in a .src file also composes safely.
  const genSources = present.filter((s) => s.key === 'userGen' || s.key === 'projectGen');
  const srcSources = present.filter((s) => s.key === 'userSrc' || s.key === 'projectSrc');

  const manualPrincipleLines = mergeTextLines(srcSources.map((s) => s.parsed.distilledPrinciples));
  const genBullets = genSources.flatMap((s) => parseGenBullets(s.parsed.distilledPrinciples));
  const { kept, overflow } = applyBudget(genBullets, budgetChars);

  const distilledBody = [manualPrincipleLines, kept.map((b) => b.line).join('\n')]
    .filter(Boolean)
    .join('\n');

  const appendixBody = overflow.length > 0
    ? `<!-- Over the ${budgetChars}-char distilled-principle budget for this compose run. Not read by any compile target. -->\n\n${overflow.map((b) => b.line).join('\n')}`
    : '';

  // ── Reassemble ──────────────────────────────────────────────────────
  const parts = [];
  parts.push(`<!-- GENERATED by \`crag compose\` (part of \`crag compile\`) — DO NOT EDIT BY HAND.\n     Edit .crag/governance.src.md (manual) or regenerate .crag/governance.gen.md via \`crag distill\`.\n     Precedence: user.src > user.gen > project.src > project.gen. -->`);
  parts.push(`\n# Governance — ${name || 'project'}\n`);
  parts.push(`## Identity\n- Project: ${name}${description ? `\n- Description: ${description}` : ''}${stack.length > 0 ? `\n- Stack: ${stack.join(', ')}` : ''}\n`);

  if (gatesBlock) {
    parts.push(`## Gates\n${gatesBlock}\n`);
  }

  if (commitConvention || commitTrailer || textSectionBlocks['Branch Strategy']) {
    const branchLines = [];
    if (textSectionBlocks['Branch Strategy']) branchLines.push(textSectionBlocks['Branch Strategy']);
    if (commitConvention === 'conventional' && !/conventional\s+commits/i.test(branchLines.join('\n'))) {
      branchLines.push('- Uses conventional commits');
    }
    if (commitTrailer && !branchLines.join('\n').includes(commitTrailer)) {
      branchLines.push(`- Commit trailer: ${commitTrailer}`);
    }
    parts.push(`## Branch Strategy\n${branchLines.join('\n')}\n`);
  }

  for (const [, heading] of TEXT_SECTIONS) {
    if (heading === 'Branch Strategy') continue; // handled above
    if (textSectionBlocks[heading]) {
      parts.push(`## ${heading}\n${textSectionBlocks[heading]}\n`);
    }
  }

  if (distilledBody) {
    parts.push(`## Distilled Principles\n${distilledBody}\n`);
  }

  if (appendixBody) {
    parts.push(`## Reference Appendix\n${appendixBody}\n`);
  }

  const content = parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

  return {
    content,
    sources: Object.fromEntries(raw.map((s) => [s.key, s.content !== null])),
    genBulletsKept: kept.length,
    genBulletsOverflow: overflow.length,
  };
}

module.exports = { composeGovernance, DEFAULT_GEN_BUDGET_CHARS, mergeTextLines, mergeGates, parseGenBullets, applyBudget };

'use strict';

/**
 * targets.js — THE TARGET REGISTRY (data, not code).
 *
 * crag used to treat 23 compile targets as a flat list of equal, independent
 * full renderers — so `crag compile --target all` blasted 23 files nobody has,
 * and 9 of them re-rendered the SAME governance substance under 9 filenames.
 * This registry replaces that with the 2026 reality:
 *
 *   AGENTS.md WON. It is the Linux-Foundation (Agentic AI Foundation) standard,
 *   read NATIVELY by Codex, Cursor, Copilot, Gemini CLI, Windsurf, Aider, Zed,
 *   Factory, Jules, Devin, Amp, RooCode, Warp, JetBrains Junie, and more.
 *   Claude Code is the sole notable holdout on native auto-load (reads CLAUDE.md,
 *   interops via an `@AGENTS.md` import).
 *
 * So the correct output is: ONE canonical AGENTS.md + only the DELTAS a
 * detected tool needs on top. Each target declares:
 *
 *   class:      'canonical' | 'satellite' | 'structural'
 *   agentsMd:   (satellites only) how the tool relates to AGENTS.md —
 *     'import'  — tool can't auto-read AGENTS.md but supports an import
 *                 directive (Claude Code `@AGENTS.md`). Emit a thin stub.
 *     'native'  — tool reads AGENTS.md itself. Emit NOTHING when AGENTS.md is
 *                 in the same compile run (a duplicate file would only bloat
 *                 context, and for priority-chain tools like Zed it would
 *                 SHADOW the canonical AGENTS.md). Standalone (no agents-md in
 *                 the run) falls back to a self-contained mirror so an explicit
 *                 `--target <id>` still yields a working file.
 *     'mirror'  — tool reads neither AGENTS.md nor an import. Emit a full,
 *                 clearly-labeled "GENERATED MIRROR of AGENTS.md" via the shared
 *                 renderer (same body as AGENTS.md — never drifts).
 *   structural: keeps a bespoke generator because its FORMAT carries real
 *               value AGENTS.md can't express (Cursor/Windsurf/Continue/Copilot
 *               path-scoped glob rules; CI/hook targets = executable gates).
 *   detect:     tool-OWNED filesystem signals (paths crag does NOT itself
 *               generate) that indicate this tool is used in a repo.
 *   bins:       machine-installed binary names (for `which`-based detection).
 *   globalPath: the tool's machine-global config path for `crag compile
 *               --global` (null when crag has no safe global target for it).
 *
 * This file must stay PURE DATA — it requires nothing from src/compile/ or
 * src/commands/ so it can be consumed by the compiler, the detector, tests,
 * and (later) the docs without import cycles.
 */

// The canonical machine-global AGENTS.md location (design doc: "Machine-global
// = ~/.agents/AGENTS.md + compiled links into each tool's global path").
const GLOBAL_CANONICAL = '~/.agents/AGENTS.md';

const TARGETS = [
  // ── Canonical ──────────────────────────────────────────────────────────
  {
    id: 'agents-md', file: 'AGENTS.md', class: 'canonical',
    label: 'AGENTS.md', detect: ['AGENTS.md'], bins: [],
    globalPath: GLOBAL_CANONICAL,
  },

  // ── Satellites ─────────────────────────────────────────────────────────
  // Claude Code — the one holdout. Reads CLAUDE.md; imports AGENTS.md.
  {
    id: 'claude', file: 'CLAUDE.md', class: 'satellite',
    agentsMd: 'import', importLine: '@AGENTS.md',
    label: 'Claude Code',
    howReads: 'Claude Code auto-loads CLAUDE.md and follows its `@AGENTS.md` import.',
    detect: ['CLAUDE.md', '.claude/'], bins: ['claude'],
    globalPath: '~/.claude/CLAUDE.md',
  },
  // Native AGENTS.md readers — emit nothing when AGENTS.md is present.
  {
    id: 'gemini', file: 'GEMINI.md', class: 'satellite', agentsMd: 'native',
    label: 'Gemini CLI',
    howReads: 'Gemini CLI reads AGENTS.md natively.',
    detect: ['GEMINI.md', '.gemini/'], bins: ['gemini'], globalPath: null,
  },
  {
    id: 'zed', file: '.rules', class: 'satellite', agentsMd: 'native',
    label: 'Zed',
    howReads: 'Zed reads AGENTS.md natively (a `.rules` file would outrank and shadow it).',
    detect: ['.zed/'], bins: ['zed'], globalPath: null,
  },
  {
    id: 'aider', file: 'CONVENTIONS.md', class: 'satellite', agentsMd: 'native',
    label: 'Aider',
    howReads: 'Aider reads AGENTS.md natively.',
    detect: ['.aider.conf.yml', '.aiderignore'], bins: ['aider'], globalPath: null,
  },
  {
    id: 'junie', file: '.junie/guidelines.md', class: 'satellite', agentsMd: 'native',
    label: 'JetBrains Junie',
    howReads: 'JetBrains Junie reads AGENTS.md natively.',
    detect: ['.junie/'], bins: [], globalPath: null,
  },
  // Reads neither AGENTS.md nor an import — must carry a full mirror.
  {
    id: 'cline', file: '.clinerules', class: 'satellite', agentsMd: 'mirror',
    label: 'Cline',
    howReads: 'Cline reads `.clinerules` at the workspace root.',
    detect: ['.clinerules'], bins: [], globalPath: null,
  },
  {
    id: 'amazonq', file: '.amazonq/rules/governance.md', class: 'satellite', agentsMd: 'mirror',
    label: 'Amazon Q Developer',
    howReads: 'Amazon Q reads `.amazonq/rules/*.md`.',
    detect: ['.amazonq/'], bins: ['q'], globalPath: null,
  },
  {
    id: 'goose', file: '.goose/GOOSEHINTS', class: 'satellite', agentsMd: 'mirror',
    label: 'Goose',
    howReads: 'Goose reads `.goose/GOOSEHINTS`.',
    detect: ['.goose/'], bins: ['goose'], globalPath: null,
  },
  {
    id: 'kiro', file: '.kiro/steering/quality-gates.md', class: 'satellite', agentsMd: 'mirror',
    label: 'AWS Kiro',
    howReads: 'Kiro reads `.kiro/steering/*.md` steering documents.',
    detect: ['.kiro/'], bins: [], globalPath: null,
  },

  // ── Structural (bespoke generators kept — real format value) ────────────
  {
    id: 'cursor', file: '.cursor/rules/governance.mdc', class: 'structural',
    label: 'Cursor',
    detect: ['.cursor/', '.cursorrules'], bins: ['cursor'], globalPath: null,
  },
  {
    id: 'windsurf', file: '.windsurf/rules/governance.md', class: 'structural',
    label: 'Windsurf',
    detect: ['.windsurf/', '.windsurfrules'], bins: ['windsurf'], globalPath: null,
  },
  {
    id: 'continue', file: '.continuerules', class: 'structural',
    label: 'Continue',
    detect: ['.continue/', '.continuerules'], bins: [], globalPath: null,
  },
  {
    id: 'copilot', file: '.github/copilot-instructions.md', class: 'structural',
    label: 'GitHub Copilot',
    detect: ['.github/copilot-instructions.md'], bins: [], globalPath: null,
  },

  // ── Structural — CI / git hooks (executable gates) ──────────────────────
  { id: 'github',     file: '.github/workflows/gates.yml', class: 'structural', label: 'GitHub Actions', detect: ['.github/workflows/'], bins: [], globalPath: null },
  { id: 'forgejo',    file: '.forgejo/workflows/gates.yml', class: 'structural', label: 'Forgejo Actions', detect: ['.forgejo/'], bins: [], globalPath: null },
  { id: 'husky',      file: '.husky/pre-commit', class: 'structural', label: 'Husky', detect: ['.husky/'], bins: [], globalPath: null },
  { id: 'pre-commit', file: '.pre-commit-config.yaml', class: 'structural', label: 'pre-commit', detect: ['.pre-commit-config.yaml'], bins: [], globalPath: null },
  { id: 'lefthook',   file: 'lefthook.yml', class: 'structural', label: 'Lefthook', detect: ['lefthook.yml', 'lefthook.yaml'], bins: [], globalPath: null },
  { id: 'gitlab',     file: '.gitlab-ci.yml', class: 'structural', label: 'GitLab CI', detect: ['.gitlab-ci.yml'], bins: [], globalPath: null },
  { id: 'coderabbit', file: '.coderabbit.yaml', class: 'structural', label: 'CodeRabbit', detect: ['.coderabbit.yaml', '.coderabbit.yml'], bins: [], globalPath: null },
  { id: 'circleci',   file: '.circleci/config.yml', class: 'structural', label: 'CircleCI', detect: ['.circleci/'], bins: [], globalPath: null },
  { id: 'azuredevops', file: 'azure-pipelines.yml', class: 'structural', label: 'Azure Pipelines', detect: ['azure-pipelines.yml'], bins: [], globalPath: null },
];

const BY_ID = new Map(TARGETS.map((t) => [t.id, t]));

function getTarget(id) {
  return BY_ID.get(id) || null;
}

function allTargetIds() {
  return TARGETS.map((t) => t.id);
}

function targetsOfClass(cls) {
  return TARGETS.filter((t) => t.class === cls);
}

/** Satellites that need a bespoke generator deleted — folded into satellite.js. */
function satelliteIds() {
  return targetsOfClass('satellite').map((t) => t.id);
}

/** Structural targets keep their existing generators in compile.js. */
function structuralIds() {
  return targetsOfClass('structural').map((t) => t.id);
}

module.exports = {
  TARGETS,
  GLOBAL_CANONICAL,
  getTarget,
  allTargetIds,
  targetsOfClass,
  satelliteIds,
  structuralIds,
};

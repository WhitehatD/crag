#!/usr/bin/env node
'use strict';

/**
 * make-poster-gif.js — regenerate assets/poster-demo.gif from a committed,
 * deterministic transcript.
 *
 * The GIF is a COMPILED ARTIFACT of this script (the same rule as every other
 * generated file in this repo: no hand-maintained compiled shapes). The
 * transcript below is curated from real `crag analyze` / `crag compile`
 * output on a fixture repo (acme-api: package.json + GitHub CI + .cursor/ +
 * .claude/) — commands and results are real; paths are shown POSIX-style and
 * timing is scripted for readability.
 *
 * Usage:
 *   node scripts/demo/make-poster-gif.js          # writes .cast + .gif
 *
 * Requires `agg` (https://github.com/asciinema/agg) on PATH for the GIF step;
 * without it the script still writes the .cast and prints the agg command.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// ── palette (matches the CLI's real escape codes) ──────────────────────────
const G = '\u001b[32m';   // green
const C = '\u001b[36m';   // cyan
const D = '\u001b[2m';    // dim
const B = '\u001b[1m';    // bold
const R = '\u001b[0m';    // reset

const events = [];
let t = 0.6;

function out(s, dt = 0) {
  t += dt;
  events.push([Number(t.toFixed(3)), 'o', s]);
}

function type(cmd, { perChar = 0.042, settle = 0.5 } = {}) {
  out(`${D}$${R} `, 0.0);
  for (const ch of cmd) out(ch, perChar);
  out('\r\n', settle);
}

function lines(rows, { perLine = 0.09, before = 0.25 } = {}) {
  t += before;
  for (const row of rows) out(row + '\r\n', perLine);
}

// ── the demo ────────────────────────────────────────────────────────────────
out(`${D}# your repo: CI, Cursor, Claude Code — and zero shared agent rules${R}\r\n`, 0.2);
out('\r\n', 0.7);

type('npx @whitehatd/crag analyze');
lines([
  '',
  '  Analyzing acme-api...',
  '',
  '  → package.json       node',
  '  → .github/workflows/  3 commands parsed',
  `  ${G}✓${R} 6 quality gates extracted`,
  `  ${G}✓${R} Generated .claude/governance.md`,
  '',
]);
t += 1.1;

type('crag compile');
lines([
  '',
  `  ${C}detected${R} (repo scan → .crag/config.json): agents-md, claude, cursor, github`,
  '',
  '  Compiling governance.md → agents-md, claude, cursor, github',
  '',
  `  ${G}✓${R} AGENTS.md                      ${D}canonical — every agent reads this${R}`,
  `  ${G}✓${R} CLAUDE.md ${D}(→ AGENTS.md)${R}        ${D}3-line import, zero duplication${R}`,
  `  ${G}✓${R} .cursor/rules/governance.mdc   ${D}only what AGENTS.md can't express${R}`,
  `  ${G}✓${R} .github/workflows/gates.yml    ${D}your gates, enforced in CI${R}`,
  '',
  '  Done. Governance is now executable infrastructure.',
  '',
]);
t += 1.2;

out(`  ${B}One source of truth. Every agent. Nothing drifts.${R}\r\n`, 0.3);
out(`  ${D}npx @whitehatd/crag  ·  crag.sh${R}\r\n`, 0.5);

// ── write asciicast v2 ──────────────────────────────────────────────────────
const header = {
  version: 2,
  width: 86,
  height: 24,
  title: 'crag — detect your AI tools, compile one source of truth',
  env: { TERM: 'xterm-256color', SHELL: '/bin/bash' },
};

const repoRoot = path.join(__dirname, '..', '..');
const castPath = path.join(repoRoot, 'assets', 'poster-demo.cast');
const gifPath = path.join(repoRoot, 'assets', 'poster-demo.gif');

const cast = [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n';
fs.writeFileSync(castPath, cast);
console.log(`wrote ${path.relative(repoRoot, castPath)} (${events.length} events, ${t.toFixed(1)}s)`);

// ── render GIF via agg ──────────────────────────────────────────────────────
const aggArgs = [
  castPath, gifPath,
  '--font-size', '16',
  '--line-height', '1.5',
  '--theme', 'dracula',
  '--last-frame-duration', '4',
];
const res = spawnSync('agg', aggArgs, { stdio: 'inherit' });
if (res.error || res.status !== 0) {
  console.log('\nagg not available or failed — render manually with:');
  console.log(`  agg ${aggArgs.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}`);
  process.exit(res.status || 0);
}
console.log(`wrote ${path.relative(repoRoot, gifPath)}`);

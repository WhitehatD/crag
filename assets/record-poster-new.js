'use strict';

/**
 * New poster GIFs for Reddit/HN/dev.to launch.
 *
 * 1. poster-sprawl    — "The File Sprawl Problem" (r/programming, r/webdev)
 * 2. poster-git-status — "git status After Compile" (r/cursor, r/ClaudeAI)
 * 3. poster-hook       — "The Hook Saves You" (r/devops)
 *
 * Design system: Catppuccin Mocha, 72 cols, font 32, fps 15, ~3-4s + 1.5s hold.
 *
 * Usage:
 *   node assets/record-poster-new.js
 *   cd assets
 *   agg poster-sprawl.cast poster-sprawl.gif --theme dracula --font-size 32 --line-height 1.4 --cols 72 --rows 18 --fps-cap 15 --last-frame-duration 1.5
 *   agg poster-git-status.cast poster-git-status.gif --theme dracula --font-size 32 --line-height 1.4 --cols 72 --rows 19 --fps-cap 15 --last-frame-duration 1.5
 *   agg poster-hook.cast poster-hook.gif --theme dracula --font-size 32 --line-height 1.4 --cols 72 --rows 16 --fps-cap 15 --last-frame-duration 1.5
 */

const fs = require('fs');
const path = require('path');

const G = '\x1b[32m'; const R = '\x1b[31m'; const Y = '\x1b[33m';
const C = '\x1b[36m'; const B = '\x1b[1m';  const D = '\x1b[2m';
const X = '\x1b[0m';

function makeCast(events, W, H) {
  return JSON.stringify({
    version: 2, width: W, height: H,
    timestamp: Math.floor(Date.now() / 1000),
    env: { SHELL: '/bin/bash', TERM: 'xterm-256color' },
    theme: {
      fg: '#cdd6f4', bg: '#1e1e2e',
      palette: '#45475a:#f38ba8:#a6e3a1:#f9e2af:#89b4fa:#f5c2e7:#94e2d5:#bac2de:#585b70:#f38ba8:#a6e3a1:#f9e2af:#89b4fa:#f5c2e7:#94e2d5:#a6adc8',
    },
  }) + '\n' + events.map(e => JSON.stringify(e)).join('\n') + '\n';
}

function ln(e, t, text, d) {
  e.push([t, 'o', text + '\r\n']);
  return t + d;
}

function pad(str, len) {
  const vis = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  return str + ' '.repeat(Math.max(0, len - vis));
}


// ========================================================================
// 1. SPRAWL — "6 files. 6 formats. None agree."
// ========================================================================
function buildSprawl() {
  const W = 72, H = 18;
  const e = []; let t = 0;

  t = ln(e, t, ` ${R}\u25cf${X} ${Y}\u25cf${X} ${G}\u25cf${X}  ${B}my-saas-app/${X} ${D}\u2014 AI agent configs${X}`, 0);
  t = ln(e, t, `${D}${'\u2500'.repeat(W - 2)}${X}`, 0.08);

  t = ln(e, t, `${D}\u276f${X} ls -la *rules* CLAUDE* AGENTS* GEMINI* copilot*`, 0.15);
  t = ln(e, t, '', 0.1);

  const files = [
    [`CLAUDE.md`,                   `${Y}3 months old${X}`,    `${D}mentions removed lint script${X}`],
    [`.cursor/rules/governance.mdc`, `${Y}5 months old${X}`,   `${D}says "use jest" (you use vitest)${X}`],
    [`AGENTS.md`,                   `${R}6 months old${X}`,    `${D}wrong test command${X}`],
    [`.github/copilot-instructions.md`, `${Y}2 months old${X}`, `${D}missing 3 gates${X}`],
    [`GEMINI.md`,                   `${R}never updated${X}`,   `${D}copy of old CLAUDE.md${X}`],
    [`.clinerules`,                 `${R}never updated${X}`,   `${D}references deleted tsconfig path${X}`],
  ];

  for (const [name, age, problem] of files) {
    t = ln(e, t, `  ${R}\u2717${X} ${pad(`${B}${name}${X}`, 38)}${age}`, 0.2);
    t = ln(e, t, `    ${problem}`, 0.1);
  }

  t = ln(e, t, '', 0.15);
  t = ln(e, t, `  ${R}${B}6 files. 6 formats. None agree.${X}`, 0.3);
  t = ln(e, t, `  ${D}Fix:${X} ${B}npx @whitehatd/crag${X} ${D}\u2014 one file, all 13 targets${X}`, 0.15);

  return { name: 'poster-sprawl', cast: makeCast(e, W, H), t, W, H };
}


// ========================================================================
// 2. GIT STATUS — "1 governance.md \u2192 13 files"
// ========================================================================
function buildGitStatus() {
  const W = 72, H = 19;
  const e = []; let t = 0;

  t = ln(e, t, ` ${R}\u25cf${X} ${Y}\u25cf${X} ${G}\u25cf${X}  ${D}\u276f${X} ${B}npx @whitehatd/crag${X} ${D}compile --target all${X}`, 0);
  t = ln(e, t, `${D}${'\u2500'.repeat(W - 2)}${X}`, 0.08);

  t = ln(e, t, `  ${G}\u2713${X} ${D}13 targets compiled in 47ms${X}`, 0.3);
  t = ln(e, t, '', 0.1);

  t = ln(e, t, `${D}\u276f${X} git status`, 0.15);
  t = ln(e, t, '', 0.1);
  t = ln(e, t, `${D}Untracked files:${X}`, 0.08);

  const files = [
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    '.amazonq/rules/governance.md',
    '.clinerules',
    '.continuerules',
    '.cursor/rules/governance.mdc',
    '.github/copilot-instructions.md',
    '.github/workflows/gates.yml',
    '.husky/pre-commit',
    '.pre-commit-config.yaml',
    '.rules',
    '.windsurf/rules/governance.md',
  ];

  for (const f of files) {
    t = ln(e, t, `  ${G}new file:   ${f}${X}`, 0.08);
  }

  t = ln(e, t, '', 0.12);
  t = ln(e, t, `  ${B}1${X} governance.md ${D}\u2192${X} ${B}13${X} files ${D}\u00b7 every AI agent + CI + hooks${X}`, 0.2);

  return { name: 'poster-git-status', cast: makeCast(e, W, H), t, W, H };
}


// ========================================================================
// 3. HOOK — "The Hook Saves You"
// ========================================================================
function buildHook() {
  const W = 72, H = 16;
  const e = []; let t = 0;

  t = ln(e, t, ` ${R}\u25cf${X} ${Y}\u25cf${X} ${G}\u25cf${X}  ${D}pre-commit drift gate${X}`, 0);
  t = ln(e, t, `${D}${'\u2500'.repeat(W - 2)}${X}`, 0.08);

  // Attempt 1: blocked
  t = ln(e, t, `${D}\u276f${X} git commit -m "feat: add OAuth provider"`, 0.15);
  t = ln(e, t, `  ${D}Running crag pre-commit hook...${X}`, 0.25);
  t = ln(e, t, `  ${R}\u2717${X} ${R}${B}BLOCKED${X} ${D}\u2014 3 compiled configs are stale${X}`, 0.4);
  t = ln(e, t, `  ${D}  AGENTS.md \u00b7 .cursor/rules/ \u00b7 CLAUDE.md${X}`, 0.15);
  t = ln(e, t, '', 0.2);

  // Fix
  t = ln(e, t, `${D}\u276f${X} npx @whitehatd/crag compile --target all`, 0.15);
  t = ln(e, t, `  ${G}\u2713${X} ${D}13 targets recompiled in 52ms${X}`, 0.3);
  t = ln(e, t, '', 0.15);

  // Attempt 2: success
  t = ln(e, t, `${D}\u276f${X} git commit -m "feat: add OAuth provider"`, 0.15);
  t = ln(e, t, `  ${D}Running crag pre-commit hook...${X}`, 0.2);
  t = ln(e, t, `  ${G}\u2713${X} ${G}${B}All 13 targets in sync${X}`, 0.35);
  t = ln(e, t, `  ${G}\u2713${X} ${D}[master a1b2c3d] feat: add OAuth provider${X}`, 0.2);
  t = ln(e, t, `  ${D}Your agents never ship stale rules.${X}`, 0.15);

  return { name: 'poster-hook', cast: makeCast(e, W, H), t, W, H };
}


// ---- Generate ----
for (const gif of [buildSprawl(), buildGitStatus(), buildHook()]) {
  const castPath = path.resolve(__dirname, `${gif.name}.cast`);
  fs.writeFileSync(castPath, gif.cast);
  const total = gif.t + 1.5;
  console.log(`${gif.name}.cast: ${gif.W}x${gif.H}, content ${gif.t.toFixed(1)}s, total ~${total.toFixed(1)}s`);
}

console.log('\nConvert:');
console.log('  cd assets');
console.log('  agg poster-sprawl.cast poster-sprawl.gif --theme dracula --font-size 32 --line-height 1.4 --cols 72 --rows 18 --fps-cap 15 --last-frame-duration 1.5');
console.log('  agg poster-git-status.cast poster-git-status.gif --theme dracula --font-size 32 --line-height 1.4 --cols 72 --rows 19 --fps-cap 15 --last-frame-duration 1.5');
console.log('  agg poster-hook.cast poster-hook.gif --theme dracula --font-size 32 --line-height 1.4 --cols 72 --rows 16 --fps-cap 15 --last-frame-duration 1.5');

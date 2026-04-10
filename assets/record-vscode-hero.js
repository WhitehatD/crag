'use strict';

/**
 * VS Code marketplace hero GIF — synthetic, max 5s.
 *
 * Shows: `npx @whitehatd/crag` on a Next.js + TS project.
 * Ends on: "Generated governance.md · Compiled 13 targets in 60ms"
 *
 * Usage: node assets/record-vscode-hero.js
 * Then:  agg assets/vscode-hero.cast assets/vscode-hero.gif --theme dracula --font-size 28 --line-height 1.3 --cols 92 --rows 16 --fps-cap 30 --last-frame-duration 1.5
 */

const fs = require('fs');
const path = require('path');

const G = '\x1b[32m'; const Y = '\x1b[33m'; const R = '\x1b[31m';
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

const W = 92, H = 16;
const e = []; let t = 0;

// Title bar
t = ln(e, t, ` ${R}\u25cf${X} ${Y}\u25cf${X} ${G}\u25cf${X}`, 0);
t = ln(e, t, `${D}${'\u2500'.repeat(90)}${X}`, 0.06);

// Type command
t = ln(e, t, `${D}\u276f${X} npx @whitehatd/crag`, 0.15);
t = ln(e, t, '', 0.06);

// Scan phase
t = ln(e, t, `  ${D}\u2192${X} package.json       ${C}node${X} ${D}\u00b7${X} ${C}typescript${X}`, 0.1);
t = ln(e, t, `  ${D}\u2192${X} .github/workflows/  ${D}4 commands parsed${X}`, 0.08);
t = ln(e, t, `  ${G}\u2713${X} ${B}${Y}7${X} quality gates extracted`, 0.15);
t = ln(e, t, `  ${G}\u2713${X} Testing    ${D}vitest \u00b7 flat${X}`, 0.08);
t = ln(e, t, `  ${G}\u2713${X} Rules      ${D}5 anti-patterns${X}`, 0.08);
t = ln(e, t, '', 0.06);

// Summary — the payoff, held at the end
t = ln(e, t, `  ${B}crag${X} ${D}\u2014 auto-pilot${X}`, 0.12);
t = ln(e, t, '', 0.04);
t = ln(e, t, `  ${D}Stack${X}      node ${D}\u00b7${X} typescript`, 0.06);
t = ln(e, t, `  ${D}Gates${X}      4 ${D}(lint \u00b7 test \u00b7 build)${X}`, 0.06);
t = ln(e, t, `  ${G}\u2713${X} Generated  .claude/governance.md ${D}(63 lines)${X}`, 0.15);
t = ln(e, t, `  ${G}\u2713${X} ${B}Compiled   13 targets${X} ${D}in 60ms${X}`, 0.2);

const castFile = path.resolve(__dirname, 'vscode-hero.cast');
fs.writeFileSync(castFile, makeCast(e, W, H));
const total = t + 1.5;
console.log(`vscode-hero.cast: ${W}x${H}, content ${t.toFixed(1)}s, total ~${total.toFixed(1)}s`);

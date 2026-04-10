'use strict';

/**
 * VS Code marketplace audit GIF — synthetic, max 5s.
 *
 * Shows: `crag audit` with mixed stale/clean results.
 * Ends on: "5 stale · 1 drift — Fix: crag compile --target all"
 *
 * Usage: node assets/record-vscode-audit.js
 * Then:  agg assets/vscode-audit.cast assets/vscode-audit.gif --theme dracula --font-size 28 --line-height 1.3 --cols 92 --rows 20 --fps-cap 30 --last-frame-duration 1.5
 */

const fs = require('fs');
const path = require('path');

const G = '\x1b[32m'; const Y = '\x1b[33m'; const R = '\x1b[31m';
const D = '\x1b[2m';  const B = '\x1b[1m';  const X = '\x1b[0m';

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

const W = 92, H = 20;
const e = []; let t = 0;

// Title bar
t = ln(e, t, ` ${R}\u25cf${X} ${Y}\u25cf${X} ${G}\u25cf${X}`, 0);
t = ln(e, t, `${D}${'\u2500'.repeat(90)}${X}`, 0.06);

// Type command
t = ln(e, t, `${D}\u276f${X} npx @whitehatd/crag audit`, 0.12);
t = ln(e, t, '', 0.06);

t = ln(e, t, `  ${B}crag audit${X} ${D}\u2014 governance drift report${X}`, 0.12);
t = ln(e, t, '', 0.04);

// Compiled configs — mix of stale and in-sync
t = ln(e, t, `  ${D}Compiled configs${X}`, 0.06);
t = ln(e, t, `  ${R}\u2717${X} ${pad('AGENTS.md', 38)}${R}stale${X} ${D}\u2014 governance.md is newer${X}`, 0.15);
t = ln(e, t, `  ${R}\u2717${X} ${pad('.cursor/rules/governance.mdc', 38)}${R}stale${X} ${D}\u2014 governance.md is newer${X}`, 0.12);
t = ln(e, t, `  ${R}\u2717${X} ${pad('GEMINI.md', 38)}${R}stale${X} ${D}\u2014 governance.md is newer${X}`, 0.12);
t = ln(e, t, `  ${G}\u2713${X} ${pad('.github/workflows/gates.yml', 38)}${D}in sync${X}`, 0.05);
t = ln(e, t, `  ${G}\u2713${X} ${pad('.husky/pre-commit', 38)}${D}in sync${X}`, 0.05);
t = ln(e, t, `  ${G}\u2713${X} ${pad('CLAUDE.md', 38)}${D}in sync${X}`, 0.05);
t = ln(e, t, `  ${R}\u2717${X} ${pad('.clinerules', 38)}${R}stale${X} ${D}\u2014 governance.md is newer${X}`, 0.12);
t = ln(e, t, `  ${R}\u2717${X} ${pad('.continuerules', 38)}${R}stale${X} ${D}\u2014 governance.md is newer${X}`, 0.12);
t = ln(e, t, '', 0.04);

// Gate reality
t = ln(e, t, `  ${D}Gate reality${X}`, 0.06);
t = ln(e, t, `  ${R}\u2717${X} ${pad('npx tsc --noEmit', 38)}${R}tsc not in devDependencies${X}`, 0.15);
t = ln(e, t, '', 0.04);

// Summary — held at the end
t = ln(e, t, `  ${R}${B}5 stale \u00b7 1 drift${X}`, 0.18);
t = ln(e, t, `  ${D}Fix:${X} crag compile --target all ${D}\u2014 or \u2014${X} crag audit --fix`, 0.15);

const castFile = path.resolve(__dirname, 'vscode-audit.cast');
fs.writeFileSync(castFile, makeCast(e, W, H));
const total = t + 1.5;
console.log(`vscode-audit.cast: ${W}x${H}, content ${t.toFixed(1)}s, total ~${total.toFixed(1)}s`);

'use strict';

/**
 * VS Code marketplace compile GIF — synthetic, max 5s.
 *
 * Shows: `crag compile --target all` with 13 targets ticking.
 * Ends on: "13 files written · 47ms"
 *
 * Usage: node assets/record-vscode-compile.js
 * Then:  agg assets/vscode-compile.cast assets/vscode-compile.gif --theme dracula --font-size 28 --line-height 1.3 --cols 92 --rows 20 --fps-cap 30 --last-frame-duration 1.5
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
t = ln(e, t, `${D}\u276f${X} npx @whitehatd/crag compile --target all --verbose`, 0.12);
t = ln(e, t, '', 0.06);

// Targets cascade — fast ticks
const targets = [
  ['.github/workflows/gates.yml',   '775 B'],
  ['.husky/pre-commit',             '256 B'],
  ['.pre-commit-config.yaml',       '857 B'],
  ['AGENTS.md',                     '1.41 KB'],
  ['.cursor/rules/governance.mdc',  '647 B'],
  ['GEMINI.md',                     '650 B'],
  ['.github/copilot-instructions.md', '1.37 KB'],
  ['.clinerules',                   '1.28 KB'],
  ['.continuerules',                '1.37 KB'],
  ['.windsurf/rules/governance.md', '1.50 KB'],
  ['.rules',                        '1.42 KB'],
  ['.amazonq/rules/governance.md',  '1.46 KB'],
  ['CLAUDE.md',                     '1.17 KB'],
];

for (const [file, size] of targets) {
  t = ln(e, t, `  ${G}\u2713${X} ${pad(file, 38)}${D}${size}${X}`, 0.12);
}

// Summary — held at the end
t = ln(e, t, '', 0.08);
t = ln(e, t, `  ${B}13 files written${X} ${D}\u00b7 47ms \u00b7 governance is now executable infrastructure${X}`, 0.2);

const castFile = path.resolve(__dirname, 'vscode-compile.cast');
fs.writeFileSync(castFile, makeCast(e, W, H));
const total = t + 1.5;
console.log(`vscode-compile.cast: ${W}x${H}, content ${t.toFixed(1)}s, total ~${total.toFixed(1)}s`);

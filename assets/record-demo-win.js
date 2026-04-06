'use strict';

/**
 * Record crag demo as a GIF on Windows.
 *
 * 1. Captures `crag demo` output with per-line timestamps
 * 2. Writes an asciicast v2 file (.cast)
 * 3. Runs `agg` to convert .cast → .gif
 *
 * Usage: node assets/record-demo-win.js
 * Requires: agg binary at /tmp/agg-x86_64-pc-windows-msvc.exe
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cragBin = path.resolve(__dirname, '..', 'bin', 'crag.js');
const aggBin = path.join(os.tmpdir(), 'agg.exe');
const castFile = path.resolve(__dirname, 'demo.cast');
const gifFile = path.resolve(__dirname, 'demo.gif');

// Step 1: Simulate typing + run the demo
console.log('Recording crag demo...');

const typedCommand = 'npx @whitehatd/crag demo';
const result = spawnSync('node', [cragBin, 'demo'], {
  encoding: 'utf-8',
  env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const output = result.stdout || '';
const lines = output.split('\n');

// Step 2: Build asciicast v2 file
// Header
const width = 120;
const height = 24; // Fewer rows than output → natural scroll as lines appear
const header = JSON.stringify({
  version: 2,
  width,
  height,
  timestamp: Math.floor(Date.now() / 1000),
  env: { SHELL: '/bin/bash', TERM: 'xterm-256color' },
  theme: {
    fg: '#cdd6f4',
    bg: '#1e1e2e',
    palette: '#45475a:#f38ba8:#a6e3a1:#f9e2af:#89b4fa:#f5c2e7:#94e2d5:#bac2de:#585b70:#f38ba8:#a6e3a1:#f9e2af:#89b4fa:#f5c2e7:#94e2d5:#a6adc8',
  },
});

const events = [];
let t = 0;

// macOS-style title bar with traffic light dots
events.push([t, 'o', ' \x1b[31m\u25cf\x1b[0m \x1b[33m\u25cf\x1b[0m \x1b[32m\u25cf\x1b[0m\r\n']);
t += 0.1;
events.push([t, 'o', '\x1b[90m' + '\u2500'.repeat(118) + '\x1b[0m\r\n']);
t += 0.1;

// Typing animation: show prompt then type command
events.push([t, 'o', '> ']);
t += 0.3;

for (let i = 0; i < typedCommand.length; i++) {
  events.push([t, 'o', typedCommand[i]]);
  t += 0.035; // 35ms per character
}

t += 0.3; // pause after typing
events.push([t, 'o', '\r\n']);
t += 0.1;

// Output lines with premium scroll timing
for (const line of lines) {
  // Truncate long lines to fit terminal width (wrap looks messy in GIFs)
  const maxCol = width - 4;
  const trimmed = line.length > maxCol ? line.slice(0, maxCol - 1) + '\u2026' : line;
  if (line.trim() === '') {
    events.push([t, 'o', '\r\n']);
    t += 0.06;
  } else {
    events.push([t, 'o', trimmed + '\r\n']);
    // Pacing: steps appear with weight, proof lines build anticipation
    if (/crag demo/.test(line)) t += 0.5;          // title pause
    else if (/Project:|Stack:|CI:/.test(line)) t += 0.2;  // context lines
    else if (/\[\d\/\d\]/.test(line)) t += 0.25;   // each step lands
    else if (/What this proves/.test(line)) t += 0.4;  // section pause
    else if (/✓/.test(line)) t += 0.35;            // each proof builds
    else if (/Total:/.test(line)) t += 0.5;         // landing moment
    else if (/Try it/.test(line)) t += 0.3;         // CTA
    else t += 0.08;
  }
}

// Final hold — short, then loop restarts
t += 1.5;

// Write cast file
const castContent = header + '\n' + events.map(e => JSON.stringify(e)).join('\n') + '\n';
fs.writeFileSync(castFile, castContent);
console.log(`Written: ${castFile} (${events.length} events, ${t.toFixed(1)}s)`);

// Step 3: Convert to GIF with agg
if (!fs.existsSync(aggBin)) {
  console.error(`agg not found at ${aggBin}`);
  console.error('Download: gh release download v1.6.0 --repo asciinema/agg --pattern "agg-x86_64-pc-windows-msvc.exe" --dir /tmp');
  process.exit(1);
}

console.log('Converting to GIF...');
const aggResult = spawnSync(aggBin, [
  castFile,
  gifFile,
  '--theme', 'dracula',
  '--font-size', '22',
  '--line-height', '1.3',
  '--speed', '1',
  '--fps-cap', '30',
  '--last-frame-duration', '2',
  '--cols', '120',
  '--rows', '24',
], {
  stdio: 'inherit',
  encoding: 'utf-8',
});

if (aggResult.status !== 0) {
  console.error('agg failed:', aggResult.stderr);
  process.exit(1);
}

const stat = fs.statSync(gifFile);
console.log(`Done: ${gifFile} (${(stat.size / 1024).toFixed(0)} KB)`);

'use strict';

/**
 * Record the VS Code marketplace compile GIF — multi-target compile.
 *
 * Shows: `crag compile --target all --verbose` with byte sizes.
 * 13 targets written, total size shown. "One file, 13 outputs."
 *
 * Usage: node assets/record-vscode-compile.js
 * Then:  agg assets/vscode-compile.cast assets/vscode-compile.gif --theme dracula --font-size 28 --line-height 1.3 --cols 92 --rows 22 --fps-cap 30 --last-frame-duration 3
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const cragBin = path.resolve(__dirname, '..', 'bin', 'crag.js');
const castFile = path.resolve(__dirname, 'vscode-compile.cast');

// Create a project with real gates
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-vscode-compile-'));
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
  name: 'my-saas-app',
  scripts: { test: 'vitest run', lint: 'eslint src/', build: 'next build', typecheck: 'tsc --noEmit' },
  devDependencies: { vitest: '^2.0.0', eslint: '^9.0.0', next: '^15.0.0', typescript: '^5.7.0' },
}, null, 2));
fs.writeFileSync(path.join(dir, 'tsconfig.json'), '{"compilerOptions":{"module":"esnext"}}');
fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export default {}');
fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), `name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build
`);

// Analyze first to create governance
execFileSync(process.execPath, [cragBin, 'analyze', '--no-install-skills'], {
  cwd: dir, encoding: 'utf-8', stdio: 'pipe',
  env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
});

// Capture `crag compile --target all --verbose`
let compileOutput;
try {
  compileOutput = execFileSync(process.execPath, [cragBin, 'compile', '--target', 'all', '--verbose'], {
    cwd: dir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
  });
} catch (err) {
  compileOutput = err.stdout || '';
}

const lines = compileOutput.split('\n');

// Build asciicast v2
const width = 92;
const height = 22;
const header = JSON.stringify({
  version: 2, width, height,
  timestamp: Math.floor(Date.now() / 1000),
  env: { SHELL: '/bin/bash', TERM: 'xterm-256color' },
  theme: {
    fg: '#cdd6f4', bg: '#1e1e2e',
    palette: '#45475a:#f38ba8:#a6e3a1:#f9e2af:#89b4fa:#f5c2e7:#94e2d5:#bac2de:#585b70:#f38ba8:#a6e3a1:#f9e2af:#89b4fa:#f5c2e7:#94e2d5:#a6adc8',
  },
});

const events = [];
let t = 0;

events.push([t, 'o', ' \x1b[31m\u25cf\x1b[0m \x1b[33m\u25cf\x1b[0m \x1b[32m\u25cf\x1b[0m\r\n']);
t += 0.1;
events.push([t, 'o', '\x1b[90m' + '\u2500'.repeat(90) + '\x1b[0m\r\n']);
t += 0.1;

const cmd = 'npx @whitehatd/crag compile --target all --verbose';
events.push([t, 'o', '> ']);
t += 0.3;
for (const ch of cmd) { events.push([t, 'o', ch]); t += 0.025; }
t += 0.3;
events.push([t, 'o', '\r\n']);
t += 0.2;

for (const line of lines) {
  const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
  const maxCol = width - 4;
  let trimmed = line;
  if (visible.length > maxCol) {
    let vis = 0, cut = 0;
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '\x1b') { while (j < line.length && line[j] !== 'm') j++; continue; }
      vis++;
      if (vis >= maxCol - 1) { cut = j + 1; break; }
    }
    trimmed = line.slice(0, cut) + '\x1b[0m\u2026';
  }

  if (line.trim() === '') {
    events.push([t, 'o', '\r\n']); t += 0.06;
  } else {
    events.push([t, 'o', trimmed + '\r\n']);
    // Steady cadence — each target ticks like a progress bar
    if (/Compiling/.test(line)) t += 0.4;
    else if (/\u2713/.test(line)) t += 0.2;    // each ✓ target gets a beat
    else if (/wrote/.test(line)) t += 0.2;
    else if (/Done/.test(line)) t += 0.5;
    else t += 0.08;
  }
}

t += 2.5;

fs.writeFileSync(castFile, header + '\n' + events.map(e => JSON.stringify(e)).join('\n') + '\n');
console.log(`Written: ${castFile} (${events.length} events, ${t.toFixed(1)}s)`);

try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

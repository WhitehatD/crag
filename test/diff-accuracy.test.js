'use strict';

// Regression tests for three false-positive drift bugs:
//   1. docker build -f <path> ignored the -f argument
//   2. make missing from monorepo subdir fallback
//   3. CI extractor promoted cross-repo checkout commands to gates

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkGateReality, clearCaches } = require('../src/commands/diff');
const { extractRunCommandsGitHubActions, detectForeignCheckout } = require('../src/analyze/ci-extractors');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n  commands/diff.js — accuracy regressions');

// Helper: create a temp repo, run a fn with its path, then clean up.
function withTempRepo(setup, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-diff-acc-'));
  try {
    setup(dir);
    clearCaches();
    body(dir);
  } finally {
    clearCaches();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- Bug 1: docker build -f <path> ---------------------------------------

test('docker build -f subdir/Dockerfile matches when that Dockerfile exists', () => {
  withTempRepo((dir) => {
    fs.mkdirSync(path.join(dir, 't', 'smoke'), { recursive: true });
    fs.writeFileSync(path.join(dir, 't', 'smoke', 'Dockerfile'), 'FROM alpine\n');
    // NOTE: no root Dockerfile — only the subdir one exists
  }, (dir) => {
    const result = checkGateReality(dir, 'docker build -f t/smoke/Dockerfile .');
    assert.strictEqual(result.status, 'match',
      `expected match, got ${result.status} (${result.detail})`);
  });
});

test('docker build -f subdir/Dockerfile drifts when that Dockerfile does NOT exist', () => {
  withTempRepo((_dir) => {
    // Empty repo — no Dockerfile anywhere
  }, (dir) => {
    const result = checkGateReality(dir, 'docker build -f t/smoke/Dockerfile .');
    assert.strictEqual(result.status, 'drift',
      `expected drift, got ${result.status} (${result.detail})`);
  });
});

test('docker build (no -f) still matches against root Dockerfile', () => {
  withTempRepo((dir) => {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM alpine\n');
  }, (dir) => {
    const result = checkGateReality(dir, 'docker build .');
    assert.strictEqual(result.status, 'match');
  });
});

// --- Bug 2: make missing from subdir fallback -----------------------------

test('make release matches when cli/Makefile exists in a subdir', () => {
  withTempRepo((dir) => {
    fs.mkdirSync(path.join(dir, 'cli'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'cli', 'Makefile'), 'release:\n\techo ok\n');
    // No root Makefile
  }, (dir) => {
    const result = checkGateReality(dir, 'make release');
    assert.strictEqual(result.status, 'match',
      `expected match, got ${result.status} (${result.detail})`);
  });
});

test('make test matches with lowercase makefile in a subdir', () => {
  withTempRepo((dir) => {
    fs.mkdirSync(path.join(dir, 'server'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'server', 'makefile'), 'test:\n\techo ok\n');
  }, (dir) => {
    const result = checkGateReality(dir, 'make test');
    assert.strictEqual(result.status, 'match');
  });
});

test('make drifts when no Makefile exists anywhere', () => {
  withTempRepo((_dir) => {
    // Empty repo
  }, (dir) => {
    const result = checkGateReality(dir, 'make release');
    assert.strictEqual(result.status, 'drift');
  });
});

// --- Bug 3: cross-repo CI checkout filtering ------------------------------

test('detectForeignCheckout: flags actions/checkout with repository field', () => {
  const jobLines = [
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          repository: prisma/prisma-engines',
    '      - run: cargo build --release',
  ];
  assert.strictEqual(detectForeignCheckout(jobLines), true);
});

test('detectForeignCheckout: ignores bare actions/checkout (same repo)', () => {
  const jobLines = [
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: npm test',
  ];
  assert.strictEqual(detectForeignCheckout(jobLines), false);
});

test('detectForeignCheckout: ignores actions/checkout with only non-repository with: fields', () => {
  const jobLines = [
    '  build:',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '        with:',
    '          fetch-depth: 0',
    '      - run: npm test',
  ];
  assert.strictEqual(detectForeignCheckout(jobLines), false);
});

test('extractRunCommandsGitHubActions: excludes run commands from jobs with foreign checkout', () => {
  const yaml = `name: build-engine-branch
on: push
jobs:
  build-engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: prisma/prisma-engines
      - run: cargo build --release
      - run: cargo test
  host-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
  const cmds = extractRunCommandsGitHubActions(yaml);
  assert.ok(!cmds.includes('cargo build --release'),
    `cargo build --release should be filtered out, got: ${cmds.join(' | ')}`);
  assert.ok(!cmds.includes('cargo test'),
    `cargo test should be filtered out, got: ${cmds.join(' | ')}`);
  assert.ok(cmds.includes('npm test'),
    `npm test should remain, got: ${cmds.join(' | ')}`);
});

test('extractRunCommandsGitHubActions: preserves commands from jobs without foreign checkout', () => {
  const yaml = `name: ci
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
      - run: npm run lint
`;
  const cmds = extractRunCommandsGitHubActions(yaml);
  assert.ok(cmds.includes('npm test'));
  assert.ok(cmds.includes('npm run lint'));
});

test('extractRunCommandsGitHubActions: falls back to simple extraction with no jobs: section', () => {
  // Degenerate input — no jobs: key. Should still return any run: commands we can find.
  const yaml = `steps:
  - run: npm test
`;
  const cmds = extractRunCommandsGitHubActions(yaml);
  assert.ok(cmds.includes('npm test'));
});

'use strict';

const assert = require('assert');
const {
  extractMakeTargets,
  extractTaskfileTargets,
  extractJustfileTargets,
} = require('../src/analyze/task-runners');

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

console.log('\n  analyze/task-runners.js');

// --- Makefile ---
test('extractMakeTargets: .PHONY targets', () => {
  const content = `.PHONY: test lint build clean
test:
\tgo test ./...
lint:
\tgolangci-lint run
build:
\tgo build ./...`;
  const targets = extractMakeTargets(content);
  assert.ok(targets.includes('test'));
  assert.ok(targets.includes('lint'));
  assert.ok(targets.includes('build'));
});

test('extractMakeTargets: target definitions at column 0', () => {
  const content = `test:\n\tcargo test\nlint:\n\tcargo clippy`;
  const targets = extractMakeTargets(content);
  assert.ok(targets.includes('test'));
  assert.ok(targets.includes('lint'));
});

test('extractMakeTargets: filters non-gate targets', () => {
  const content = `.PHONY: install docs release test\ninstall:\n\techo install`;
  const targets = extractMakeTargets(content);
  assert.ok(targets.includes('test'));
  assert.ok(!targets.includes('install'));
  assert.ok(!targets.includes('release'));
});

test('extractMakeTargets: skips variable assignments', () => {
  const content = `PREFIX = /usr/local\ntest:\n\techo test`;
  const targets = extractMakeTargets(content);
  assert.ok(targets.includes('test'));
  assert.ok(!targets.includes('PREFIX'));
});

// --- Taskfile ---
test('extractTaskfileTargets: basic tasks', () => {
  const content = `version: '3'
tasks:
  test:
    cmds:
      - go test ./...
  lint:
    cmds:
      - golangci-lint run
  deploy:
    cmds:
      - ./scripts/deploy.sh`;
  const targets = extractTaskfileTargets(content);
  assert.ok(targets.includes('test'));
  assert.ok(targets.includes('lint'));
  assert.ok(!targets.includes('deploy'));
});

// --- justfile ---
test('extractJustfileTargets: simple recipes', () => {
  const content = `test:
    cargo test

lint:
    cargo clippy

release:
    cargo build --release`;
  const targets = extractJustfileTargets(content);
  assert.ok(targets.includes('test'));
  assert.ok(targets.includes('lint'));
  assert.ok(!targets.includes('release'));
});

test('extractJustfileTargets: skips comments and indented lines', () => {
  const content = `# comment
test:
    echo hi
    # nested comment`;
  const targets = extractJustfileTargets(content);
  assert.deepStrictEqual(targets, ['test']);
});

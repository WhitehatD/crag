'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m\u2713\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m\u2717\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

const crag = path.join(__dirname, '..', 'bin', 'crag.js');

function run(args, opts = {}) {
  return execFileSync(process.execPath, [crag, ...args], {
    encoding: 'utf-8',
    timeout: 30000, // auto does analyze + compile so needs more time
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
    ...opts,
  });
}

function mkProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-auto-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const { looksLikeProject } = require('../src/commands/auto');

console.log('\n  commands/auto.js');

test('looksLikeProject: detects package.json', () => {
  const dir = mkProject({ 'package.json': '{}' });
  assert.ok(looksLikeProject(dir));
});

test('looksLikeProject: detects Cargo.toml', () => {
  const dir = mkProject({ 'Cargo.toml': '[package]' });
  assert.ok(looksLikeProject(dir));
});

test('looksLikeProject: returns false for empty dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-auto-empty-'));
  assert.ok(!looksLikeProject(dir));
});

test('auto: generates governance.md and compiles in project dir', () => {
  const dir = mkProject({
    'package.json': '{"name":"test-auto","scripts":{"test":"echo ok","lint":"echo lint"}}',
  });

  const out = run([], { cwd: dir });

  // Governance should exist
  assert.ok(fs.existsSync(path.join(dir, '.claude', 'governance.md')), 'governance.md should exist');
  // AGENTS.md should be compiled
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')), 'AGENTS.md should be compiled');
  // Output should contain summary markers
  assert.ok(out.includes('auto-pilot') || out.includes('Compiled'), 'should show summary');
});

test('auto: works with existing governance.md (compile only)', () => {
  const dir = mkProject({
    'package.json': '{"name":"test-existing","scripts":{"test":"echo ok"}}',
    '.claude/governance.md': `# Governance — existing
## Identity
- Project: existing
- Stack: node

## Gates (run in order, stop on failure)
### Test
- npm run test
`,
  });

  const out = run([], { cwd: dir });
  assert.ok(out.includes('Governance:') || out.includes('auto-pilot'), 'should show existing governance');
  assert.ok(fs.existsSync(path.join(dir, 'AGENTS.md')), 'should still compile');
});

test('auto: no-args in non-project dir shows help', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-auto-noproject-'));
  const out = run([], { cwd: dir });
  assert.ok(out.includes('Usage'), 'should show help in non-project dir');
});

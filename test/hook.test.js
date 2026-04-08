'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { findGitDir, HOOK_MARKER, generateHookScript } = require('../src/commands/hook');

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
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CRAG_NO_UPDATE_CHECK: '1' },
    ...opts,
  });
}

function mkGitProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-hook-'));
  // Create .git directory structure
  const gitDir = path.join(dir, '.git');
  fs.mkdirSync(path.join(gitDir, 'hooks'), { recursive: true });
  // Minimal git dir structure
  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

console.log('\n  commands/hook.js');

test('findGitDir: finds .git in current dir', () => {
  const dir = mkGitProject({});
  const gitDir = findGitDir(dir);
  assert.ok(gitDir, 'should find .git');
  assert.ok(gitDir.endsWith('.git'));
});

test('findGitDir: returns null for non-git dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-hook-nogit-'));
  const gitDir = findGitDir(dir);
  assert.strictEqual(gitDir, null);
});

test('generateHookScript: contains marker', () => {
  const script = generateHookScript(false);
  assert.ok(script.includes(HOOK_MARKER));
});

test('generateHookScript: contains governance.md check', () => {
  const script = generateHookScript(false);
  assert.ok(script.includes('governance.md'));
  assert.ok(script.includes('git diff --cached'));
});

test('generateHookScript: drift gate adds audit', () => {
  const script = generateHookScript(true);
  assert.ok(script.includes('crag audit'));
  assert.ok(script.includes('DRIFT_EXIT'));
});

test('generateHookScript: no drift gate omits audit', () => {
  const script = generateHookScript(false);
  assert.ok(!script.includes('crag audit'));
});

test('hook install: creates pre-commit hook', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  run(['hook', 'install'], { cwd: dir });

  const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit');
  assert.ok(fs.existsSync(hookPath), 'hook should exist');
  const content = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(content.includes(HOOK_MARKER), 'hook should have crag marker');
});

test('hook install --drift-gate: includes drift check', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  run(['hook', 'install', '--drift-gate'], { cwd: dir });

  const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit');
  const content = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(content.includes('crag audit'), 'should include drift gate');
});

test('hook install: refuses to overwrite non-crag hook without --force', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  // Write a non-crag hook
  const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom hook"');

  try {
    run(['hook', 'install'], { cwd: dir });
    assert.fail('should have failed');
  } catch (err) {
    assert.ok(err.status !== 0);
  }
});

test('hook install --force: overwrites non-crag hook', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, '#!/bin/sh\necho "custom hook"');

  run(['hook', 'install', '--force'], { cwd: dir });
  const content = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(content.includes(HOOK_MARKER), 'should be crag hook after --force');
});

test('hook install: overwrites existing crag hook without --force', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  // Install once
  run(['hook', 'install'], { cwd: dir });
  // Install again (should succeed without --force)
  run(['hook', 'install', '--drift-gate'], { cwd: dir });
  const hookPath = path.join(dir, '.git', 'hooks', 'pre-commit');
  const content = fs.readFileSync(hookPath, 'utf-8');
  assert.ok(content.includes('crag audit'), 'second install should update');
});

test('hook uninstall: removes crag hook', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  run(['hook', 'install'], { cwd: dir });
  run(['hook', 'uninstall'], { cwd: dir });
  assert.ok(!fs.existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')));
});

test('hook status: reports installed', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  run(['hook', 'install'], { cwd: dir });
  const out = run(['hook', 'status'], { cwd: dir });
  assert.ok(out.includes('Installed by crag'));
});

test('hook status: reports not installed', () => {
  const dir = mkGitProject({ 'package.json': '{}' });
  const out = run(['hook', 'status'], { cwd: dir });
  assert.ok(out.includes('No hook installed') || out.includes('not installed'));
});

test('help text mentions crag hook', () => {
  const out = run(['help']);
  assert.ok(out.includes('crag hook'));
});

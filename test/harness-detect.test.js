'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  staticSignals, detectTargets, resolveTargets, readConfig, isCragGenerated,
} = require('../src/compile/detect');

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-hdetect-test-'));
  const origLog = console.log;
  console.log = () => {};
  try { fn(dir); }
  finally {
    console.log = origLog;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function touch(dir, rel, content = '') {
  const abs = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

console.log('\n  harness detect — static signals');

test('detects a tool-owned dir signal (.cursor/)', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, '.cursor'));
    const { toolOwned } = staticSignals(dir);
    assert.ok(toolOwned.has('cursor'), 'should detect cursor from .cursor/');
  });
});

test('a crag-generated file is NOT a signal (no feedback loop)', () => {
  withTempDir((dir) => {
    touch(dir, '.clinerules', '# Cline\n> GENERATED MIRROR of AGENTS.md by [crag]\n');
    const { toolOwned } = staticSignals(dir);
    assert.ok(!toolOwned.has('cline'), 'crag-generated .clinerules must not count');
  });
});

test('a user-authored .clinerules IS a signal', () => {
  withTempDir((dir) => {
    touch(dir, '.clinerules', '# my own cline rules\ndo the thing\n');
    const { toolOwned } = staticSignals(dir);
    assert.ok(toolOwned.has('cline'), 'user .clinerules should count');
  });
});

test('isCragGenerated recognizes crag markers', () => {
  withTempDir((dir) => {
    touch(dir, 'a.md', 'x\n<!-- crag:auto-start -->\n');
    touch(dir, 'b.md', 'plain user content\n');
    assert.ok(isCragGenerated(path.join(dir, 'a.md')));
    assert.ok(!isCragGenerated(path.join(dir, 'b.md')));
  });
});

console.log('\n  harness detect — detectTargets');

test('always includes canonical agents-md', () => {
  withTempDir((dir) => {
    const { targets } = detectTargets(dir);
    assert.ok(targets.includes('agents-md'), 'agents-md is always compiled');
  });
});

test('an empty repo detects only agents-md', () => {
  withTempDir((dir) => {
    const { targets } = detectTargets(dir);
    assert.deepStrictEqual(targets, ['agents-md']);
  });
});

test('a repo with .windsurf/ + .github/copilot-instructions.md detects both', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, '.windsurf'));
    touch(dir, '.github/copilot-instructions.md', '# user copilot rules\n');
    const { targets } = detectTargets(dir);
    assert.ok(targets.includes('windsurf'));
    assert.ok(targets.includes('copilot'));
  });
});

console.log('\n  harness detect — resolveTargets persistence');

test('first resolve detects + persists to .crag/config.json', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, '.cursor'));
    const res = resolveTargets(dir);
    assert.strictEqual(res.source, 'detected');
    const cfg = readConfig(dir);
    assert.ok(cfg && Array.isArray(cfg.targets), 'config persisted');
    assert.ok(cfg.targets.includes('cursor'));
  });
});

test('second resolve reads config (authoritative, reproducible)', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, '.cursor'));
    resolveTargets(dir);                 // seed
    fs.rmSync(path.join(dir, '.cursor'), { recursive: true, force: true });
    const res = resolveTargets(dir);
    assert.strictEqual(res.source, 'config');
    assert.ok(res.targets.includes('cursor'), 'config remains authoritative');
  });
});

test('--refresh re-detects, ignoring stale config', () => {
  withTempDir((dir) => {
    fs.mkdirSync(path.join(dir, '.cursor'));
    resolveTargets(dir);
    fs.rmSync(path.join(dir, '.cursor'), { recursive: true, force: true });
    const res = resolveTargets(dir, { refresh: true });
    assert.strictEqual(res.source, 'detected');
    assert.ok(!res.targets.includes('cursor'), 'refresh drops the removed tool');
  });
});

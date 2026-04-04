'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { expandGlobs, enrichMember } = require('../src/workspace/enumerate');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-enum-test-'));
  try { fn(dir); }
  finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

console.log('\n  workspace/enumerate.js');

test('expandGlobs expands dir/* pattern', () => {
  withTempDir((root) => {
    fs.mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages', 'b'), { recursive: true });
    const members = expandGlobs(root, ['packages/*']);
    assert.strictEqual(members.length, 2);
    assert.ok(members.some(m => m.name === 'a'));
    assert.ok(members.some(m => m.name === 'b'));
  });
});

test('expandGlobs ignores dotfiles and node_modules', () => {
  withTempDir((root) => {
    fs.mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages', '.hidden'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages', 'node_modules'), { recursive: true });
    const members = expandGlobs(root, ['packages/*']);
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].name, 'a');
  });
});

test('expandGlobs rejects parent-traversal patterns', () => {
  withTempDir((root) => {
    const members = expandGlobs(root, ['../../../etc']);
    assert.strictEqual(members.length, 0);
  });
});

test('expandGlobs respects negation patterns', () => {
  withTempDir((root) => {
    fs.mkdirSync(path.join(root, 'packages', 'keep'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages', 'skip'), { recursive: true });
    const members = expandGlobs(root, ['packages/*', '!packages/skip']);
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].name, 'keep');
  });
});

test('expandGlobs handles exact paths (no wildcard)', () => {
  withTempDir((root) => {
    fs.mkdirSync(path.join(root, 'backend'));
    const members = expandGlobs(root, ['backend']);
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].name, 'backend');
  });
});

test('expandGlobs deduplicates overlapping patterns', () => {
  withTempDir((root) => {
    fs.mkdirSync(path.join(root, 'packages', 'a'), { recursive: true });
    const members = expandGlobs(root, ['packages/*', 'packages/*']);
    assert.strictEqual(members.length, 1);
  });
});

test('expandGlobs returns empty for missing directory', () => {
  withTempDir((root) => {
    const members = expandGlobs(root, ['nonexistent/*']);
    assert.deepStrictEqual(members, []);
  });
});

test('enrichMember detects node stack', () => {
  withTempDir((root) => {
    const memberPath = path.join(root, 'api');
    fs.mkdirSync(memberPath);
    fs.writeFileSync(path.join(memberPath, 'package.json'), '{}');
    const enriched = enrichMember(root, { name: 'api', path: memberPath });
    assert.ok(enriched.stack.includes('node'));
    assert.strictEqual(enriched.hasGovernance, false);
    assert.strictEqual(enriched.hasGit, false);
  });
});

test('enrichMember detects polyglot stack', () => {
  withTempDir((root) => {
    const memberPath = path.join(root, 'svc');
    fs.mkdirSync(memberPath);
    fs.writeFileSync(path.join(memberPath, 'package.json'), '{}');
    fs.writeFileSync(path.join(memberPath, 'Cargo.toml'), '');
    fs.writeFileSync(path.join(memberPath, 'Dockerfile'), '');
    const enriched = enrichMember(root, { name: 'svc', path: memberPath });
    assert.ok(enriched.stack.includes('node'));
    assert.ok(enriched.stack.includes('rust'));
    assert.ok(enriched.stack.includes('docker'));
  });
});

test('enrichMember flags hasGovernance when .claude/governance.md exists', () => {
  withTempDir((root) => {
    const memberPath = path.join(root, 'api');
    fs.mkdirSync(path.join(memberPath, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(memberPath, '.claude', 'governance.md'), '# governance');
    const enriched = enrichMember(root, { name: 'api', path: memberPath });
    assert.strictEqual(enriched.hasGovernance, true);
  });
});

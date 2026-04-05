'use strict';

const assert = require('assert');
const {
  detectBranchStrategy,
  countFeatureBranches,
  classifyGitBranchStrategy,
  FEATURE_PREFIXES,
} = require('../src/governance/drift-utils');

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

console.log('\n  governance/drift-utils.js');

// --- detectBranchStrategy ---

test('detectBranchStrategy: trunk-based in section', () => {
  const md = `## Branch Strategy\n- Trunk-based development\n- Conventional commits\n`;
  assert.strictEqual(detectBranchStrategy(md), 'trunk-based');
});

test('detectBranchStrategy: feature-branches in section', () => {
  const md = `## Branch Strategy\n- Feature branches: feat/, fix/, docs/\n`;
  assert.strictEqual(detectBranchStrategy(md), 'feature-branches');
});

test('detectBranchStrategy: workspace-wrapper case — trunk first, features later', () => {
  const md = `## Branch Strategy
- Trunk-based at the workspace wrapper (no feature branches at root)
- Each sub-repo uses feature branches: feat/, fix/
`;
  assert.strictEqual(detectBranchStrategy(md), 'trunk-based');
});

test('detectBranchStrategy: scoped to section — ignores prose elsewhere', () => {
  const md = `# Governance
Preamble mentions feature branches as an antipattern.
## Branch Strategy
- Trunk-based development
`;
  assert.strictEqual(detectBranchStrategy(md), 'trunk-based');
});

test('detectBranchStrategy: empty/null/undefined → null', () => {
  assert.strictEqual(detectBranchStrategy(''), null);
  assert.strictEqual(detectBranchStrategy(null), null);
  assert.strictEqual(detectBranchStrategy(undefined), null);
});

test('detectBranchStrategy: neither keyword → null', () => {
  assert.strictEqual(detectBranchStrategy(`## Branch Strategy\n- whatever\n`), null);
});

// --- countFeatureBranches ---

test('countFeatureBranches: only main → []', () => {
  assert.deepStrictEqual(countFeatureBranches('main\n'), []);
});

test('countFeatureBranches: remote-only origin/feat/* counts', () => {
  const out = [
    'main',
    'origin/main',
    'origin/HEAD',
    'origin/feat/billing',
    'origin/fix/backup-oom',
  ].join('\n');
  assert.deepStrictEqual(
    countFeatureBranches(out).sort(),
    ['feat/billing', 'fix/backup-oom']
  );
});

test('countFeatureBranches: local + remote dedupe', () => {
  const out = ['main', 'feat/login', 'origin/main', 'origin/feat/login'].join('\n');
  assert.deepStrictEqual(countFeatureBranches(out), ['feat/login']);
});

test('countFeatureBranches: custom remote names', () => {
  const out = 'upstream/feat/x\nfork/fix/y\nmain\n';
  assert.deepStrictEqual(countFeatureBranches(out).sort(), ['feat/x', 'fix/y']);
});

test('countFeatureBranches: handles all prefixes', () => {
  const out = FEATURE_PREFIXES.map(p => `${p}/x`).concat('main', 'random/y').join('\n');
  assert.strictEqual(countFeatureBranches(out).length, FEATURE_PREFIXES.length);
});

test('countFeatureBranches: empty/null/undefined → []', () => {
  assert.deepStrictEqual(countFeatureBranches(''), []);
  assert.deepStrictEqual(countFeatureBranches(null), []);
  assert.deepStrictEqual(countFeatureBranches(undefined), []);
});

// --- classifyGitBranchStrategy ---

test('classifyGitBranchStrategy: 3+ features → feature-branches', () => {
  const out = 'main\nfeat/a\nfeat/b\nfeat/c\n';
  assert.strictEqual(classifyGitBranchStrategy(out), 'feature-branches');
});

test('classifyGitBranchStrategy: 0-2 features → trunk-based', () => {
  assert.strictEqual(classifyGitBranchStrategy('main\n'), 'trunk-based');
  assert.strictEqual(classifyGitBranchStrategy('main\nfeat/a\n'), 'trunk-based');
  assert.strictEqual(classifyGitBranchStrategy('main\nfeat/a\nfeat/b\n'), 'trunk-based');
});

test('classifyGitBranchStrategy: remote-only feat branches still count', () => {
  // Real hosting-platform-backend case: no local feature branches,
  // 23+ remote feat/fix branches → should classify as feature-branches.
  const out = [
    'main',
    'origin/main',
    'origin/HEAD',
    'origin/feat/a',
    'origin/feat/b',
    'origin/fix/c',
    'origin/fix/d',
  ].join('\n');
  assert.strictEqual(classifyGitBranchStrategy(out), 'feature-branches');
});

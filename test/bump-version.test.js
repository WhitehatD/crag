'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { bumpSemver, bumpSkillVersions } = require('../scripts/bump-version');

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

function mkSkillsDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-bump-'));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

console.log('\n  scripts/bump-version.js');

// --- bumpSemver ---

test('bumpSemver: patch', () => {
  assert.strictEqual(bumpSemver('0.2.7', 'patch'), '0.2.8');
});

test('bumpSemver: minor resets patch', () => {
  assert.strictEqual(bumpSemver('0.2.7', 'minor'), '0.3.0');
});

test('bumpSemver: major resets minor and patch', () => {
  assert.strictEqual(bumpSemver('1.2.3', 'major'), '2.0.0');
});

test('bumpSemver: invalid version throws', () => {
  assert.throws(() => bumpSemver('not-a-version', 'patch'), /invalid current version/);
});

test('bumpSemver: unknown kind throws', () => {
  assert.throws(() => bumpSemver('1.0.0', 'sideways'), /unknown bump kind/);
});

// --- bumpSkillVersions ---

test('bumpSkillVersions: rewrites version line in frontmatter', () => {
  const dir = mkSkillsDir({
    'pre-start-context.md': `---
name: pre-start-context
version: 0.2.2
source_hash: abc123
description: test skill
---

body content here
`,
    'post-start-validation.md': `---
name: post-start-validation
version: 0.2.2
source_hash: def456
description: another test skill
---

more body content
`,
  });

  const changed = bumpSkillVersions('0.2.7', dir);
  assert.deepStrictEqual(changed.sort(), ['post-start-validation.md', 'pre-start-context.md']);

  const pre = fs.readFileSync(path.join(dir, 'pre-start-context.md'), 'utf-8');
  assert.ok(pre.includes('version: 0.2.7'));
  assert.ok(!pre.includes('version: 0.2.2'));
  // Source hash must NOT be touched — that's sync-skill-hashes.js's job.
  assert.ok(pre.includes('source_hash: abc123'));
  // Body must not be touched.
  assert.ok(pre.includes('body content here'));

  const post = fs.readFileSync(path.join(dir, 'post-start-validation.md'), 'utf-8');
  assert.ok(post.includes('version: 0.2.7'));
  assert.ok(post.includes('source_hash: def456'));
});

test('bumpSkillVersions: leaves body `version: X.Y.Z` text untouched', () => {
  // A skill whose markdown body mentions "version: 0.2.0" in prose should
  // not have that prose rewritten — only the frontmatter block.
  const dir = mkSkillsDir({
    'skill.md': `---
name: skill
version: 0.2.2
---

# Heading

Some paragraph that mentions version: 0.2.0 in prose as an example.
`,
  });

  bumpSkillVersions('0.2.7', dir);
  const updated = fs.readFileSync(path.join(dir, 'skill.md'), 'utf-8');

  // Frontmatter line changed
  assert.ok(/^version: 0\.2\.7$/m.test(updated));
  // Body prose preserved
  assert.ok(updated.includes('version: 0.2.0 in prose'));
});

test('bumpSkillVersions: skip files without frontmatter', () => {
  const dir = mkSkillsDir({
    'notes.md': '# just a markdown file\n\nno frontmatter.\n',
    'real-skill.md': `---
name: real-skill
version: 0.1.0
---
body
`,
  });

  const changed = bumpSkillVersions('0.2.7', dir);
  assert.deepStrictEqual(changed, ['real-skill.md']);

  const notes = fs.readFileSync(path.join(dir, 'notes.md'), 'utf-8');
  assert.ok(!notes.includes('version:'));
});

test('bumpSkillVersions: skip files whose frontmatter has no version field', () => {
  const dir = mkSkillsDir({
    'description-only.md': `---
name: description-only
description: no version field
---
body
`,
  });

  const changed = bumpSkillVersions('0.2.7', dir);
  assert.deepStrictEqual(changed, []);
});

test('bumpSkillVersions: returns [] for missing directory', () => {
  const changed = bumpSkillVersions('0.2.7', path.join(os.tmpdir(), 'nonexistent-' + Date.now()));
  assert.deepStrictEqual(changed, []);
});

test('bumpSkillVersions: idempotent — running twice with same version is a no-op second time', () => {
  const dir = mkSkillsDir({
    'skill.md': `---
name: skill
version: 0.2.2
---
body
`,
  });

  const first = bumpSkillVersions('0.2.7', dir);
  const second = bumpSkillVersions('0.2.7', dir);
  assert.strictEqual(first.length, 1);
  assert.strictEqual(second.length, 0);
});

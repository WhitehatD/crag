#!/usr/bin/env node
'use strict';

// Automatically recompute and update the `source_hash` field in every
// src/skills/*.md frontmatter whenever the skill body changes.
//
// Run manually:  node scripts/sync-skill-hashes.js
// Run in CI:     triggered by .github/workflows/sync-hashes.yml on any
//                change under src/skills/.
//
// Exits 0 if no changes were needed.
// Exits 0 if files were updated (prints a summary).
// Exits non-zero only on genuine errors.

const fs = require('fs');
const path = require('path');
const { computeHash, readFrontmatter, writeFrontmatter } = require('../src/update/integrity');

const SKILLS_DIR = path.join(__dirname, '..', 'src', 'skills');

function main() {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.error(`no skills directory at ${SKILLS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    console.log('no skill files found — nothing to sync');
    return;
  }

  const changed = [];

  for (const file of files) {
    const filePath = path.join(SKILLS_DIR, file);
    const parsed = readFrontmatter(filePath);
    if (!parsed) continue;

    const expectedHash = computeHash(parsed.body);
    const currentHash = parsed.source_hash;

    if (currentHash === expectedHash) {
      console.log(`  ✓ ${file} — hash is current (${expectedHash.substring(0, 12)}...)`);
      continue;
    }

    writeFrontmatter(filePath, { source_hash: expectedHash });
    changed.push({ file, from: currentHash || '(none)', to: expectedHash });
    console.log(`  ↑ ${file} — updated ${currentHash ? currentHash.substring(0, 12) : 'none'}... → ${expectedHash.substring(0, 12)}...`);
  }

  console.log('');
  if (changed.length === 0) {
    console.log(`all ${files.length} skill hashes are in sync`);
  } else {
    console.log(`updated ${changed.length} of ${files.length} skills`);
    if (process.env.GITHUB_OUTPUT) {
      const out = require('fs');
      out.appendFileSync(process.env.GITHUB_OUTPUT, `changed=true\n`);
      out.appendFileSync(process.env.GITHUB_OUTPUT, `count=${changed.length}\n`);
    }
  }
}

try {
  main();
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}

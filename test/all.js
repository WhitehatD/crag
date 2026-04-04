#!/usr/bin/env node
'use strict';

// Test runner — loads all test files and reports pass/fail.
// Uses Node's built-in assert, no dependencies.
//
// Usage:
//   node test/all.js            # run all test files
//   node test/all.js parse      # run only test files whose names contain "parse"
//   node test/all.js parse diff # multiple filters (OR)

const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const filters = process.argv.slice(2);

let testFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

if (filters.length > 0) {
  testFiles = testFiles.filter(f => filters.some(q => f.includes(q)));
  if (testFiles.length === 0) {
    console.error(`\n\x1b[31m✗ No test files match filter(s): ${filters.join(', ')}\x1b[0m\n`);
    process.exit(1);
  }
  console.log(`\nFilter: ${filters.join(', ')} — matched ${testFiles.length} file(s)`);
}

console.log(`\nRunning ${testFiles.length} test file(s)...`);

const start = Date.now();
for (const file of testFiles) {
  require(path.join(testDir, file));
}
const elapsed = Date.now() - start;

// Summary
if (process.exitCode === 1) {
  console.error(`\n\x1b[31m✗ Some tests failed\x1b[0m (${elapsed}ms)\n`);
  process.exit(1);
} else {
  console.log(`\n\x1b[32m✓ All tests passed\x1b[0m (${elapsed}ms)\n`);
}

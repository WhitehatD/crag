#!/usr/bin/env node
'use strict';

// Test runner — loads all test files and reports pass/fail.
// Uses Node's built-in assert, no dependencies.

const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const testFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

console.log(`\nRunning ${testFiles.length} test files...`);

for (const file of testFiles) {
  require(path.join(testDir, file));
}

// Summary
if (process.exitCode === 1) {
  console.error('\n\x1b[31m✗ Some tests failed\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\n\x1b[32m✓ All tests passed\x1b[0m\n');
}

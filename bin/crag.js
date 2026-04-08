#!/usr/bin/env node

'use strict';

const { run } = require('../src/cli');

const result = run(process.argv.slice(2));

// Cloud commands (login, sync, team) are async. Handle rejections.
if (result && typeof result.then === 'function') {
  result.catch(err => {
    console.error(`  \x1b[31m\u2717\x1b[0m ${err.message}`);
    process.exit(2);
  });
}

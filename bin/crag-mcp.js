#!/usr/bin/env node

'use strict';

const { start } = require('../src/mcp/server');

start().catch((err) => {
  process.stderr.write(`[crag-mcp] fatal: ${err.message}\n`);
  process.exit(1);
});

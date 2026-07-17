'use strict';

/**
 * `crag mcp` — starts the crag-mcp gateway server on stdio.
 *
 * Thin CLI wrapper around src/mcp/server.js, mirroring bin/crag-mcp.js so
 * both entry points (`crag mcp` and the standalone `crag-mcp` binary used
 * by `claude mcp add crag crag-mcp`) behave identically. This file lives in
 * src/commands/ alongside the other CLI subcommands but is NOT part of the
 * deterministic compile path — src/compile/ never imports it, and it never
 * imports anything from src/compile/.
 */

const { validateFlags } = require('../cli-args');

function mcp(args) {
  validateFlags('mcp', args, { boolean: [] });
  const { start } = require('../mcp/server');
  start().catch((err) => {
    process.stderr.write(`[crag-mcp] fatal: ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { mcp };

'use strict';

/**
 * src/distill/index.js — orchestrates `crag distill`.
 *
 * fetch (opt-in MCP, src/distill/fetch-principles.js)
 *   -> partition by scope (src/distill/render.js)
 *   -> render pure text per layer (src/distill/render.js)
 *   -> diff against on-disk .gen file, write (or report, in --check mode)
 *
 * This module is the only caller that combines the MCP fetch with a
 * filesystem write. It never touches .claude/governance.md — that's
 * composed separately, deterministically, by src/compile/compose.js,
 * which never imports anything under src/distill/ or src/mcp/.
 */

const fs = require('fs');
const { atomicWrite } = require('../compile/atomic-write');
const { layerPaths } = require('../governance/layer-paths');
const { fetchCompileEligiblePrinciples } = require('./fetch-principles');
const { partitionByLayer, renderGenFile } = require('./render');

function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Run distill against `opts.cwd` (defaults to process.cwd()).
 * `opts.check` — compute + report without writing (CI-safe, no side effects).
 *
 * Returns a plain result object (never throws for "not configured" or
 * "backend error" — those are reported states, not exceptions, so the CLI
 * layer can decide exit codes/formatting):
 *
 *   { configured: false, message }
 *   { configured: true, error, layers: [] }
 *   { configured: true, asOf, layers: [{ layer, path, principleCount, changed, wrote }] }
 */
async function runDistill(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const check = !!opts.check;

  const fetched = await fetchCompileEligiblePrinciples(cwd);

  if (!fetched.configured) {
    return {
      configured: false,
      message: 'memory federation is not configured (set CRAG_MEMORY_MCP or .crag/mcp.json) — crag distill is a no-op.',
    };
  }

  if (fetched.error) {
    return { configured: true, error: fetched.error, layers: [] };
  }

  const asOf = new Date().toISOString();
  const partitioned = partitionByLayer(fetched.principles);
  const paths = layerPaths(cwd);

  const plan = [
    { layer: 'user', path: paths.userGen, principles: partitioned.user },
    { layer: 'project', path: paths.projectGen, principles: partitioned.project },
  ];

  const layers = plan.map(({ layer, path: genPath, principles }) => {
    const rendered = renderGenFile(principles, { asOf });
    const existing = readIfExists(genPath);
    const changed = existing !== rendered;
    let wrote = false;
    if (!check && changed) {
      atomicWrite(genPath, rendered);
      wrote = true;
    }
    return {
      layer,
      path: genPath,
      principleCount: principles.length,
      existed: existing !== null,
      changed,
      wrote,
    };
  });

  return { configured: true, asOf, layers };
}

module.exports = { runDistill };

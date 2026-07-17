'use strict';

/**
 * `crag distill` — the governance back-edge (docs/closed-loop.md REV 2/5.1).
 *
 * Fetches compile-eligible principles from the configured memory backend
 * (crag-mcp's federated MemoryAdapter — opt-in via CRAG_MEMORY_MCP or
 * .crag/mcp.json) and renders them into MANAGED governance.gen.md files,
 * placed by scope: universal -> the user-layer file, project (or any other
 * scope) -> the project-layer file. `--check` computes the would-write
 * diff without touching disk (CI-safe).
 *
 * NOT part of the deterministic compile core: this command is the one
 * opt-in edge that talks to a backend over MCP. `crag compile` never
 * imports this file or anything under src/distill/.
 */

const { validateFlags } = require('../cli-args');
const { runDistill } = require('../distill');
const { EXIT_USER } = require('../cli-errors');

function formatLayer(l) {
  const rel = l.path;
  if (!l.changed) {
    return `  \x1b[90m○\x1b[0m ${rel} \x1b[2m(up to date, ${l.principleCount} principle(s))\x1b[0m`;
  }
  const verb = l.wrote ? '\x1b[32mwrote\x1b[0m' : '\x1b[36mwould write\x1b[0m';
  const state = l.existed ? 'changed' : 'new';
  return `  ${verb} ${rel} \x1b[2m(${state}, ${l.principleCount} principle(s))\x1b[0m`;
}

async function distill(args) {
  validateFlags('distill', args, { boolean: ['--check'] });
  const check = args.includes('--check');
  const cwd = process.cwd();

  const result = await runDistill({ cwd, check });

  if (!result.configured) {
    console.log(`\n  crag distill\n`);
    console.log(`  ${result.message}\n`);
    return;
  }

  if (result.error) {
    console.error(`\n  crag distill\n`);
    console.error(`  \x1b[31m✗\x1b[0m memory backend error: ${result.error}\n`);
    process.exit(EXIT_USER);
  }

  console.log(`\n  crag distill${check ? ' --check' : ''} — as of ${result.asOf}\n`);
  for (const l of result.layers) {
    console.log(formatLayer(l));
  }

  const anyChanged = result.layers.some((l) => l.changed);
  if (check) {
    console.log(anyChanged
      ? '\n  Would write changes above — run `crag distill` (without --check) to apply.\n'
      : '\n  Up to date — no changes.\n');
  } else {
    console.log(anyChanged
      ? '\n  Done. Review the .gen diff, then `crag compile` to recompose governance.md.\n'
      : '\n  Up to date — no changes.\n');
  }
}

module.exports = { distill };

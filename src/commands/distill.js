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

const fs = require('fs');
const path = require('path');
const { validateFlags } = require('../cli-args');
const { runDistill } = require('../distill');
const { atomicWrite } = require('../compile/atomic-write');
const { layerPaths, artifactPath } = require('../governance/layer-paths');
const { cliError, EXIT_USER } = require('../cli-errors');

/**
 * `crag distill --migrate` — one-shot opt-in to the composed model.
 * Copies an existing .claude/governance.md to .crag/governance.src.md so
 * the project starts composing from split sources. Non-destructive:
 * refuses if .crag/governance.src.md already exists.
 */
function migrate(cwd) {
  const src = artifactPath(cwd); // .claude/governance.md
  const dest = layerPaths(cwd).projectSrc; // .crag/governance.src.md
  if (!fs.existsSync(src)) {
    cliError('no .claude/governance.md to migrate. Run `crag analyze` or `crag init` first.', EXIT_USER);
  }
  if (fs.existsSync(dest)) {
    cliError(`.crag/governance.src.md already exists — refusing to overwrite. Edit it directly.`, EXIT_USER);
  }
  atomicWrite(dest, fs.readFileSync(src, 'utf-8'));
  console.log(`\n  crag distill --migrate\n`);
  console.log(`  \x1b[32m✓\x1b[0m copied ${path.relative(cwd, src)} → ${path.relative(cwd, dest)}`);
  console.log(`  This repo now composes governance from .crag/ sources.`);
  console.log(`  Next: \`crag distill\` to render principles, then \`crag compile\`.\n`);
}

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
  validateFlags('distill', args, { boolean: ['--check', '--migrate'] });
  const cwd = process.cwd();

  if (args.includes('--migrate')) {
    migrate(cwd);
    return;
  }

  const check = args.includes('--check');
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

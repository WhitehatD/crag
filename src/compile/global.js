'use strict';

/**
 * global.js — `crag compile --global` (machine-global user layer).
 *
 * Your cross-project engineering identity (commit style, "never force-push
 * main", safety baselines) lives ONCE in the user layer (~/.crag/
 * governance.src.md hand-authored + governance.gen.md distilled). It already
 * composes INTO every opted-in project. This command materializes it the OTHER
 * way — as machine-global agent config that governs the long tail of folders
 * you never set crag up in:
 *
 *   ~/.agents/AGENTS.md         canonical machine-global (the AGENTS.md standard)
 *   ~/.claude/CLAUDE.md         @-import satellite (Claude Code, the one holdout)
 *
 * SAFETY: a per-tool global file is written ONLY if it does not exist yet or is
 * already crag-managed. An unmarked hand-authored file (e.g. your existing
 * ~/.claude/CLAUDE.md) is SKIPPED, never overwritten — a machine-global file
 * governs every project on the machine, so the bar to touch it is higher than
 * a project-local satellite.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { parseGovernance } = require('../governance/parse');
const { composeGovernance } = require('./compose');
const { resolveHome } = require('../governance/layer-paths');
const { generateAgentsMd } = require('./agents-md');
const { renderSatellite } = require('./satellite');
const { TARGETS, GLOBAL_CANONICAL } = require('./targets');
const { isCragGenerated } = require('./detect');

function expandHome(p) {
  return p.startsWith('~/') ? path.join(resolveHome(), p.slice(2)) : p;
}

function compileGlobal(opts = {}) {
  const dryRun = !!opts.dryRun;
  const home = resolveHome();

  // Compose the user layer ALONE (no project). Returns null when neither
  // ~/.crag/governance.src.md nor .gen.md exists → clean no-op.
  const composed = composeGovernance(home, { scope: 'user' });
  if (!composed) {
    console.log('\n  crag compile --global\n');
    console.log('  Nothing to compile — no machine-global user layer found.');
    console.log('  Author ~/.crag/governance.src.md (your cross-project rules), or run');
    console.log('  `crag distill` in any repo to populate ~/.crag/governance.gen.md.\n');
    return { written: [], skipped: [], empty: true };
  }

  const parsed = parseGovernance(composed.content);
  if (!parsed.name) parsed.name = os.hostname() || 'machine-global';

  const agentsAbs = expandHome(GLOBAL_CANONICAL);      // ~/.agents/AGENTS.md
  const agentsDir = path.dirname(agentsAbs);
  const importRef = '@' + agentsAbs;

  const written = [];
  const skipped = [];

  console.log('\n  crag compile --global\n');
  console.log(`  source: ~/.crag/governance.{src,gen}.md → ${parsed.name}`);

  // Canonical machine-global AGENTS.md.
  if (dryRun) {
    console.log(`  \x1b[2mwould write\x1b[0m ${agentsAbs} (canonical)`);
  } else {
    generateAgentsMd(agentsDir, parsed);               // writes agentsDir/AGENTS.md
  }
  written.push(agentsAbs);

  // Per-tool global satellites (registry globalPath), safe-only.
  for (const t of TARGETS) {
    if (t.id === 'agents-md' || t.class !== 'satellite' || !t.globalPath) continue;
    const abs = expandHome(t.globalPath);
    if (fs.existsSync(abs) && !isCragGenerated(abs)) {
      console.log(`  \x1b[90m○\x1b[0m ${t.globalPath} \x1b[2m(${t.label}: hand-authored, not crag-managed — skipped)\x1b[0m`);
      skipped.push(abs);
      continue;
    }
    if (dryRun) {
      const how = t.agentsMd === 'import' ? '@AGENTS.md import' : 'mirror';
      console.log(`  \x1b[2mwould write\x1b[0m ${abs} (${how})`);
      written.push(abs);
      continue;
    }
    renderSatellite(t, parsed, { cwd: path.dirname(abs), agentsMdInRun: true, importRef });
    written.push(abs);
  }
  console.log();
  return { written, skipped, empty: false };
}

module.exports = { compileGlobal, expandHome };

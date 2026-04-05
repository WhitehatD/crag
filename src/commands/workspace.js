'use strict';

const fs = require('fs');
const path = require('path');
const { detectWorkspace } = require('../workspace/detect');
const { enumerateMembers } = require('../workspace/enumerate');
const { loadGovernanceHierarchy } = require('../workspace/governance');
const { validateFlags } = require('../cli-args');

/**
 * crag workspace — inspect the detected workspace.
 * Prints workspace type, root, all members with their stacks and governance status.
 */
function workspace(args) {
  validateFlags('workspace', args, { boolean: ['--json'] });
  const json = args.includes('--json');
  const cwd = process.cwd();

  const ws = detectWorkspace(cwd);

  if (ws.type === 'none') {
    if (json) {
      console.log(JSON.stringify({ type: 'none', root: ws.root, members: [] }, null, 2));
      return;
    }
    console.log(`\n  No workspace detected.`);
    console.log(`  Root: ${ws.root}`);
    console.log(`  crag works fine without a workspace — it just won't enumerate members.\n`);
    return;
  }

  const members = enumerateMembers(ws);
  const hierarchy = loadGovernanceHierarchy(ws, members);

  if (json) {
    const output = {
      type: ws.type,
      root: ws.root,
      configFile: ws.configFile,
      memberCount: members.length,
      warnings: ws.warnings || [],
      members: members.map(m => ({
        name: m.name,
        path: m.relativePath,
        stack: m.stack,
        hasGovernance: m.hasGovernance,
        hasGit: m.hasGit,
        inheritsFromRoot: hierarchy.members[m.name]?.inherit === 'root',
      })),
      rootGovernance: hierarchy.root ? {
        name: hierarchy.root.name,
        gatesCount: Object.keys(hierarchy.root.gates).length,
        runtimes: hierarchy.root.runtimes,
      } : null,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(`\n  Workspace: \x1b[36m${ws.type}\x1b[0m`);
  console.log(`  Root: ${ws.root}`);
  if (ws.configFile) console.log(`  Config: ${ws.configFile}`);
  console.log(`  Members: ${members.length}`);

  if (ws.warnings && ws.warnings.length > 0) {
    console.log(`  \x1b[33mWarnings:\x1b[0m`);
    for (const w of ws.warnings) console.log(`    ! ${w}`);
  }

  if (hierarchy.root) {
    const gates = Object.keys(hierarchy.root.gates).length;
    console.log(`  Root governance: ${gates} gate section(s), runtimes: ${hierarchy.root.runtimes.join(', ') || 'none'}`);
  } else {
    console.log(`  Root governance: \x1b[90m(none)\x1b[0m`);
  }

  if (members.length === 0) {
    console.log(`\n  (No members found — check workspace config.)\n`);
    return;
  }

  console.log(`\n  Members:`);
  for (const m of members) {
    const govIcon = m.hasGovernance ? '\x1b[32m✓\x1b[0m' : '\x1b[90m○\x1b[0m';
    const gitIcon = m.hasGit ? ' \x1b[33m[git]\x1b[0m' : '';
    const stack = m.stack.length > 0 ? `[${m.stack.join(', ')}]` : '[empty]';
    const inherit = hierarchy.members[m.name]?.inherit === 'root' ? ' \x1b[36m(inherits)\x1b[0m' : '';
    console.log(`    ${govIcon} ${m.name.padEnd(30)} ${stack}${gitIcon}${inherit}`);
    console.log(`      ${m.relativePath}`);
  }

  console.log('');
  console.log(`  Legend: \x1b[32m✓\x1b[0m has governance  \x1b[90m○\x1b[0m no governance  \x1b[33m[git]\x1b[0m independent repo  \x1b[36m(inherits)\x1b[0m merges with root\n`);
}

module.exports = { workspace };

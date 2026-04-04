'use strict';

const path = require('path');
const { syncSkills } = require('../update/skill-sync');
const { detectWorkspace } = require('../workspace/detect');
const { enumerateMembers } = require('../workspace/enumerate');

/**
 * crag upgrade — update universal skills to latest version.
 */
function upgrade(args) {
  const checkOnly = args.includes('--check');
  const workspace = args.includes('--workspace');
  const force = args.includes('--force');
  const cwd = process.cwd();

  console.log(`\n  crag upgrade${checkOnly ? ' --check' : ''}${force ? ' --force' : ''}\n`);

  // Upgrade current project
  const result = syncSkills(cwd, { force, dryRun: checkOnly });
  printResult(cwd, result, checkOnly);

  // Upgrade workspace members if requested
  if (workspace) {
    const ws = detectWorkspace(cwd);
    if (ws.type !== 'none') {
      const members = enumerateMembers(ws);
      console.log(`\n  Workspace: ${ws.type} (${members.length} members)\n`);

      for (const member of members) {
        if (member.hasClaude) {
          const memberResult = syncSkills(member.path, { force, dryRun: checkOnly });
          printResult(member.path, memberResult, checkOnly);
        }
      }
    } else {
      console.log('  No workspace detected.\n');
    }
  }
}

function printResult(dir, result, checkOnly) {
  const label = path.basename(dir);
  const prefix = checkOnly ? '(dry run) ' : '';

  for (const item of result.updated) {
    console.log(`  \x1b[32m✓\x1b[0m ${prefix}${label}/${item.name}: ${item.from} → ${item.to}`);
  }

  for (const item of result.skipped) {
    console.log(`  \x1b[90m○\x1b[0m ${label}/${item.name}: ${item.version} (${item.reason})`);
  }

  for (const item of result.conflicted) {
    console.log(`  \x1b[33m!\x1b[0m ${label}/${item.name}: ${item.installed} → ${item.available} (${item.reason})`);
    console.log(`      Run with --force to overwrite (backup will be created)`);
  }

  if (result.updated.length === 0 && result.conflicted.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}: all skills current`);
  }
}

module.exports = { upgrade };

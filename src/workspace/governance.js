'use strict';

const fs = require('fs');
const path = require('path');
const { parseGovernance } = require('../governance/parse');

/**
 * Load governance hierarchy for a workspace.
 * Returns { root: parsed, members: { name: parsed } }
 */
function loadGovernanceHierarchy(workspace, members) {
  const rootGovPath = path.join(workspace.root, '.claude', 'governance.md');
  const root = fs.existsSync(rootGovPath)
    ? parseGovernance(fs.readFileSync(rootGovPath, 'utf-8'))
    : null;

  const memberGovs = {};
  for (const member of members) {
    if (member.hasGovernance) {
      const govPath = path.join(member.path, '.claude', 'governance.md');
      try {
        memberGovs[member.name] = parseGovernance(fs.readFileSync(govPath, 'utf-8'));
      } catch { /* skip unreadable */ }
    }
  }

  return { root, members: memberGovs };
}

/**
 * Normalize a parsed governance object so merging is safe.
 * Returns an object with guaranteed shape: { name, description, gates, runtimes, inherit }.
 */
function normalizeGovernance(g) {
  if (!g || typeof g !== 'object') {
    return { name: '', description: '', gates: {}, runtimes: [], inherit: null };
  }
  return {
    name: typeof g.name === 'string' ? g.name : '',
    description: typeof g.description === 'string' ? g.description : '',
    gates: (g.gates && typeof g.gates === 'object') ? g.gates : {},
    runtimes: Array.isArray(g.runtimes) ? g.runtimes : [],
    inherit: g.inherit || null,
  };
}

/**
 * Safely clone a gates section, coercing malformed input to empty arrays.
 */
function cloneSection(data) {
  if (!data || typeof data !== 'object') {
    return { commands: [], path: null, condition: null };
  }
  return {
    commands: Array.isArray(data.commands)
      ? data.commands.filter(c => c && typeof c.cmd === 'string').map(c => ({
          cmd: c.cmd,
          classification: c.classification || 'MANDATORY',
        }))
      : [],
    path: typeof data.path === 'string' ? data.path : null,
    condition: typeof data.condition === 'string' ? data.condition : null,
  };
}

/**
 * Merge root governance with member governance.
 * Root gates are mandatory (prepended with `root:` prefix).
 * Member gates are additive (appended, replace on section name collision).
 * Security and branch strategy from root cascade down.
 *
 * Both inputs are normalized before merging, so malformed input never throws.
 */
function mergeGovernance(rootParsed, memberParsed) {
  const root = normalizeGovernance(rootParsed);
  const member = normalizeGovernance(memberParsed);

  // If root is empty (no name + no gates), just return member
  if (!root.name && Object.keys(root.gates).length === 0) return member;
  // If member is empty, return root
  if (!member.name && Object.keys(member.gates).length === 0) return root;

  const merged = {
    name: member.name || root.name,
    description: member.description || root.description,
    gates: {},
    runtimes: [...new Set([...root.runtimes, ...member.runtimes])],
    inherit: member.inherit,
  };

  // Root gates first (mandatory, prefixed to avoid collision)
  for (const [section, data] of Object.entries(root.gates)) {
    merged.gates[`root:${section}`] = cloneSection(data);
  }

  // Member gates after (additive)
  for (const [section, data] of Object.entries(member.gates)) {
    merged.gates[section] = cloneSection(data);
  }

  return merged;
}

/**
 * Get effective governance for a specific member.
 * If member has governance and it says inherit: root, merge.
 * If member has governance without inherit, use member only.
 * If member has no governance, use root.
 */
function getEffectiveGovernance(hierarchy, memberName) {
  const memberGov = hierarchy.members[memberName];
  const rootGov = hierarchy.root;

  if (!memberGov) return rootGov;
  if (memberGov.inherit === 'root') return mergeGovernance(rootGov, memberGov);
  return memberGov;
}

module.exports = { loadGovernanceHierarchy, mergeGovernance, getEffectiveGovernance, normalizeGovernance };

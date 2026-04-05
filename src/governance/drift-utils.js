'use strict';

/**
 * Drift-detection helpers shared between `crag doctor` and `crag diff`.
 *
 * Both commands need to answer the same two questions:
 *
 *   1. What branch strategy does the governance claim? (text scan of the
 *      `## Branch Strategy` section — first keyword mention wins, so a
 *      workspace wrapper that says "trunk-based at root, feature branches
 *      in sub-repos" is classified as trunk-based, which matches its own
 *      git reality even when sub-repos use feature branches.)
 *
 *   2. What does git actually show? (count unique feature branches across
 *      local + remote refs, stripping `origin/` so a repo whose local
 *      branches are merged+deleted but whose remote still has open
 *      `feat/*` refs is correctly classified as feature-branches.)
 *
 * Before this module existed, doctor.js and diff.js each had their own
 * (slightly different, slightly wrong) implementations. The duplication
 * meant a fix landed in doctor went unapplied in diff and vice-versa —
 * real bug, caught by stress testing against real repos.
 *
 * This module is the single source of truth. Import from here; do not
 * reimplement.
 */

const { extractSection } = require('./parse');

const FEATURE_PREFIXES = ['feat', 'fix', 'docs', 'chore', 'feature', 'hotfix'];

/**
 * Detect the branch strategy declared in a governance.md document.
 *
 * Scopes the text scan to the `## Branch Strategy` section (avoiding false
 * matches against unrelated prose). Within that section, the FIRST keyword
 * to appear wins — this matches human reading order where the opening
 * statement is the rule and later lines are qualifications.
 *
 * Returns 'feature-branches', 'trunk-based', or null.
 */
function detectBranchStrategy(content) {
  if (typeof content !== 'string' || content.length === 0) return null;
  const section = extractSection(content, 'Branch Strategy');
  const scope = section || content; // fall back to whole file if section absent
  const featureIdx = scope.search(/[Ff]eature branches/);
  const trunkIdx = scope.search(/[Tt]runk-based/);
  if (featureIdx === -1 && trunkIdx === -1) return null;
  if (featureIdx === -1) return 'trunk-based';
  if (trunkIdx === -1) return 'feature-branches';
  return featureIdx < trunkIdx ? 'feature-branches' : 'trunk-based';
}

/**
 * Given the raw output of `git branch -a --format="%(refname:short)"`, return
 * the list of unique feature branches (by short name, after stripping any
 * remote prefix).
 *
 * Normalizes remote-tracking refs so `origin/feat/foo` and `feat/foo`
 * both count as the same feature branch. A repo whose local branches
 * have been merged-and-deleted but whose remote still has feat/*
 * branches IS still practicing feature-branch development — callers
 * MUST NOT misread that as "trunk-based".
 *
 * Also skips symbolic refs like `origin/HEAD`.
 */
function countFeatureBranches(gitBranchOutput) {
  if (typeof gitBranchOutput !== 'string' || gitBranchOutput.length === 0) {
    return [];
  }
  const rawList = gitBranchOutput
    .split('\n')
    .map(b => b.trim())
    .filter(Boolean)
    .filter(b => !b.endsWith('/HEAD')); // skip symbolic refs

  const prefixGroup = FEATURE_PREFIXES.join('|');
  const remoteStripRe = new RegExp(`^[A-Za-z0-9_.-]+/((?:${prefixGroup})/.+)$`);
  const featureRe = new RegExp(`^(${prefixGroup})/`);

  const normalized = rawList.map(b => {
    const m = b.match(remoteStripRe);
    return m ? m[1] : b;
  });
  const unique = [...new Set(normalized)];
  return unique.filter(b => featureRe.test(b));
}

/**
 * Classify a repo as 'feature-branches' or 'trunk-based' based on the
 * current `git branch -a --format=%(refname:short)` output.
 *
 * Threshold: 3+ unique feature branches indicates active feature-branch
 * workflow. Fewer (or 0) indicates trunk-based — even if history shows
 * some merge commits from old feat/* branches that have been deleted.
 */
function classifyGitBranchStrategy(gitBranchOutput) {
  const features = countFeatureBranches(gitBranchOutput);
  return features.length > 2 ? 'feature-branches' : 'trunk-based';
}

module.exports = {
  FEATURE_PREFIXES,
  detectBranchStrategy,
  countFeatureBranches,
  classifyGitBranchStrategy,
};

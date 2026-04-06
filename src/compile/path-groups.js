'use strict';

const { flattenGatesRich } = require('../governance/parse');

/**
 * Group gates by path scope for per-path file generation.
 * Returns { root: [...gates without path], scoped: { 'frontend/': [...], 'api/': [...] } }
 */
function groupGatesByPath(gates) {
  const rich = flattenGatesRich(gates);
  const root = [];
  const scoped = {};
  for (const g of rich) {
    if (g.path) {
      (scoped[g.path] = scoped[g.path] || []).push(g);
    } else {
      root.push(g);
    }
  }
  return { root, scoped };
}

// Convert a governance path (e.g., "frontend/") to a glob pattern.
function pathToGlob(p) {
  const clean = p.replace(/\/+$/, '');
  return `${clean}/**/*`;
}

/**
 * Sanitize a path for use as a filename (e.g., "frontend/" → "frontend").
 */
function pathToFilename(p) {
  return p.replace(/\/+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

module.exports = { groupGatesByPath, pathToGlob, pathToFilename };

'use strict';

/**
 * audit-gen.js — the claim-health axis of `crag audit`, DETERMINISTIC half.
 *
 * `crag distill` renders compile-eligible principles into .crag/governance.gen.md
 * with a per-line annotation:
 *   - <rule text> <!-- principle:ID confidence:N scope:S adopted:YYYY-MM-DD -->
 *
 * This module reads those annotations OFF DISK ONLY — no network, no LLM, no
 * backend. That keeps `crag audit` inside the deterministic core: the offline
 * axis can only reason about what distill recorded (adoption age, rule census),
 * and says so honestly. The LIVE eligibility re-check (is each rendered
 * principle still fresh in the backend?) is the opt-in `crag audit --memory`
 * edge, implemented in src/commands/audit.js via the same fetch seam
 * `crag distill` uses — it never runs unless the flag is passed AND a backend
 * is configured.
 *
 * Nothing under src/compile/ imports this file.
 */

const fs = require('fs');
const { layerPaths } = require('../governance/layer-paths');

// A managed rule line's annotation, as written by src/distill/render.js.
const ANNOTATION_RE = /<!--\s*principle:(\d+)\s+confidence:([\d.]+)\s+scope:(\S+)\s+adopted:(\d{4}-\d{2}-\d{2})\s*-->/;

// Adoption age (days) after which we recommend a re-distill. Rendered rules
// are only as fresh as the last `crag distill` run — the backend may have
// retired them since (retirement by omission only takes effect on re-render).
const STALE_ADOPTION_DAYS = 30;

/** Parse one .gen file's managed rules. Returns [] for absent/unreadable. */
function parseGenFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const rules = [];
  for (const line of content.split('\n')) {
    const m = line.match(ANNOTATION_RE);
    if (!m) continue;
    rules.push({
      principleId: Number(m[1]),
      confidence: Number(m[2]),
      scope: m[3],
      adopted: m[4],
      text: line.replace(ANNOTATION_RE, '').replace(/^-\s*/, '').trim(),
    });
  }
  return rules;
}

/**
 * The deterministic memory axis. Reads both .gen layers and returns:
 *   {
 *     present: bool,               // any .gen file with managed rules exists
 *     layers: { user: {path, rules}, project: {path, rules} },
 *     totalRules: N,
 *     staleAdoption: [ {principleId, adopted, ageDays, layer, text} ],
 *     staleAdoptionDays: STALE_ADOPTION_DAYS,
 *   }
 * `now` injectable for tests.
 */
function auditGenLayers(cwd, now) {
  const paths = layerPaths(cwd);
  const nowMs = (now instanceof Date ? now : new Date()).getTime();

  const layers = {
    user: { path: paths.userGen, rules: parseGenFile(paths.userGen) },
    project: { path: paths.projectGen, rules: parseGenFile(paths.projectGen) },
  };

  const staleAdoption = [];
  for (const [layerName, layer] of Object.entries(layers)) {
    for (const r of layer.rules) {
      const adoptedMs = Date.parse(r.adopted + 'T00:00:00Z');
      if (Number.isNaN(adoptedMs)) continue;
      const ageDays = Math.floor((nowMs - adoptedMs) / 86400000);
      if (ageDays > STALE_ADOPTION_DAYS) {
        staleAdoption.push({
          principleId: r.principleId,
          adopted: r.adopted,
          ageDays,
          layer: layerName,
          text: r.text.slice(0, 100),
        });
      }
    }
  }

  const totalRules = layers.user.rules.length + layers.project.rules.length;
  return {
    present: totalRules > 0,
    layers,
    totalRules,
    staleAdoption,
    staleAdoptionDays: STALE_ADOPTION_DAYS,
  };
}

/**
 * OPT-IN live re-check (the `--memory` flag): compare rendered rules against
 * the backend's CURRENT compile-eligible set. A rendered principle missing
 * from the current eligible set has been retired backend-side and awaits
 * removal-by-re-render. Pure function over inputs — the network call happens
 * in the caller (src/commands/audit.js) through the distill fetch seam.
 */
function diffAgainstEligible(genAudit, eligiblePrinciples) {
  const eligibleIds = new Set(
    (Array.isArray(eligiblePrinciples) ? eligiblePrinciples : [])
      .map((p) => Number(p && p.id))
      .filter((n) => !Number.isNaN(n))
  );
  const retired = [];
  for (const [layerName, layer] of Object.entries(genAudit.layers)) {
    for (const r of layer.rules) {
      if (!eligibleIds.has(r.principleId)) {
        retired.push({ principleId: r.principleId, layer: layerName, text: r.text.slice(0, 100) });
      }
    }
  }
  return { retired, eligibleCount: eligibleIds.size };
}

module.exports = { auditGenLayers, diffAgainstEligible, parseGenFile, ANNOTATION_RE, STALE_ADOPTION_DAYS };

'use strict';

/**
 * `crag why <id>` — the lineage receipt ("the screenshot feature").
 *
 * Renders the full provenance of a governance rule as a clean hierarchical
 * receipt:  rule -> source principle -> claims -> verification runs.
 *
 * The <id> may be:
 *   - a rule / principle id     e.g. `29` or `principle:29`
 *   - a claim id                e.g. `insight:123`, `claim:123`, or a bare `123`
 *     that matches no principle
 *
 * Endpoints (crag-engine daemon):
 *   GET /rules                          -> match principle_id for rule text + claim_health
 *   GET /claims/{claim_id}              -> the claim + linked insights/principles
 *   GET /ground/history/{kind}/{cid}    -> the reasoning / verification trail
 *
 * `--json` prints the assembled raw contract JSON for scripting.
 * Read-only. NOT part of the deterministic compile path — see cockpit-client.js.
 */

const { validateFlags } = require('../cli-args');
const { EXIT_USER } = require('../cli-errors');
const { engineUrl, getJson, printDownHint } = require('./cockpit-client');
const { G, R, Y, C, B, D, GRAY, X } = require('../colors');

/**
 * Parse a cockpit id into { kind, num, raw }.
 *   `principle:29` -> { kind: 'principle', num: 29 }
 *   `insight:123`  -> { kind: 'insight',   num: 123 }
 *   `claim:123`    -> { kind: 'insight',   num: 123 }   (claim is an insight kind)
 *   `29`           -> { kind: null,        num: 29 }     (ambiguous: try principle first)
 */
function parseId(raw) {
  const s = String(raw).trim();
  const m = s.match(/^([a-z_]+):(\d+)$/i);
  if (m) {
    let kind = m[1].toLowerCase();
    if (kind === 'claim') kind = 'insight';
    return { kind, num: parseInt(m[2], 10), raw: s };
  }
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && String(n) === s) return { kind: null, num: n, raw: s };
  return { kind: null, num: null, raw: s };
}

const HEALTH_COLOR = {
  fresh: G, passing: G, stale: R, revalidating: Y, unverified: GRAY,
};
function fmtHealth(h) {
  const c = HEALTH_COLOR[h] || GRAY;
  return `${c}${h || 'unknown'}${X}`;
}

function fmtVerdict(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'pass' || s === 'passed' || s === 'verified') return `${G}${v}${X}`;
  if (s === 'fail' || s === 'failed' || s === 'stale') return `${R}${v}${X}`;
  return `${Y}${v || '?'}${X}`;
}

async function why(args) {
  validateFlags('why', args, { boolean: ['--json'], string: [] });
  const url = engineUrl();
  const idArg = args.find((a) => !a.startsWith('-'));
  if (!idArg) {
    console.error(`  ${R}✗${X} Error: crag why needs an id, e.g. ${C}crag why 29${X} or ${C}crag why insight:123${X}`);
    process.exit(EXIT_USER);
  }
  const id = parseId(idArg);

  // 1) Fetch the rules table (source of principle text + claim_health).
  const rulesResp = await getJson(url, '/rules');
  if (!rulesResp || !rulesResp.ok) {
    if (args.includes('--json')) { console.log(JSON.stringify({ ok: false, error: 'engine_unreachable' })); }
    else { printDownHint(url); }
    process.exit(EXIT_USER);
  }
  const rules = Array.isArray(rulesResp.rules) ? rulesResp.rules : [];

  // A principle match: the id is (or could be) a principle_id.
  let principle = null;
  if (id.kind === 'principle' || id.kind === null) {
    principle = rules.find((r) => Number(r.principle_id) === id.num) || null;
  }

  // A claim lineage: fetch iff the id is explicitly a claim, or bare-numeric
  // that did NOT resolve to a principle.
  let claim = null;
  let history = null;
  const treatAsClaim = id.kind === 'insight' || (id.kind === null && !principle);
  if (treatAsClaim && id.num !== null) {
    claim = await getJson(url, `/claims/${id.num}`);
    history = await getJson(url, `/ground/history/insight/${id.num}`);
  } else if (principle) {
    // A rule's evidence chain: the principle's own verification trail.
    history = await getJson(url, `/ground/history/principle/${principle.principle_id}`);
  }

  if (!principle && !(claim && claim.ok)) {
    if (args.includes('--json')) { console.log(JSON.stringify({ ok: false, error: 'not_found', id: id.raw })); }
    else { console.error(`  ${R}✗${X} Error: no rule or claim found for id ${C}${id.raw}${X}.`); }
    process.exit(EXIT_USER);
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: true, id: id.raw, principle, claim, history }));
    return;
  }

  renderReceipt(id, principle, claim, history);
}

function renderReceipt(id, principle, claim, history) {
  console.log('');
  console.log(`  ${B}lineage receipt${X} ${GRAY}· ${id.raw}${X}`);
  console.log(`  ${GRAY}${'═'.repeat(52)}${X}`);

  // Level 1: the rule / principle.
  if (principle) {
    console.log(`  ${B}rule${X}`);
    console.log(`    ${principle.text || '(no text)'}`);
    const bits = [];
    bits.push(`principle:${principle.principle_id}`);
    if (typeof principle.confidence === 'number') bits.push(`conf ${principle.confidence.toFixed(2)}`);
    if (principle.project) bits.push(principle.project);
    console.log(`    ${GRAY}${bits.join('  ·  ')}${X}`);
    console.log(`    ${GRAY}health${X} ${fmtHealth(principle.claim_health)}${principle.stale ? `  ${R}(stale)${X}` : ''}`);
  }

  // Level 2 + 3: the claim and its linked insights/principles.
  const c = claim && claim.ok ? claim : null;
  const claimObj = c ? (c.claim || c) : null;
  if (claimObj) {
    console.log(`  ${GRAY}${'─'.repeat(52)}${X}`);
    console.log(`  ${B}claim${X} ${GRAY}${claimObj.kind ? claimObj.kind + ':' : ''}${claimObj.id != null ? claimObj.id : id.num}${X}`);
    if (claimObj.content || claimObj.text) console.log(`    ${claimObj.content || claimObj.text}`);
    const linkedP = (c && c.principles) || claimObj.principles || [];
    const linkedI = (c && c.insights) || claimObj.insights || [];
    if (Array.isArray(linkedP) && linkedP.length) {
      console.log(`    ${GRAY}→ principles: ${linkedP.map((p) => (typeof p === 'object' ? p.id : p)).join(', ')}${X}`);
    }
    if (Array.isArray(linkedI) && linkedI.length) {
      console.log(`    ${GRAY}→ insights: ${linkedI.map((p) => (typeof p === 'object' ? p.id : p)).join(', ')}${X}`);
    }
  }

  // Level 4: the verification runs (the receipt's evidence chain).
  const runs = extractRuns(history);
  console.log(`  ${GRAY}${'─'.repeat(52)}${X}`);
  console.log(`  ${B}verification runs${X}${runs.length ? '' : ` ${GRAY}(none recorded)${X}`}`);
  for (const run of runs) {
    const when = run.when || run.created_at || run.timestamp || '';
    console.log('');
    console.log(`    ${fmtVerdict(run.verdict)} ${GRAY}${when}${X}`);
    if (run.command) console.log(`      ${C}$ ${run.command}${X}`);
    if (run.output) {
      const lines = String(run.output).split('\n').slice(0, 6);
      for (const l of lines) console.log(`      ${GRAY}${l}${X}`);
    }
    if (run.reasoning || run.cot) console.log(`      ${D}${run.reasoning || run.cot}${X}`);
  }

  console.log('');
  console.log(`  ${GRAY}${'═'.repeat(52)}${X}`);
  console.log('');
}

/** Normalize the /ground/history payload into an array of run records. */
function extractRuns(history) {
  if (!history || !history.ok) return [];
  const raw = history.runs || history.history || history.trail || history.items || [];
  return Array.isArray(raw) ? raw : [];
}

module.exports = { why, parseId };

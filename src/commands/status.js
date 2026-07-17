'use strict';

/**
 * `crag status` — the cockpit dashboard.
 *
 * A thin client of the crag-engine daemon's GET /overview aggregate endpoint.
 * Renders a compact cockpit: trust score (%), corpus counts, needs-you count,
 * and today's capture/verify/promote strip. `--json` prints the raw contract
 * JSON for scripting; nothing else.
 *
 * Read-only. NOT part of the deterministic compile path — see cockpit-client.js.
 */

const { validateFlags } = require('../cli-args');
const { EXIT_USER } = require('../cli-errors');
const { engineUrl, getJson, printDownHint } = require('./cockpit-client');
const { G, R, Y, C, B, D, GRAY, X } = require('../colors');

function projectFlag(args) {
  const i = args.findIndex((a) => a === '--project' || a.startsWith('--project='));
  if (i === -1) return null;
  const a = args[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1] || null;
}

/** Trust score → colored percentage string. null = "—" (fresh install). */
function fmtTrust(trust) {
  if (!trust || trust.value === null || trust.value === undefined) return `${GRAY}—${X}`;
  const pct = Math.round(trust.value * 100);
  const color = pct >= 80 ? G : pct >= 50 ? Y : R;
  return `${color}${B}${pct}%${X}`;
}

async function status(args) {
  validateFlags('status', args, { boolean: ['--json'], string: ['--project'] });
  const url = engineUrl();
  const project = projectFlag(args);
  const q = project ? `?project=${encodeURIComponent(project)}` : '';

  const data = await getJson(url, `/overview${q}`);
  if (!data || !data.ok) {
    if (args.includes('--json')) { console.log(JSON.stringify({ ok: false, error: 'engine_unreachable' })); }
    else { printDownHint(url); }
    process.exit(EXIT_USER);
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(data));
    return;
  }

  const trust = data.trust_score || {};
  const counts = data.counts || {};
  const needs = data.needs_you || {};
  const today = data.today || {};
  const health = data.health || {};
  const num = (v) => (typeof v === 'number' ? v : 0);

  console.log('');
  console.log(`  ${B}crag cockpit${X}${project ? ` ${GRAY}·${X} ${C}${project}${X}` : ''}`);
  console.log(`  ${GRAY}${'─'.repeat(40)}${X}`);
  console.log(`  trust     ${fmtTrust(trust)}   ${GRAY}${num(trust.verified)} verified / ${num(trust.active_claims)} active claims${X}`);
  console.log(`  corpus    ${num(counts.insights)} insights ${GRAY}·${X} ${num(counts.principles)} principles ${GRAY}·${X} ${num(counts.claims)} claims`);

  const needsTotal = num(needs.total);
  const needsStr = needsTotal > 0 ? `${Y}${B}${needsTotal}${X} ${GRAY}(run \`crag inbox\`)${X}` : `${G}0${X} ${GRAY}(all clear)${X}`;
  console.log(`  needs you ${needsStr}`);

  console.log(`  today     ${GRAY}captured${X} ${num(today.captured)}  ${GRAY}verified${X} ${num(today.verified)}  ${GRAY}promoted${X} ${num(today.promoted)}`);

  const daemon = health.daemon;
  const daemonStr = daemon === 'ok' || daemon === true ? `${G}ok${X}` : `${Y}${daemon || '?'}${X}`;
  console.log(`  ${GRAY}${'─'.repeat(40)}${X}`);
  console.log(`  ${GRAY}daemon ${daemonStr}${GRAY} · ${url}${X}`);
  console.log('');
}

module.exports = { status };

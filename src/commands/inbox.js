'use strict';

/**
 * `crag inbox` — the needs-you review queue.
 *
 * A thin client of the crag-engine daemon's GET /inbox aggregate endpoint.
 * Lists items awaiting a human decision (t2 dispositions, grounding proposals,
 * contradictions, stale rules) with id / kind / title / why. Read-only: this
 * task ships the cockpit VIEW only — approve/reject mutation is via the console
 * or MCP for now. `--json` prints the raw contract JSON for scripting.
 *
 * NOT part of the deterministic compile path — see cockpit-client.js.
 */

const { validateFlags } = require('../cli-args');
const { EXIT_USER } = require('../cli-errors');
const { engineUrl, getJson, printDownHint } = require('./cockpit-client');
const { G, Y, C, B, D, GRAY, X } = require('../colors');

function projectFlag(args) {
  const i = args.findIndex((a) => a === '--project' || a.startsWith('--project='));
  if (i === -1) return null;
  const a = args[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1] || null;
}

const KIND_LABEL = {
  t2_disposition: 'disposition',
  grounding_proposal: 'grounding',
  contradiction: 'contradiction',
  stale_rule: 'stale rule',
};

async function inbox(args) {
  validateFlags('inbox', args, { boolean: ['--json'], string: ['--project', '--limit'] });
  const url = engineUrl();
  const project = projectFlag(args);

  const limIdx = args.findIndex((a) => a === '--limit' || a.startsWith('--limit='));
  let limit = 100;
  if (limIdx !== -1) {
    const raw = args[limIdx].includes('=') ? args[limIdx].split('=')[1] : args[limIdx + 1];
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) limit = n;
  }

  const params = new URLSearchParams();
  if (project) params.set('project', project);
  params.set('limit', String(limit));

  const data = await getJson(url, `/inbox?${params.toString()}`);
  if (!data || !data.ok) {
    if (args.includes('--json')) { console.log(JSON.stringify({ ok: false, error: 'engine_unreachable' })); }
    else { printDownHint(url); }
    process.exit(EXIT_USER);
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(data));
    return;
  }

  const items = Array.isArray(data.items) ? data.items : [];
  const total = typeof data.total === 'number' ? data.total : items.length;

  console.log('');
  console.log(`  ${B}inbox${X}${project ? ` ${GRAY}·${X} ${C}${project}${X}` : ''} ${GRAY}(${total} item${total === 1 ? '' : 's'} need you)${X}`);
  console.log(`  ${GRAY}${'─'.repeat(46)}${X}`);

  if (items.length === 0) {
    console.log(`  ${G}✓${X} nothing needs you right now.`);
    console.log('');
    return;
  }

  for (const it of items) {
    const kind = KIND_LABEL[it.kind] || it.kind || 'item';
    const deadline = it.deadline ? `  ${Y}due ${it.deadline}${X}` : '';
    console.log('');
    console.log(`  ${C}${it.id}${X}  ${GRAY}[${kind}]${X}${deadline}`);
    if (it.title) console.log(`    ${B}${it.title}${X}`);
    if (it.why) console.log(`    ${GRAY}${it.why}${X}`);
  }

  console.log('');
  console.log(`  ${GRAY}${'─'.repeat(46)}${X}`);
  console.log(`  ${D}Approve/reject via the console or MCP. Inspect one with:${X} ${C}crag why <id>${X}`);
  console.log('');
}

module.exports = { inbox };

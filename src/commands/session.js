'use strict';

/**
 * `crag session-start` / `crag session-end` — the deterministic session
 * lifecycle CLI (design laws 1-2). These are the shims the harness SessionStart
 * / SessionEnd `command` hooks invoke; they are thin clients of the crag-anchor
 * daemon's /session/start and /session/end endpoints (see cockpit-client.js).
 *
 * Two modes each:
 *   plain    — human-readable output for a person running it directly.
 *   --hook   — machine mode for the harness hook. session-start emits the exact
 *              Claude Code SessionStart hook JSON on stdout (additionalContext
 *              injection); session-end is fire-and-forget. In --hook mode a dead
 *              daemon MUST be silent (exit 0, no output) — a broken hook must
 *              never break the user's session. FAIL-OPEN ALWAYS.
 *
 * NOT part of the deterministic compile path — opt-in engine bridge, like the
 * cockpit commands. Nothing under src/compile/ imports this file.
 *
 * EXIT STYLE: once a fetch() to the engine has SUCCEEDED, undici pools a
 * keep-alive socket; a subsequent FORCED process.exit() can race its teardown
 * on Windows (libuv UV_HANDLE_CLOSING assertion — the same class of bug
 * sync.js routes around). So past a successful fetch we set process.exitCode
 * and return, never process.exit(). Pre-fetch exits (bad flags) are unaffected.
 */

const { validateFlags } = require('../cli-args');
const { engineUrl, getJson, postJson, printDownHint } = require('./cockpit-client');
const { G, B, D, GRAY, C, X } = require('../colors');

const HOOK_TIMEOUT_MS = 2000; // hooks can't block — a tight bound, fail-open past it.

function projectFlag(args) {
  const i = args.findIndex((a) => a === '--project' || a.startsWith('--project='));
  if (i === -1) return null;
  const a = args[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1] || null;
}

// ── context rendering (session-start) ─────────────────────────────────────

/**
 * Render the /session/start payload as a plain markdown block — the SAME text
 * that goes into the hook's additionalContext AND the human plain-mode output,
 * so the two never diverge. No ANSI here: this string may be injected verbatim
 * into an agent's context.
 */
function renderContextMarkdown(data) {
  const ov = data.overview || {};
  const trust = ov.trust_score || {};
  const counts = ov.counts || {};
  const today = ov.today || {};
  const lines = [];
  lines.push('## crag session context');

  const pct = typeof trust.value === 'number' ? `${Math.round(trust.value * 100)}%` : '—';
  lines.push(`- Trust: ${pct} (${trust.verified || 0} verified / ${trust.active_claims || 0} active claims)`);
  lines.push(`- Corpus: ${counts.insights || 0} insights · ${counts.principles || 0} principles · ${counts.claims || 0} claims`);
  lines.push(`- Today: captured ${today.captured || 0} · verified ${today.verified || 0} · promoted ${today.promoted || 0}`);

  const needs = Array.isArray(data.needs_you_top) ? data.needs_you_top : [];
  if (needs.length > 0) {
    lines.push(`- Needs you (${data.needs_you_total || needs.length} total, top ${needs.length}):`);
    for (const n of needs) lines.push(`  - ${n.title || n.kind}${n.why ? ` — ${n.why}` : ''}`);
  } else {
    lines.push('- Needs you: 0 (all clear)');
  }

  if (data.rules_stale_count) {
    lines.push(`- Rules: ${data.rules_stale_count} compiled rule(s) have stale evidence — run \`crag inbox\``);
  }

  const last = data.last_session;
  if (last) {
    const when = last.date || (last.created_at ? String(last.created_at).slice(0, 10) : '?');
    lines.push(`- Last session (${when}): ${last.accomplished || '—'}`);
    if (last.next_steps) lines.push(`  - Next steps: ${last.next_steps}`);
  }

  return lines.join('\n');
}

/** The exact Claude Code SessionStart hook stdout contract. */
function hookJson(markdown) {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: markdown,
    },
  });
}

async function sessionStart(args) {
  validateFlags('session-start', args, { boolean: ['--hook', '--json'], string: ['--project'] });
  const isHook = args.includes('--hook');
  const url = engineUrl();
  const project = projectFlag(args);
  const q = project ? `?project=${encodeURIComponent(project)}` : '';

  // Tight timeout in hook mode (must not stall the session); normal otherwise.
  const timeout = isHook ? HOOK_TIMEOUT_MS : undefined;
  const data = await getJson(url, `/session/start${q}`, timeout);

  if (!data || !data.ok) {
    if (isHook) {
      // FAIL-OPEN: a down daemon must NEVER break the session. Emit nothing.
      process.exitCode = 0;
      return;
    }
    if (args.includes('--json')) {
      console.log(JSON.stringify({ ok: false, error: 'engine_unreachable' }));
      process.exitCode = 1;
      return;
    }
    printDownHint(url);
    process.exitCode = 1; // safe: getJson swallowed the fetch, nothing pooled on failure
    return;
  }

  const markdown = renderContextMarkdown(data);

  if (isHook) {
    // The one line the harness reads: SessionStart hook JSON on stdout.
    console.log(hookJson(markdown));
    return;
  }
  if (args.includes('--json')) {
    console.log(JSON.stringify(data));
    return;
  }

  // Human plain mode: a compact context block.
  console.log('');
  console.log(`  ${B}crag session${X}${project ? ` ${GRAY}·${X} ${C}${project}${X}` : ''}`);
  console.log(`  ${GRAY}${'─'.repeat(44)}${X}`);
  for (const ln of markdown.split('\n')) {
    if (ln.startsWith('## ')) continue; // header already printed as the title
    console.log(`  ${ln}`);
  }
  console.log('');
}

// ── end capture (session-end) ─────────────────────────────────────────────

function summaryFlag(args) {
  const i = args.findIndex((a) => a === '--summary' || a.startsWith('--summary='));
  if (i === -1) return null;
  const a = args[i];
  return a.includes('=') ? a.split('=').slice(1).join('=') : args[i + 1] || null;
}

/**
 * In --hook mode the harness pipes a JSON payload on stdin (Claude Code hooks:
 * {session_id, transcript_path, ...}). That session_id is the DETERMINISTIC
 * session identity — it keys the ONE canonical row in the engine's sessions
 * table (the anti-fragmentation upsert). Read it fail-open: TTY (manual run)
 * skips immediately; a pipe gets max 250ms; anything malformed → null.
 */
function readHookStdin(timeoutMs = 250) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve(null);
    let buf = '';
    const done = (v) => { clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => done(safeParse(buf)), timeoutMs);
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => done(safeParse(buf)));
    process.stdin.on('error', () => done(null));
  });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

async function sessionEnd(args) {
  validateFlags('session-end', args, {
    boolean: ['--hook', '--json'], string: ['--project', '--summary'],
  });
  const isHook = args.includes('--hook');
  const url = engineUrl();
  const project = projectFlag(args);
  const summary = summaryFlag(args);

  const body = {};
  if (project) body.project = project;
  if (summary) body.summary = summary;
  // Session identity precedence: hook stdin JSON (the harness's own id) beats
  // the env var; env remains the fallback for non-hook/manual invocations.
  if (isHook) {
    const hookInput = await readHookStdin();
    if (hookInput && typeof hookInput.session_id === 'string' && hookInput.session_id) {
      body.session_id = hookInput.session_id;
    }
  }
  if (!body.session_id && process.env.CLAUDE_SESSION_ID) {
    body.session_id = process.env.CLAUDE_SESSION_ID;
  }

  const timeout = isHook ? HOOK_TIMEOUT_MS : undefined;
  const data = await postJson(url, '/session/end', body, timeout);

  if (isHook) {
    // Fire-and-forget: SessionEnd can't block and must never fail the session.
    // Whatever happened (recorded, no-op, daemon down), exit 0 silently.
    process.exitCode = 0;
    return;
  }

  if (!data || !data.ok) {
    if (args.includes('--json')) {
      console.log(JSON.stringify({ ok: false, error: 'engine_unreachable' }));
      process.exitCode = 1;
      return;
    }
    printDownHint(url);
    process.exitCode = 1;
    return;
  }

  if (args.includes('--json')) {
    console.log(JSON.stringify(data));
    return;
  }

  const cap = data.captured_today || 0;
  const ver = data.verified_today || 0;
  const pro = data.promoted_today || 0;
  console.log(
    `  ${G}captured ${cap} lessons${X} ${GRAY}·${X} ${ver} verified ${GRAY}·${X} ${pro} promoted ` +
    `${GRAY}— run \`crag why\`${X}`);
}

module.exports = { sessionStart, sessionEnd, renderContextMarkdown, hookJson };

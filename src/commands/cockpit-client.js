'use strict';

/**
 * Shared HTTP client for the read-only cockpit commands
 * (`crag status`, `crag inbox`, `crag why`).
 *
 * These are thin clients of the crag-anchor daemon's aggregate endpoints
 * (default http://127.0.0.1:8786, env CRAG_ANCHOR_URL). Like `crag memory`,
 * they are the OPT-IN engine bridge layer — NOT part of the deterministic
 * compile path. Nothing under src/compile/ imports this file, and it imports
 * nothing from src/compile/. The determinism guarantee of `crag compile` /
 * `crag audit` (offline mode) is untouched.
 *
 * The client idiom mirrors src/commands/memory.js exactly: engineUrl() resolves
 * the base URL, getJson() does an AbortController-bounded fetch and returns the
 * parsed JSON or null on ANY failure (unreachable, timeout, non-2xx, bad JSON).
 * No new dependencies — zero-dep core is a hard product invariant.
 */

const DEFAULT_ENGINE_URL = 'http://127.0.0.1:8786';
const DEFAULT_TIMEOUT_MS = 3000;

/** env CRAG_ANCHOR_URL > default loopback. */
function engineUrl() {
  return process.env.CRAG_ANCHOR_URL || DEFAULT_ENGINE_URL;
}

/** GET <base><path> with a hard timeout. Returns parsed JSON or null. */
async function getJson(base, p, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base.replace(/\/$/, '') + p, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST <base><path> with a JSON body and a hard timeout. Returns parsed JSON
 * or null on ANY failure (unreachable, timeout, non-2xx, bad JSON) — the same
 * fail-closed contract as getJson. Callers decide whether "null" is fatal
 * (plain mode) or silent (hook mode). Used by `crag session-end`.
 */
async function postJson(base, p, body, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base.replace(/\/$/, '') + p, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The friendly hint printed when the daemon is unreachable. Mirrors
 * memory.js's INSTALL_HINT / "crag memory up" guidance so the two surfaces
 * read consistently.
 */
const DOWN_HINT = `crag Anchor is not reachable at ${'${url}'} — the memory backend is down.

  Start it:
    crag memory up            # start the engine + wire this repo
  Check status:
    crag memory status

  (Override the URL with CRAG_ANCHOR_URL if the daemon runs elsewhere.)`;

/** Print the down hint with the resolved url interpolated. */
function printDownHint(url) {
  console.error(DOWN_HINT.replace('${url}', url));
}

module.exports = { engineUrl, getJson, postJson, printDownHint, DEFAULT_TIMEOUT_MS };

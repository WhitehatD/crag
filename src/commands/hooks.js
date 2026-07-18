'use strict';

/**
 * `crag hooks install` — wire the deterministic session lifecycle into the
 * harness (Claude Code, and optionally Codex).
 *
 * "Prompts suggest, hooks enforce." Session context-load and end-capture are
 * NOT skills the agent remembers — they are harness `command` hooks that run
 * the CLI deterministically every session (design laws 1-2):
 *
 *   SessionStart → crag session-start --hook   (injects context via stdout JSON)
 *   SessionEnd   → crag session-end --hook     (fire-and-forget capture)
 *
 * MERGE semantics are load-bearing: we read the existing settings.json, deep-
 * merge our two hook entries into the `hooks.SessionStart` / `hooks.SessionEnd`
 * arrays WITHOUT clobbering any existing keys (permissions, other hooks, other
 * matchers), and atomic-write the result. Re-running is idempotent — a crag
 * entry is identified by its command string and never duplicated.
 *
 * NOT part of the deterministic compile path — like the cockpit/memory
 * commands, this is the opt-in harness-bridge layer. Nothing under
 * src/compile/ imports this file, and it imports nothing from src/compile/
 * except the shared atomic-write primitive (a pure fs helper, not compile
 * logic).
 */

const fs = require('fs');
const path = require('path');
const { atomicWrite } = require('../compile/atomic-write');
const { G, B, D, Y, X } = require('../colors');

const START_CMD = 'crag session-start --hook';
const END_CMD = 'crag session-end --hook';

/** The Claude Code hook entry shape: a matcher-group wrapping command hooks. */
function hookEntry(command) {
  return { hooks: [{ type: 'command', command }] };
}

/**
 * Deep-merge our SessionStart/SessionEnd command hooks into an existing
 * settings object WITHOUT clobbering anything. Returns { settings, changed }.
 *
 * - Preserves every unrelated top-level key (permissions, env, model, …).
 * - Preserves every existing hook event and every existing entry within
 *   SessionStart / SessionEnd.
 * - Idempotent: if an entry with our exact command already exists in the
 *   event's array, we do not add a duplicate.
 */
function mergeHooks(existing) {
  // Clone so we never mutate the caller's object (defensive; also lets the
  // "changed" comparison be meaningful).
  const settings = existing && typeof existing === 'object' ? { ...existing } : {};
  const hooks = { ...(settings.hooks && typeof settings.hooks === 'object' ? settings.hooks : {}) };
  settings.hooks = hooks;

  let changed = false;

  for (const [event, command] of [['SessionStart', START_CMD], ['SessionEnd', END_CMD]]) {
    const arr = Array.isArray(hooks[event]) ? hooks[event].slice() : [];
    const present = arr.some((grp) =>
      grp && Array.isArray(grp.hooks) &&
      grp.hooks.some((h) => h && h.type === 'command' && h.command === command));
    if (!present) {
      arr.push(hookEntry(command));
      changed = true;
    }
    hooks[event] = arr;
  }

  return { settings, changed };
}

/**
 * Codex CLI equivalents. Codex's real config shape is not documented anywhere
 * in this repo or the local infra evidence, so we DO NOT invent one — we skip
 * with a clear note per the spec. If/when Codex documents a session-hook
 * schema, wire it here.
 */
function installCodex() {
  return { skipped: true, reason: 'Codex session-hook config shape not documented in local evidence — skipped (not invented).' };
}

/**
 * Install the hooks into <cwd>/.claude/settings.json. Merge-safe + atomic.
 * Returns { path, changed, created } for the caller to report.
 */
function installHooks(cwd) {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  let existing = {};
  let created = true;
  try {
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    existing = JSON.parse(raw);
    created = false;
  } catch {
    // Absent or invalid JSON → start fresh. (An invalid file is rare; we do
    // not want a corrupt settings.json to block hook install, and we never
    // overwrite valid unrelated content — only the parse failure path resets.)
    existing = {};
  }

  const { settings, changed } = mergeHooks(existing);
  if (changed || created) {
    atomicWrite(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }
  return { path: settingsPath, changed: changed || created, created };
}

/**
 * The single-line install confirmation `crag init` / `crag memory up` print.
 * Kept here so the message is defined once and both callers stay consistent.
 */
function printInstalledLine() {
  console.log(`  ${G}\u2713${X} hooks installed \u2014 capture runs silently from your next session`);
}

/** CLI entry: `crag hooks install [--codex]`. */
function hooks(args) {
  const sub = args[0];
  if (sub !== 'install') {
    console.log(`\n  ${B}crag hooks${X} ${D}\u2014 deterministic session lifecycle${X}\n`);
    console.log(`  Usage:`);
    console.log(`    crag hooks install            Wire SessionStart/SessionEnd into .claude/settings.json`);
    console.log(`    crag hooks install --codex    Also wire the Codex CLI equivalents (if supported)\n`);
    if (sub && sub !== '--help' && sub !== '-h') process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  const res = installHooks(cwd);

  console.log(`\n  ${B}crag hooks${X} ${D}\u2014 installed${X}\n`);
  const rel = path.relative(cwd, res.path) || res.path;
  if (res.created) {
    console.log(`  ${G}\u2713${X} created ${rel}`);
  } else if (res.changed) {
    console.log(`  ${G}\u2713${X} merged into ${rel} ${D}(existing keys preserved)${X}`);
  } else {
    console.log(`  ${D}\u25cb already installed \u2014 ${rel} unchanged${X}`);
  }
  console.log(`    ${D}SessionStart${X}  ${START_CMD}`);
  console.log(`    ${D}SessionEnd${X}    ${END_CMD}`);

  if (args.includes('--codex')) {
    const cx = installCodex();
    if (cx.skipped) console.log(`  ${Y}!${X} Codex: ${cx.reason}`);
  }
  console.log('');
}

module.exports = { hooks, installHooks, mergeHooks, printInstalledLine, START_CMD, END_CMD };

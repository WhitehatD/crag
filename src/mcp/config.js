'use strict';

/**
 * Federation config loader — OPT-IN, generic, backend-agnostic.
 *
 * crag-mcp never hardcodes a memory backend URL, path, or product name.
 * Federation is enabled only if the USER configures it, via (in priority
 * order):
 *
 *   1. env CRAG_MEMORY_MCP
 *        - a JSON object string: {"command":"...", "args":[...]}  (stdio backend)
 *        - a JSON object string: {"url":"..."}                    (HTTP backend)
 *        - or a bare URL string (shorthand for the HTTP form)
 *   2. <cwd>/.crag/mcp.json  — same shape, project-local config file
 *
 * If neither is present, `loadMemoryConfig()` returns null and the caller
 * (src/mcp/server.js) simply does not register any federated tools. No
 * error, no default endpoint — federation is fully absent until configured.
 */

const fs = require('fs');
const path = require('path');

function parseConfigString(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (obj && typeof obj === 'object') return obj;
  } catch {
    // Not JSON — fall through to bare-URL shorthand.
  }
  if (/^https?:\/\//i.test(trimmed)) return { url: trimmed };
  return null;
}

/**
 * Load the opt-in memory-backend config, or null if not configured.
 * `cwd` defaults to process.cwd(); passed explicitly for testability.
 */
function loadMemoryConfig(cwd) {
  const root = cwd || process.cwd();

  const envRaw = process.env.CRAG_MEMORY_MCP;
  if (envRaw) {
    const fromEnv = parseConfigString(envRaw);
    if (fromEnv) return normalizeConfig(fromEnv);
  }

  const configPath = path.join(root, '.crag', 'mcp.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return normalizeConfig(parsed);
    } catch {
      // Malformed config file: fail soft, treat as "not configured" rather
      // than crashing the MCP server on startup.
      return null;
    }
  }

  return null;
}

function normalizeConfig(obj) {
  if (obj.command) {
    return {
      kind: 'stdio',
      command: String(obj.command),
      args: Array.isArray(obj.args) ? obj.args.map(String) : [],
      env: obj.env && typeof obj.env === 'object' ? obj.env : undefined,
    };
  }
  if (obj.url) {
    return { kind: 'http', url: String(obj.url) };
  }
  return null;
}

module.exports = { loadMemoryConfig, parseConfigString, normalizeConfig };

'use strict';

/**
 * fetch-principles.js — the ONLY place `crag distill` talks to a memory
 * backend. Reuses the existing crag-mcp MemoryAdapter (src/mcp/config.js +
 * src/mcp/adapters/memory-adapter.js) rather than building a second
 * connector — same opt-in config (CRAG_MEMORY_MCP env or .crag/mcp.json),
 * same adapter contract (connect/listTools/callTool/disconnect).
 *
 * Determinism boundary: this file is the network/LLM edge of `crag distill`.
 * Nothing under src/compile/ imports this file or src/mcp/ at all — the
 * compose step (src/compile/compose.js) only ever reads already-rendered
 * text off disk. See test/mcp.test.js "determinism boundary" test and
 * docs/distill.md.
 */

const { loadMemoryConfig } = require('../mcp/config');
const { createAdapter } = require('../mcp/adapters/memory-adapter');

const EXPORT_TOOL_NAME = 'principles_export';

/**
 * Normalize whatever shape the backend's `principles_export` tool call
 * returned into a flat array of principle objects. Accepts:
 *   - a bare JSON array:            [ {...}, {...} ]
 *   - a wrapped object:             { principles: [ {...}, {...} ] }
 * Any other shape yields an empty array (fail-soft — a malformed backend
 * response should not crash `crag distill`, it should render nothing new).
 */
function extractPrinciplesFromToolResult(result) {
  if (!result || !Array.isArray(result.content)) return [];
  const textPart = result.content.find((c) => c && c.type === 'text' && typeof c.text === 'string');
  if (!textPart) return [];
  let parsed;
  try {
    parsed = JSON.parse(textPart.text);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.principles)) return parsed.principles;
  return [];
}

/**
 * Fetch compile-eligible principles from the configured memory backend.
 *
 * Returns:
 *   { configured: false }
 *     — no CRAG_MEMORY_MCP / .crag/mcp.json found. Caller no-ops with a
 *       clear message; this is not an error.
 *   { configured: true, principles: [...] }
 *     — connected and fetched (possibly zero) principles.
 *   { configured: true, principles: [], error: '<message>' }
 *     — a backend was configured but the call failed (connection refused,
 *       tool missing, malformed response). Fail-soft: distill treats this
 *       like zero principles rather than crashing, but surfaces the error
 *       to the CLI so the operator can see the backend is unreachable.
 *
 * `cwd` is passed through for testability (mirrors loadMemoryConfig's own
 * cwd parameter) and defaults to process.cwd().
 */
async function fetchCompileEligiblePrinciples(cwd) {
  const config = loadMemoryConfig(cwd || process.cwd());
  const adapter = createAdapter(config);

  if (!adapter) {
    return { configured: false, principles: [] };
  }

  try {
    await adapter.connect();
    const result = await adapter.callTool(EXPORT_TOOL_NAME, { compile_eligible: true });
    const principles = extractPrinciplesFromToolResult(result);
    if (result && result.isError) {
      const textPart = Array.isArray(result.content) ? result.content.find((c) => c && c.type === 'text') : null;
      return { configured: true, principles: [], error: (textPart && textPart.text) || 'memory backend returned an error' };
    }
    return { configured: true, principles };
  } catch (err) {
    return { configured: true, principles: [], error: err.message };
  } finally {
    try { await adapter.disconnect(); } catch { /* best effort */ }
  }
}

module.exports = { fetchCompileEligiblePrinciples, extractPrinciplesFromToolResult, EXPORT_TOOL_NAME };

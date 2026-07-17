'use strict';

/**
 * crag-mcp — the unified federating MCP gateway (docs/closed-loop.md rev 5,
 * §5.1). Speaks MCP over stdio (newline-delimited JSON-RPC 2.0, no SDK
 * dependency — see src/mcp/stdio-rpc.js).
 *
 * Two tool families, one server:
 *   - governance tools (crag.compile / crag.audit / crag.status) — always
 *     present, run the existing deterministic compiler in a subprocess.
 *   - federated tools (crag.<backend-tool>, crag.disposition_*) — present
 *     ONLY if the user configured a memory backend (env CRAG_MEMORY_MCP or
 *     .crag/mcp.json). Absent otherwise. See src/mcp/federation.js.
 *
 * Determinism boundary: this file is never imported by src/compile/ or by
 * src/commands/compile.js. The compile core has zero knowledge this module
 * exists.
 */

const { readMessages, writeMessage, makeResult, makeError, ErrorCodes } = require('./stdio-rpc');
const { GOVERNANCE_TOOLS } = require('./governance-tools');
const { buildFederation } = require('./federation');

const PROTOCOL_VERSION = '2026-06-18';

function log(...args) {
  // MCP stdio transport: stdout is the wire. All diagnostics go to stderr.
  process.stderr.write(`[crag-mcp] ${args.join(' ')}\n`);
}

async function start(options = {}) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const cwd = options.cwd || process.cwd();
  const pkg = require('../../package.json');

  const toolRegistry = new Map();
  for (const tool of GOVERNANCE_TOOLS) {
    toolRegistry.set(tool.name, tool);
  }

  let federation = { tools: [], adapter: null, callTool: async () => { throw new Error('not configured'); }, disconnect: async () => {} };
  try {
    federation = await buildFederation(cwd);
    for (const t of federation.tools) {
      toolRegistry.set(t.name, {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        handler: async (input) => federation.callTool(t.name, input),
      });
    }
    if (federation.adapter) {
      log(`federation active — ${federation.tools.length} tool(s) proxied from configured memory backend`);
    }
  } catch (err) {
    // Federation is opt-in and must fail SOFT: a misconfigured or
    // unreachable memory backend must never take down the governance
    // tools, which are the load-bearing, always-available half of crag-mcp.
    log(`federation unavailable, continuing with governance tools only: ${err.message}`);
  }

  async function handleRequest(msg) {
    const { id, method, params } = msg;

    if (method === 'initialize') {
      return makeResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'crag', version: pkg.version },
      });
    }

    if (method === 'tools/list') {
      const tools = [...toolRegistry.values()].map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      return makeResult(id, { tools });
    }

    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const tool = toolRegistry.get(name);
      if (!tool) {
        return makeError(id, ErrorCodes.METHOD_NOT_FOUND, `unknown tool: ${name}`);
      }
      try {
        const result = await tool.handler(args);
        return makeResult(id, result);
      } catch (err) {
        return makeResult(id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        });
      }
    }

    if (method === 'shutdown') {
      return makeResult(id, {});
    }

    return makeError(id, ErrorCodes.METHOD_NOT_FOUND, `unknown method: ${method}`);
  }

  const reader = readMessages(
    stdin,
    async (msg) => {
      if (!msg || msg.jsonrpc !== '2.0') {
        if (msg && msg.id !== undefined) {
          writeMessage(stdout, makeError(msg.id, ErrorCodes.INVALID_REQUEST, 'invalid JSON-RPC message'));
        }
        return;
      }
      // Notifications (no id) — acknowledge nothing, just observe.
      if (msg.id === undefined) {
        if (msg.method === 'notifications/initialized') { /* no-op */ }
        return;
      }
      const response = await handleRequest(msg);
      writeMessage(stdout, response);
    },
    (err) => log(`malformed input: ${err.message}`),
    async () => {
      await federation.disconnect().catch(() => {});
      process.exit(0);
    }
  );

  return { reader, toolRegistry, federation };
}

module.exports = { start, PROTOCOL_VERSION };

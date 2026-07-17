'use strict';

/**
 * MemoryAdapter — the ports-and-adapters seam for federation.
 *
 * crag-mcp never special-cases a memory backend. Every backend, whatever
 * product it is, is reached through this narrow interface:
 *
 *   connect()          -> Promise<void>
 *   listTools()         -> Promise<Array<{ name, description?, inputSchema? }>>
 *   callTool(name, args) -> Promise<{ content, isError? }>   (MCP tool-call result shape)
 *   disconnect()        -> Promise<void>
 *
 * Concrete adapters (stdio-memory-adapter.js, http-memory-adapter.js) plug
 * into this shape. src/mcp/federation.js only ever talks to a
 * `MemoryAdapter`, never to a specific backend's transport details. Adding
 * a third transport (e.g. SSE) means adding a third adapter — nothing else
 * in the gateway changes.
 */
class MemoryAdapter {
  async connect() {
    throw new Error('MemoryAdapter.connect() not implemented');
  }

  async listTools() {
    throw new Error('MemoryAdapter.listTools() not implemented');
  }

  async callTool(_name, _args) {
    throw new Error('MemoryAdapter.callTool() not implemented');
  }

  async disconnect() {
    // Default: no-op. Adapters with persistent connections/processes override.
  }
}

/**
 * Factory: build the right adapter for a normalized config
 * (see src/mcp/config.js: normalizeConfig -> { kind: 'stdio'|'http', ... }).
 * Returns null for an unrecognized/absent config (caller treats as
 * "federation not configured").
 */
function createAdapter(config) {
  if (!config) return null;
  if (config.kind === 'stdio') {
    const { StdioMemoryAdapter } = require('./stdio-memory-adapter');
    return new StdioMemoryAdapter(config);
  }
  if (config.kind === 'http') {
    const { HttpMemoryAdapter } = require('./http-memory-adapter');
    return new HttpMemoryAdapter(config);
  }
  return null;
}

module.exports = { MemoryAdapter, createAdapter };

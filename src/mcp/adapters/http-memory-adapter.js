'use strict';

/**
 * HttpMemoryAdapter — MemoryAdapter over a generic MCP-over-HTTP endpoint.
 *
 * Minimal JSON-RPC-over-HTTP-POST client: each call is a single POST with a
 * JSON-RPC request body and a JSON-RPC response body. This is a simplified
 * subset of the MCP "streamable HTTP" transport (no session negotiation, no
 * SSE stream) — enough for `crag.recall`-style request/response tool calls
 * against any backend that speaks JSON-RPC 2.0 over HTTP. `config.url`
 * comes entirely from user config (src/mcp/config.js); no default endpoint
 * is ever baked in here.
 *
 * Uses the Node 18+ global `fetch` — no dependency added.
 */

const { MemoryAdapter } = require('./memory-adapter');

const PROTOCOL_VERSION = '2026-06-18';

class HttpMemoryAdapter extends MemoryAdapter {
  constructor(config) {
    super();
    this.url = config.url;
    this.nextId = 1;
    this.connected = false;
    this.sessionId = null;
  }

  async connect() {
    const result = await this._post('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'crag-mcp', version: require('../../../package.json').version },
    });
    this.connected = true;
    return result;
  }

  async listTools() {
    const result = await this._post('tools/list', {});
    return (result && result.tools) || [];
  }

  async callTool(name, args) {
    return this._post('tools/call', { name, arguments: args || {} });
  }

  async disconnect() {
    this.connected = false;
  }

  async _post(method, params) {
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    const res = await fetch(this.url, { method: 'POST', headers, body });
    const sessionHeader = res.headers && res.headers.get && res.headers.get('Mcp-Session-Id');
    if (sessionHeader) this.sessionId = sessionHeader;

    if (!res.ok) {
      throw new Error(`memory backend HTTP ${res.status} on "${method}"`);
    }
    const json = await res.json();
    if (json.error) {
      throw new Error(json.error.message || 'memory backend error');
    }
    return json.result;
  }
}

module.exports = { HttpMemoryAdapter };

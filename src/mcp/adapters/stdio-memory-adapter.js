'use strict';

/**
 * StdioMemoryAdapter — MemoryAdapter over a spawned child process speaking
 * MCP JSON-RPC on its stdio (the same shape crag-mcp itself speaks to its
 * client). Generic: `config.command` / `config.args` / `config.env` come
 * entirely from user config (src/mcp/config.js) — never hardcoded here.
 */

const { spawn } = require('child_process');
const { MemoryAdapter } = require('./memory-adapter');
const { readMessages, writeMessage, makeRequest, makeNotification } = require('../stdio-rpc');

const PROTOCOL_VERSION = '2026-06-18';
const CALL_TIMEOUT_MS = 30_000;

class StdioMemoryAdapter extends MemoryAdapter {
  constructor(config) {
    super();
    this.config = config;
    this.child = null;
    this.reader = null;
    this.nextId = 1;
    this.pending = new Map();
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    this.child = spawn(this.config.command, this.config.args || [], {
      env: this.config.env ? { ...process.env, ...this.config.env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stderr.on('data', () => { /* backend diagnostics — not our stdout, safe to drop or log elsewhere */ });
    this.child.on('error', (err) => this._rejectAllPending(err));
    this.child.on('exit', () => {
      this.connected = false;
      this._rejectAllPending(new Error('memory backend process exited'));
    });

    this.reader = readMessages(
      this.child.stdout,
      (msg) => this._handleMessage(msg),
      () => { /* malformed line from backend — ignore, do not crash */ },
      () => { this.connected = false; }
    );

    await this._request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'crag-mcp', version: require('../../../package.json').version },
    });
    this._notify('notifications/initialized', {});
    this.connected = true;
  }

  async listTools() {
    const result = await this._request('tools/list', {});
    return (result && result.tools) || [];
  }

  async callTool(name, args) {
    const result = await this._request('tools/call', { name, arguments: args || {} });
    return result;
  }

  async disconnect() {
    if (this.child && !this.child.killed) {
      try { this.child.stdin.end(); } catch { /* already closed */ }
      try { this.child.kill(); } catch { /* best effort */ }
    }
    this.connected = false;
  }

  _handleMessage(msg) {
    if (msg && msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject, timer } = this.pending.get(msg.id);
      clearTimeout(timer);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || 'memory backend error'));
      else resolve(msg.result);
    }
    // Notifications / requests FROM the backend are not handled — crag-mcp
    // is a pure client of the memory backend in this direction.
  }

  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`memory backend timed out on "${method}"`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        writeMessage(this.child.stdin, makeRequest(id, method, params));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  _notify(method, params) {
    try {
      writeMessage(this.child.stdin, makeNotification(method, params));
    } catch { /* best effort — backend may already be gone */ }
  }

  _rejectAllPending(err) {
    for (const [, { reject, timer }] of this.pending) {
      clearTimeout(timer);
      reject(err);
    }
    this.pending.clear();
  }
}

module.exports = { StdioMemoryAdapter };

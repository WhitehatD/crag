'use strict';

/**
 * mock-memory-mcp.js — a minimal MCP stdio backend used by
 * test/distill.test.js to exercise the full `crag distill` path (config ->
 * MemoryAdapter -> principles_export) without a real memory daemon.
 *
 * Exposes exactly one tool, `principles_export`, returning the JSON in the
 * MOCK_PRINCIPLES env var (a JSON-encoded array), or a small default set.
 * Requires stdio-rpc via a RELATIVE path so it works regardless of how the
 * spawning test resolves absolute paths on any OS.
 */

const path = require('path');
const { readMessages, writeMessage, makeResult, makeError, ErrorCodes } =
  require(path.join(__dirname, '..', '..', 'src', 'mcp', 'stdio-rpc'));

const DEFAULT_PRINCIPLES = [
  { id: 1, text: 'Default eligible principle.', scope: 'project', confidence: 0.9, claim_health: 'fresh' },
];

function principles() {
  if (process.env.MOCK_PRINCIPLES) {
    try { return JSON.parse(process.env.MOCK_PRINCIPLES); } catch { return []; }
  }
  return DEFAULT_PRINCIPLES;
}

readMessages(
  process.stdin,
  (msg) => {
    if (msg.method === 'initialize') {
      writeMessage(process.stdout, makeResult(msg.id, {
        protocolVersion: '2026-06-18',
        capabilities: {},
        serverInfo: { name: 'mock-memory', version: '0' },
      }));
      return;
    }
    if (msg.method === 'notifications/initialized') return; // no reply to a notification
    if (msg.method === 'tools/list') {
      writeMessage(process.stdout, makeResult(msg.id, {
        tools: [{ name: 'principles_export', description: 'export compile-eligible principles', inputSchema: { type: 'object' } }],
      }));
      return;
    }
    if (msg.method === 'tools/call') {
      if (msg.params && msg.params.name === 'principles_export') {
        writeMessage(process.stdout, makeResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(principles()) }],
          isError: false,
        }));
      } else {
        writeMessage(process.stdout, makeError(msg.id, ErrorCodes.METHOD_NOT_FOUND, 'unknown tool'));
      }
      return;
    }
    if (msg.id !== undefined) {
      writeMessage(process.stdout, makeResult(msg.id, {}));
    }
  },
  () => { /* ignore malformed lines */ },
  () => { process.exit(0); }
);

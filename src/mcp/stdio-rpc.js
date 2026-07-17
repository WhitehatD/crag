'use strict';

/**
 * Minimal newline-delimited JSON-RPC 2.0 transport helpers.
 *
 * MCP's stdio transport frames messages as one JSON object per line (no
 * Content-Length headers, unlike LSP). This module is deliberately tiny and
 * dependency-free — crag's compile core is zero-dep, and this layer (used by
 * both the crag-mcp SERVER and the generic memory-adapter CLIENT) stays
 * zero-dep too. No MCP SDK required to speak the protocol at this level.
 */

const JSONRPC_VERSION = '2.0';

/**
 * Wrap a readable stream (e.g. process.stdin or a child process's stdout)
 * with a line reader that parses each line as JSON and invokes `onMessage`.
 * Malformed lines are reported via `onError` but never crash the reader.
 *
 * Returns a `{ close() }` handle.
 */
function readMessages(readable, onMessage, onError, onEnd) {
  let buffer = '';

  function handleData(chunk) {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch (err) {
        if (onError) onError(new Error(`invalid JSON-RPC line: ${err.message}`), line);
        continue;
      }
      onMessage(msg);
    }
  }

  readable.on('data', handleData);
  readable.on('end', () => { if (onEnd) onEnd(); });
  readable.on('close', () => { if (onEnd) onEnd(); });
  readable.on('error', (err) => { if (onError) onError(err, null); });

  return {
    close() {
      readable.removeListener('data', handleData);
    },
  };
}

/**
 * Write a single JSON-RPC message as one newline-terminated line to a
 * writable stream (e.g. process.stdout or a child process's stdin).
 */
function writeMessage(writable, message) {
  writable.write(JSON.stringify(message) + '\n');
}

function makeRequest(id, method, params) {
  return { jsonrpc: JSONRPC_VERSION, id, method, params: params || {} };
}

function makeNotification(method, params) {
  return { jsonrpc: JSONRPC_VERSION, method, params: params || {} };
}

function makeResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

function makeError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: JSONRPC_VERSION, id, error };
}

// Standard JSON-RPC error codes used by this module.
const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

module.exports = {
  JSONRPC_VERSION,
  readMessages,
  writeMessage,
  makeRequest,
  makeNotification,
  makeResult,
  makeError,
  ErrorCodes,
};

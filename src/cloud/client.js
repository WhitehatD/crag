'use strict';

const { API_BASE } = require('./config');

/**
 * Make an authenticated request to the crag cloud API.
 * Uses the built-in fetch API (Node 18+). Zero external dependencies.
 *
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {string} urlPath - API path (e.g. /api/teams/me)
 * @param {{ token?: string, body?: object }} opts
 * @returns {Promise<object|string>} Parsed JSON or text body
 * @throws {Error} with .status property on HTTP errors
 */
async function apiRequest(method, urlPath, opts = {}) {
  const url = `${API_BASE}${urlPath}`;
  const headers = {};
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (opts.body) headers['Content-Type'] = 'application/json';

  const fetchOpts = { method, headers };
  if (opts.body) fetchOpts.body = JSON.stringify(opts.body);

  let res;
  try {
    res = await fetch(url, fetchOpts);
  } catch (err) {
    const wrapped = new Error(`network error: ${err.message}`);
    wrapped.status = 0;
    throw wrapped;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg;
    try {
      const json = JSON.parse(text);
      msg = json.error || json.message || text;
    } catch {
      msg = text || `HTTP ${res.status}`;
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

module.exports = { apiRequest };

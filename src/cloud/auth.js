'use strict';

const fs = require('fs');
const http = require('http');
const { execFile } = require('child_process');
const { CREDENTIALS_DIR, CREDENTIALS_PATH, API_BASE } = require('./config');

/**
 * Read saved credentials from disk.
 * Returns { token, user, created } or null.
 */
function readCredentials() {
  try {
    return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write credentials to disk. Creates ~/.crag/ if needed.
 */
function writeCredentials(data) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(data, null, 2) + '\n');
}

/**
 * Delete saved credentials.
 */
function clearCredentials() {
  try { fs.unlinkSync(CREDENTIALS_PATH); } catch {}
}

/**
 * Guard: require valid credentials. Calls cliError and exits if not logged in.
 * Returns the credentials object on success.
 */
function requireAuth() {
  const creds = readCredentials();
  if (!creds || !creds.token) {
    const { cliError, EXIT_USER } = require('../cli-errors');
    cliError('not logged in. Run crag login first.', EXIT_USER);
  }
  return creds;
}

/**
 * Open a URL in the default browser. Platform-aware (Win/Mac/Linux).
 */
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? 'cmd'
    : process.platform === 'darwin' ? 'open'
    : 'xdg-open';
  const args = process.platform === 'win32'
    ? ['/c', 'start', '', url]
    : [url];
  execFile(cmd, args, { stdio: 'ignore' });
}

/**
 * Run the browser-based OAuth flow:
 *   1. Start a local HTTP server on a random port
 *   2. Open browser to cloud auth endpoint
 *   3. Cloud completes GitHub OAuth, redirects to localhost with token
 *   4. Return { token, user }
 *
 * Times out after 2 minutes.
 */
function browserAuth() {
  return new Promise((resolve, reject) => {
    let settled = false;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html('Login failed', esc(error)));
        finish(new Error(error));
        return;
      }

      const token = url.searchParams.get('token');
      const user = url.searchParams.get('user');
      if (!token) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html('Login failed', 'No token received'));
        finish(new Error('no token in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html('Logged in to crag', `Authenticated as <b>${esc(user || 'unknown')}</b>. You can close this tab.`));
      finish(null, { token, user });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      openBrowser(`${API_BASE}/api/auth/cli?port=${port}`);
    });

    const timer = setTimeout(() => {
      finish(new Error('login timed out after 2 minutes'));
    }, 120_000);

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (err) reject(err); else resolve(result);
    }
  });
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function html(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>`
    + '<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:80vh;}'
    + 'div{text-align:center}</style></head><body><div>'
    + `<h2>${esc(title)}</h2><p>${body}</p></div></body></html>`;
}

module.exports = { readCredentials, writeCredentials, clearCredentials, requireAuth, browserAuth, openBrowser };

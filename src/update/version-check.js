'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = process.env.HOME || process.env.USERPROFILE || os.tmpdir();
const CACHE_DIR = path.join(HOME, '.claude', 'scaffold-cli');
const CACHE_FILE = path.join(CACHE_DIR, 'update-check.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const TIMEOUT_MS = 3000;

/**
 * Non-blocking update check. Reads from cache if fresh.
 * Prints a one-line notice if a newer version is available.
 * Never blocks, never throws.
 *
 * Opt-out: set SCAFFOLD_NO_UPDATE_CHECK=1 in environment.
 */
function checkOnce() {
  if (process.env.SCAFFOLD_NO_UPDATE_CHECK === '1') return;

  try {
    // Read cache
    if (fs.existsSync(CACHE_FILE)) {
      let cache;
      try {
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      } catch {
        // Corrupt cache — delete and re-fetch
        try { fs.unlinkSync(CACHE_FILE); } catch {}
        cache = null;
      }

      if (cache && typeof cache.checkedAt === 'number') {
        const age = Date.now() - cache.checkedAt;
        if (age < CACHE_TTL_MS) {
          if (cache.updateAvailable) {
            const current = require('../../package.json').version;
            console.log(`  \x1b[33m↑\x1b[0m scaffold-cli v${cache.latestVersion} available (you have v${current}). Run: npm update -g scaffold-cli`);
          }
          return;
        }
      }
    }

    // Cache is stale or missing — trigger background check
    checkRegistry();
  } catch {
    // Silent failure — never block CLI
  }
}

/**
 * Fetch latest version from npm registry with timeout.
 * Writes result to cache file atomically.
 */
function checkRegistry() {
  const currentVersion = require('../../package.json').version;

  const req = https.get('https://registry.npmjs.org/scaffold-cli/latest', { timeout: TIMEOUT_MS }, (res) => {
    // Abort if status is non-OK
    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
      res.resume(); // Drain to allow cleanup
      return;
    }

    let data = '';
    let size = 0;
    const MAX_SIZE = 100 * 1024; // 100KB cap

    res.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        res.destroy();
        return;
      }
      data += chunk;
    });

    res.on('end', () => {
      try {
        const pkg = JSON.parse(data);
        const latest = pkg.version;
        if (typeof latest !== 'string') return;

        const updateAvailable = compareVersions(latest, currentVersion) > 0;

        if (!fs.existsSync(CACHE_DIR)) {
          fs.mkdirSync(CACHE_DIR, { recursive: true });
        }

        // Atomic write: write to temp file, then rename
        const tmp = CACHE_FILE + '.tmp.' + process.pid;
        fs.writeFileSync(tmp, JSON.stringify({
          checkedAt: Date.now(),
          latestVersion: latest,
          currentVersion,
          updateAvailable,
        }));
        try {
          fs.renameSync(tmp, CACHE_FILE);
        } catch {
          // Another process wrote first — that's fine
          try { fs.unlinkSync(tmp); } catch {}
        }

        if (updateAvailable) {
          console.log(`  \x1b[33m↑\x1b[0m scaffold-cli v${latest} available (you have v${currentVersion}). Run: npm update -g scaffold-cli`);
        }
      } catch {
        // Malformed response — ignore
      }
    });

    res.on('error', () => { /* ignore */ });
  });

  req.on('error', () => { /* Network error — silent */ });
  req.on('timeout', () => { req.destroy(); });

  // Don't let the request keep the process alive
  if (req.unref) req.unref();
}

/**
 * Compare two semver version strings.
 * Returns >0 if a > b, <0 if a < b, 0 if equal.
 * Handles x.y.z and x.y.z-prerelease formats.
 * Pre-release versions are less than their release counterparts.
 */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, prerelease] = String(v).split('-', 2);
    const parts = core.split('.').map(n => parseInt(n, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return { core: parts.slice(0, 3), prerelease: prerelease || null };
  };

  const pa = parse(a);
  const pb = parse(b);

  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] - pb.core[i];
  }

  // Core versions equal — pre-release comparison
  // No prerelease > has prerelease (e.g., 1.0.0 > 1.0.0-beta)
  if (!pa.prerelease && pb.prerelease) return 1;
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && !pb.prerelease) return 0;
  return pa.prerelease.localeCompare(pb.prerelease);
}

module.exports = { checkOnce, checkRegistry, compareVersions, CACHE_FILE };

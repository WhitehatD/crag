'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Write `content` to `filePath` atomically:
 *   1. Ensure parent directory exists
 *   2. Write to a sibling tempfile (unpredictable suffix — crypto-random)
 *   3. Rename tempfile over destination
 *
 * If any step fails, the tempfile is cleaned up and the original destination
 * remains untouched. Prevents partial-write state if the process is killed
 * mid-write or the filesystem runs out of space.
 *
 * The random suffix makes the temp filename unpredictable, blocking
 * race-condition attacks on shared filesystems where an attacker could
 * pre-create a symlink at the expected temp path.
 */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  } else if (!fs.statSync(dir).isDirectory()) {
    // A non-directory (e.g. a file) exists where we need a directory.
    // This happens when a project has e.g. .cursor/rules as a file instead
    // of a directory. Throw a clear error instead of corrupting the project.
    throw new Error(`path conflict: ${dir} exists but is not a directory`);
  }

  const suffix = crypto.randomBytes(8).toString('hex');
  const tmp = `${filePath}.tmp.${suffix}`;

  try {
    // wx flag: fail if the temp path somehow already exists (defense-in-depth
    // on top of the unpredictable suffix).
    fs.writeFileSync(tmp, content, { flag: 'wx' });
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    throw new Error(`atomicWrite failed for ${filePath}: ${err.message}`);
  }
}

module.exports = { atomicWrite };

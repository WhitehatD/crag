'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Write `content` to `filePath` atomically:
 *   1. Ensure parent directory exists
 *   2. Write to a sibling tempfile
 *   3. Rename tempfile over destination
 *
 * If any step fails, the tempfile is cleaned up and the original destination
 * remains untouched. Prevents partial-write state if the process is killed
 * mid-write or the filesystem runs out of space.
 */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const tmp = filePath + '.tmp.' + process.pid + '.' + Date.now();

  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

module.exports = { atomicWrite };

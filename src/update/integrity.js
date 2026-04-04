'use strict';

const crypto = require('crypto');
const fs = require('fs');

/**
 * Normalize content for hashing: convert CRLF to LF so Windows and Unix
 * produce identical hashes for semantically identical content.
 */
function normalizeForHash(content) {
  return String(content).replace(/\r\n/g, '\n');
}

/**
 * Compute SHA-256 hash of content after CRLF normalization.
 */
function computeHash(content) {
  return crypto.createHash('sha256').update(normalizeForHash(content), 'utf-8').digest('hex');
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns { version, source_hash, name, description, body }
 */
function readFrontmatter(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { version: null, source_hash: null, name: null, description: null, body: content };

  const frontmatter = match[1];
  const body = match[2];

  const get = (key) => {
    const m = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  };

  return {
    version: get('version'),
    source_hash: get('source_hash'),
    name: get('name'),
    description: get('description'),
    body,
  };
}

/**
 * Format a value for YAML frontmatter.
 * Quotes strings that contain special characters or could be ambiguous.
 */
function yamlScalar(value) {
  if (value == null) return '';
  const str = String(value);

  // If contains newline, use literal block scalar
  if (/\r?\n/.test(str)) {
    const indented = str.split(/\r?\n/).map(l => '  ' + l).join('\n');
    return `|\n${indented}`;
  }

  // Characters that require quoting in YAML plain scalar:
  //   : leading/trailing or followed by space (key separator)
  //   # comment marker
  //   special markers: & * ! | > ' " % @ `
  //   leading/trailing whitespace
  //   strings that could be misread as other types: true, false, null, yes, no, numbers
  const needsQuoting =
    /^[\s]|[\s]$/.test(str) ||
    /[:#&*!|>'"%@`]/.test(str) ||
    /^(true|false|null|yes|no|~)$/i.test(str) ||
    /^-?\d+(\.\d+)?$/.test(str) ||
    str === '';

  if (!needsQuoting) return str;

  // Use double quotes and escape \ and "
  return `"${str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Update frontmatter fields in a markdown file without modifying the body.
 * Only updates fields that are provided in the meta object.
 * Values are YAML-escaped for safety.
 */
function writeFrontmatter(filePath, meta) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    // No existing frontmatter — create one
    const fields = Object.entries(meta)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}: ${yamlScalar(v)}`)
      .join('\n');
    fs.writeFileSync(filePath, `---\n${fields}\n---\n${content}`);
    return;
  }

  let frontmatter = match[1];
  const body = match[2];

  for (const [key, value] of Object.entries(meta)) {
    if (value == null) continue;
    const formatted = `${key}: ${yamlScalar(value)}`;
    const regex = new RegExp(`^${key}:.*$`, 'm');
    if (regex.test(frontmatter)) {
      frontmatter = frontmatter.replace(regex, formatted);
    } else {
      frontmatter += `\n${formatted}`;
    }
  }

  fs.writeFileSync(filePath, `---\n${frontmatter}\n---\n${body}`);
}

/**
 * Check if installed skill body has been modified from its source hash.
 * Returns true if a hash exists and does not match, or if no hash is present
 * (conservative default — "can't verify" is treated as "might be modified").
 */
function isModified(filePath) {
  const parsed = readFrontmatter(filePath);
  if (!parsed) return false; // File doesn't exist — nothing to modify
  if (!parsed.source_hash) return true; // No hash present — assume modified (safe default)
  const currentHash = computeHash(parsed.body);
  return currentHash !== parsed.source_hash;
}

module.exports = { computeHash, normalizeForHash, readFrontmatter, writeFrontmatter, isModified, yamlScalar };

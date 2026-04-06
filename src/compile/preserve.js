'use strict';

const fs = require('fs');

/**
 * Preserve user-added custom sections across recompilation.
 *
 * Generated content is wrapped in markers:
 *   <!-- crag:auto-start -->
 *   [generated]
 *   <!-- crag:auto-end -->
 *
 * Content outside these markers is user-owned and survives recompile.
 * For YAML/shell targets, use # crag:auto-start / # crag:auto-end.
 */

const MD_START = '<!-- crag:auto-start -->';
const MD_END = '<!-- crag:auto-end -->';
const COMMENT_START = '# crag:auto-start';
const COMMENT_END = '# crag:auto-end';

function preserveCustomSections(filePath, generatedContent, style) {
  const startMarker = style === 'comment' ? COMMENT_START : MD_START;
  const endMarker = style === 'comment' ? COMMENT_END : MD_END;

  const wrapped = `${startMarker}\n${generatedContent}\n${endMarker}\n`;

  if (!fs.existsSync(filePath)) return wrapped;

  const existing = fs.readFileSync(filePath, 'utf-8');

  // If no markers in existing file, this is a legacy compile or hand-written
  // file — don't destroy it, just return the new wrapped content.
  if (!existing.includes(startMarker) || !existing.includes(endMarker)) return wrapped;

  const beforeIdx = existing.indexOf(startMarker);
  const afterIdx = existing.indexOf(endMarker) + endMarker.length;

  const before = existing.slice(0, beforeIdx);
  const after = existing.slice(afterIdx);

  return before + wrapped.trimEnd() + after;
}

module.exports = { preserveCustomSections, MD_START, MD_END, COMMENT_START, COMMENT_END };

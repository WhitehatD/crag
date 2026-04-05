'use strict';

/**
 * Governance parser v2 — backward-compatible with v1.
 *
 * New optional annotations:
 *   ### Section (path: dir/)        — path-scoped gates
 *   ### Section (if: file)          — conditional section
 *   - command                       # [OPTIONAL]
 *   ## Gates (inherit: root)        — inheritance marker
 */

// Defensive cap: governance files should be well under this size.
// Protects against ReDoS on catastrophic-backtracking-prone regex.
const MAX_CONTENT_SIZE = 256 * 1024; // 256 KB

/**
 * Validate an annotation path (used for `path:` and `if:` on gate sections).
 *
 * Rejects:
 *   - Absolute paths (/, C:\, \\server\share)
 *   - Parent traversal (..)
 *   - Newlines or null bytes (defense against injection into generated YAML/shell)
 *
 * These paths are interpolated into shell commands and YAML scalars downstream
 * (husky, pre-commit, github-actions), so the parser is the single chokepoint
 * where untrusted path strings from governance.md become structured data.
 */
function isValidAnnotationPath(p) {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.length > 512) return false;
  if (/[\n\r\x00]/.test(p)) return false;
  // POSIX absolute or Windows drive-letter / UNC
  if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')) return false;
  // Parent traversal (match as a path segment, not as substring of a name)
  const segments = p.split(/[\\/]/);
  if (segments.includes('..')) return false;
  return true;
}

/**
 * Extract a markdown section body by heading name.
 * Starts after the first line matching `## <name>` (with optional trailing text),
 * ends at the next `## ` heading or EOF. Returns the body string, or null if not found.
 *
 * Implemented via line-by-line scan to avoid regex backtracking on large inputs.
 */
function extractSection(content, name) {
  const lines = content.split('\n');
  const headingPrefix = `## ${name}`;
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === headingPrefix || line.startsWith(headingPrefix + ' ') || line.startsWith(headingPrefix + '\t')) {
      start = i + 1;
      break;
    }
  }

  if (start === -1) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    // Next top-level section (## but not ###)
    if (/^## [^#]/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function parseGovernance(content) {
  const result = {
    name: '',
    description: '',
    gates: {},
    runtimes: [],
    inherit: null,
    warnings: [],
  };

  if (typeof content !== 'string') {
    result.warnings.push('Invalid content type (expected string)');
    return result;
  }
  if (content.length > MAX_CONTENT_SIZE) {
    // Truncate at a section boundary so we don't sever `## Gates` mid-list
    // and silently lose half the gates. Find the last `## ` heading before
    // the cap and cut there; if none exists, cut at the last newline to at
    // least avoid leaving a half-written line.
    const truncated = content.slice(0, MAX_CONTENT_SIZE);
    const lastSection = truncated.lastIndexOf('\n## ');
    const lastLine = truncated.lastIndexOf('\n');
    const cut = lastSection !== -1 ? lastSection : (lastLine !== -1 ? lastLine : MAX_CONTENT_SIZE);
    content = content.slice(0, cut);
    result.warnings.push(
      `governance.md exceeds ${MAX_CONTENT_SIZE} bytes — truncated at byte ${cut} (last section boundary).`
    );
  }

  const nameMatch = content.match(/- Project:\s*(.+)/);
  if (nameMatch) result.name = nameMatch[1].trim();

  const descMatch = content.match(/- Description:\s*(.+)/);
  if (descMatch) result.description = descMatch[1].trim();

  // Check for inheritance marker: ## Gates (inherit: root)
  const inheritMatch = content.match(/## Gates[^\n]*\(inherit:\s*(\w+)\)/);
  if (inheritMatch) result.inherit = inheritMatch[1].trim();

  // Extract the Gates section (ends at next ## heading or EOF).
  // Splitting manually avoids potential catastrophic backtracking on large inputs.
  const gatesBody = extractSection(content, 'Gates');
  if (gatesBody) {
    let section = 'default';
    let sectionMeta = { path: null, condition: null };
    // Fenced code blocks (```bash / ```sh / ```shell) are treated as an
    // alternative command carrier: every non-blank, non-comment line inside
    // is extracted as a MANDATORY command for the current section. This
    // matches the very common markdown pattern of documenting gate commands
    // in a bash fence instead of a bullet list.
    let inCodeBlock = false;

    for (const line of gatesBody.split('\n')) {
      // Fence toggle. Accepts ``` , ```bash , ```sh , ```shell (and any other
      // language tag) — we treat all fenced blocks inside ## Gates as gate
      // command carriers. A non-shell language tag would be unusual here.
      if (/^\s*```/.test(line)) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        const cmd = line.trim();
        // Skip blanks and pure comments. Do NOT strip inline comments from
        // the tail of a command — shell parsers treat `#` mid-line as a
        // comment only when preceded by whitespace, and losing the rest of
        // the line could silently drop logic like `echo "# header"`.
        if (!cmd || cmd.startsWith('#')) continue;
        if (!result.gates[section]) {
          result.gates[section] = {
            commands: [],
            path: sectionMeta.path,
            condition: sectionMeta.condition,
          };
        }
        result.gates[section].commands.push({ cmd, classification: 'MANDATORY' });
        continue;
      }

      // Match ### Section or ### Section (path: dir/) or ### Section (if: file)
      const sub = line.match(/^### (.+?)(?:\s*\((?:(path|if):\s*(.+?))\))?\s*$/);
      if (sub) {
        section = sub[1].trim().toLowerCase();
        sectionMeta = { path: null, condition: null };
        if (sub[2] === 'path') {
          const raw = sub[3].trim();
          if (isValidAnnotationPath(raw)) {
            sectionMeta.path = raw;
          } else {
            result.warnings.push(`Invalid path annotation in section "${sub[1].trim()}": ${JSON.stringify(raw)} (must be a relative in-repo path without "..")`);
          }
        }
        if (sub[2] === 'if') {
          const raw = sub[3].trim();
          if (isValidAnnotationPath(raw)) {
            sectionMeta.condition = raw;
          } else {
            result.warnings.push(`Invalid if annotation in section "${sub[1].trim()}": ${JSON.stringify(raw)} (must be a relative in-repo path without "..")`);
          }
        }
        result.gates[section] = {
          commands: [],
          path: sectionMeta.path,
          condition: sectionMeta.condition,
        };
      } else if (line.match(/^\s*- [^[\s]/) && line.trim() !== '-') {
        let cmd = line.replace(/^\s*- /, '').trim();
        let classification = 'MANDATORY';

        // Check for # [OPTIONAL] or # [MANDATORY] suffix
        const classMatch = cmd.match(/\s*#\s*\[(MANDATORY|OPTIONAL|ADVISORY)\]\s*$/);
        if (classMatch) {
          classification = classMatch[1];
          cmd = cmd.replace(/\s*#\s*\[(?:MANDATORY|OPTIONAL|ADVISORY)\]\s*$/, '').trim();
        }

        if (cmd) {
          if (!result.gates[section]) {
            result.gates[section] = { commands: [], path: null, condition: null };
          }
          result.gates[section].commands.push({ cmd, classification });
        }
      }
    }
  }

  // Warn if no gates were found (helps users catch structural mistakes)
  if (Object.keys(result.gates).length === 0) {
    result.warnings.push('No gates found in governance.md. Expected: "## Gates" section with "- command" entries.');
  }

  // Detect runtimes from gate commands
  const allCmds = Object.values(result.gates)
    .flatMap(g => (g.commands || []).map(c => c.cmd))
    .join(' ');
  if (/\b(node|npm|npx|eslint|prettier|biome|vitest|jest|next)\b/.test(allCmds)) result.runtimes.push('node');
  if (/\b(cargo|rustc|clippy|rustfmt)\b/.test(allCmds)) result.runtimes.push('rust');
  if (/\b(python|pip|pytest|ruff|mypy|django)\b/.test(allCmds)) result.runtimes.push('python');
  if (/\b(java|gradle|gradlew|maven|mvn)\b/.test(allCmds)) result.runtimes.push('java');
  if (/\bgo (build|test|vet|lint)\b/.test(allCmds)) result.runtimes.push('go');
  if (/\bdocker\b/.test(allCmds)) result.runtimes.push('docker');

  return result;
}

/**
 * Flatten v2 gates to v1 format for backward compat with compile targets.
 * Returns { sectionName: ['cmd1', 'cmd2'] } — classification and metadata are lost.
 * Use flattenGatesRich() when you need annotations.
 */
function flattenGates(gates) {
  const flat = {};
  if (!gates || typeof gates !== 'object') return flat;
  for (const [section, data] of Object.entries(gates)) {
    if (!data || typeof data !== 'object') continue;
    const cmds = Array.isArray(data.commands) ? data.commands : [];
    flat[section] = cmds
      .filter(c => c && typeof c.cmd === 'string' && c.cmd.trim())
      .map(c => c.cmd);
  }
  return flat;
}

/**
 * Flatten v2 gates preserving metadata.
 * Returns an array of { section, cmd, classification, path, condition } in order.
 */
function flattenGatesRich(gates) {
  const out = [];
  if (!gates || typeof gates !== 'object') return out;
  for (const [section, data] of Object.entries(gates)) {
    if (!data || typeof data !== 'object') continue;
    const cmds = Array.isArray(data.commands) ? data.commands : [];
    for (const c of cmds) {
      if (!c || typeof c.cmd !== 'string' || !c.cmd.trim()) continue;
      out.push({
        section,
        cmd: c.cmd,
        classification: c.classification || 'MANDATORY',
        path: data.path || null,
        condition: data.condition || null,
      });
    }
  }
  return out;
}

module.exports = { parseGovernance, flattenGates, flattenGatesRich, extractSection, isValidAnnotationPath };

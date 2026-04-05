'use strict';

/**
 * Multi-CI step extraction.
 *
 * The GitHub Actions path already lives in src/governance/yaml-run.js
 * (extractRunCommands) and we reuse it here. This module adds support for:
 *   - GitLab CI          (.gitlab-ci.yml)
 *   - CircleCI           (.circleci/config.yml)
 *   - Travis CI          (.travis.yml)
 *   - Azure Pipelines    (azure-pipelines.yml, .azure-pipelines/)
 *   - Buildkite          (.buildkite/pipeline.yml, .buildkite/pipeline.yaml)
 *   - Drone              (.drone.yml)
 *   - Woodpecker         (.woodpecker.yml, .woodpecker/*.yml)
 *   - Bitbucket          (bitbucket-pipelines.yml)
 *
 * Each extractor returns a list of raw shell command strings. The CI
 * normalizer (normalize.js) dedups and filters them uniformly regardless
 * of which CI system they came from.
 */

const fs = require('fs');
const path = require('path');
const { extractRunCommands, stripYamlQuotes } = require('../governance/yaml-run');
const { safeRead } = require('./stacks');

/**
 * Detect which CI system(s) a project uses and extract commands from each.
 * Returns { system: 'name-or-null', commands: string[] }
 */
function extractCiCommands(dir) {
  const commands = [];
  let primary = null;

  // GitHub Actions
  const ghDir = path.join(dir, '.github', 'workflows');
  if (fs.existsSync(ghDir)) {
    primary = primary || 'github-actions';
    for (const file of walkYaml(ghDir)) {
      const content = safeRead(file);
      commands.push(...extractRunCommands(content));
    }
  }

  // GitLab CI
  const gitlabFile = path.join(dir, '.gitlab-ci.yml');
  if (fs.existsSync(gitlabFile)) {
    primary = primary || 'gitlab-ci';
    commands.push(...extractGitlabCommands(safeRead(gitlabFile)));
  }

  // CircleCI
  const circleFile = path.join(dir, '.circleci', 'config.yml');
  if (fs.existsSync(circleFile)) {
    primary = primary || 'circle-ci';
    commands.push(...extractCircleCommands(safeRead(circleFile)));
  }

  // Travis CI
  const travisFile = path.join(dir, '.travis.yml');
  if (fs.existsSync(travisFile)) {
    primary = primary || 'travis-ci';
    commands.push(...extractTravisCommands(safeRead(travisFile)));
  }

  // Azure Pipelines
  for (const azureFile of ['azure-pipelines.yml', 'azure-pipelines.yaml']) {
    const p = path.join(dir, azureFile);
    if (fs.existsSync(p)) {
      primary = primary || 'azure-pipelines';
      commands.push(...extractAzureCommands(safeRead(p)));
    }
  }
  const azureDir = path.join(dir, '.azure-pipelines');
  if (fs.existsSync(azureDir)) {
    primary = primary || 'azure-pipelines';
    for (const file of walkYaml(azureDir)) {
      commands.push(...extractAzureCommands(safeRead(file)));
    }
  }

  // Buildkite
  for (const bkFile of ['.buildkite/pipeline.yml', '.buildkite/pipeline.yaml']) {
    const p = path.join(dir, bkFile);
    if (fs.existsSync(p)) {
      primary = primary || 'buildkite';
      commands.push(...extractBuildkiteCommands(safeRead(p)));
    }
  }

  // Drone
  const droneFile = path.join(dir, '.drone.yml');
  if (fs.existsSync(droneFile)) {
    primary = primary || 'drone';
    commands.push(...extractDroneCommands(safeRead(droneFile)));
  }

  // Woodpecker
  const woodFile = path.join(dir, '.woodpecker.yml');
  if (fs.existsSync(woodFile)) {
    primary = primary || 'woodpecker';
    commands.push(...extractDroneCommands(safeRead(woodFile))); // same format
  }
  const woodDir = path.join(dir, '.woodpecker');
  if (fs.existsSync(woodDir)) {
    primary = primary || 'woodpecker';
    for (const file of walkYaml(woodDir)) {
      commands.push(...extractDroneCommands(safeRead(file)));
    }
  }

  // Bitbucket
  const bbFile = path.join(dir, 'bitbucket-pipelines.yml');
  if (fs.existsSync(bbFile)) {
    primary = primary || 'bitbucket';
    commands.push(...extractBitbucketCommands(safeRead(bbFile)));
  }

  // Jenkins — Jenkinsfiles are Groovy, not YAML. We do not try to parse them.
  if (fs.existsSync(path.join(dir, 'Jenkinsfile'))) {
    primary = primary || 'jenkins';
  }

  return { system: primary, commands };
}

function walkYaml(dir) {
  const out = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkYaml(full));
      else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
        out.push(full);
      }
    }
  } catch { /* skip */ }
  return out;
}

// --- GitLab CI -------------------------------------------------------------

/**
 * GitLab CI uses `script:`, `before_script:`, `after_script:` keys containing
 * either a single string or a list of strings.
 */
function extractGitlabCommands(content) {
  return extractYamlListField(content, ['script', 'before_script', 'after_script']);
}

// --- CircleCI --------------------------------------------------------------

/**
 * CircleCI uses `run: cmd` (inline) or `run: { command: "..." }` or
 * `run: { command: | ... }` inside a steps: array.
 */
function extractCircleCommands(content) {
  const commands = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Inline: - run: npm test
    const inline = line.match(/^\s*-?\s*run:\s*(.+)$/);
    if (inline) {
      const rest = inline[1].trim();
      if (rest && !rest.startsWith('#') && !rest.startsWith('|') && !rest.startsWith('>') &&
          !rest.startsWith('{') && !rest.startsWith('name:') && !rest.startsWith('command:')) {
        commands.push(stripYamlQuotes(rest));
      }
    }
    // Nested: command: ...
    const cmdMatch = line.match(/^\s*command:\s*(.+)$/);
    if (cmdMatch) {
      const rest = cmdMatch[1].trim();
      if (rest && !rest.startsWith('|') && !rest.startsWith('>') && !rest.startsWith('#')) {
        commands.push(stripYamlQuotes(rest));
      } else if (rest === '|' || rest === '>-' || rest.startsWith('|') || rest.startsWith('>')) {
        // Block scalar — collect following lines with greater indent
        const baseIndent = (line.match(/^(\s*)/) || ['', ''])[1].length;
        for (let j = i + 1; j < lines.length; j++) {
          const inner = lines[j];
          if (inner.trim() === '') continue;
          const innerIndent = (inner.match(/^(\s*)/) || ['', ''])[1].length;
          if (innerIndent <= baseIndent) break;
          commands.push(inner.trim());
        }
      }
    }
  }
  return commands;
}

// --- Travis CI -------------------------------------------------------------

function extractTravisCommands(content) {
  return extractYamlListField(content, ['script', 'before_script', 'install']);
}

// --- Azure Pipelines -------------------------------------------------------

/**
 * Azure Pipelines uses `- script: cmd` or `- bash: cmd` or `- pwsh: cmd`.
 */
function extractAzureCommands(content) {
  const commands = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*-?\s*(script|bash|pwsh|powershell):\s*(.*)$/);
    if (!m) continue;
    const rest = m[2].trim();
    if (/^[|>][+-]?\s*$/.test(rest)) {
      // Block scalar
      const baseIndent = (line.match(/^(\s*)/) || ['', ''])[1].length;
      for (let j = i + 1; j < lines.length; j++) {
        const inner = lines[j];
        if (inner.trim() === '') continue;
        const innerIndent = (inner.match(/^(\s*)/) || ['', ''])[1].length;
        if (innerIndent <= baseIndent) break;
        commands.push(inner.trim());
      }
    } else if (rest && !rest.startsWith('#')) {
      commands.push(stripYamlQuotes(rest));
    }
  }
  return commands;
}

// --- Buildkite -------------------------------------------------------------

/**
 * Buildkite uses `command: cmd` (single) or `commands: [list]`.
 */
function extractBuildkiteCommands(content) {
  return extractYamlListField(content, ['command', 'commands']);
}

// --- Drone / Woodpecker ----------------------------------------------------

/**
 * Drone and Woodpecker use `commands:` lists inside pipeline steps.
 */
function extractDroneCommands(content) {
  return extractYamlListField(content, ['commands']);
}

// --- Bitbucket Pipelines ---------------------------------------------------

/**
 * Bitbucket uses `script: [list]` inside step: blocks.
 */
function extractBitbucketCommands(content) {
  return extractYamlListField(content, ['script']);
}

// --- Generic YAML list field extractor -------------------------------------

/**
 * Extract commands from YAML keys that can be either a single string or a
 * list of strings. Handles both inline and block-scalar forms. This is the
 * workhorse used by GitLab, Travis, Buildkite, Drone, Bitbucket.
 *
 * It is deliberately heuristic — a full YAML parser would be more accurate
 * but we don't ship dependencies. The parser accepts false positives (which
 * normalize.js filters) over missing real gates.
 */
function extractYamlListField(content, fields) {
  const commands = [];
  const lines = content.split(/\r?\n/);
  const fieldRegex = new RegExp('^(\\s*)-?\\s*(' + fields.join('|') + '):\\s*(.*)$');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(fieldRegex);
    if (!m) continue;

    const baseIndent = m[1].length;
    const rest = m[3].trim();

    if (!rest) {
      // List form: field: then lines below are "  - cmd"
      for (let j = i + 1; j < lines.length; j++) {
        const inner = lines[j];
        if (inner.trim() === '') continue;
        const indentMatch = inner.match(/^(\s*)/);
        const innerIndent = indentMatch[1].length;
        if (innerIndent <= baseIndent) break;
        const listItem = inner.match(/^\s*-\s*(.+)$/);
        if (listItem) {
          commands.push(stripYamlQuotes(listItem[1].trim()));
        }
      }
    } else if (/^[|>][+-]?\s*$/.test(rest)) {
      // Block scalar
      for (let j = i + 1; j < lines.length; j++) {
        const inner = lines[j];
        if (inner.trim() === '') continue;
        const indentMatch = inner.match(/^(\s*)/);
        if (indentMatch[1].length <= baseIndent) break;
        commands.push(inner.trim());
      }
    } else if (rest.startsWith('[')) {
      // Inline list: script: [cmd1, cmd2]
      const inner = rest.slice(1, rest.indexOf(']') === -1 ? rest.length : rest.indexOf(']'));
      for (const item of inner.split(',')) {
        const trimmed = stripYamlQuotes(item.trim());
        if (trimmed) commands.push(trimmed);
      }
    } else if (!rest.startsWith('#')) {
      commands.push(stripYamlQuotes(rest));
    }
  }

  return commands;
}

module.exports = { extractCiCommands, walkYaml, extractYamlListField };

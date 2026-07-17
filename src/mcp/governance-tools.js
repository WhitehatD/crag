'use strict';

/**
 * Governance tools — the LOCAL, deterministic half of the crag-mcp gateway.
 *
 * These tools MUST NOT reimplement compile/audit logic. They wrap the
 * existing `bin/crag.js` CLI in a child process. This is deliberate, not
 * laziness:
 *
 *   1. `src/commands/compile.js` and `src/commands/audit.js` call
 *      `process.exit()` on several paths (missing governance.md, drift
 *      found, unknown target). Calling them in-process from an MCP server
 *      would kill the whole server on the first `crag.audit` that finds
 *      drift. A subprocess boundary makes that safe by construction.
 *   2. It guarantees the MCP tool's behavior is byte-identical to the CLI
 *      a user already trusts — no second code path to drift out of sync.
 *   3. It keeps the deterministic compiler untouched: nothing in
 *      `src/compile/` is imported here, and nothing in this file is
 *      imported by `src/compile/` or `src/commands/compile.js`.
 *
 * `crag.status` is the one exception: it reads governance.md and calls the
 * pure, non-exiting `parseGovernance` parser directly (same function
 * `compile.js` uses for its own `list` output) — there is no exit path to
 * guard against there.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CRAG_BIN = path.join(__dirname, '..', '..', 'bin', 'crag.js');

/**
 * Run `node bin/crag.js <args>` in `cwd`, capturing stdout/stderr/exit code
 * instead of letting it exit the MCP server process.
 */
function runCragCli(args, cwd) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [CRAG_BIN, ...args],
      { cwd: cwd || process.cwd(), maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          exitCode: err && typeof err.code === 'number' ? err.code : 0,
          stdout: stdout || '',
          stderr: stderr || '',
        });
      }
    );
  });
}

/**
 * crag.compile — runs the existing deterministic compiler.
 * input: { target?: string, dryRun?: boolean, cwd?: string }
 */
async function toolCompile(input) {
  const args = ['compile'];
  if (input && input.target) args.push('--target', String(input.target));
  if (input && input.dryRun) args.push('--dry-run');
  const cwd = input && input.cwd;
  const result = await runCragCli(args, cwd);
  return {
    content: [{ type: 'text', text: (result.stdout + result.stderr).trim() || '(no output)' }],
    isError: result.exitCode !== 0,
  };
}

/**
 * crag.audit — drift detection, delegates to the existing audit command.
 * input: { fix?: boolean, cwd?: string }
 * Always requests --json from the underlying CLI so the tool result is
 * structured; the raw text is also included for humans reading transcripts.
 */
async function toolAudit(input) {
  const args = ['audit', '--json'];
  if (input && input.fix) args.push('--fix');
  const cwd = input && input.cwd;
  const result = await runCragCli(args, cwd);
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch { /* non-JSON, e.g. --fix combined output */ }
  const text = parsed ? JSON.stringify(parsed, null, 2) : (result.stdout + result.stderr).trim();
  // audit --json exits non-zero when drift is found — that is a valid,
  // successful tool CALL (the tool ran fine; it found issues). Only a
  // genuinely broken invocation (no governance.md, parse crash) should be
  // surfaced as an MCP tool error.
  const hardFailure = !parsed && result.exitCode !== 0;
  return {
    content: [{ type: 'text', text: text || '(no output)' }],
    isError: hardFailure,
  };
}

/**
 * crag.status — project governance snapshot. Pure read, no subprocess
 * needed: parseGovernance never calls process.exit.
 * input: { cwd?: string }
 */
async function toolStatus(input) {
  const cwd = (input && input.cwd) || process.cwd();
  const govPath = path.join(cwd, '.claude', 'governance.md');
  const pkg = require('../../package.json');

  if (!fs.existsSync(govPath)) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          cragVersion: pkg.version,
          governanceFound: false,
          message: 'No .claude/governance.md found. Run `crag init` or `crag analyze` first.',
        }, null, 2),
      }],
      isError: false,
    };
  }

  const { parseGovernance, flattenGates } = require('../governance/parse');
  const content = fs.readFileSync(govPath, 'utf-8');
  const parsed = parseGovernance(content);
  const flat = flattenGates(parsed.gates);
  const gateCount = Object.values(flat).flat().length;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        cragVersion: pkg.version,
        governanceFound: true,
        projectName: parsed.name || 'unnamed project',
        gateCount,
        sectionCount: Object.keys(parsed.gates).length,
        runtimes: parsed.runtimes,
        warnings: parsed.warnings || [],
      }, null, 2),
    }],
    isError: false,
  };
}

/**
 * crag.distill — the governance back-edge: render verified memory principles
 * into `.crag/governance.gen.md`. Wraps the CLI in a subprocess (same
 * rationale as compile/audit: distill exits non-zero on usage errors, and the
 * subprocess boundary keeps the MCP server alive + byte-identical to the CLI).
 * The memory fetch happens inside the CLI via the configured memory adapter;
 * nothing here (or anywhere in src/mcp/) touches src/compile/ internals.
 * input: { check?: boolean, cwd?: string }
 */
async function toolDistill(input) {
  const args = ['distill'];
  if (input && input.check) args.push('--check');
  const cwd = input && input.cwd;
  const result = await runCragCli(args, cwd);
  // `--check` exits non-zero when a diff EXISTS — like audit, that is a
  // successful tool call reporting a finding, not a broken invocation.
  const hardFailure = result.exitCode !== 0 && !(input && input.check);
  return {
    content: [{ type: 'text', text: (result.stdout + result.stderr).trim() || '(no output)' }],
    isError: hardFailure,
  };
}

const GOVERNANCE_TOOLS = [
  {
    name: 'crag.compile',
    description: 'Compile .claude/governance.md into a target config (or "all" targets). Pure, deterministic, no network — runs the same code path as `crag compile`.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Compile target name (e.g. "claude", "agents-md", "all"). Omit to list available targets.' },
        dryRun: { type: 'boolean', description: 'Preview output paths without writing files.' },
        cwd: { type: 'string', description: 'Project directory (defaults to the MCP server process cwd).' },
      },
    },
    handler: toolCompile,
  },
  {
    name: 'crag.audit',
    description: 'Drift report: stale compiled configs, governance-vs-reality gate failures, missing targets. Runs the same code path as `crag audit --json`.',
    inputSchema: {
      type: 'object',
      properties: {
        fix: { type: 'boolean', description: 'Auto-recompile stale targets.' },
        cwd: { type: 'string', description: 'Project directory (defaults to the MCP server process cwd).' },
      },
    },
    handler: toolAudit,
  },
  {
    name: 'crag.status',
    description: 'Governance snapshot for the project: gate count, runtimes, whether governance.md exists.',
    inputSchema: {
      type: 'object',
      properties: {
        cwd: { type: 'string', description: 'Project directory (defaults to the MCP server process cwd).' },
      },
    },
    handler: toolStatus,
  },
  {
    name: 'crag.distill',
    description: 'Governance back-edge: render verified memory principles into .crag/governance.gen.md (the composed model). check=true previews the would-write diff without touching disk (CI-safe). Runs the same code path as `crag distill`.',
    inputSchema: {
      type: 'object',
      properties: {
        check: { type: 'boolean', description: 'Preview the would-change diff without writing (maps to --check).' },
        cwd: { type: 'string', description: 'Project directory (defaults to the MCP server process cwd).' },
      },
    },
    handler: toolDistill,
  },
];

module.exports = { GOVERNANCE_TOOLS, runCragCli, toolCompile, toolAudit, toolStatus, toolDistill };

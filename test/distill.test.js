'use strict';

// crag distill — the governance back-edge.
// Covers the pure render layer AND a full end-to-end run against a mock
// MCP memory backend (test/fixtures/mock-memory-mcp.js). See
// docs/distill.md and docs/closed-loop.md REV 2/5.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n  src/distill/ — crag distill');

// ── Pure render layer ────────────────────────────────────────────────

const { eligiblePrinciples, partitionByLayer, layerForScope, renderGenFile } = require('../src/distill/render');

test('render: claim_health gate keeps only fresh/passing, drops the rest', () => {
  const input = [
    { id: 1, text: 'fresh one', scope: 'project', confidence: 0.9, claim_health: 'fresh' },
    { id: 2, text: 'passing one', scope: 'project', confidence: 0.9, claim_health: 'passing' },
    { id: 3, text: 'stale one', scope: 'project', confidence: 0.9, claim_health: 'stale' },
    { id: 4, text: 'unverified one', scope: 'project', confidence: 0.9, claim_health: 'unverified' },
    { id: 5, text: 'no health', scope: 'project', confidence: 0.9 },
  ];
  const kept = eligiblePrinciples(input).map((p) => p.id).sort();
  assert.deepStrictEqual(kept, [1, 2], 'only fresh + passing survive the gate');
});

test('render: principles missing id or text are dropped defensively', () => {
  const input = [
    { id: 1, text: 'ok', claim_health: 'fresh' },
    { text: 'no id', claim_health: 'fresh' },
    { id: 2, text: '   ', claim_health: 'fresh' },
    { id: 3, claim_health: 'fresh' },
  ];
  assert.deepStrictEqual(eligiblePrinciples(input).map((p) => p.id), [1]);
});

test('render: layerForScope routes universal -> user, everything else -> project', () => {
  assert.strictEqual(layerForScope('universal'), 'user');
  assert.strictEqual(layerForScope('project'), 'project');
  assert.strictEqual(layerForScope('stack'), 'project');
  assert.strictEqual(layerForScope(undefined), 'project', 'unknown scope must NOT leak into the shared user layer');
});

test('render: partitionByLayer splits eligible principles by scope', () => {
  const input = [
    { id: 1, text: 'u', scope: 'universal', confidence: 0.9, claim_health: 'fresh' },
    { id: 2, text: 'p', scope: 'project', confidence: 0.9, claim_health: 'fresh' },
    { id: 3, text: 'stale-u', scope: 'universal', confidence: 0.9, claim_health: 'stale' },
  ];
  const parts = partitionByLayer(input);
  assert.deepStrictEqual(parts.user.map((p) => p.id), [1]);
  assert.deepStrictEqual(parts.project.map((p) => p.id), [2]);
});

test('render: renderGenFile is deterministic (id-sorted) and annotated', () => {
  const input = [
    { id: 34, text: 'second by id', scope: 'project', confidence: 0.8, claim_health: 'fresh' },
    { id: 12, text: 'first by id', scope: 'project', confidence: 0.91, claim_health: 'fresh' },
  ];
  const out = renderGenFile(input, { asOf: '2026-07-17T00:00:00.000Z' });
  assert.ok(out.includes('## Distilled Principles'));
  assert.ok(out.includes('<!-- principle:12 confidence:0.91 scope:project adopted:2026-07-17 -->'));
  assert.ok(out.includes('<!-- principle:34 confidence:0.80 scope:project adopted:2026-07-17 -->'));
  // id 12 must render before id 34 (stable, sorted)
  assert.ok(out.indexOf('principle:12') < out.indexOf('principle:34'), 'output must be id-sorted for stable diffs');
  // Re-render identical input -> byte-identical output
  assert.strictEqual(out, renderGenFile([...input].reverse(), { asOf: '2026-07-17T00:00:00.000Z' }));
});

test('render: empty principle list renders a clear placeholder, not a crash', () => {
  const out = renderGenFile([], { asOf: '2026-07-17T00:00:00.000Z' });
  assert.ok(out.includes('## Distilled Principles'));
  assert.ok(out.includes('(no compile-eligible principles at this scope)'));
});

// ── fetch-principles: result normalization ───────────────────────────

const { extractPrinciplesFromToolResult } = require('../src/distill/fetch-principles');

test('fetch: accepts a bare JSON array tool result', () => {
  const r = { content: [{ type: 'text', text: JSON.stringify([{ id: 1, text: 'x' }]) }] };
  assert.deepStrictEqual(extractPrinciplesFromToolResult(r), [{ id: 1, text: 'x' }]);
});

test('fetch: accepts a { principles: [...] } wrapped tool result', () => {
  const r = { content: [{ type: 'text', text: JSON.stringify({ principles: [{ id: 2, text: 'y' }] }) }] };
  assert.deepStrictEqual(extractPrinciplesFromToolResult(r), [{ id: 2, text: 'y' }]);
});

test('fetch: malformed/absent content fails soft to [] (never throws)', () => {
  assert.deepStrictEqual(extractPrinciplesFromToolResult(null), []);
  assert.deepStrictEqual(extractPrinciplesFromToolResult({ content: [] }), []);
  assert.deepStrictEqual(extractPrinciplesFromToolResult({ content: [{ type: 'text', text: '{not json' }] }), []);
});

// ── runDistill: not configured is a clean no-op ──────────────────────

const { runDistill } = require('../src/distill');

// NOTE: the async tests below MUST run sequentially, not concurrently.
// test/all.js require()s each file without awaiting, so top-level
// `asyncTest(...)` calls would all start at once — and these tests mutate
// SHARED process.env (HOME, CRAG_MEMORY_MCP, MOCK_PRINCIPLES). Concurrent
// env mutation is a race. We serialize them in one awaited chain at the
// bottom of this file instead.

async function testNoBackend() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-distill-'));
  const prev = process.env.CRAG_MEMORY_MCP;
  delete process.env.CRAG_MEMORY_MCP;
  try {
    const result = await runDistill({ cwd: scratch, check: true });
    assert.strictEqual(result.configured, false);
    assert.ok(/not configured/i.test(result.message));
  } finally {
    if (prev !== undefined) process.env.CRAG_MEMORY_MCP = prev;
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

// ── Full path against the mock MCP backend ───────────────────────────

const MOCK = path.join(__dirname, 'fixtures', 'mock-memory-mcp.js');

function withMockBackend(principles, fn) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-distill-e2e-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-distill-home-'));
  const prevEnv = process.env.CRAG_MEMORY_MCP;
  const prevMock = process.env.MOCK_PRINCIPLES;
  const prevHome = process.env.HOME;
  const prevUserprofile = process.env.USERPROFILE;
  process.env.CRAG_MEMORY_MCP = JSON.stringify({ command: process.execPath, args: [MOCK] });
  process.env.MOCK_PRINCIPLES = JSON.stringify(principles);
  process.env.HOME = home;              // layer-paths.resolveHome prefers HOME first
  process.env.USERPROFILE = home;       // belt-and-suspenders on Windows
  const restore = () => {
    if (prevEnv === undefined) delete process.env.CRAG_MEMORY_MCP; else process.env.CRAG_MEMORY_MCP = prevEnv;
    if (prevMock === undefined) delete process.env.MOCK_PRINCIPLES; else process.env.MOCK_PRINCIPLES = prevMock;
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevUserprofile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevUserprofile;
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  };
  return Promise.resolve(fn({ scratch, home })).finally(restore);
}

const E2E_PRINCIPLES = [
  { id: 12, text: 'Never commit secrets.', scope: 'universal', confidence: 0.95, claim_health: 'fresh' },
  { id: 34, text: 'Compile path stays zero-dep.', scope: 'project', confidence: 0.9, claim_health: 'passing' },
  { id: 56, text: 'Stale rule that must be omitted.', scope: 'project', confidence: 0.8, claim_health: 'stale' },
];

async function testCheckNoWrite() {
  await withMockBackend(E2E_PRINCIPLES, async ({ scratch, home }) => {
    const result = await runDistill({ cwd: scratch, check: true });
    assert.strictEqual(result.configured, true);
    assert.ok(!result.error, `unexpected backend error: ${result.error}`);

    const proj = result.layers.find((l) => l.layer === 'project');
    const user = result.layers.find((l) => l.layer === 'user');
    assert.strictEqual(user.principleCount, 1, 'one universal principle -> user layer');
    assert.strictEqual(proj.principleCount, 1, 'one eligible project principle (stale omitted)');
    assert.ok(proj.changed && user.changed);
    assert.ok(!proj.wrote && !user.wrote, '--check must not write');

    // Nothing on disk
    assert.ok(!fs.existsSync(path.join(scratch, '.crag', 'governance.gen.md')));
    assert.ok(!fs.existsSync(path.join(home, '.crag', 'governance.gen.md')));
  });
}

async function testWriteProducesGen() {
  await withMockBackend(E2E_PRINCIPLES, async ({ scratch, home }) => {
    const result = await runDistill({ cwd: scratch, check: false });
    assert.ok(result.layers.every((l) => l.wrote), `expected both layers written, got ${JSON.stringify(result.layers)}`);

    const projPath = path.join(scratch, '.crag', 'governance.gen.md');
    const userPath = path.join(home, '.crag', 'governance.gen.md');
    assert.ok(fs.existsSync(projPath) && fs.existsSync(userPath));

    const proj = fs.readFileSync(projPath, 'utf-8');
    const user = fs.readFileSync(userPath, 'utf-8');
    assert.ok(user.includes('principle:12'), 'universal principle in user layer');
    assert.ok(proj.includes('principle:34'), 'project principle in project layer');
    assert.ok(!proj.includes('principle:56') && !user.includes('principle:56'), 'stale principle #56 omitted everywhere');
    assert.ok(proj.includes('DO NOT EDIT BY HAND'), 'gen file carries the managed banner');

    // Idempotent: a second write run is a no-op (unchanged), even though the
    // banner/adoption-date timestamp differs (substantive-signature compare).
    const again = await runDistill({ cwd: scratch, check: false });
    assert.ok(again.layers.every((l) => !l.changed), 'unchanged principle set -> no diff on rerun');
  });
}

// Serialize the env-mutating async tests (see NOTE above).
(async () => {
  await asyncTest('runDistill: no backend configured -> configured:false, no-op', testNoBackend);
  await asyncTest('runDistill --check: reports would-write WITHOUT touching disk', testCheckNoWrite);
  await asyncTest('runDistill (write): produces annotated .gen files, omits stale', testWriteProducesGen);
})();

'use strict';

const assert = require('assert');
const { mergeGovernance, normalizeGovernance, getEffectiveGovernance } = require('../src/workspace/governance');

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n  workspace/governance.js');

// --- normalizeGovernance ---

test('normalizeGovernance returns empty shape for null', () => {
  const n = normalizeGovernance(null);
  assert.strictEqual(n.name, '');
  assert.deepStrictEqual(n.gates, {});
  assert.deepStrictEqual(n.runtimes, []);
});

test('normalizeGovernance preserves valid fields', () => {
  const n = normalizeGovernance({
    name: 'test',
    description: 'desc',
    gates: { a: {} },
    runtimes: ['node'],
    inherit: 'root',
  });
  assert.strictEqual(n.name, 'test');
  assert.strictEqual(n.inherit, 'root');
});

test('normalizeGovernance coerces invalid types', () => {
  const n = normalizeGovernance({
    name: 42,
    gates: 'not-an-object',
    runtimes: 'not-an-array',
  });
  assert.strictEqual(n.name, '');
  assert.deepStrictEqual(n.gates, {});
  assert.deepStrictEqual(n.runtimes, []);
});

// --- mergeGovernance ---

test('mergeGovernance prefixes root gates', () => {
  const root = {
    name: 'root',
    gates: { code: { commands: [{ cmd: 'npm test', classification: 'MANDATORY' }], path: null, condition: null } },
    runtimes: ['node'],
  };
  const member = {
    name: 'backend',
    gates: { tests: { commands: [{ cmd: 'pytest', classification: 'MANDATORY' }], path: null, condition: null } },
    runtimes: ['python'],
  };
  const merged = mergeGovernance(root, member);
  assert.ok(merged.gates['root:code']);
  assert.ok(merged.gates['tests']);
  assert.strictEqual(merged.name, 'backend');
  assert.ok(merged.runtimes.includes('node'));
  assert.ok(merged.runtimes.includes('python'));
});

test('mergeGovernance uses member name over root name', () => {
  const root = { name: 'root', gates: {}, runtimes: [] };
  const member = { name: 'svc', gates: {}, runtimes: [] };
  const merged = mergeGovernance(root, member);
  assert.strictEqual(merged.name, 'svc');
});

test('mergeGovernance handles null member', () => {
  const root = { name: 'root', gates: {}, runtimes: [] };
  const merged = mergeGovernance(root, null);
  assert.strictEqual(merged.name, 'root');
});

test('mergeGovernance handles null root', () => {
  const member = { name: 'svc', gates: {}, runtimes: [] };
  const merged = mergeGovernance(null, member);
  assert.strictEqual(merged.name, 'svc');
});

test('mergeGovernance handles both null', () => {
  const merged = mergeGovernance(null, null);
  assert.strictEqual(merged.name, '');
  assert.deepStrictEqual(merged.gates, {});
});

test('mergeGovernance tolerates malformed gate commands', () => {
  const root = {
    name: 'root',
    gates: {
      bad: {
        commands: [{ cmd: 'ok' }, null, { noCmd: true }, { cmd: 'also-ok', classification: 'OPTIONAL' }],
        path: null,
        condition: null,
      },
    },
    runtimes: [],
  };
  const member = {
    name: 'svc',
    gates: { local: { commands: [{ cmd: 'svc-cmd' }], path: null, condition: null } },
    runtimes: [],
  };
  // Should not throw, and should filter malformed commands
  const merged = mergeGovernance(root, member);
  assert.strictEqual(merged.gates['root:bad'].commands.length, 2);
  assert.strictEqual(merged.gates['root:bad'].commands[1].classification, 'OPTIONAL');
  assert.ok(merged.gates['local']);
});

test('mergeGovernance dedupes runtimes', () => {
  const root = { name: 'r', gates: {}, runtimes: ['node', 'rust'] };
  const member = { name: 'm', gates: {}, runtimes: ['node', 'go'] };
  const merged = mergeGovernance(root, member);
  assert.strictEqual(merged.runtimes.length, 3);
  assert.ok(merged.runtimes.includes('node'));
  assert.ok(merged.runtimes.includes('rust'));
  assert.ok(merged.runtimes.includes('go'));
});

// --- getEffectiveGovernance ---

test('getEffectiveGovernance returns root when member has no governance', () => {
  const hierarchy = {
    root: { name: 'root', gates: {}, runtimes: [] },
    members: {},
  };
  const eff = getEffectiveGovernance(hierarchy, 'missing');
  assert.strictEqual(eff.name, 'root');
});

test('getEffectiveGovernance returns member when no inherit marker', () => {
  const hierarchy = {
    root: { name: 'root', gates: { r: { commands: [], path: null, condition: null } }, runtimes: [] },
    members: { svc: { name: 'svc', gates: {}, runtimes: [] } },
  };
  const eff = getEffectiveGovernance(hierarchy, 'svc');
  assert.strictEqual(eff.name, 'svc');
  assert.ok(!eff.gates['root:r']);
});

test('getEffectiveGovernance merges when inherit: root', () => {
  const hierarchy = {
    root: {
      name: 'root',
      gates: { r: { commands: [{ cmd: 'cmd1', classification: 'MANDATORY' }], path: null, condition: null } },
      runtimes: [],
    },
    members: {
      svc: {
        name: 'svc',
        gates: { m: { commands: [{ cmd: 'cmd2', classification: 'MANDATORY' }], path: null, condition: null } },
        runtimes: [],
        inherit: 'root',
      },
    },
  };
  const eff = getEffectiveGovernance(hierarchy, 'svc');
  assert.ok(eff.gates['root:r']);
  assert.ok(eff.gates['m']);
});

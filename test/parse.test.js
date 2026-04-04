'use strict';

const assert = require('assert');
const { parseGovernance, flattenGates, flattenGatesRich, extractSection } = require('../src/governance/parse');

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

console.log('\n  parse.js');

// --- v1 format compatibility ---

test('parses v1 format with single section', () => {
  const md = `# Governance — Test

## Identity
- Project: test-project
- Description: A test

## Gates (run in order, stop on failure)
### Code
- node --check main.js
- npm test
`;
  const result = parseGovernance(md);
  assert.strictEqual(result.name, 'test-project');
  assert.strictEqual(result.description, 'A test');
  assert.strictEqual(result.gates.code.commands.length, 2);
  assert.strictEqual(result.gates.code.commands[0].cmd, 'node --check main.js');
  assert.strictEqual(result.gates.code.commands[0].classification, 'MANDATORY');
  assert.strictEqual(result.gates.code.path, null);
  assert.strictEqual(result.gates.code.condition, null);
});

test('v1 format gates have empty warnings on happy path', () => {
  const md = `## Gates\n### Code\n- echo test\n`;
  const result = parseGovernance(md);
  assert.strictEqual(result.warnings.length, 0);
});

test('warns when no gates section found', () => {
  const md = `## Identity\n- Project: empty`;
  const result = parseGovernance(md);
  assert.ok(result.warnings.some(w => w.includes('No gates')));
});

// --- v2 annotations ---

test('parses path-scoped section', () => {
  const md = `## Gates\n### Frontend (path: frontend/)\n- npx biome check .\n`;
  const result = parseGovernance(md);
  assert.strictEqual(result.gates.frontend.path, 'frontend/');
  assert.strictEqual(result.gates.frontend.commands[0].cmd, 'npx biome check .');
});

test('parses conditional section', () => {
  const md = `## Gates\n### TypeScript (if: tsconfig.json)\n- tsc --noEmit\n`;
  const result = parseGovernance(md);
  assert.strictEqual(result.gates.typescript.condition, 'tsconfig.json');
});

test('parses OPTIONAL classification', () => {
  const md = `## Gates\n### Code\n- eslint . # [OPTIONAL]\n`;
  const result = parseGovernance(md);
  assert.strictEqual(result.gates.code.commands[0].classification, 'OPTIONAL');
  assert.strictEqual(result.gates.code.commands[0].cmd, 'eslint .');
});

test('parses ADVISORY classification', () => {
  const md = `## Gates\n### Audit\n- npm audit # [ADVISORY]\n`;
  const result = parseGovernance(md);
  assert.strictEqual(result.gates.audit.commands[0].classification, 'ADVISORY');
});

test('parses inherit marker', () => {
  const md = `## Gates (inherit: root)\n### Extra\n- npm test\n`;
  const result = parseGovernance(md);
  assert.strictEqual(result.inherit, 'root');
});

test('detects node runtime', () => {
  const md = `## Gates\n### Code\n- npm test\n- npx eslint .\n`;
  const result = parseGovernance(md);
  assert.ok(result.runtimes.includes('node'));
});

test('detects multiple runtimes', () => {
  const md = `## Gates\n### A\n- cargo test\n### B\n- go test ./...\n### C\n- pytest\n`;
  const result = parseGovernance(md);
  assert.ok(result.runtimes.includes('rust'));
  assert.ok(result.runtimes.includes('go'));
  assert.ok(result.runtimes.includes('python'));
});

// --- flattenGates ---

test('flattenGates returns v1-shape object', () => {
  const gates = {
    code: { commands: [{ cmd: 'npm test', classification: 'MANDATORY' }], path: null, condition: null },
  };
  const flat = flattenGates(gates);
  assert.deepStrictEqual(flat.code, ['npm test']);
});

test('flattenGates handles malformed input', () => {
  assert.deepStrictEqual(flattenGates(null), {});
  assert.deepStrictEqual(flattenGates(undefined), {});
  assert.deepStrictEqual(flattenGates('not-an-object'), {});
  assert.deepStrictEqual(flattenGates({ bad: null }), {});
  assert.deepStrictEqual(flattenGates({ bad: { commands: 'not-array' } }), { bad: [] });
});

test('flattenGates filters empty commands', () => {
  const gates = {
    code: { commands: [{ cmd: '' }, { cmd: '   ' }, { cmd: 'npm test' }], path: null, condition: null },
  };
  assert.deepStrictEqual(flattenGates(gates).code, ['npm test']);
});

// --- flattenGatesRich ---

test('flattenGatesRich preserves metadata', () => {
  const gates = {
    frontend: {
      commands: [{ cmd: 'eslint .', classification: 'OPTIONAL' }],
      path: 'frontend/',
      condition: null,
    },
  };
  const rich = flattenGatesRich(gates);
  assert.strictEqual(rich.length, 1);
  assert.strictEqual(rich[0].section, 'frontend');
  assert.strictEqual(rich[0].classification, 'OPTIONAL');
  assert.strictEqual(rich[0].path, 'frontend/');
});

// --- extractSection ---

test('extractSection finds section by name', () => {
  const md = `# Title\n\n## Gates\n- a\n- b\n\n## Other\n`;
  const body = extractSection(md, 'Gates');
  assert.ok(body.includes('- a'));
  assert.ok(!body.includes('## Other'));
});

test('extractSection returns null for missing section', () => {
  const md = `## Identity\n- Project: x`;
  assert.strictEqual(extractSection(md, 'Gates'), null);
});

test('extractSection stops at next top-level heading only', () => {
  const md = `## Gates\n### Subsection\n- cmd\n## Next\n`;
  const body = extractSection(md, 'Gates');
  assert.ok(body.includes('### Subsection'));
  assert.ok(body.includes('- cmd'));
  assert.ok(!body.includes('## Next'));
});

// --- Size limit (ReDoS protection) ---

test('parseGovernance caps oversized input', () => {
  const huge = '## Gates\n' + '- echo test\n'.repeat(50000);
  const result = parseGovernance(huge);
  assert.ok(result.warnings.some(w => w.includes('exceeds')));
});

// --- Malformed input ---

test('parseGovernance handles non-string input', () => {
  const result = parseGovernance(null);
  assert.ok(result.warnings.length > 0);
  assert.deepStrictEqual(result.gates, {});
});

test('parseGovernance handles empty string', () => {
  const result = parseGovernance('');
  assert.deepStrictEqual(result.gates, {});
});

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { renderSatellite, satelliteAction } = require('../src/compile/satellite');
const { getTarget } = require('../src/compile/targets');

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

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-satellite-test-'));
  const origLog = console.log;
  console.log = () => {};
  try { fn(dir); }
  finally {
    console.log = origLog;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function sampleParsed() {
  return {
    name: 'test-project',
    description: 'A test project',
    stack: ['node'],
    runtimes: ['node'],
    commitConvention: 'conventional',
    commitTrailer: 'Co-Authored-By: Claude <noreply@anthropic.com>',
    security: '- No hardcoded secrets',
    gates: {
      code: {
        commands: [
          { cmd: 'npm test', classification: 'MANDATORY' },
          { cmd: 'npm run lint', classification: 'OPTIONAL' },
        ],
        path: null,
        condition: null,
      },
    },
  };
}

console.log('\n  satellite.js — action decision');

test('satelliteAction: import + agents-md in run → import', () => {
  assert.strictEqual(satelliteAction(getTarget('claude'), true), 'import');
});
test('satelliteAction: import + standalone → mirror', () => {
  assert.strictEqual(satelliteAction(getTarget('claude'), false), 'mirror');
});
test('satelliteAction: native + agents-md in run → skip', () => {
  assert.strictEqual(satelliteAction(getTarget('gemini'), true), 'skip');
  assert.strictEqual(satelliteAction(getTarget('zed'), true), 'skip');
});
test('satelliteAction: native + standalone → mirror', () => {
  assert.strictEqual(satelliteAction(getTarget('gemini'), false), 'mirror');
});
test('satelliteAction: mirror class → always mirror', () => {
  assert.strictEqual(satelliteAction(getTarget('cline'), true), 'mirror');
  assert.strictEqual(satelliteAction(getTarget('cline'), false), 'mirror');
});

console.log('\n  satellite.js — Claude Code import stub');

test('claude + agents-md in run → thin @AGENTS.md import (no full gates)', () => {
  withTempDir((dir) => {
    const r = renderSatellite(getTarget('claude'), sampleParsed(), { cwd: dir, agentsMdInRun: true });
    assert.strictEqual(r.action, 'import');
    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('@AGENTS.md'), 'stub must import AGENTS.md');
    assert.ok(!content.includes('npm test'), 'stub must NOT duplicate the gates');
    assert.ok(content.length < 400, 'stub should be small');
  });
});

test('claude import respects importRef override (--global absolute path)', () => {
  withTempDir((dir) => {
    renderSatellite(getTarget('claude'), sampleParsed(), {
      cwd: dir, agentsMdInRun: true, importRef: '@~/.agents/AGENTS.md',
    });
    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('@~/.agents/AGENTS.md'), 'should use the override import ref');
  });
});

console.log('\n  satellite.js — native skip');

test('gemini native + agents-md in run → NO file written (reads AGENTS.md)', () => {
  withTempDir((dir) => {
    const r = renderSatellite(getTarget('gemini'), sampleParsed(), { cwd: dir, agentsMdInRun: true });
    assert.strictEqual(r.action, 'skip');
    assert.ok(!fs.existsSync(path.join(dir, 'GEMINI.md')), 'no GEMINI.md when AGENTS.md present');
  });
});

test('zed native + agents-md in run → NO .rules (no shadowing of AGENTS.md)', () => {
  withTempDir((dir) => {
    const r = renderSatellite(getTarget('zed'), sampleParsed(), { cwd: dir, agentsMdInRun: true });
    assert.strictEqual(r.action, 'skip');
    assert.ok(!fs.existsSync(path.join(dir, '.rules')), '.rules must not shadow AGENTS.md');
  });
});

console.log('\n  satellite.js — mirror content');

test('cline mirror carries the full AGENTS.md body + canonical label', () => {
  withTempDir((dir) => {
    const r = renderSatellite(getTarget('cline'), sampleParsed(), { cwd: dir, agentsMdInRun: true });
    assert.strictEqual(r.action, 'mirror');
    const content = fs.readFileSync(path.join(dir, '.clinerules'), 'utf-8');
    assert.ok(content.includes('npm test'), 'mirror carries the gates');
    assert.ok(content.includes('MIRROR of AGENTS.md'), 'mirror is labeled');
    assert.ok(content.includes('Cline'), 'mirror header names the harness');
  });
});

test('mirror body matches the canonical AGENTS.md body (no drift)', () => {
  withTempDir((dir) => {
    const { buildAgentsMdBody } = require('../src/compile/agents-md');
    const parsed = sampleParsed();
    renderSatellite(getTarget('cline'), parsed, { cwd: dir, agentsMdInRun: true });
    const mirror = fs.readFileSync(path.join(dir, '.clinerules'), 'utf-8');
    const body = buildAgentsMdBody(parsed);
    // The shared body appears verbatim inside the mirror.
    assert.ok(mirror.includes(body.trim().split('\n')[0]), 'mirror embeds the shared body');
    assert.ok(mirror.includes('## Quality Gates'), 'mirror has the canonical gates section');
  });
});

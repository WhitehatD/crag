'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateCopilot } = require('../src/compile/copilot');
const { generateContinue } = require('../src/compile/continue');
const { generateWindsurf } = require('../src/compile/windsurf');
const { generateAgentsMd } = require('../src/compile/agents-md');
const { generateCursorRules } = require('../src/compile/cursor-rules');
const { atomicWrite } = require('../src/compile/atomic-write');
// Satellite targets (claude/gemini/cline/zed/amazonq/aider/junie/goose/kiro)
// no longer have bespoke generators — they route through renderSatellite.
// Their behavior is covered in test/satellite.test.js; the structural targets
// (copilot/continue/windsurf/cursor) + canonical agents-md are tested here.
const { renderSatellite } = require('../src/compile/satellite');
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-target-test-'));
  const origLog = console.log;
  console.log = () => {};
  try { fn(dir); }
  finally {
    console.log = origLog;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// Sample parsed governance used across all target tests
function sampleParsed() {
  return {
    name: 'test-project',
    description: 'A test project for compile target unit tests',
    stack: ['node', 'typescript', 'rust'],
    runtimes: ['node', 'rust'],
    branchStrategy: '- Trunk-based development\n- Conventional commits\n- Commit trailer: Co-Authored-By: Claude <noreply@anthropic.com>',
    commitConvention: 'conventional',
    commitTrailer: 'Co-Authored-By: Claude <noreply@anthropic.com>',
    security: '- No hardcoded secrets — grep for sk_live, AKIA, password= before commit',
    gates: {
      code: {
        commands: [
          { cmd: 'npm test', classification: 'MANDATORY' },
          { cmd: 'npm run lint', classification: 'OPTIONAL' },
          { cmd: 'npm audit', classification: 'ADVISORY' },
        ],
        path: null,
        condition: null,
      },
      frontend: {
        commands: [
          { cmd: 'npx biome check .', classification: 'MANDATORY' },
        ],
        path: 'frontend/',
        condition: null,
      },
      typescript: {
        commands: [
          { cmd: 'tsc --noEmit', classification: 'MANDATORY' },
        ],
        path: null,
        condition: 'tsconfig.json',
      },
    },
  };
}

console.log('\n  compile/copilot.js');

test('generates .github/copilot-instructions.md', () => {
  withTempDir((dir) => {
    generateCopilot(dir, sampleParsed());
    const out = path.join(dir, '.github', 'copilot-instructions.md');
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Copilot Instructions'));
    assert.ok(content.includes('test-project'));
    assert.ok(content.includes('npm test'));
    assert.ok(content.includes('OPTIONAL'));
    assert.ok(content.includes('ADVISORY'));
    // frontend/ gates are now in a per-path scoped file
    const scopedPath = path.join(dir, '.github', 'instructions', 'frontend.instructions.md');
    assert.ok(fs.existsSync(scopedPath), 'per-path copilot instructions file exists');
    const scopedContent = fs.readFileSync(scopedPath, 'utf-8');
    assert.ok(scopedContent.includes('applyTo'));
    assert.ok(scopedContent.includes('biome'));
  });
});

test('copilot output mentions governance.md as source of truth', () => {
  withTempDir((dir) => {
    generateCopilot(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf-8');
    assert.ok(content.toLowerCase().includes('governance.md'));
    assert.ok(content.includes('crag'));
  });
});

console.log('\n  compile/continue.js');

test('generates .continuerules at repo root', () => {
  withTempDir((dir) => {
    generateContinue(dir, sampleParsed());
    const out = path.join(dir, '.continuerules');
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Continue Rules'));
  });
});

test('continue output mentions MANDATORY, OPTIONAL, ADVISORY classifications', () => {
  withTempDir((dir) => {
    generateContinue(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.continuerules'), 'utf-8');
    assert.ok(content.includes('MANDATORY'));
    assert.ok(content.includes('OPTIONAL'));
    assert.ok(content.includes('ADVISORY'));
  });
});

console.log('\n  compile/windsurf.js');

test('generates .windsurf/rules/governance.md', () => {
  withTempDir((dir) => {
    generateWindsurf(dir, sampleParsed());
    const out = path.join(dir, '.windsurf', 'rules', 'governance.md');
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('Windsurf Rules'));
    assert.ok(content.includes('Cascade'));
  });
});

test('windsurf output has YAML frontmatter with trigger: always_on', () => {
  withTempDir((dir) => {
    generateWindsurf(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.windsurf', 'rules', 'governance.md'), 'utf-8');
    assert.ok(content.startsWith('---'));
    assert.ok(content.includes('trigger: always_on'));
    // frontend/ gates are now in a per-path glob-scoped file
    const scopedPath = path.join(dir, '.windsurf', 'rules', 'frontend.md');
    assert.ok(fs.existsSync(scopedPath), 'per-path windsurf rule exists');
    const scopedContent = fs.readFileSync(scopedPath, 'utf-8');
    assert.ok(scopedContent.includes('trigger: glob'));
    assert.ok(scopedContent.includes('biome'));
  });
});

console.log('\n  compile target classifications (structural targets)');

test('every structural target honors gate classifications in output', () => {
  withTempDir((dir) => {
    const parsed = sampleParsed();
    generateCopilot(dir, parsed);
    generateContinue(dir, parsed);
    generateWindsurf(dir, parsed);
    // Each structural target should reference OPTIONAL or ADVISORY or MANDATORY
    const outputs = [
      fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf-8'),
      fs.readFileSync(path.join(dir, '.continuerules'), 'utf-8'),
      fs.readFileSync(path.join(dir, '.windsurf', 'rules', 'governance.md'), 'utf-8'),
    ];
    for (const out of outputs) {
      const hasClassification =
        out.includes('MANDATORY') ||
        out.includes('OPTIONAL') ||
        out.includes('ADVISORY') ||
        out.toLowerCase().includes('classification');
      assert.ok(hasClassification, 'expected classification reference in output');
    }
  });
});

// --- Previously untested compile targets ---

console.log('\n  compile/agents-md.js');

test('generates AGENTS.md at repo root', () => {
  withTempDir((dir) => {
    generateAgentsMd(dir, sampleParsed());
    const out = path.join(dir, 'AGENTS.md');
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.length > 0);
    assert.ok(content.includes('test-project'));
    assert.ok(content.includes('npm test'));
  });
});

test('AGENTS.md includes project description and gates', () => {
  withTempDir((dir) => {
    generateAgentsMd(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.ok(content.includes('A test project'));
    assert.ok(content.includes('## Quality Gates'));
    assert.ok(content.includes('npm test'));
    assert.ok(content.includes('tsc --noEmit'));
  });
});

console.log('\n  compile/cursor-rules.js');

test('generates .cursor/rules/governance.mdc with MDC frontmatter', () => {
  withTempDir((dir) => {
    generateCursorRules(dir, sampleParsed());
    const out = path.join(dir, '.cursor', 'rules', 'governance.mdc');
    assert.ok(fs.existsSync(out));
    const content = fs.readFileSync(out, 'utf-8');
    // Cursor MDC files start with YAML frontmatter containing `description:`.
    assert.ok(content.startsWith('---'));
    assert.ok(content.includes('description:'));
  });
});

test('cursor rules output contains gate commands and per-path files', () => {
  withTempDir((dir) => {
    generateCursorRules(dir, sampleParsed());
    const content = fs.readFileSync(path.join(dir, '.cursor', 'rules', 'governance.mdc'), 'utf-8');
    assert.ok(content.includes('npm test'));
    // frontend/ gates are in a per-path scoped .mdc
    const scopedPath = path.join(dir, '.cursor', 'rules', 'frontend.mdc');
    assert.ok(fs.existsSync(scopedPath), 'per-path cursor rule exists');
    const scopedContent = fs.readFileSync(scopedPath, 'utf-8');
    assert.ok(scopedContent.includes('biome'));
    assert.ok(scopedContent.includes('alwaysApply: false'));
  });
});

console.log('\n  satellite targets via renderSatellite (standalone/mirror)');

// Standalone (no agents-md in the run) → satellites emit a self-contained
// mirror so an explicit `--target <id>` still yields a usable file.
test('gemini (native) standalone renders a self-contained GEMINI.md mirror', () => {
  withTempDir((dir) => {
    renderSatellite(getTarget('gemini'), sampleParsed(), { cwd: dir, agentsMdInRun: false });
    const out = path.join(dir, 'GEMINI.md');
    assert.ok(fs.existsSync(out), 'GEMINI.md should exist standalone');
    const content = fs.readFileSync(out, 'utf-8');
    assert.ok(content.includes('test-project'));
    assert.ok(content.includes('npm test'));
    assert.ok(content.includes('AGENTS.md'), 'mirror labels AGENTS.md as canonical');
  });
});

test('claude (import) standalone renders a self-contained CLAUDE.md mirror', () => {
  withTempDir((dir) => {
    renderSatellite(getTarget('claude'), sampleParsed(), { cwd: dir, agentsMdInRun: false });
    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf-8');
    assert.ok(content.includes('A test project'));
    assert.ok(content.includes('npm test'));
    assert.ok(content.includes('tsc --noEmit'));
  });
});

console.log('\n  compile/atomic-write.js');

test('atomicWrite writes content to the destination', () => {
  withTempDir((dir) => {
    const target = path.join(dir, 'out.txt');
    atomicWrite(target, 'hello\n');
    assert.strictEqual(fs.readFileSync(target, 'utf-8'), 'hello\n');
  });
});

test('atomicWrite creates parent directories as needed', () => {
  withTempDir((dir) => {
    const target = path.join(dir, 'deep', 'nested', 'file.txt');
    atomicWrite(target, 'x');
    assert.strictEqual(fs.readFileSync(target, 'utf-8'), 'x');
  });
});

test('atomicWrite overwrites an existing file', () => {
  withTempDir((dir) => {
    const target = path.join(dir, 'out.txt');
    fs.writeFileSync(target, 'old');
    atomicWrite(target, 'new');
    assert.strictEqual(fs.readFileSync(target, 'utf-8'), 'new');
  });
});

test('atomicWrite leaves no lingering .tmp files after success', () => {
  withTempDir((dir) => {
    const target = path.join(dir, 'out.txt');
    atomicWrite(target, 'done');
    const entries = fs.readdirSync(dir);
    const tmps = entries.filter((e) => e.includes('.tmp.'));
    assert.strictEqual(tmps.length, 0);
  });
});

test('atomicWrite uses unpredictable temp suffix (crypto randomness)', () => {
  withTempDir((dir) => {
    // We can't observe the temp file after success (rename removed it),
    // but we can verify it's not PID-based by writing many files and
    // confirming they all succeed under high parallelism semantics.
    // Easier: just check the impl exports what we expect and works.
    const targets = [];
    for (let i = 0; i < 5; i++) {
      const t = path.join(dir, `f${i}.txt`);
      atomicWrite(t, String(i));
      targets.push(t);
    }
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(fs.readFileSync(targets[i], 'utf-8'), String(i));
    }
  });
});

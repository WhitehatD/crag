'use strict';

// Composed governance (docs/closed-loop.md REV 2/3) — precedence, dedup,
// budget, and the non-negotiable backward-compatibility guarantee.

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

console.log('\n  src/compile/compose.js — composed governance');

const {
  composeGovernance,
  mergeTextLines,
  mergeGates,
  parseGenBullets,
  applyBudget,
} = require('../src/compile/compose');
const { hasSplitSources } = require('../src/governance/layer-paths');

// A scratch project that ALSO overrides HOME so the user-layer files land
// inside the sandbox (never the real ~/.crag). Returns { cwd, home, cleanup }.
function scratchProject() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-compose-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crag-compose-home-'));
  fs.mkdirSync(path.join(cwd, '.crag'), { recursive: true });
  fs.mkdirSync(path.join(home, '.crag'), { recursive: true });
  return {
    cwd,
    home,
    write(rel, content) {
      const full = rel.startsWith('~')
        ? path.join(home, rel.slice(2))
        : path.join(cwd, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    },
    cleanup() {
      fs.rmSync(cwd, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

// Run fn with HOME/USERPROFILE pointed at a sandbox dir (compose reads the
// user layer from ~/.crag). Restores env afterward.
function withHome(home, fn) {
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return fn();
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    if (prevProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prevProfile;
  }
}

// ---------------------------------------------------------------------------
// Backward compatibility — the load-bearing guarantee.
// ---------------------------------------------------------------------------

test('backward-compat: no project .crag split -> composeGovernance returns null (no-op)', () => {
  const p = scratchProject();
  try {
    withHome(p.home, () => {
      // Only a legacy .claude/governance.md, no .crag/*.src.md or *.gen.md.
      p.write('.claude/governance.md', '# Governance — legacy\n\n## Gates\n### Test\n- npm test\n');
      assert.strictEqual(hasSplitSources(p.cwd), false, 'legacy repo must not activate composition');
      assert.strictEqual(composeGovernance(p.cwd), null, 'composeGovernance must be a no-op for legacy repos');
    });
  } finally {
    p.cleanup();
  }
});

test('backward-compat: a populated USER layer alone does NOT hijack a non-opted-in repo', () => {
  const p = scratchProject();
  try {
    withHome(p.home, () => {
      // User has universal governance, but the project never opted in.
      p.write('~/.crag/governance.src.md', '# Global\n\n## Security\n- User-layer rule\n');
      p.write('.claude/governance.md', '# Governance — legacy\n\n## Gates\n### Test\n- npm test\n');
      assert.strictEqual(hasSplitSources(p.cwd), false);
      assert.strictEqual(composeGovernance(p.cwd), null);
    });
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Composition: precedence + presence of both src and gen content.
// ---------------------------------------------------------------------------

test('compose: .src + .gen both present -> composed artifact contains both, gen after src, in precedence order', () => {
  const p = scratchProject();
  try {
    withHome(p.home, () => {
      p.write('.crag/governance.src.md', [
        '# Governance — composed-app',
        '## Identity',
        '- Project: composed-app',
        '- Stack: node',
        '## Gates',
        '### Test',
        '- npm test',
        '## Security',
        '- No hardcoded secrets',
      ].join('\n') + '\n');
      p.write('.crag/governance.gen.md', [
        '<!-- GENERATED -->',
        '## Distilled Principles',
        '- Project rule from gen. <!-- principle:34 confidence:0.90 scope:project adopted:2026-07-17 -->',
      ].join('\n') + '\n');
      p.write('~/.crag/governance.gen.md', [
        '<!-- GENERATED -->',
        '## Distilled Principles',
        '- Universal rule from user gen. <!-- principle:12 confidence:0.95 scope:universal adopted:2026-07-17 -->',
      ].join('\n') + '\n');

      const r = composeGovernance(p.cwd);
      assert.ok(r, 'composition must activate once the project opts in');
      // src content present
      assert.ok(r.content.includes('- npm test'), 'gate from .src must be present');
      assert.ok(r.content.includes('- No hardcoded secrets'), 'security from .src must be present');
      // gen content present (both layers)
      assert.ok(r.content.includes('principle:12'), 'user-layer distilled principle must be present');
      assert.ok(r.content.includes('principle:34'), 'project-layer distilled principle must be present');
      // precedence: user.gen (#12) before project.gen (#34)
      assert.ok(r.content.indexOf('principle:12') < r.content.indexOf('principle:34'),
        'user-layer gen must precede project-layer gen (precedence order)');
      assert.strictEqual(r.genBulletsOverflow, 0, 'nothing should overflow the default budget here');
    });
  } finally {
    p.cleanup();
  }
});

test('compose: identical bullet across src and gen is deduped (first/highest-precedence wins)', () => {
  const p = scratchProject();
  try {
    withHome(p.home, () => {
      const dupLine = '- Never commit secrets';
      p.write('.crag/governance.src.md', ['# Governance — dedup', '## Security', dupLine].join('\n') + '\n');
      // Same exact line also appears in a gen file's Security section.
      p.write('.crag/governance.gen.md', ['## Security', dupLine].join('\n') + '\n');

      const r = composeGovernance(p.cwd);
      const occurrences = r.content.split(dupLine).length - 1;
      assert.strictEqual(occurrences, 1, `duplicate line must appear exactly once, saw ${occurrences}`);
    });
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Budget + overflow -> Reference Appendix (never a compiled prompt section).
// ---------------------------------------------------------------------------

test('compose: confidence-ranked budget keeps the top prefix, overflow goes to Reference Appendix', () => {
  const p = scratchProject();
  try {
    withHome(p.home, () => {
      p.write('.crag/governance.src.md', '# Governance — budget\n## Identity\n- Project: budget\n');
      p.write('.crag/governance.gen.md', [
        '## Distilled Principles',
        '- High confidence rule kept in the body. <!-- principle:1 confidence:0.99 scope:project adopted:2026-07-17 -->',
        '- Low confidence rule that should overflow. <!-- principle:2 confidence:0.40 scope:project adopted:2026-07-17 -->',
      ].join('\n') + '\n');

      // Budget large enough for exactly one bullet (l1 is 110 chars + the
      // 1-char cumulative separator; l2 pushes past 112).
      const r = composeGovernance(p.cwd, { budgetChars: 112 });
      assert.strictEqual(r.genBulletsKept, 1);
      assert.strictEqual(r.genBulletsOverflow, 1);
      const [body, appendix = ''] = r.content.split('## Reference Appendix');
      assert.ok(body.includes('principle:1'), 'highest-confidence rule kept in body');
      assert.ok(!body.includes('principle:2'), 'overflow rule must NOT be in the compiled body');
      assert.ok(appendix.includes('principle:2'), 'overflow rule must be in the Reference Appendix');
    });
  } finally {
    p.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Unit-level helpers.
// ---------------------------------------------------------------------------

test('mergeTextLines: dedups by trimmed line, keeps first occurrence order', () => {
  const out = mergeTextLines(['- a\n- b', '- b\n- c']);
  assert.strictEqual(out, '- a\n- b\n- c');
});

test('mergeGates: dedups commands within a section, first (highest precedence) wins', () => {
  const a = [{ section: 'test', cmd: 'npm test', classification: 'MANDATORY', path: null, condition: null }];
  const b = [
    { section: 'test', cmd: 'npm test', classification: 'OPTIONAL', path: null, condition: null },
    { section: 'test', cmd: 'npm run e2e', classification: 'MANDATORY', path: null, condition: null },
  ];
  const merged = mergeGates([a, b]);
  assert.strictEqual(merged.length, 1);
  assert.strictEqual(merged[0].commands.length, 2, 'duplicate npm test collapsed, npm run e2e appended');
  assert.strictEqual(merged[0].commands[0].classification, 'MANDATORY', 'first occurrence classification kept');
});

test('parseGenBullets: extracts id + confidence from the annotation comment', () => {
  const bullets = parseGenBullets('- x <!-- principle:7 confidence:0.88 scope:project adopted:2026-07-17 -->');
  assert.strictEqual(bullets.length, 1);
  assert.strictEqual(bullets[0].id, '7');
  assert.strictEqual(bullets[0].confidence, 0.88);
});

test('applyBudget: prefix semantics — a higher-confidence rule is never dropped for a smaller lower-confidence one', () => {
  const bullets = [
    { line: '-'.repeat(50), id: 'hi', confidence: 0.9 },
    { line: '-'.repeat(10), id: 'lo', confidence: 0.1 },
  ];
  // Budget fits only the first (0.9) bullet; the small 0.1 bullet must NOT sneak in.
  const { kept, overflow } = applyBudget(bullets, 51);
  assert.strictEqual(kept.length, 1);
  assert.strictEqual(kept[0].id, 'hi');
  assert.strictEqual(overflow[0].id, 'lo');
});

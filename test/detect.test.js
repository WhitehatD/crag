'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { detectWorkspace } = require('../src/workspace/detect');

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

console.log('\n  workspace/detect.js');

// Helper: make a temp workspace dir and clean it up
function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-ws-test-'));
  try { fn(dir); }
  finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); }
    catch {}
  }
}

test('returns none for empty directory', () => {
  withTempDir((dir) => {
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'none');
  });
});

test('detects pnpm workspace', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'pnpm');
  });
});

test('detects npm workspace via package.json', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'root',
      workspaces: ['packages/*'],
    }));
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'npm');
  });
});

test('detects npm workspace with object form', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      name: 'root',
      workspaces: { packages: ['apps/*'] },
    }));
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'npm');
  });
});

test('detects Cargo workspace', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[workspace]\nmembers = ["crate-a", "crate-b"]\n');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'cargo');
    assert.deepStrictEqual(ws.patterns, ['crate-a', 'crate-b']);
  });
});

test('skips Cargo.toml without [workspace] section', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "mylib"\n');
    const ws = detectWorkspace(dir);
    assert.notStrictEqual(ws.type, 'cargo');
  });
});

test('detects Go workspace', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'go.work'), 'go 1.22\n\nuse (\n  ./module-a\n  ./module-b\n)\n');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'go');
  });
});

test('detects Nx workspace', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'nx.json'), '{}');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'nx');
  });
});

test('detects Turborepo', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'turbo.json'), '{}');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'turbo');
  });
});

test('detects Bazel WORKSPACE', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'WORKSPACE'), '');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'bazel');
  });
});

test('detects Bazel MODULE.bazel', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'MODULE.bazel'), '');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'bazel');
  });
});

test('detects git submodules', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, '.gitmodules'),
      '[submodule "sub1"]\n  path = sub1\n  url = https://example.com/sub1.git\n');
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'git-submodules');
    assert.ok(ws.submodules.some(s => s.name === 'sub1'));
  });
});

test('detects independent nested repos', () => {
  withTempDir((dir) => {
    // Parent repo
    fs.mkdirSync(path.join(dir, '.git'));
    // Two child repos
    fs.mkdirSync(path.join(dir, 'backend', '.git'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'frontend', '.git'), { recursive: true });
    const ws = detectWorkspace(dir);
    assert.strictEqual(ws.type, 'independent-repos');
    assert.strictEqual(ws.nestedRepos.length, 2);
  });
});

test('handles malformed package.json gracefully', () => {
  withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'package.json'), '{malformed json');
    const ws = detectWorkspace(dir);
    // Should not throw, falls through to 'none'
    assert.ok(ws.type === 'none' || ws.type === 'npm' || ws.type === 'gradle');
  });
});

test('returns finite result even on empty filesystem root search', () => {
  // Just make sure the loop terminates with something sensible
  const ws = detectWorkspace(os.tmpdir());
  assert.ok(ws.type);
  assert.ok(ws.root);
});

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Detect workspace type by walking up from startDir.
 * Returns { type, root, configFile, members: [], warnings: [] }
 *
 * Warnings surface parse errors (vs. missing files) so users know when a
 * workspace config was present but broken.
 *
 * Supported types (in priority order):
 *   pnpm, npm, yarn, cargo, go, gradle, maven, nx, turbo,
 *   bazel, git-submodules, independent-repos, none
 */
function detectWorkspace(startDir) {
  let current = path.resolve(startDir);
  const warnings = [];

  const wrap = (result) => ({ ...result, warnings });

  while (true) {
    // 1. pnpm workspaces
    const pnpmWs = path.join(current, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmWs)) {
      return wrap({ type: 'pnpm', root: current, configFile: 'pnpm-workspace.yaml', members: [] });
    }

    // 2. npm/yarn workspaces (package.json with "workspaces")
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces.packages || []);
          return wrap({ type: 'npm', root: current, configFile: 'package.json', members: [], patterns });
        }
      } catch (err) {
        warnings.push(`malformed package.json at ${pkgPath}: ${err.message}`);
      }
    }

    // 3. Cargo workspace
    const cargoPath = path.join(current, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      try {
        const content = fs.readFileSync(cargoPath, 'utf-8');
        if (content.includes('[workspace]')) {
          const membersMatch = content.match(/members\s*=\s*\[([\s\S]*?)\]/);
          const patterns = membersMatch
            ? membersMatch[1].match(/"([^"]+)"/g)?.map(m => m.replace(/"/g, '')) || []
            : [];
          return wrap({ type: 'cargo', root: current, configFile: 'Cargo.toml', members: [], patterns });
        }
      } catch (err) {
        warnings.push(`malformed Cargo.toml at ${cargoPath}: ${err.message}`);
      }
    }

    // 4. Go workspace
    const goWork = path.join(current, 'go.work');
    if (fs.existsSync(goWork)) {
      try {
        const content = fs.readFileSync(goWork, 'utf-8');
        const useMatch = content.match(/use\s*\(([\s\S]*?)\)/);
        const patterns = useMatch
          ? useMatch[1].split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//'))
          : [];
        return wrap({ type: 'go', root: current, configFile: 'go.work', members: [], patterns });
      } catch (err) {
        warnings.push(`malformed go.work at ${goWork}: ${err.message}`);
      }
    }

    // 5. Gradle multi-project
    for (const gradleFile of ['settings.gradle.kts', 'settings.gradle']) {
      const gradlePath = path.join(current, gradleFile);
      if (fs.existsSync(gradlePath)) {
        try {
          const content = fs.readFileSync(gradlePath, 'utf-8');
          if (content.includes('include(') || content.includes('include ')) {
            const includes = [];
            const regex = /include\s*\(\s*["']([^"']+)["']/g;
            let m;
            while ((m = regex.exec(content)) !== null) includes.push(m[1].replace(/:/g, '/'));
            // Also match Groovy-style: include 'module'
            const groovyRegex = /include\s+['"]([^'"]+)['"]/g;
            while ((m = groovyRegex.exec(content)) !== null) includes.push(m[1].replace(/:/g, '/'));
            return wrap({ type: 'gradle', root: current, configFile: gradleFile, members: [], patterns: includes });
          }
        } catch (err) {
          warnings.push(`malformed ${gradleFile} at ${gradlePath}: ${err.message}`);
        }
      }
    }

    // 6. Maven multi-module
    const pomPath = path.join(current, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      try {
        const content = fs.readFileSync(pomPath, 'utf-8');
        if (content.includes('<modules>')) {
          const modules = [];
          const regex = /<module>([^<]+)<\/module>/g;
          let m;
          while ((m = regex.exec(content)) !== null) modules.push(m[1]);
          if (modules.length > 0) {
            return wrap({ type: 'maven', root: current, configFile: 'pom.xml', members: [], patterns: modules });
          }
        }
      } catch (err) {
        warnings.push(`malformed pom.xml at ${pomPath}: ${err.message}`);
      }
    }

    // 7. Nx
    if (fs.existsSync(path.join(current, 'nx.json'))) {
      return wrap({ type: 'nx', root: current, configFile: 'nx.json', members: [] });
    }

    // 8. Turborepo
    if (fs.existsSync(path.join(current, 'turbo.json'))) {
      return wrap({ type: 'turbo', root: current, configFile: 'turbo.json', members: [] });
    }

    // 9. Bazel
    for (const bazelFile of ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel']) {
      if (fs.existsSync(path.join(current, bazelFile))) {
        return wrap({ type: 'bazel', root: current, configFile: bazelFile, members: [] });
      }
    }

    // 10. Git submodules
    const gitmodulesPath = path.join(current, '.gitmodules');
    if (fs.existsSync(gitmodulesPath)) {
      try {
        const content = fs.readFileSync(gitmodulesPath, 'utf-8');
        const submodules = [];
        const regex = /\[submodule\s+"([^"]+)"\][\s\S]*?path\s*=\s*(.+)/g;
        let m;
        while ((m = regex.exec(content)) !== null) {
          submodules.push({ name: m[1].trim(), path: m[2].trim() });
        }
        return wrap({ type: 'git-submodules', root: current, configFile: '.gitmodules', members: [], submodules });
      } catch (err) {
        warnings.push(`malformed .gitmodules at ${gitmodulesPath}: ${err.message}`);
      }
    }

    // Stop at git root (if reached without finding workspace markers)
    if (fs.existsSync(path.join(current, '.git'))) {
      // Check for independent nested repos (multiple .git dirs in children)
      const nestedRepos = findNestedRepos(current);
      if (nestedRepos.length >= 2) {
        return wrap({ type: 'independent-repos', root: current, configFile: null, members: [], nestedRepos });
      }
      // Single repo, no workspace
      return wrap({ type: 'none', root: current, configFile: null, members: [] });
    }

    // Move up
    const parent = path.dirname(current);
    if (parent === current) break; // Filesystem root
    current = parent;
  }

  return wrap({ type: 'none', root: startDir, configFile: null, members: [] });
}

/**
 * Scan immediate child directories for independent git repos.
 */
function findNestedRepos(dir) {
  const repos = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const childGit = path.join(dir, entry.name, '.git');
      if (fs.existsSync(childGit)) {
        repos.push({ name: entry.name, path: path.join(dir, entry.name) });
      }
    }
  } catch { /* permission error — skip */ }
  return repos;
}

module.exports = { detectWorkspace, findNestedRepos };

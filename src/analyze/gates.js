'use strict';

/**
 * Gate inference per language/runtime.
 *
 * Reads the `_manifests` attached by stacks.js and produces concrete shell
 * commands that should run as governance gates. Each inferLanguageGates
 * function appends to result.linters / result.testers / result.builders
 * (the existing structure), which the generator in analyze.js turns into
 * the ### Lint / ### Test / ### Build sections of governance.md.
 *
 * Golden rule: prefer conservative, canonical commands. The user can always
 * add exotic flags; we must not guess them.
 */

const fs = require('fs');
const path = require('path');
const { safeRead, safeJson, parseSimpleToml } = require('./stacks');

const push = (arr, cmd) => {
  if (!arr.includes(cmd)) arr.push(cmd);
};

function inferGates(dir, result) {
  inferNodeGates(dir, result);
  inferDenoGates(dir, result);
  inferBunGates(dir, result);
  inferPythonGates(dir, result);
  inferRustGates(dir, result);
  inferGoGates(dir, result);
  inferJavaGates(dir, result);
  inferKotlinGates(dir, result);
  inferDotNetGates(dir, result);
  inferSwiftGates(dir, result);
  inferElixirGates(dir, result);
  inferErlangGates(dir, result);
  inferRubyGates(dir, result);
  inferPhpGates(dir, result);
  inferHaskellGates(dir, result);
  inferOCamlGates(dir, result);
  inferZigGates(dir, result);
  inferCrystalGates(dir, result);
  inferNimGates(dir, result);
  inferJuliaGates(dir, result);
  inferDartGates(dir, result);
  inferCFamilyGates(dir, result);
  inferInfrastructureGates(dir, result);
}

// --- Node ------------------------------------------------------------------

function inferNodeGates(dir, result) {
  const pkg = result._manifests.packageJson;
  if (!pkg) return;

  const scripts = pkg.scripts || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Prefer explicit scripts (most reliable signal)
  if (scripts.test) push(result.testers, 'npm run test');
  if (scripts.lint) push(result.linters, 'npm run lint');
  if (scripts.build) push(result.builders, 'npm run build');
  if (scripts.typecheck || scripts['type-check']) {
    push(result.builders, scripts.typecheck ? 'npm run typecheck' : 'npm run type-check');
  }
  if (scripts['format:check']) push(result.linters, 'npm run format:check');

  // Fall back to tool detection for repos that don't use canonical script names
  if (!scripts.lint) {
    // Modern flat config (eslint.config.*) or legacy (.eslintrc*)
    const hasEslintConfig = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
                             'eslint.config.ts', '.eslintrc', '.eslintrc.js',
                             '.eslintrc.json', '.eslintrc.cjs', '.eslintrc.yaml']
      .some(f => fs.existsSync(path.join(dir, f)));
    if (hasEslintConfig || deps.eslint) {
      push(result.linters, 'npx eslint . --max-warnings 0');
    }

    // XO — used by sindresorhus-family projects (chalk, etc.)
    if (deps.xo || (pkg.xo !== undefined)) {
      push(result.linters, 'npx xo');
    }

    // Biome replaces eslint + prettier in modern projects
    if (fs.existsSync(path.join(dir, 'biome.json')) ||
        fs.existsSync(path.join(dir, 'biome.jsonc')) ||
        deps['@biomejs/biome']) {
      push(result.linters, 'npx biome check .');
    }
  }

  // TypeScript type-check as a gate
  if ((deps.typescript || fs.existsSync(path.join(dir, 'tsconfig.json'))) &&
      !scripts.typecheck && !scripts['type-check']) {
    push(result.linters, 'npx tsc --noEmit');
  }

  // Syntax check for CLI projects
  if (pkg.bin && !result.stack.includes('next.js') && !result.stack.includes('react')) {
    const binFiles = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
    for (const bin of binFiles) {
      push(result.builders, `node --check ${bin}`);
    }
  }
}

// --- Deno ------------------------------------------------------------------

function inferDenoGates(dir, result) {
  if (!result.stack.includes('deno')) return;
  push(result.testers, 'deno test -A');
  push(result.linters, 'deno lint');
  push(result.linters, 'deno fmt --check');
}

// --- Bun -------------------------------------------------------------------

function inferBunGates(dir, result) {
  if (!result.stack.includes('bun')) return;
  // Only add bun test if there's no Node scripts already covering it
  const pkg = result._manifests.packageJson;
  if (!pkg || !pkg.scripts || !pkg.scripts.test) {
    push(result.testers, 'bun test');
  }
}

// --- Python ----------------------------------------------------------------

function inferPythonGates(dir, result) {
  if (!result.stack.includes('python')) return;

  const pyproject = result._manifests.pyproject;
  const runner = result._manifests.pythonRunner;
  const hasTox = result._manifests.hasTox;
  const hasNox = result._manifests.hasNox;

  // Build the runner prefix (e.g. "uv run", "poetry run", "pdm run", "hatch run", "")
  const prefix = runnerPrefix(runner);

  // Test selection (priority: tox > nox > pytest directly)
  if (hasTox) {
    push(result.testers, `${prefix}tox run`.trim());
  } else if (hasNox) {
    push(result.testers, `${prefix}nox`.trim());
  } else if (pyproject && (pyproject.sections.has('tool.pytest.ini_options') ||
                            pyprojectHasDep(pyproject, 'pytest'))) {
    push(result.testers, `${prefix}pytest`.trim());
  } else if (fs.existsSync(path.join(dir, 'pytest.ini')) ||
             fs.existsSync(path.join(dir, 'tests')) ||
             fs.existsSync(path.join(dir, 'test'))) {
    // Bare pytest fallback if there's a tests/ directory
    push(result.testers, `${prefix}pytest`.trim());
  }

  // Lint: ruff > flake8 > pylint
  if ((pyproject && pyproject.sections.has('tool.ruff')) ||
      fs.existsSync(path.join(dir, 'ruff.toml')) ||
      fs.existsSync(path.join(dir, '.ruff.toml')) ||
      pyprojectHasDep(pyproject, 'ruff')) {
    push(result.linters, `${prefix}ruff check .`.trim());
    push(result.linters, `${prefix}ruff format --check .`.trim());
  } else if (pyprojectHasDep(pyproject, 'flake8') || fs.existsSync(path.join(dir, '.flake8'))) {
    push(result.linters, `${prefix}flake8`.trim());
  }

  // Type-check: mypy
  if ((pyproject && pyproject.sections.has('tool.mypy')) ||
      fs.existsSync(path.join(dir, 'mypy.ini')) ||
      fs.existsSync(path.join(dir, '.mypy.ini')) ||
      pyprojectHasDep(pyproject, 'mypy')) {
    push(result.linters, `${prefix}mypy .`.trim());
  }

  // Format-only: black (if not covered by ruff format)
  if (pyprojectHasDep(pyproject, 'black') &&
      !result.linters.some(l => l.includes('ruff format'))) {
    push(result.linters, `${prefix}black --check .`.trim());
  }

  // Build
  if (pyproject && pyproject.sections.has('build-system')) {
    push(result.builders, 'python -m build');
  }
}

function runnerPrefix(runner) {
  switch (runner) {
    case 'uv': return 'uv run ';
    case 'poetry': return 'poetry run ';
    case 'pdm': return 'pdm run ';
    case 'hatch': return 'hatch run ';
    case 'rye': return 'rye run ';
    case 'pipenv': return 'pipenv run ';
    default: return '';
  }
}

function pyprojectHasDep(pyproject, name) {
  if (!pyproject) return false;
  // This is a very loose check — a full TOML parser would inspect
  // project.dependencies / project.optional-dependencies / tool.poetry.dev-dependencies
  // arrays, but we don't have one. We approximate by checking raw content for
  // the dep name appearing in a dependency-like context.
  // For now: check if any section references the tool (e.g. [tool.black] exists).
  const toolSection = `tool.${name}`;
  if (pyproject.sections.has(toolSection)) return true;
  // Also check values for common patterns like "pytest>=7.0"
  for (const [, v] of pyproject.values) {
    if (v.includes(name)) return true;
  }
  return false;
}

// --- Rust ------------------------------------------------------------------

function inferRustGates(dir, result) {
  if (!result.stack.includes('rust')) return;
  push(result.testers, 'cargo test');
  push(result.linters, 'cargo clippy -- -D warnings');
  push(result.linters, 'cargo fmt --check');
}

// --- Go --------------------------------------------------------------------

function inferGoGates(dir, result) {
  if (!result.stack.includes('go')) return;
  push(result.testers, 'go test ./...');
  push(result.linters, 'go vet ./...');
  // golangci-lint if configured
  if (['.golangci.yml', '.golangci.yaml', '.golangci.toml']
      .some(f => fs.existsSync(path.join(dir, f)))) {
    push(result.linters, 'golangci-lint run');
  }
}

// --- Java ------------------------------------------------------------------

function inferJavaGates(dir, result) {
  const buildSystem = result._manifests.javaBuildSystem;
  if (!buildSystem) return;
  // Kotlin projects get their own gates (inferKotlinGates replaces these)
  if (result.stack.includes('kotlin')) return;

  if (buildSystem === 'maven') {
    const cmd = result._manifests.javaWrapper ? './mvnw' : 'mvn';
    push(result.testers, `${cmd} test`);
    push(result.builders, `${cmd} verify`);
    // Checkstyle / Spotbugs if configured
    if (fs.existsSync(path.join(dir, 'checkstyle.xml'))) {
      push(result.linters, `${cmd} checkstyle:check`);
    }
  } else if (buildSystem === 'gradle') {
    const cmd = result._manifests.gradleWrapper ? './gradlew' : 'gradle';
    push(result.testers, `${cmd} test`);
    push(result.builders, `${cmd} build`);
    if (fs.existsSync(path.join(dir, 'config', 'checkstyle'))) {
      push(result.linters, `${cmd} checkstyleMain`);
    }
  }
}

// --- Kotlin ----------------------------------------------------------------

function inferKotlinGates(dir, result) {
  if (!result.stack.includes('kotlin')) return;
  const cmd = result._manifests.gradleWrapper ? './gradlew' : 'gradle';
  push(result.testers, `${cmd} test`);
  push(result.builders, `${cmd} build`);
  // ktlint
  if (fs.existsSync(path.join(dir, '.editorconfig'))) {
    // ktlint uses .editorconfig; advisory only
  }
  // detekt is a common kotlin static analyzer
  if (fs.existsSync(path.join(dir, 'detekt.yml')) ||
      fs.existsSync(path.join(dir, 'detekt-config.yml'))) {
    push(result.linters, `${cmd} detekt`);
  }
}

// --- .NET ------------------------------------------------------------------

function inferDotNetGates(dir, result) {
  if (!result.stack.includes('dotnet')) return;
  push(result.builders, 'dotnet build --no-restore');
  push(result.testers, 'dotnet test --no-build --verbosity normal');
  push(result.linters, 'dotnet format --verify-no-changes');
}

// --- Swift -----------------------------------------------------------------

function inferSwiftGates(dir, result) {
  if (!result.stack.includes('swift')) return;
  push(result.builders, 'swift build');
  push(result.testers, 'swift test');
  if (fs.existsSync(path.join(dir, '.swiftlint.yml'))) {
    push(result.linters, 'swiftlint lint --strict');
  }
}

// --- Elixir ----------------------------------------------------------------

function inferElixirGates(dir, result) {
  if (!result.stack.includes('elixir')) return;
  push(result.testers, 'mix test');
  push(result.linters, 'mix format --check-formatted');
  // Credo is the ubiquitous Elixir linter
  const mixExs = safeRead(path.join(dir, 'mix.exs'));
  if (mixExs.includes('credo')) {
    push(result.linters, 'mix credo --strict');
  }
  if (mixExs.includes('dialyxir') || mixExs.includes('dialyzer')) {
    push(result.linters, 'mix dialyzer');
  }
}

// --- Ruby ------------------------------------------------------------------

function inferRubyGates(dir, result) {
  const ruby = result._manifests.ruby;
  if (!ruby) return;

  // Test runner
  if (ruby.hasRspec) {
    push(result.testers, 'bundle exec rspec');
  } else if (ruby.rakefile) {
    // `rake test` is the idiomatic target
    push(result.testers, 'bundle exec rake test');
  } else if (ruby.hasMinitest) {
    push(result.testers, 'bundle exec rake test');
  }

  // Linters
  if (ruby.hasRubocop) {
    push(result.linters, 'bundle exec rubocop');
  }
  if (ruby.hasStandardRb) {
    push(result.linters, 'bundle exec standardrb');
  }
  if (ruby.hasReek) {
    push(result.linters, 'bundle exec reek');
  }
  if (ruby.hasBrakeman) {
    push(result.linters, 'bundle exec brakeman -q --no-pager');
  }

  // Bundle audit is a sensible security default if Gemfile exists
  if (ruby.gemfile) {
    push(result.linters, 'bundle exec bundle-audit check --update');
  }
}

// --- PHP -------------------------------------------------------------------

function inferPhpGates(dir, result) {
  const php = result._manifests.php;
  if (!php) return;

  // Prefer composer scripts if they exist (most reliable)
  if (php.scripts && php.scripts.test) {
    push(result.testers, 'composer test');
  } else if (php.hasPest) {
    push(result.testers, 'vendor/bin/pest');
  } else if (php.hasPhpunit) {
    push(result.testers, 'vendor/bin/phpunit');
  }

  if (php.hasPhpcs) {
    push(result.linters, 'vendor/bin/phpcs');
  }
  if (php.hasPhpStan) {
    push(result.linters, 'vendor/bin/phpstan analyse');
  }
  if (php.hasPsalm) {
    push(result.linters, 'vendor/bin/psalm');
  }
  if (php.hasPhpCsFixer) {
    push(result.linters, 'vendor/bin/php-cs-fixer fix --dry-run --diff');
  }
  if (php.hasRector) {
    push(result.linters, 'vendor/bin/rector process --dry-run');
  }

  // composer validate is a near-universal sanity gate
  push(result.linters, 'composer validate --strict');
}

// --- Erlang ----------------------------------------------------------------

function inferErlangGates(dir, result) {
  if (!result.stack.includes('erlang')) return;
  const buildSystem = result._manifests.erlangBuildSystem;
  if (buildSystem === 'rebar3') {
    push(result.testers, 'rebar3 eunit');
    push(result.testers, 'rebar3 ct');
    push(result.linters, 'rebar3 dialyzer');
    push(result.builders, 'rebar3 compile');
  } else if (buildSystem === 'erlang.mk') {
    push(result.testers, 'make tests');
    push(result.builders, 'make');
  }
}

// --- Haskell ---------------------------------------------------------------

function inferHaskellGates(dir, result) {
  if (!result.stack.includes('haskell')) return;
  const buildSystem = result._manifests.haskellBuildSystem;
  if (buildSystem === 'stack') {
    push(result.testers, 'stack test');
    push(result.builders, 'stack build');
  } else {
    // cabal / hpack
    push(result.testers, 'cabal test');
    push(result.builders, 'cabal build');
  }
  // hlint is near-universal for Haskell lint
  if (fs.existsSync(path.join(dir, '.hlint.yaml')) || fs.existsSync(path.join(dir, '.hlint.yml'))) {
    push(result.linters, 'hlint .');
  }
}

// --- OCaml -----------------------------------------------------------------

function inferOCamlGates(dir, result) {
  if (!result.stack.includes('ocaml')) return;
  const buildSystem = result._manifests.ocamlBuildSystem;
  if (buildSystem === 'dune') {
    push(result.testers, 'dune runtest');
    push(result.builders, 'dune build');
    push(result.linters, 'dune build @fmt --auto-promote');
  } else if (buildSystem === 'opam') {
    push(result.testers, 'opam exec -- dune runtest');
  }
}

// --- Zig -------------------------------------------------------------------

function inferZigGates(dir, result) {
  if (!result.stack.includes('zig')) return;
  push(result.testers, 'zig build test');
  push(result.builders, 'zig build');
  push(result.linters, 'zig fmt --check .');
}

// --- Crystal ---------------------------------------------------------------

function inferCrystalGates(dir, result) {
  if (!result.stack.includes('crystal')) return;
  push(result.testers, 'crystal spec');
  push(result.builders, 'shards build');
  push(result.linters, 'crystal tool format --check');
  if (fs.existsSync(path.join(dir, '.ameba.yml'))) {
    push(result.linters, 'bin/ameba');
  }
}

// --- Nim -------------------------------------------------------------------

function inferNimGates(dir, result) {
  if (!result.stack.includes('nim')) return;
  push(result.testers, 'nimble test');
  push(result.builders, 'nimble build');
}

// --- Julia -----------------------------------------------------------------

function inferJuliaGates(dir, result) {
  if (!result.stack.includes('julia')) return;
  push(result.testers, 'julia --project=. -e "using Pkg; Pkg.test()"');
}

// --- Dart / Flutter --------------------------------------------------------

function inferDartGates(dir, result) {
  if (!result.stack.includes('dart')) return;
  if (result.stack.includes('flutter')) {
    push(result.testers, 'flutter test');
    push(result.linters, 'flutter analyze');
    push(result.builders, 'flutter build apk --debug');
  } else {
    push(result.testers, 'dart test');
    push(result.linters, 'dart analyze');
    push(result.builders, 'dart compile exe');
  }
  push(result.linters, 'dart format --output=none --set-exit-if-changed .');
}

// --- C / C++ family --------------------------------------------------------

/**
 * Infer gates for C / C++ projects. Prefers task-runner output (mined from
 * Makefile) because the exact build steps vary wildly. Only emits generic
 * gates when the Makefile mining returned nothing.
 */
function inferCFamilyGates(dir, result) {
  const buildSystem = result._manifests.cBuildSystem;
  if (!buildSystem) return;
  // If task-runners.js already populated gates from the Makefile, don't
  // add generic fallbacks — the project-specific targets are better.
  const hasMakeGates =
    (result.taskTargets && result.taskTargets.make && result.taskTargets.make.length > 0);

  if (buildSystem === 'cmake') {
    push(result.builders, 'cmake -S . -B build');
    push(result.builders, 'cmake --build build');
    push(result.testers, 'ctest --test-dir build --output-on-failure');
  } else if (buildSystem === 'meson') {
    push(result.builders, 'meson setup build');
    push(result.builders, 'meson compile -C build');
    push(result.testers, 'meson test -C build');
  } else if (buildSystem === 'autotools') {
    if (!hasMakeGates) {
      push(result.builders, './configure && make');
      push(result.testers, 'make check');
    }
  } else if (buildSystem === 'make' && !hasMakeGates) {
    push(result.builders, 'make');
    push(result.testers, 'make check');
  }
}

// --- Infrastructure --------------------------------------------------------

function inferInfrastructureGates(dir, result) {
  const infra = result._manifests.infra;
  if (!infra) return;

  if (infra.terraform) {
    push(result.linters, 'terraform fmt -check -recursive');
    push(result.linters, 'terraform validate');
    if (fs.existsSync(path.join(dir, '.tflint.hcl'))) {
      push(result.linters, 'tflint');
    }
  }

  if (infra.helm) {
    push(result.linters, 'helm lint');
  }

  if (infra.openapi) {
    push(result.linters, `npx @stoplight/spectral-cli lint ${infra.openapi}`);
  }

  if (infra.proto) {
    push(result.linters, 'buf lint');
  }

  // Dockerfile → hadolint (advisory — too noisy by default to be mandatory)
  if (result.stack.includes('docker')) {
    result._advisories = result._advisories || [];
    result._advisories.push('hadolint Dockerfile');
  }

  // GitHub Actions workflows → actionlint (advisory)
  if (fs.existsSync(path.join(dir, '.github', 'workflows'))) {
    result._advisories = result._advisories || [];
    result._advisories.push('actionlint');
  }
}

module.exports = { inferGates };

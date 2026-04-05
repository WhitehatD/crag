# Supported languages and runtimes

`crag analyze` detects 25+ stacks and build systems. Each row lists the
primary manifest files it looks for and the canonical gate commands it
emits per language. Framework detection only fires when the dependency
is in runtime `dependencies`, not `devDependencies`, so projects that
use Express as a test fixture don't get labelled as Express apps.

| Family | Detected from | Gates emitted |
|---|---|---|
| Node / Deno / Bun | `package.json`, `deno.json`, `bun.lockb`, `bunfig.toml`, `tsconfig.json` | `npm run test/lint/build`, `tsc --noEmit`, `eslint`, `biome check`, `xo`, `deno test/lint/fmt`, `bun test` |
| Python | `pyproject.toml`, `setup.py`, `requirements.txt` | `uv run pytest`, `poetry run pytest`, `pdm run pytest`, `hatch run pytest`, `tox run`, `nox`, `ruff check/format`, `mypy`, `black --check`, `python -m build` — detected per runner |
| Rust | `Cargo.toml` (incl. `[workspace]`) | `cargo test`, `cargo clippy -- -D warnings`, `cargo fmt --check` |
| Go | `go.mod`, `.golangci.yml` | `go test ./...`, `go vet ./...`, `golangci-lint run` |
| Java / Kotlin | `pom.xml`, `build.gradle(.kts)`, Kotlin plugin detection | `./mvnw test verify`, `./gradlew test build`, `checkstyle`, `detekt` |
| Ruby | `Gemfile`, `*.gemspec`, `Rakefile` | `bundle exec rspec`, `bundle exec rake test`, `rubocop`, `standardrb`, `brakeman`, `bundle-audit` |
| PHP | `composer.json`, `phpunit.xml(.dist)` | `composer test`, `vendor/bin/phpunit`, `vendor/bin/pest`, `vendor/bin/phpstan analyse`, `vendor/bin/psalm`, `vendor/bin/phpcs`, `composer validate --strict` |
| .NET | `*.csproj`, `*.fsproj`, `*.vbproj`, `*.sln`, `*.slnx`, `Directory.Build.props`, `global.json` | `dotnet test`, `dotnet build --no-restore`, `dotnet format --verify-no-changes` |
| Swift | `Package.swift` | `swift test`, `swift build`, `swiftlint` |
| Elixir / Erlang | `mix.exs`, `rebar.config` | `mix test`, `mix format --check-formatted`, `mix credo --strict`, `mix dialyzer`, `rebar3 eunit`, `rebar3 ct`, `rebar3 dialyzer` |
| Haskell | `*.cabal`, `cabal.project`, `stack.yaml`, `package.yaml` | `cabal test/build`, `stack test/build`, `hlint .` |
| OCaml | `dune-project`, `*.opam` | `dune runtest`, `dune build` |
| Zig | `build.zig`, `build.zig.zon` | `zig build test`, `zig build`, `zig fmt --check .` |
| Crystal | `shard.yml` | `crystal spec`, `shards build`, `crystal tool format --check` |
| Nim | `*.nimble`, `nim.cfg` | `nimble test`, `nimble build` |
| Julia | `Project.toml` (uuid-sniffed) | `julia --project=. -e 'Pkg.test()'` |
| Dart / Flutter | `pubspec.yaml` | `flutter test/analyze/build`, `dart test/analyze/compile`, `dart format --set-exit-if-changed .` |
| C / C++ | `CMakeLists.txt`, `configure.ac`, `meson.build`, `Makefile` (with C sources) | `cmake -S . -B build && cmake --build build`, `ctest --test-dir build`, `meson setup/compile/test`, `./configure && make && make check` |
| Lua | `*.rockspec`, `.luarc.json`, `.luacheckrc` | (task-runner mined) |
| Infrastructure | `*.tf`, `Chart.yaml`, `Dockerfile`, `openapi.yaml`, `*.proto` | `terraform fmt/validate`, `tflint`, `helm lint`, `hadolint Dockerfile`, `spectral lint`, `buf lint` |

## False-positive guards

- **Framework detection**: only fires from runtime `dependencies`, never
  `devDependencies`. Axios imports Express for its test harness; that
  doesn't make Axios an Express application.
- **Fixture directory exclusion**: nested stack detection skips
  `examples/`, `samples/`, `fixtures/`, `docs/`, `testdata/`,
  `benchmarks/`, `playground/`, `sandbox/`, `__fixtures__/`,
  `__mocks__/`, `node_modules/`, `vendor/`, `target/`, `dist/`,
  `build/`, `out/`, `bin/`, `obj/`. Monorepos with fixture sub-apps
  report the primary stack only.
- **Symlink cycle protection**: `detectNestedStacks` tracks visited
  realpaths via `fs.lstatSync` + a `Set`. Symlinked directories are
  skipped entirely to prevent pathological enumeration.
- **Task runner gates**: Makefile target mining only recognises
  canonical gate names (`test`, `lint`, `check`, `verify`, `kselftest`,
  `selftest`, `sanity`, `smoke`, `integration`, `e2e`, `unit`, and
  ~20 more). Artifact targets like `vmlinux` or `bindist` are ignored.

# Supported workspaces

pnpm · npm / yarn · Cargo (`[workspace]`) · Go multi-module (`go.work`)
· Gradle multi-module · Maven reactor · Nx · Turborepo · Bazel · git
submodules · independent nested repos · subservices (polyglot
microservices under `src/*`, `services/*`, `packages/*`, `apps/*`,
`backend/`, `frontend/`, … with no root manifest — handled by nested
stack detection).

## Commands

```bash
crag workspace              # human-readable inspection
crag workspace --json       # machine-readable
crag analyze --workspace    # per-member governance sections
```

## Multi-level governance

Root governance sets cross-cutting rules (branch strategy, security).
Member governance adds stack-specific gates via
`## Gates (inherit: root)`:

```markdown
# Governance — backend/
## Gates (inherit: root)
### Backend
- cargo test
- cargo clippy -- -D warnings
```

When gates run, the root's gates are prepended first, then the
member's gates are appended. This lets a monorepo have one source of
truth for security/branch policy while per-service test/lint commands
live with the services.

## Fixture filtering

`crag analyze --workspace` filters these directory names out of the
per-member enumeration so monorepos like vite (79 fixture packages)
don't get 79 governance sections:

`playground/`, `playgrounds/`, `sandbox/`, `fixtures/`, `fixture/`,
`__fixtures__/`, `__mocks__/`, `__snapshots__/`, `examples/`,
`example/`, `samples/`, `sample/`, `demos/`, `demo/`, `testdata/`,
`test-data/`, `test_data/`, `benchmarks/`, `benchmark/`, `bench/`,
`e2e/`, `integration-tests/`, `perf/`, `stress/`, `docs/`, `doc/`,
`documentation/`, `website/`, `site/`, `www/`, `node_modules/`,
`vendor/`, `vendored/`, `third_party/`, `third-party/`, `target/`,
`dist/`, `build/`, `out/`, `bin/`, `obj/`.

## Symlink cycle protection

`detectNestedStacks` tracks visited realpaths via `fs.lstatSync` + a
`Set`. A symlink loop like `src/app → ../../src/app` is detected on
the first visit and skipped. Pathological monorepos cannot blow up the
scanner.

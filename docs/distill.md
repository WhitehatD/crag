# crag distill — the governance back-edge

`crag distill` closes the loop between **verified memory principles** and the
**governance files every agent obeys**. Compilation (`crag compile`) is the
forward edge: one governance source → 23 target configs. Distillation is the
*back*-edge: a memory backend's compile-eligible principles → managed
`governance.gen.md` files that then flow through the same compile pipeline.

Like `crag mcp`, distill is an **optional, opt-in module**. The deterministic
compiler never imports it. If you never configure a memory backend, `crag
distill` is a clear no-op and nothing about the zero-dependency compile core
changes.

## The composed-governance model

Governance is no longer a single hand-edited `governance.md`. It is *composed*
at compile time from up to four **source** files, in two layers:

```
SOURCES (two layers × {manual, machine})            OWNER
  user.src   ~/.crag/governance.src.md               human (global / org)
  user.gen   ~/.crag/governance.gen.md               ← crag distill (universal)
  project.src  <repo>/.crag/governance.src.md         human (this repo)
  project.gen  <repo>/.crag/governance.gen.md         ← crag distill (project)
        │
        ▼  crag compile — COMPOSITION (pure text, no LLM, deterministic)
           precedence: user.src > user.gen > project.src > project.gen
           + line-level dedup + confidence-ranked token budget
        ▼
  <repo>/.claude/governance.md   ★ PURE ARTIFACT — "GENERATED, do not edit" ★
        ▼
  23 targets (CLAUDE.md, AGENTS.md, Cursor, CI, hooks, …)
```

- `~/.crag/` is crag's existing user-level state directory (the same one that
  holds cloud credentials) — not a new location.
- **Retirement by omission**: distill only renders principles the backend
  reports as `claim_health: fresh` or `passing`. A principle that goes stale
  simply stops rendering on the next distill run — no explicit delete, no rot.
- **Propose-don't-impose via git**: `.gen` files are committed. A distill
  refresh is an ordinary reviewable diff. `--check` computes that diff without
  writing, for CI.
- **Determinism preserved**: the compile/compose path is pure text — no LLM,
  no network. All backend/LLM interaction lives on the distill side, behind the
  opt-in `MemoryAdapter`. crag itself never needs an API key; if it ever did,
  its trust story would die, so it never does. Any rephrasing of a principle
  happens *backend-side* before crag sees the string — crag only ever places
  verbatim text.

## Backward compatibility (opt-in, additive)

The split is **opt-in per project**. Composition activates only when the repo
has a project-level split source (`<repo>/.crag/governance.src.md` or
`.gen.md`). Until then:

- `crag compile` reads `.claude/governance.md` directly, **byte-for-byte
  identical to before** the composed model existed.
- A populated *user* layer alone never hijacks a repo that hasn't opted in —
  it would otherwise silently overwrite a hand-maintained `governance.md` in
  every legacy repo you touch. That footgun is designed out.

### Migration

Opt a repo in with one command:

```bash
crag distill --migrate      # copies .claude/governance.md → .crag/governance.src.md
```

It refuses if `.crag/governance.src.md` already exists (non-destructive). After
migrating, edit `.crag/governance.src.md` as your manual source; the compiled
`.claude/governance.md` becomes a generated artifact you no longer hand-edit.

## Configure a memory backend

Distill fetches principles through the **same opt-in adapter** as `crag mcp`
(there is no second connector). Configure it via either:

- env `CRAG_MEMORY_MCP` — a JSON object (`{"command":"…","args":[…]}` for a
  stdio backend, or `{"url":"…"}` / a bare URL for HTTP), or
- `<repo>/.crag/mcp.json` — the same shape as a project-local file.

The backend must expose a `principles_export` tool returning either a JSON
array of principles or `{ "principles": [ … ] }`. Each principle has the shape:

```json
{ "id": 172, "text": "…", "scope": "universal|project",
  "confidence": 0.92, "claim_health": "fresh|passing|stale|…" }
```

- `scope: "universal"` → the user-layer `~/.crag/governance.gen.md`.
- any other scope (`project`, `stack`, missing) → the project-layer
  `<repo>/.crag/governance.gen.md` (unknown scopes never leak into the shared
  user layer — fail-safe default).

If no backend is configured, `crag distill` prints a clear message and does
nothing.

## Usage

```bash
crag distill            # fetch principles, write the .gen files (per layer)
crag distill --check    # preview the would-change diff, write nothing (CI-safe)
crag distill --migrate  # opt this repo into the composed model (one-time)
```

Then recompose + recompile:

```bash
crag compile            # composes .crag/ sources → .claude/governance.md → targets
```

`crag distill` is idempotent: re-running on an unchanged principle set produces
no diff (the volatile as-of timestamp and per-rule adoption date are ignored
when deciding whether the substance changed — so review diffs stay clean).

## Rendered `.gen` format

Each principle renders as one annotated bullet under a single
`## Distilled Principles` heading, sorted by id for stable diffs:

```markdown
<!-- GENERATED by `crag distill` on <as-of> — DO NOT EDIT BY HAND. … -->

## Distilled Principles

- Never commit secrets. <!-- principle:12 confidence:0.95 scope:universal adopted:2026-07-17 -->
```

The `<!-- principle:… -->` annotation back-links each rule to its source claim
(id + confidence + adopted date) so a rot audit can trace a compiled rule to
the principle behind it.

## Composition rules (deterministic)

- **Precedence**: `user.src > user.gen > project.src > project.gen`. On a
  scalar field (project name, stack), the highest-precedence non-empty value
  wins. Distilled bullets render in that same precedence order.
- **Dedup**: identical rule lines (compared by trimmed text) collapse to one —
  the highest-precedence occurrence.
- **Token budget**: gen-sourced distilled principles are ranked by confidence
  and kept up to a per-compose character budget (a confidence-ordered
  *prefix* — a higher-confidence rule is never dropped in favor of a smaller
  lower-confidence one). Overflow goes to a top-level `## Reference Appendix`
  section, which **no compile target reads** — so overflow never bloats the
  agent prompt files, it stays available for reference in the artifact only.

  > This v1 applies one budget at composition time (upstream of the 23
  > targets). Per-target budgets are a future refinement.

## Where distill sits in the loop

Distillation is one edge of the sealed governance loop (see
`docs/closed-loop.md`): verified memory → **distill** → managed `.gen` →
compile → targets → enforcement → captured lessons → verified memory. The only
remaining human link is reviewing `.gen` diffs — everything else is machinery.

# The governance.md format

The one file you maintain. Everything else is generated. Target length:
20–30 lines.

## Minimal example

```markdown
# Governance — example-app

## Identity
- Project: example-app

## Gates (run in order, stop on failure)
### Lint
- npx eslint . --max-warnings 0
- npx tsc --noEmit

### Test
- npm run test
- cargo test

### Build
- cargo build --release

## Branch Strategy
- Trunk-based, conventional commits

## Security
- No hardcoded secrets or API keys
```

## Section annotations (all optional)

### Path-scoped sections

```markdown
### Frontend (path: web/)
- npx biome check .
- npm run build
```

Gates in this section run with `cwd = web/`. Used for monorepos where
different directories have different build systems.

### Conditional sections

```markdown
### TypeScript (if: tsconfig.json)
- npx tsc --noEmit
```

Entire section is skipped if `tsconfig.json` doesn't exist at project
root. Used to make governance files portable across configurations.

### Gate classifications

```markdown
### Test
- npm run test                    # [MANDATORY] — default, stops on failure
- npm run test:slow               # [OPTIONAL] — warns and continues
- npm run test:experimental       # [ADVISORY] — always runs, never stops
```

| Classification | Behavior on failure |
|---|---|
| `[MANDATORY]` (default) | Stop execution |
| `[OPTIONAL]` | Print warning, continue to next gate |
| `[ADVISORY]` | Log result, always proceed |

### Inheritance (monorepo)

```markdown
## Gates (inherit: root)
### Backend
- cargo test
```

In a workspace member, this merges the root governance's gates first,
then appends the member's own gates. Used for multi-level governance in
monorepos where root cross-stack rules apply to every member plus
per-member stack-specific rules.

## Parser security

All annotation path values (`path:`, `if:`) are validated via
`isValidAnnotationPath()` which rejects:

- Absolute POSIX paths (`/...`)
- Windows drive-letter paths (`C:\...`)
- UNC paths (`\\server\share`)
- Parent traversal (`../`)
- Newlines or null bytes (defense against injection into generated
  YAML/shell)

Invalid annotations are dropped and a warning is recorded in
`parsed.warnings`.

The parser has a 256 KB content cap to prevent ReDoS on pathological
input. Truncation cuts at the last `\n## ` section boundary so gates
never get severed mid-list.

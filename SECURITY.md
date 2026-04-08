# Security Policy

## Supported Versions

crag is currently pre-1.0 and ships from `master`. Security fixes land in the
latest minor version and are released as a patch bump. Older minor versions do
not receive backports.

| Version | Supported |
| ------- | --------- |
| 0.3.x   | yes       |
| < 0.3   | no        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security reports.**

Email `alexc.forbusiness@gmail.com` with:

1. A description of the issue and the threat model it breaks (attacker
   capabilities, access assumed, impact).
2. A minimal reproducer — ideally a `governance.md` or workspace layout plus
   the exact `crag` command that triggers the bug.
3. The crag version (`crag version`) and platform (OS + Node version).

You can expect:

- An acknowledgment within 72 hours.
- An initial assessment (confirmed / not a vuln / needs more info) within
  one week.
- A fix, release, and public advisory coordinated with you once the patch
  lands on npm.

GitHub Security Advisories are also accepted via the "Report a vulnerability"
button on the Security tab of the repository.

## Threat Model

crag is designed to run on developer machines and in CI with the following
assumptions:

- **`governance.md` is trusted-but-authored-by-humans.** The parser rejects
  absolute paths and `..` in path/condition annotations, and every downstream
  generator escapes user values for its target format (shell, YAML, markdown).
  However, governance content can still contain arbitrary commands that crag
  will faithfully wire into CI hooks. Review changes to `governance.md` in PRs
  the same way you review CI configs.
- **The `src/skills/*.md` files that ship in the npm package are trusted.**
  Skill sync validates that sources are regular files inside the package's
  own `src/skills/` directory via `fs.realpathSync`, blocking symlink
  redirection.
- **crag never executes code from the npm registry at install time.** The
  package has no `postinstall` / `preinstall` scripts. It has zero runtime
  dependencies, so there is no transitive supply chain.
- **The auto-update check contacts `registry.npmjs.org` over HTTPS** with a
  3-second timeout, 100 KB response cap, and 24-hour cache. It fails silently
  on any error. Set `CRAG_NO_UPDATE_CHECK=1` to disable entirely.

## Hardening Already in Place

- **Shell injection** — all user-controlled values interpolated into shell
  commands are routed through `shellEscapeDoubleQuoted()` which escapes
  `\`, `` ` ``, `$`, `"` in the correct order.
- **YAML injection** — all user-controlled values interpolated into YAML
  (GitHub Actions, pre-commit config) go through `yamlScalar()` which quotes
  colons, `#`, control chars, boolean-like and number-like strings.
- **Path traversal** — workspace enumeration uses `fs.realpathSync` to resolve
  symlinks and rejects any path whose real location falls outside the
  workspace root. Gate annotations are rejected if absolute or containing
  `..` segments.
- **Symlink attacks on skill sync** — `isTrustedSource()` rejects symlinks
  and any source outside `src/skills/`.
- **ReDoS** — `parseGovernance()` caps input at 256 KB and uses line-scan
  extraction instead of complex regexes.
- **CRLF portability** — skill hashes are computed after `\r\n → \n`
  normalization so Windows and Unix contributors produce identical integrity
  values.
- **Atomic writes** — every compile target writes via `atomicWrite()` (temp
  file with unpredictable crypto-random suffix + rename). Partial failures
  leave the old state intact.
- **CI secrets** — `NPM_TOKEN` is scoped to the publish job only. `id-token:
  write` is scoped to the release workflow for SLSA provenance.

## Scope

In scope:

- Any of the command surface (`init`, `check`, `compile`, `analyze`, `diff`,
  `upgrade`, `workspace`, `audit`, `hook`, `demo`, `doctor`, `auto`).
- The generated artifacts (CI configs, hooks, AI agent rule files).
- The auto-update and skill-sync machinery.
- The release pipeline (`.github/workflows/release.yml`).

Out of scope:

- Vulnerabilities in Claude Code itself, the npm registry, or GitHub Actions.
- Configuration mistakes in the user's own `governance.md` (e.g. explicitly
  writing a destructive command).
- Social engineering of maintainers.

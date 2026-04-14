# r/cursor Post

**Flair:** Tips & Tricks

**Title:** Auto-generate .cursor/rules from your CI pipeline — stops your Cursor rules from drifting

---

**Body:**

If you maintain `.cursorrules` or `.cursor/rules/` files manually, you've probably hit this: you add a lint rule or change a test command in CI, and your Cursor rules stay stale. Cursor keeps telling the agent to run the old command. You fix it eventually, but it keeps happening.

I looked at this across 100 popular repos and the pattern is everywhere. Even repos that have Cursor rules (like cal.com, shadcn/ui, trpc) have rules that don't fully match their CI pipeline.

### The approach

Instead of writing Cursor rules by hand, I extract the rules from the source of truth — your CI config and package manifests — into a single `governance.md`, then compile it to `.cursor/rules/governance.mdc` in Cursor's native MDC format.

```bash
npx @whitehatd/crag
```

That's it. It reads your project (package.json, GitHub Actions, Cargo.toml, whatever you have), figures out your test/lint/build commands, code style, and conventions, then generates config files for Cursor and 13 other tools.

### What the generated .mdc looks like

The output uses Cursor's MDC frontmatter format with proper `alwaysApply: true` and description fields. It includes:

- Your actual quality gates (test, lint, build commands) in the right order
- Security rules (no hardcoded secrets)
- Commit conventions (if you use conventional commits)
- Framework-specific conventions it detected

If you already have custom content in your `.cursor/rules/` files, crag preserves it — it wraps generated content in markers and only replaces the generated sections on recompile.

### Keeping it in sync

```bash
npx @whitehatd/crag hook install
```

This adds a pre-commit hook. Whenever governance.md changes (because you updated your CI or added a new lint rule), it recompiles your Cursor rules automatically. No more drift.

### Quick audit

If you want to check whether your current setup is drifting without installing anything:

[crag.sh/audit](https://crag.sh/audit) — paste your repo URL, get a grade.

Zero dependencies, no LLM, MIT licensed. [GitHub](https://github.com/WhitehatD/crag).

Works for any language (25+ detected) and any CI system (GitHub Actions, GitLab CI, CircleCI, etc.).

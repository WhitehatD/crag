# crag mcp — the MCP gateway

`crag mcp` starts an MCP (Model Context Protocol) server on stdio. It is an
**optional, opt-in module** — the deterministic compiler (`crag compile`,
`crag audit`) never imports it and has no idea it exists. Nothing about the
zero-dependency compile core changes because this module exists.

Two kinds of tools show up on this server, and they are structurally
different:

1. **Governance tools** — always present. They run the exact same
   deterministic code path as the CLI (`crag compile`, `crag audit`,
   project status), just wrapped for MCP tool-call semantics. Pure, local,
   no network calls, no LLM involved.
2. **Federated memory tools** — present **only if you configure a memory
   backend**. Absent otherwise. crag never assumes you have one, never talks
   to one by default, and never hardcodes any backend's address or name.

## Install / register

```bash
npm install -g @whitehatd/crag
claude mcp add crag crag-mcp
```

Or run it directly:

```bash
crag mcp            # via the crag CLI subcommand
crag-mcp             # via the standalone binary (what `claude mcp add` wires up)
```

Both entry points start the identical server (`src/mcp/server.js`); `crag mcp`
is a convenience subcommand, `crag-mcp` is the binary most MCP clients expect
to `command`-spawn directly.

## Governance tools

| Tool | What it does | Wraps |
|---|---|---|
| `crag.compile` | Compile `.claude/governance.md` into a target config (or `all`) | `crag compile` |
| `crag.audit` | Drift report — stale configs, gate-vs-reality failures, missing targets | `crag audit --json` |
| `crag.status` | Governance snapshot: gate count, runtimes, whether `governance.md` exists | `parseGovernance` (direct call, no subprocess needed) |

`crag.compile` and `crag.audit` run the CLI in a **child process**, not
in-process. This is deliberate: the CLI commands call `process.exit()` on
several paths (missing governance.md, drift found, unknown target). Calling
them directly from the MCP server would kill the server on the first
`crag.audit` that finds drift. The subprocess boundary makes that impossible
by construction, and it guarantees the MCP tool's output is byte-identical
to what you'd get running the CLI yourself — there's no second implementation
to drift out of sync with the first.

## Federation (opt-in, generic)

If you run a memory/knowledge MCP server (your own, or any MCP-compatible
backend), point crag-mcp at it and its tools appear on the crag surface,
namespaced under `crag.` — e.g. a backend tool named `recall` shows up as
`crag.recall`.

Configure it one of two ways (env var wins if both are present):

**Environment variable**, JSON object or bare URL:

```bash
# stdio backend (crag-mcp spawns it as a child process)
export CRAG_MEMORY_MCP='{"command":"my-memory-server","args":["--port","0"]}'

# HTTP backend (bare URL shorthand)
export CRAG_MEMORY_MCP='https://your-memory-server.example/mcp'
```

**Project config file**, `.crag/mcp.json`:

```json
{
  "url": "http://localhost:PORT/mcp"
}
```

or, for a stdio backend:

```json
{
  "command": "my-memory-server",
  "args": ["--stdio"],
  "env": { "MY_MEMORY_SERVER_TOKEN": "..." }
}
```

Replace `your-memory-server.example` / `PORT` / `my-memory-server` with your
own backend — these are placeholders, not defaults. If neither the env var
nor `.crag/mcp.json` is present, `crag mcp` starts with **only** the 3
governance tools. No error, no silent phone-home, no default endpoint.

### If the backend is unreachable

Federation failures are soft. If the configured backend can't be reached
(wrong command, connection refused, bad config), `crag mcp` logs a warning
to stderr and starts anyway with the governance tools intact. A broken
memory backend never takes down the part of the gateway you actually need
for CI and local governance.

### The adapter seam

Federation is built on a narrow `MemoryAdapter` interface
(`connect` / `listTools` / `callTool` / `disconnect`) in
`src/mcp/adapters/memory-adapter.js`. Two adapters ship today:

- `stdio-memory-adapter.js` — spawns your backend as a child process and
  speaks MCP JSON-RPC over its stdio.
- `http-memory-adapter.js` — POSTs JSON-RPC requests to a configured URL
  (a minimal subset of MCP's streamable-HTTP transport).

Nothing in `src/mcp/federation.js` or `src/mcp/server.js` knows or cares
which one is in play, or what product is on the other end. Adding a third
transport means adding a third adapter; nothing else changes.

### Disposition stubs

Two tool names — `crag.disposition_list` and `crag.disposition_resolve` —
are always exposed when a backend is configured, forwarded generically to
your backend's `disposition_list` / `disposition_resolve` tools. If your
backend doesn't implement them yet, calling them surfaces your backend's own
"tool not found" response — an honest stub, not a fake success.

## Protocol notes

- Transport: newline-delimited JSON-RPC 2.0 over stdio (one JSON object per
  line — the MCP stdio convention, not LSP's `Content-Length` framing).
- No MCP SDK dependency. `src/mcp/stdio-rpc.js` is a ~100-line hand-rolled
  reader/writer; the server and the federation client (`stdio-memory-adapter.js`)
  both build on it. Keeping this layer dependency-free matters because
  `crag-mcp` is the one part of crag that talks to an external process —
  the fewer moving pieces in that path, the fewer ways it can break silently.
- Closing stdin cleanly shuts the server down (exit code 0).

## The determinism boundary, restated

`src/compile/` — the code that produces `CLAUDE.md`, `AGENTS.md`, CI
workflows, and the other 20 targets — has **zero** dependency edges into
`src/mcp/`. You can delete `src/mcp/` and `bin/crag-mcp.js` entirely and
`crag compile` / `crag audit` behave exactly as before, because they always
have: the MCP gateway is a consumer of the compiler, never the other way
around. That's the whole point of this module living in its own directory
instead of being woven into `src/compile/`.

'use strict';

/**
 * Federation — proxies a configured memory backend's tools through the
 * crag-mcp gateway, namespaced under `crag.` (rev 5, §5.1).
 *
 * Graceful by construction: if `loadMemoryConfig()` returns null (no env
 * var, no .crag/mcp.json), `buildFederation()` resolves to
 * `{ tools: [], adapter: null }` — the caller registers zero extra tools.
 * No brain-specific or otherwise product-specific name ever appears here;
 * everything downstream of the adapter is generic MemoryAdapter traffic.
 */

const { loadMemoryConfig } = require('./config');
const { createAdapter } = require('./adapters/memory-adapter');

const NAMESPACE = 'crag.';

// Disposition tools (rev 5, §5.2 / task item 4): stubs today, wired for
// real once the sibling disposition engine ships. They proxy generically to
// whatever the configured backend exposes under these names — if the
// backend doesn't implement them yet, the call surfaces the backend's own
// "tool not found" error, which is honest (a stub that lies about success
// would be worse than one that fails loudly).
const DISPOSITION_STUB_NAMES = ['disposition_list', 'disposition_resolve'];

function namespaced(name) {
  return name.startsWith(NAMESPACE) ? name : NAMESPACE + name;
}

function stripNamespace(name) {
  return name.startsWith(NAMESPACE) ? name.slice(NAMESPACE.length) : name;
}

/**
 * Connect to the configured memory backend (if any) and build the list of
 * federated MCP tool definitions plus a call router.
 *
 * Returns:
 *   {
 *     tools: [{ name, description, inputSchema }],
 *     adapter: MemoryAdapter | null,
 *     callTool(name, args) -> Promise<toolCallResult>,
 *     disconnect() -> Promise<void>,
 *   }
 */
async function buildFederation(cwd) {
  const config = loadMemoryConfig(cwd);
  const adapter = createAdapter(config);

  if (!adapter) {
    return {
      tools: [],
      adapter: null,
      async callTool() {
        throw new Error('memory federation is not configured (set CRAG_MEMORY_MCP or .crag/mcp.json)');
      },
      async disconnect() {},
    };
  }

  await adapter.connect();
  const backendTools = await adapter.listTools();

  const tools = backendTools.map((t) => ({
    name: namespaced(t.name),
    description: t.description || `Federated tool "${t.name}" from the configured memory backend.`,
    inputSchema: t.inputSchema || { type: 'object' },
  }));

  // Always surface the disposition stubs when a backend is configured, even
  // if listTools() didn't report them — they're pre-declared per rev-5 §5.2.
  const knownNames = new Set(tools.map((t) => t.name));
  for (const stubName of DISPOSITION_STUB_NAMES) {
    const full = namespaced(stubName);
    if (!knownNames.has(full)) {
      tools.push({
        name: full,
        description: `Disposition engine stub — proxies to the configured memory backend's "${stubName}" tool once wired.`,
        inputSchema: { type: 'object' },
      });
    }
  }

  return {
    tools,
    adapter,
    async callTool(name, args) {
      return adapter.callTool(stripNamespace(name), args);
    },
    async disconnect() {
      await adapter.disconnect();
    },
  };
}

module.exports = { buildFederation, namespaced, stripNamespace, DISPOSITION_STUB_NAMES };

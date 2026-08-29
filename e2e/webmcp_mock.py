WEBMCP_INIT_SCRIPT = r"""
(() => {
  const tools = new Map();
  const listeners = new Set();
  const notify = () => {
    for (const listener of listeners) {
      try { listener(new Event('toolchange')); } catch (_) {}
    }
  };
  const modelContext = {
    async registerTool(definition, options = {}) {
      if (!definition || typeof definition.name !== 'string') throw new TypeError('Tool name is required');
      if (tools.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`);
      tools.set(definition.name, definition);
      const signal = options.signal;
      if (signal) {
        if (signal.aborted) {
          tools.delete(definition.name);
          throw signal.reason || new DOMException('Aborted', 'AbortError');
        }
        signal.addEventListener('abort', () => { tools.delete(definition.name); notify(); }, { once: true });
      }
      notify();
    },
    async getTools() { return [...tools.values()]; },
    async executeTool(tool, input, options = {}) {
      if (!tool || !tools.has(tool.name)) throw new Error(`Tool is not registered: ${tool?.name ?? 'unknown'}`);
      const parsed = typeof input === 'string' ? JSON.parse(input) : input;
      const signal = options.signal || new AbortController().signal;
      return tool.execute(parsed, { signal });
    },
    addEventListener(type, listener) { if (type === 'toolchange') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'toolchange') listeners.delete(listener); },
  };
  Object.defineProperty(document, 'modelContext', { configurable: true, value: modelContext });
  Object.defineProperty(window, '__branchlineNativeTools', {
    configurable: true,
    value: {
      names: async () => (await modelContext.getTools()).map((tool) => tool.name).sort(),
      call: async (name, input = {}) => {
        const tool = (await modelContext.getTools()).find((candidate) => candidate.name === name);
        if (!tool) throw new Error(`Tool not registered: ${name}`);
        return modelContext.executeTool(tool, JSON.stringify(input), { signal: new AbortController().signal });
      },
    },
  });
})();
"""

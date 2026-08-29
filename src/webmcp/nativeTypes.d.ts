export {};

declare global {
  interface WebMCPToolAnnotations {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  }

  interface WebMCPExecutionOptions {
    signal: AbortSignal;
  }

  interface WebMCPToolDefinition {
    name: string;
    title?: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    annotations?: WebMCPToolAnnotations;
    execute: (input: unknown, options: WebMCPExecutionOptions) => unknown | Promise<unknown>;
  }

  interface WebMCPRegisteredTool {
    name: string;
    title?: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    annotations?: WebMCPToolAnnotations;
    origin?: string;
    window?: Window;
  }

  interface ModelContext extends EventTarget {
    registerTool(tool: WebMCPToolDefinition, options?: { signal?: AbortSignal; exposedTo?: string[] }): Promise<void>;
    getTools(options?: { fromOrigins?: string[] }): Promise<WebMCPRegisteredTool[]>;
    executeTool(tool: WebMCPRegisteredTool, inputJson: string, options?: { signal?: AbortSignal }): Promise<unknown>;
  }

  interface Document {
    modelContext?: ModelContext;
  }
}

declare global {
  interface ImportMeta {
    hot?: { dispose(callback: () => void): void };
  }
}

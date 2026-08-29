import { desiredToolNames, type ToolName } from '../app/selectors.js';
import { branchlineStore } from '../store/branchlineStore.js';
import { toolDefinitions } from './definitions.js';

export class WebMCPRegistry {
  private readonly controllers = new Map<ToolName, AbortController>();
  private readonly errors: Record<string, string> = {};
  private unsubscribe?: () => void;
  private toolChangeListener?: () => void;
  private reconciliation = Promise.resolve();
  private lastDesiredKey = '';
  private destroyed = false;

  start(): void {
    const supported = typeof document.modelContext?.registerTool === 'function';
    branchlineStore.setWebMCPSupport(supported);
    if (!supported) {
      branchlineStore.setRegistryState([], [], {});
      return;
    }
    this.unsubscribe = branchlineStore.subscribe((state) => {
      const key = desiredToolNames(state).join('|');
      if (key !== this.lastDesiredKey) this.queueReconcile();
    });
    if (typeof document.modelContext?.addEventListener === 'function') {
      this.toolChangeListener = () => void this.mirrorNativeRegistry();
      document.modelContext.addEventListener('toolchange', this.toolChangeListener);
    }
    this.queueReconcile();
  }

  private queueReconcile(): void {
    this.reconciliation = this.reconciliation.then(() => this.reconcile()).catch((error: unknown) => {
      console.error('WebMCP reconciliation failed', error);
    });
  }

  async reconcile(): Promise<void> {
    if (this.destroyed || typeof document.modelContext?.registerTool !== 'function') return;
    const desired = desiredToolNames(branchlineStore.getState());
    this.lastDesiredKey = desired.join('|');
    const desiredSet = new Set(desired);

    for (const [name, controller] of [...this.controllers]) {
      if (!desiredSet.has(name)) {
        controller.abort(`BRANCHLINE precondition no longer holds for ${name}.`);
        this.controllers.delete(name);
      }
    }

    for (const name of desired) {
      if (this.controllers.has(name)) continue;
      const controller = new AbortController();
      try {
        // Native WebMCP registration remains explicit and directly reviewable.
        await document.modelContext.registerTool(toolDefinitions[name], { signal: controller.signal });
        if (this.destroyed || !desiredToolNames(branchlineStore.getState()).includes(name)) {
          controller.abort(`BRANCHLINE precondition changed while registering ${name}.`);
          continue;
        }
        this.controllers.set(name, controller);
        delete this.errors[name];
      } catch (error) {
        controller.abort();
        this.errors[name] = error instanceof Error ? error.message : String(error);
      }
    }
    await this.mirrorNativeRegistry();
  }

  async mirrorNativeRegistry(): Promise<void> {
    const registered = [...this.controllers.keys()].sort();
    let discovered: string[] = [];
    if (typeof document.modelContext?.getTools === 'function') {
      try {
        discovered = (await document.modelContext.getTools()).map((tool) => tool.name).sort();
      } catch (error) {
        this.errors.getTools = error instanceof Error ? error.message : String(error);
      }
    }
    branchlineStore.setRegistryState(registered, discovered, this.errors);
  }

  getRegisteredNames(): ToolName[] {
    return [...this.controllers.keys()].sort();
  }

  stop(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    if (this.toolChangeListener && document.modelContext) {
      document.modelContext.removeEventListener('toolchange', this.toolChangeListener);
    }
    for (const controller of this.controllers.values()) controller.abort('BRANCHLINE page lifecycle ended.');
    this.controllers.clear();
    branchlineStore.setRegistryState([], [], this.errors);
  }
}

export const webmcpRegistry = new WebMCPRegistry();

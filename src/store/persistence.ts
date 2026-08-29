import type { AppState } from '../domain/types.js';

const STORAGE_KEY = 'branchline-state-v1';

export function saveState(state: AppState): void {
  try {
    const serializable = {
      ...state,
      webmcp: {
        supported: false,
        registeredNames: [],
        registrationErrors: {},
        nativeDiscoveredNames: [],
      },
      ui: {
        ...state.ui,
        capabilityDockOpen: false,
        aboutOpen: false,
        approvalOpen: state.stagedPlan?.status === 'awaiting_approval',
        debugOpen: false,
        toast: undefined,
      },
      visualEvents: state.visualEvents.slice(-20),
      toolActivity: state.toolActivity.slice(-120),
      audit: state.audit.slice(-240),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Persistence is an enhancement; storage denial must not break the operational twin.
  }
}

export function loadState(): AppState | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as AppState;
  } catch {
    return undefined;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

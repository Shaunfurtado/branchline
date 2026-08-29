import { currentSimulatedBranches, impactSummary, type ToolName } from './app/selectors.js';
import { renderAboutModal } from './components/AboutModal.js';
import { renderApprovalSurface } from './components/ApprovalSurface.js';
import { renderAuditTimeline } from './components/AuditTimeline.js';
import { renderBranchChamber } from './components/BranchChamber.js';
import { renderCapabilityDock } from './components/CapabilityDock.js';
import { renderCausalAtlas } from './components/CausalAtlas.js';
import { renderCausalProof } from './components/CausalProof.js';
import { renderCommandBar } from './components/CommandBar.js';
import { renderConstraintPanel } from './components/ConstraintPanel.js';
import { renderDebugLab, debugExamples } from './components/DebugLab.js';
import { renderAlertsDrawer, renderAuditDrawer } from './components/Drawers.js';
import { renderEntityInspector } from './components/EntityInspector.js';
import { renderRecoveryReport } from './components/RecoveryReport.js';
import { formatMoney } from './components/format.js';
import { escapeHtml } from './components/html.js';
import { DomainError } from './domain/errors.js';
import type { AppState, AtlasView, BranchStrategy, RecoveryBranch, VisualEvent } from './domain/types.js';
import { branchlineStore } from './store/branchlineStore.js';
import { getLocalToolHandler } from './webmcp/handlers.js';
import { webmcpRegistry } from './webmcp/registry.js';
import { startWebMCP } from './webmcp/useWebMCP.js';

type ActionElement = HTMLElement | SVGElement;

const branchNames: Record<BranchStrategy, string> = {
  service_first: 'Service First',
  cost_guard: 'Cost Guard',
  balanced: 'Balanced Recovery',
  resilience: 'Resilient Mesh',
};

let alertsOpen = false;
let auditOpen = false;
let debugTool: ToolName = 'get_ops_snapshot';
let debugOutput = '';
let busyLabel = '';
let fatalError = '';
let toastTimer: number | undefined;
let cleanupWebMCP: (() => void) | undefined;
let lastVisualId = '';
let audioContext: AudioContext | undefined;

function renderUnsupportedBanner(state: AppState): string {
  if (state.webmcp.supported) return '';
  return `<div class="webmcp-banner" role="status"><span class="status-dot"></span><p><strong>Human mode active.</strong> Native WebMCP site tools are unavailable in this browser; the operational twin remains fully usable.</p><button data-action="toggle-capabilities">View capability state</button></div>`;
}

function renderBusy(): string {
  if (!busyLabel) return '';
  return `<div class="busy-surface" role="status" aria-live="polite"><span class="busy-orbit"><i></i><i></i><i></i></span><div><strong>${escapeHtml(busyLabel)}</strong><small>Deterministic domain operation in progress</small></div></div>`;
}

function renderToast(state: AppState): string {
  const toast = state.ui.toast;
  if (!toast) return '';
  return `<div class="toast toast-${toast.kind}" role="status"><span>${toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : '◆'}</span><p>${escapeHtml(toast.message)}</p><button data-action="dismiss-toast" aria-label="Dismiss message">×</button></div>`;
}

function renderFatal(): string {
  if (!fatalError) return '';
  return `<div class="fatal-boundary" role="alert"><div class="fatal-mark">!</div><div><span class="eyebrow">Rendering recovery boundary</span><h2>BRANCHLINE recovered a page error</h2><p>${escapeHtml(fatalError)}</p><button class="primary-action" data-action="recover-fatal">Reset to the healthy featured twin</button></div></div>`;
}

function applicationMarkup(state: AppState): string {
  return `
    <div class="app-shell ${state.ui.cinematicMode ? 'cinematic-mode' : ''}" data-phase="${state.phase}">
      ${renderCommandBar(state)}
      ${renderUnsupportedBanner(state)}
      <div class="operational-layout">
        ${renderConstraintPanel(state)}
        ${renderCausalAtlas(state)}
        ${renderBranchChamber(state)}
      </div>
      ${renderAuditTimeline(state)}
      ${renderEntityInspector(state)}
      ${renderCausalProof(state)}
      ${renderCapabilityDock(state)}
      ${renderApprovalSurface(state)}
      ${renderRecoveryReport(state)}
      ${renderAboutModal(state)}
      ${renderDebugLab(state, debugTool, debugOutput)}
      ${renderAlertsDrawer(state, alertsOpen)}
      ${renderAuditDrawer(state, auditOpen)}
      ${renderBusy()}
      ${renderToast(state)}
      ${renderFatal()}
    </div>`;
}

function activeIdentity(): { action?: string; id?: string } {
  const active = document.activeElement as HTMLElement | null;
  return { action: active?.dataset.action, id: active?.dataset.id };
}

function restoreFocus(identity: { action?: string; id?: string }, state: AppState): void {
  const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]:not([hidden])');
  if (modal && !modal.contains(document.activeElement)) {
    const preferred = state.ui.approvalOpen
      ? modal.querySelector<HTMLElement>('[data-action="approve-plan"]')
      : modal.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]');
    preferred?.focus({ preventScroll: true });
    return;
  }
  if (!identity.action) return;
  const selector = `[data-action="${CSS.escape(identity.action)}"]${identity.id ? `[data-id="${CSS.escape(identity.id)}"]` : ''}`;
  document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
}

function render(): void {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Application root #app is missing.');
  const identity = activeIdentity();
  const state = branchlineStore.getState();
  root.innerHTML = applicationMarkup(state); // safe-html: generated markup escapes all untrusted text at component boundaries.
  requestAnimationFrame(() => restoreFocus(identity, state));
  processLatestVisual(state);
}

function setToast(kind: 'info' | 'success' | 'warning' | 'error', message: string): void {
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  branchlineStore.updateUI({ toast: { kind, message, id: `toast_${Date.now()}` } });
  toastTimer = window.setTimeout(() => branchlineStore.updateUI({ toast: undefined }), 4_800);
}

function playTone(event: VisualEvent['type']): void {
  if (!branchlineStore.getState().ui.audioEnabled) return;
  try {
    audioContext ??= new AudioContext();
    const ctx = audioContext;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const frequencies: Partial<Record<VisualEvent['type'], [number, number]>> = {
      shock_started: [86, 54],
      branch_created: [330, 520],
      plan_approved: [440, 660],
      reality_committed: [180, 640],
      checkpoint_restored: [520, 145],
      verification_completed: [390, 780],
    };
    const pair = frequencies[event] ?? [280, 330];
    oscillator.frequency.setValueAtTime(pair[0], now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, pair[1]), now + 0.42);
    oscillator.type = event === 'shock_started' ? 'sine' : 'triangle';
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(event === 'shock_started' ? 0.11 : 0.055, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.48);
  } catch {
    // Audio is optional and never blocks an operational action.
  }
}

function processLatestVisual(state: AppState): void {
  const latest = state.visualEvents.at(-1);
  if (!latest || latest.id === lastVisualId) return;
  lastVisualId = latest.id;
  playTone(latest.type);
}

async function runBusy<T>(label: string, operation: () => Promise<T> | T): Promise<T | undefined> {
  busyLabel = label;
  render();
  try {
    const result = await operation();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setToast('error', message);
    return undefined;
  } finally {
    busyLabel = '';
    render();
  }
}

function transition(operation: () => void): void {
  const startViewTransition = (document as unknown as { startViewTransition?: (callback: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (typeof startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    void startViewTransition.call(document, operation).finished.catch(() => undefined);
  } else {
    operation();
  }
}

function focusEntity(id: string): void {
  branchlineStore.updateUI({ selectedEntityId: id });
  branchlineStore.appendVisual({ type: 'entity_focused', entityId: id });
}

function traceImpact(): void {
  const state = branchlineStore.getState();
  const source = state.scenario.disruptions.find((item) => item.active)?.sourceEntityId;
  if (!source) {
    setToast('warning', 'Trigger a disruption before tracing consequences.');
    return;
  }
  const impact = impactSummary(state);
  const path = impact.criticalPaths[0] ?? ['sup_nori', 'cmp_battery_cell', 'fac_pnq', 'prod_orion', 'order_1082', 'cus_apex'];
  branchlineStore.updateUI({ atlasView: 'causality', proofPathIds: path });
  branchlineStore.appendVisual({ type: 'impact_traced', pathIds: path });
}

async function createAndSimulate(strategy: BranchStrategy): Promise<RecoveryBranch | undefined> {
  const branch = branchlineStore.createBranch(branchNames[strategy], strategy, {}, 'human');
  return branchlineStore.simulateBranch(branch.id, 30, 'human');
}

async function createDemoTrio(): Promise<void> {
  if (branchlineStore.getState().branches.length > 0) return;
  for (const strategy of ['service_first', 'cost_guard', 'balanced'] as const) {
    const branch = branchlineStore.createBranch(branchNames[strategy], strategy, {}, 'human');
    await branchlineStore.simulateBranch(branch.id, 30, 'human');
  }
  const ids = currentSimulatedBranches(branchlineStore.getState()).map((branch) => branch.id);
  if (ids.length >= 2) branchlineStore.compareBranches(ids, 'human');
}

function selectedOrBestBranch(): RecoveryBranch | undefined {
  const state = branchlineStore.getState();
  const selected = state.branches.find((branch) => branch.id === state.ui.selectedBranchId && branch.status === 'current');
  if (selected) return selected;
  return currentSimulatedBranches(state).sort((a, b) => {
    const scoreA = (a.simulation?.protectedRevenueCents ?? 0) - (a.simulation?.totalIncrementalCostCents ?? 0) * 2;
    const scoreB = (b.simulation?.protectedRevenueCents ?? 0) - (b.simulation?.totalIncrementalCostCents ?? 0) * 2;
    return scoreB - scoreA;
  })[0];
}

function openProof(branchId: string): void {
  const branch = branchlineStore.getState().branches.find((candidate) => candidate.id === branchId);
  if (!branch?.simulation) return;
  const path = [...new Set(branch.simulation.causalProof.flatMap((step) => step.entityIds))];
  branchlineStore.updateUI({ selectedBranchId: branchId, atlasView: 'causality', proofPathIds: path, recoveryOpen: false });
  branchlineStore.appendVisual({ type: 'causal_proof', pathIds: path });
}

function recoveryMarkdown(state: AppState): string {
  const staged = state.stagedPlan;
  const branch = state.branches.find((candidate) => candidate.id === staged?.branchId);
  const actual = state.operational.actualMetrics;
  const disruption = state.scenario.disruptions.find((item) => item.active);
  const checkpoint = state.checkpoints.find((candidate) => candidate.planId === staged?.id);
  const lines = [
    '# BRANCHLINE Recovery Report',
    '',
    `**Scenario:** ${state.scenario.name}`,
    `**Manufacturer:** ${state.scenario.manufacturer}`,
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '## Disruption',
    '',
    disruption ? `- ${disruption.name}: ${disruption.cause}` : '- No active disruption.',
    '',
    '## Active constraints',
    '',
    `- Maximum extra cost: ${formatMoney(state.constraints.maxExtraCostCents, false)}`,
    `- Protected tiers: ${state.constraints.protectTiers.join(', ')}`,
    `- Human-locked orders: ${state.constraints.humanLockedOrderIds.join(', ') || 'none'}`,
    '- Voltra V-2170 may never supply ORION-X.',
    '',
    '## Selected branch',
    '',
    `- ${branch?.name ?? 'Not available'} (${branch?.strategy ?? 'n/a'})`,
    `- Plan: ${staged?.id ?? 'n/a'}`,
    '',
    '## Recovery actions',
    '',
    ...(branch?.actions.map((action, index) => `${index + 1}. **${action.type}** — ${action.description}`) ?? ['No actions recorded.']),
    '',
    '## Before / after metrics',
    '',
    actual ? `- Revenue protected: ${formatMoney(actual.protectedRevenueCents, false)}\n- Incremental cost: ${formatMoney(actual.totalIncrementalCostCents, false)}\n- On-time orders: ${actual.onTimeOrders}/${state.scenario.orders.length}\n- Delayed orders: ${actual.delayedOrderIds.join(', ') || 'none'}\n- Hard compatibility violations: ${actual.hardConstraintViolations.length}\n- Apex Health delivery: T+${actual.orderDeliveryDays.order_1082 ?? 'unfulfilled'}` : '- No execution metrics.',
    '',
    '## Approval and rollback',
    '',
    `- Approval: ${state.approval?.id ?? 'none'}`,
    `- Checkpoint: ${checkpoint?.id ?? 'none'}`,
    `- Verification: ${state.verification?.status ?? 'not run'}`,
    '',
    '## Audit summary',
    '',
    ...state.audit.slice(-12).map((event) => `- ${event.timestamp} · ${event.actor.toUpperCase()} · ${event.summary}`),
    '',
    '> Synthetic operational twin. No real orders, purchases, shipments, or production systems are changed.',
  ];
  return lines.join('\n');
}

function exportReport(): void {
  const report = recoveryMarkdown(branchlineStore.getState());
  const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'branchline-recovery-report.md';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  setToast('success', 'Recovery report exported as Markdown.');
}

async function executeDebug(name: ToolName): Promise<void> {
  const textarea = document.querySelector<HTMLTextAreaElement>('#debug-input');
  let input: unknown;
  try {
    input = JSON.parse(textarea?.value ?? '{}');
  } catch (error) {
    debugOutput = JSON.stringify({ ok: false, code: 'INVALID_JSON', summary: error instanceof Error ? error.message : String(error) }, null, 2);
    render();
    return;
  }
  const state = branchlineStore.getState();
  if (state.webmcp.supported && state.webmcp.registeredNames.includes(name) && document.modelContext?.executeTool) {
    const tools = await document.modelContext.getTools();
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new DomainError('NOT_FOUND', `${name} is not visible through getTools().`);
    const output = await document.modelContext.executeTool(tool, JSON.stringify(input), { signal: new AbortController().signal });
    debugOutput = JSON.stringify(output, null, 2);
  } else {
    const output = await getLocalToolHandler(name)(input);
    debugOutput = JSON.stringify(output, null, 2);
  }
  render();
}

async function handleAction(element: ActionElement, action: string): Promise<void> {
  const state = branchlineStore.getState();
  switch (action) {
    case 'trigger-shock':
      branchlineStore.triggerFeaturedShock('human');
      return;
    case 'trace-impact':
      traceImpact();
      return;
    case 'inspect-entity':
      if (element.dataset.id) focusEntity(element.dataset.id);
      return;
    case 'close-inspector':
      branchlineStore.updateUI({ selectedEntityId: undefined });
      return;
    case 'set-view':
      branchlineStore.updateUI({ atlasView: element.dataset.view as AtlasView });
      return;
    case 'select-branch':
      if (element.dataset.id) branchlineStore.updateUI({ selectedBranchId: element.dataset.id, atlasView: 'futures' });
      return;
    case 'create-branch': {
      const strategy = element.dataset.strategy as BranchStrategy;
      await runBusy(`Creating and simulating ${branchNames[strategy]}`, () => createAndSimulate(strategy));
      return;
    }
    case 'create-demo-trio':
      await runBusy('Forking three deterministic recovery futures', createDemoTrio);
      return;
    case 'simulate-branch':
      if (element.dataset.id) await runBusy('Recomputing branch against live context', () => branchlineStore.simulateBranch(element.dataset.id!, 30, 'human'));
      return;
    case 'compare-current': {
      const ids = currentSimulatedBranches(state).map((branch) => branch.id).slice(0, 4);
      if (ids.length >= 2) branchlineStore.compareBranches(ids, 'human');
      return;
    }
    case 'stage-branch': {
      const branchId = element.dataset.id;
      if (branchId) branchlineStore.stagePlan(branchId, 'Selected as the strongest current recovery tradeoff for human review.', 'human');
      return;
    }
    case 'approve-plan':
      branchlineStore.approveStagedPlan();
      setToast('success', 'Human approval recorded. apply_plan is now eligible for registration.');
      return;
    case 'reject-plan':
      branchlineStore.rejectStagedPlan();
      return;
    case 'return-compare':
      branchlineStore.updateUI({ approvalOpen: false, atlasView: 'futures' });
      return;
    case 'manual-apply': {
      const plan = state.stagedPlan;
      if (!plan) return;
      transition(() => branchlineStore.applyPlan(plan.id, state.contextVersion, 'human'));
      return;
    }
    case 'manual-verify': {
      const plan = branchlineStore.getState().stagedPlan;
      if (plan) await runBusy('Verifying actual state against the simulated promise', () => branchlineStore.verifyPlan(plan.id, 'human'));
      return;
    }
    case 'manual-rollback': {
      const id = element.dataset.id ?? state.checkpoints.at(-1)?.id;
      if (id) transition(() => branchlineStore.rollbackPlan(id, 'Human requested restoration of the execution checkpoint.', 'human'));
      return;
    }
    case 'close-recovery':
      branchlineStore.updateUI({ recoveryOpen: false });
      return;
    case 'export-report':
      exportReport();
      return;
    case 'explain-branch':
      if (element.dataset.id) openProof(element.dataset.id);
      return;
    case 'close-proof':
      branchlineStore.updateUI({ proofPathIds: [], selectedAuditId: undefined });
      return;
    case 'protect-apex':
      branchlineStore.protectOrder('order_1082', !state.constraints.humanLockedOrderIds.includes('order_1082'), 'human');
      return;
    case 'toggle-order-lock': {
      const id = element.dataset.id;
      if (id) branchlineStore.protectOrder(id, !state.constraints.humanLockedOrderIds.includes(id), 'human');
      return;
    }
    case 'toggle-tier': {
      const tier = Number(element.dataset.tier) as 1 | 2 | 3;
      const tiers = new Set(state.constraints.protectTiers);
      if (tiers.has(tier) && tier !== 1) tiers.delete(tier);
      else tiers.add(tier);
      tiers.add(1);
      branchlineStore.updateConstraints({ protectTiers: [...tiers].sort() as Array<1 | 2 | 3> });
      return;
    }
    case 'copy-demo-prompt': {
      const prompt = element.dataset.prompt ?? '';
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        const input = document.createElement('textarea');
        input.value = prompt;
        document.body.append(input);
        input.select();
        document.execCommand('copy');
        input.remove();
      }
      setToast('success', 'Canonical agent prompt copied.');
      return;
    }
    case 'toggle-capabilities':
      branchlineStore.updateUI({ capabilityDockOpen: !state.ui.capabilityDockOpen });
      return;
    case 'close-capabilities':
      branchlineStore.updateUI({ capabilityDockOpen: false });
      return;
    case 'toggle-about':
      branchlineStore.updateUI({ aboutOpen: !state.ui.aboutOpen });
      return;
    case 'close-about':
      branchlineStore.updateUI({ aboutOpen: false });
      return;
    case 'open-debug':
      branchlineStore.updateUI({ aboutOpen: false, debugOpen: true });
      return;
    case 'close-debug':
      branchlineStore.updateUI({ debugOpen: false });
      return;
    case 'debug-select-tool':
      debugTool = element.dataset.id as ToolName;
      debugOutput = '';
      render();
      return;
    case 'debug-load-example': {
      const textarea = document.querySelector<HTMLTextAreaElement>('#debug-input');
      if (textarea) textarea.value = debugExamples[debugTool];
      return;
    }
    case 'debug-execute':
      await runBusy(`Executing ${debugTool}`, () => executeDebug(debugTool));
      return;
    case 'refresh-native-tools':
      await webmcpRegistry.mirrorNativeRegistry();
      setToast('info', 'Native registry reconciled through getTools().');
      return;
    case 'show-alerts':
      alertsOpen = true;
      render();
      return;
    case 'close-alerts':
      alertsOpen = false;
      render();
      return;
    case 'focus-audit':
      auditOpen = true;
      render();
      return;
    case 'close-audit':
      auditOpen = false;
      render();
      return;
    case 'select-audit': {
      const auditId = element.dataset.id;
      const event = state.audit.find((candidate) => candidate.id === auditId);
      auditOpen = false;
      if (event) branchlineStore.updateUI({ selectedAuditId: event.id, proofPathIds: event.evidencePath ?? event.affectedEntityIds.slice(0, 8), atlasView: 'causality' });
      return;
    }
    case 'select-tool-activity': {
      const event = state.toolActivity.find((candidate) => candidate.id === element.dataset.id);
      if (event?.affectedIds[0]) focusEntity(event.affectedIds[0]);
      return;
    }
    case 'toggle-audio':
      branchlineStore.updateUI({ audioEnabled: !state.ui.audioEnabled });
      return;
    case 'toggle-cinematic':
      branchlineStore.updateUI({ cinematicMode: !state.ui.cinematicMode });
      return;
    case 'reset-demo':
      alertsOpen = false;
      auditOpen = false;
      debugOutput = '';
      transition(() => branchlineStore.reset());
      return;
    case 'dismiss-toast':
      branchlineStore.updateUI({ toast: undefined });
      return;
    case 'recover-fatal':
      fatalError = '';
      branchlineStore.reset();
      return;
    default:
      return;
  }
}

function handleControl(element: HTMLInputElement | HTMLSelectElement): void {
  const action = element.dataset.action;
  const state = branchlineStore.getState();
  switch (action) {
    case 'constraint-budget':
      branchlineStore.updateConstraints({ maxExtraCostCents: Number(element.value) * 100 });
      return;
    case 'constraint-air':
      branchlineStore.updateConstraints({ noAirFreight: (element as HTMLInputElement).checked });
      return;
    case 'constraint-delays':
      branchlineStore.updateConstraints({ maxDelayedOrders: Number(element.value) });
      return;
    case 'curveball':
      branchlineStore.toggleCurveball((element as HTMLInputElement).checked, 'human');
      return;
    case 'time-scrubber':
      branchlineStore.updateUI({ futuresDay: Number(element.value) });
      return;
    default:
      if (action) console.debug(`Unhandled control action ${action}`, state.stateVersion);
  }
}

function trapModalFocus(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]:not([hidden])');
  if (!modal) return;
  const focusable = [...modal.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')];
  if (!focusable.length) return;
  const first = focusable[0]!;
  const last = focusable.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function mountBranchline(): () => void {
  const unsubscribe = branchlineStore.subscribe(() => render());
  cleanupWebMCP = startWebMCP();
  render();

  const clickHandler = (event: MouseEvent) => {
    const element = (event.target as Element).closest<HTMLElement | SVGElement>('[data-action]');
    if (!element || element instanceof HTMLInputElement || element instanceof HTMLSelectElement) return;
    event.preventDefault();
    void handleAction(element, element.dataset.action ?? '').catch((error: unknown) => {
      setToast('error', error instanceof Error ? error.message : String(error));
    });
  };
  const changeHandler = (event: Event) => {
    const element = (event.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>('input[data-action], select[data-action]');
    if (!element) return;
    try {
      handleControl(element);
    } catch (error) {
      setToast('error', error instanceof Error ? error.message : String(error));
    }
  };
  const inputHandler = (event: Event) => {
    const element = event.target as HTMLInputElement;
    if (element.dataset.action === 'time-scrubber') handleControl(element);
  };
  const keyHandler = (event: KeyboardEvent) => {
    trapModalFocus(event);
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      branchlineStore.updateUI({ debugOpen: !branchlineStore.getState().ui.debugOpen });
    }
    if (event.key === 'Escape') {
      alertsOpen = false;
      auditOpen = false;
      branchlineStore.updateUI({ capabilityDockOpen: false, aboutOpen: false, approvalOpen: false, recoveryOpen: false, debugOpen: false, selectedEntityId: undefined, proofPathIds: [] });
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof SVGGElement && event.target.dataset.action) {
      event.preventDefault();
      void handleAction(event.target, event.target.dataset.action);
    }
  };
  const errorHandler = (event: ErrorEvent) => {
    fatalError = event.error instanceof Error ? event.error.message : event.message;
    render();
  };
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    if (reason instanceof DOMException && reason.name === 'AbortError') return;
    fatalError = reason instanceof Error ? reason.message : String(reason);
    render();
  };
  document.addEventListener('click', clickHandler);
  document.addEventListener('change', changeHandler);
  document.addEventListener('input', inputHandler);
  document.addEventListener('keydown', keyHandler);
  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audioContext?.state === 'running') void audioContext.suspend();
    if (!document.hidden && audioContext?.state === 'suspended' && branchlineStore.getState().ui.audioEnabled) void audioContext.resume();
  });
  return () => {
    unsubscribe();
    cleanupWebMCP?.();
    document.removeEventListener('click', clickHandler);
    document.removeEventListener('change', changeHandler);
    document.removeEventListener('input', inputHandler);
    document.removeEventListener('keydown', keyHandler);
    window.removeEventListener('error', errorHandler);
    window.removeEventListener('unhandledrejection', rejectionHandler);
  };
}

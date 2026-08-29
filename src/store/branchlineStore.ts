import { computePhase, contextHash, currentSimulatedBranches } from '../app/selectors.js';
import { createFeaturedScenario } from '../data/featuredScenario.js';
import { assertScenarioValid } from '../data/scenarioValidation.js';
import { mergeBranchConstraints } from '../domain/constraints.js';
import { DomainError } from '../domain/errors.js';
import { stableHash } from '../domain/hash.js';
import { assertSimulationInvariants } from '../domain/invariants.js';
import { planBranch } from '../domain/planner.js';
import { simulatePlan } from '../domain/simulator.js';
import type {
  Actor,
  AppState,
  ApprovalRecord,
  AuditEvent,
  BranchConstraints,
  BranchStrategy,
  Checkpoint,
  DomainCommand,
  EntityStatus,
  RecoveryBranch,
  StagedPlan,
  ToolActivityEvent,
  VerificationResult,
  VisualEvent,
  VisualEventInput,
} from '../domain/types.js';
import { clearState, loadState, saveState } from './persistence.js';

const BASE_TIME = Date.parse('2026-08-28T05:00:00.000Z');

type Listener = (state: AppState, previous: AppState) => void;

function makeTimestamp(index: number): string {
  return new Date(BASE_TIME + index * 1_000).toISOString();
}

function initialConstraints(): AppState['constraints'] {
  return {
    maxExtraCostCents: 30_000_000,
    protectTiers: [1],
    maxDelayedOrders: 6,
    noAirFreight: false,
    humanLockedOrderIds: [],
    prohibitedSubstitutions: [
      {
        supplierId: 'sup_voltra',
        productId: 'prod_orion',
        reason: 'V-2170 is not compatible with ORION-X thermal class T3.',
      },
    ],
    provenance: {
      maxExtraCostCents: { actor: 'human', reason: 'Canonical judge constraint', createdAt: makeTimestamp(1) },
      protectTiers: { actor: 'human', reason: 'Protect every Tier-1 customer', createdAt: makeTimestamp(1) },
      prohibitedSubstitutions: { actor: 'system', reason: 'Product compatibility invariant', createdAt: makeTimestamp(1) },
    },
  };
}

export function createInitialState(resetToken = 0): AppState {
  const scenario = createFeaturedScenario();
  assertScenarioValid(scenario);
  const state: AppState = {
    scenario,
    operational: {
      activeDisruptionIds: [],
      committedActions: [],
      statusOverrides: {},
      currentDay: 0,
      realityLabel: 'Healthy baseline',
    },
    constraints: initialConstraints(),
    branches: [],
    checkpoints: [],
    audit: [
      {
        id: 'audit_boot',
        timestamp: makeTimestamp(1),
        actor: 'system',
        verb: 'initialized',
        summary: 'Healthy synthetic operational twin loaded.',
        affectedEntityIds: [],
        reversible: false,
        stateVersion: 1,
        contextVersion: 1,
      },
    ],
    toolActivity: [],
    visualEvents: [],
    stateVersion: 1,
    contextVersion: 1,
    phase: 'OBSERVE',
    ui: {
      atlasView: 'network',
      proofPathIds: [],
      futuresDay: 0,
      capabilityDockOpen: false,
      aboutOpen: false,
      approvalOpen: false,
      recoveryOpen: false,
      debugOpen: false,
      cinematicMode: false,
      audioEnabled: false,
    },
    webmcp: {
      supported: false,
      registeredNames: [],
      registrationErrors: {},
      nativeDiscoveredNames: [],
    },
    invocationCount: {},
    executedPlanIds: [],
    resetToken,
  };
  return state;
}

function restoreState(): AppState {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).has('fresh')) return createInitialState();
  const restored = loadState();
  if (!restored || restored.scenario?.id !== 'scenario_nori_quality_shock') return createInitialState();
  restored.webmcp = { supported: false, registeredNames: [], registrationErrors: {}, nativeDiscoveredNames: [] };
  restored.ui = {
    ...restored.ui,
    capabilityDockOpen: false,
    aboutOpen: false,
    debugOpen: new URLSearchParams(window.location.search).has('debug'),
    toast: undefined,
  };
  restored.phase = computePhase(restored);
  return restored;
}

function updateEntityStatuses(state: AppState): void {
  const shocked = state.scenario.disruptions.some((disruption) => disruption.active && disruption.id === 'disrupt_nori_12d');
  const overrides: Record<string, EntityStatus> = { ...state.operational.statusOverrides };
  if (shocked) {
    overrides.sup_nori = 'blocked';
    overrides.cmp_battery_cell = 'blocked';
    overrides.fac_pnq = 'at_risk';
    overrides.fac_maa = 'at_risk';
    overrides.fac_blr = 'watch';
    for (const order of state.scenario.orders) overrides[order.id] = 'at_risk';
  }
  if (state.operational.actualMetrics) {
    for (const id of state.operational.actualMetrics.affectedOrderIds) overrides[id] = 'recovered';
    overrides.fac_pnq = 'recovered';
    overrides.fac_maa = 'recovered';
    overrides.fac_blr = 'recovered';
    overrides.cmp_battery_cell = 'recovering';
  }
  state.operational.statusOverrides = overrides;
}

export class BranchlineStore {
  private state: AppState;
  private readonly listeners = new Set<Listener>();

  constructor(initial?: AppState) {
    this.state = initial ?? restoreState();
  }

  getState = (): AppState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private replace(next: AppState, previous: AppState, persist = true): void {
    next.phase = computePhase(next);
    updateEntityStatuses(next);
    this.state = next;
    if (persist && typeof window !== 'undefined') saveState(next);
    for (const listener of this.listeners) listener(next, previous);
  }

  private mutate(
    actor: Actor,
    verb: string,
    summary: string,
    options: {
      contextChange?: boolean;
      reason?: string;
      affectedEntityIds?: string[];
      reversible?: boolean;
      toolName?: string;
      correlationId?: string;
      evidencePath?: string[];
      visualEvent?: VisualEventInput;
      mutate: (draft: AppState) => void;
    },
  ): AppState {
    const previous = this.state;
    const next = structuredClone(previous);
    options.mutate(next);
    next.stateVersion += 1;
    if (options.contextChange) {
      next.contextVersion += 1;
      const staleIds: string[] = [];
      for (const branch of next.branches) {
        if (branch.simulation && branch.status !== 'executed') {
          branch.status = 'stale';
          branch.staleReason = 'Human or operational context changed after simulation.';
          staleIds.push(branch.id);
        }
      }
      if (next.stagedPlan && next.stagedPlan.status !== 'executed') {
        next.stagedPlan.status = 'revoked';
        next.approval = undefined;
        next.ui.approvalOpen = false;
      }
      if (staleIds.length > 0) {
        next.visualEvents.push({
          id: `visual_stale_${next.stateVersion}`,
          type: 'branches_stale',
          branchIds: staleIds,
          createdAt: makeTimestamp(next.stateVersion + next.audit.length),
        });
      }
    }
    const timestamp = makeTimestamp(next.stateVersion + next.audit.length + next.toolActivity.length);
    const auditEvent: AuditEvent = {
      id: `audit_${next.stateVersion}_${verb.replaceAll(' ', '_')}`,
      timestamp,
      actor,
      verb,
      summary,
      reason: options.reason,
      affectedEntityIds: options.affectedEntityIds ?? [],
      reversible: options.reversible ?? false,
      toolName: options.toolName,
      correlationId: options.correlationId,
      stateVersion: next.stateVersion,
      contextVersion: next.contextVersion,
      evidencePath: options.evidencePath,
    };
    next.audit.push(auditEvent);
    if (options.visualEvent) {
      next.visualEvents.push({
        ...options.visualEvent,
        id: `visual_${next.stateVersion}_${options.visualEvent.type}`,
        createdAt: timestamp,
      } as VisualEvent);
    }
    this.replace(next, previous);
    return next;
  }

  appendVisual(event: VisualEventInput): void {
    const previous = this.state;
    const next = structuredClone(previous);
    next.visualEvents.push({
      ...event,
      id: `visual_ephemeral_${next.visualEvents.length + 1}_${event.type}`,
      createdAt: makeTimestamp(next.stateVersion + next.visualEvents.length + 1),
    } as VisualEvent);
    this.replace(next, previous, false);
  }

  setWebMCPSupport(supported: boolean): void {
    const previous = this.state;
    const next = structuredClone(previous);
    next.webmcp.supported = supported;
    this.replace(next, previous, false);
  }

  setRegistryState(registeredNames: string[], nativeDiscoveredNames: string[], errors: Record<string, string>): void {
    const previous = this.state;
    const next = structuredClone(previous);
    next.webmcp.registeredNames = [...registeredNames].sort();
    next.webmcp.nativeDiscoveredNames = [...nativeDiscoveredNames].sort();
    next.webmcp.registrationErrors = { ...errors };
    next.webmcp.lastReconciledAt = makeTimestamp(next.stateVersion + next.toolActivity.length + 1);
    this.replace(next, previous, false);
  }

  recordToolActivity(event: ToolActivityEvent): void {
    const previous = this.state;
    const next = structuredClone(previous);
    next.toolActivity.push(event);
    next.invocationCount[event.toolName] = (next.invocationCount[event.toolName] ?? 0) + (event.status === 'started' ? 1 : 0);
    this.replace(next, previous, false);
  }

  triggerFeaturedShock(actor: Actor, correlationId?: string): AppState {
    if (this.state.scenario.disruptions.find((item) => item.id === 'disrupt_nori_12d')?.active) return this.state;
    return this.mutate(actor, 'triggered disruption', 'NoriCell production set to zero for 12 days.', {
      contextChange: true,
      reason: 'Synthetic quality containment event',
      affectedEntityIds: ['sup_nori', 'cmp_battery_cell', 'fac_blr', 'fac_pnq', 'fac_maa'],
      reversible: true,
      correlationId,
      visualEvent: { type: 'shock_started', sourceId: 'sup_nori' },
      mutate: (draft) => {
        const disruption = draft.scenario.disruptions.find((item) => item.id === 'disrupt_nori_12d')!;
        disruption.active = true;
        draft.operational.activeDisruptionIds = ['disrupt_nori_12d'];
        draft.operational.realityLabel = 'NoriCell shock active';
        draft.ui.atlasView = 'causality';
      },
    });
  }

  toggleCurveball(active: boolean, actor: Actor = 'human'): AppState {
    return this.mutate(actor, active ? 'activated route event' : 'cleared route event', active ? 'Pacific express lane delayed by three days.' : 'Pacific express lane delay cleared.', {
      contextChange: true,
      affectedEntityIds: ['lane_nori_sin', 'hub_sin'],
      reversible: true,
      mutate: (draft) => {
        const disruption = draft.scenario.disruptions.find((item) => item.id === 'disrupt_pacific_delay')!;
        disruption.active = active;
        draft.operational.activeDisruptionIds = draft.scenario.disruptions.filter((item) => item.active).map((item) => item.id);
      },
    });
  }

  updateConstraints(
    patch: Partial<Pick<AppState['constraints'], 'maxExtraCostCents' | 'protectTiers' | 'maxDelayedOrders' | 'noAirFreight' | 'maxEmissionsDeltaKg'>>,
    actor: Actor = 'human',
  ): AppState {
    return this.mutate(actor, 'edited constraints', 'Shared operational constraints changed.', {
      contextChange: true,
      reason: 'Direct human constraint edit',
      affectedEntityIds: [],
      reversible: true,
      mutate: (draft) => {
        draft.constraints = { ...draft.constraints, ...patch };
        for (const key of Object.keys(patch)) {
          draft.constraints.provenance[key] = {
            actor,
            reason: actor === 'human' ? 'Direct interface edit' : 'Shared command update',
            createdAt: makeTimestamp(draft.stateVersion + draft.audit.length + 1),
          };
        }
      },
    });
  }

  protectOrder(orderId: string, protect: boolean, actor: Actor = 'human'): AppState {
    const order = this.state.scenario.orders.find((candidate) => candidate.id === orderId);
    if (!order) throw new DomainError('NOT_FOUND', `Order ${orderId} does not exist.`);
    const exists = this.state.constraints.humanLockedOrderIds.includes(orderId);
    if (exists === protect) return this.state;
    return this.mutate(actor, protect ? 'protected order' : 'removed order protection', protect ? `${orderId} received a human intent pin.` : `${orderId} human intent pin removed.`, {
      contextChange: true,
      reason: protect ? 'Human explicitly protected this customer commitment.' : 'Human removed the explicit protection.',
      affectedEntityIds: [orderId, order.productId, order.factoryId, order.customerId],
      reversible: true,
      evidencePath: [order.factoryId, order.productId, order.id, order.customerId],
      visualEvent: protect ? { type: 'human_constraint_added', entityId: orderId } : undefined,
      mutate: (draft) => {
        const locks = new Set(draft.constraints.humanLockedOrderIds);
        if (protect) locks.add(orderId);
        else locks.delete(orderId);
        draft.constraints.humanLockedOrderIds = [...locks];
        draft.constraints.provenance[`lock:${orderId}`] = {
          actor,
          reason: protect ? 'Protected from the visual interface' : 'Protection removed from the visual interface',
          createdAt: makeTimestamp(draft.stateVersion + draft.audit.length + 1),
        };
        draft.ui.selectedEntityId = orderId;
      },
    });
  }

  createBranch(
    name: string,
    strategy: BranchStrategy,
    constraints: BranchConstraints = {},
    actor: Actor = 'human',
    correlationId?: string,
  ): RecoveryBranch {
    if (!this.state.scenario.disruptions.some((disruption) => disruption.active)) {
      throw new DomainError('WRONG_PHASE', 'Create a branch only after a disruption is active.', { nextTools: ['get_ops_snapshot'] });
    }
    mergeBranchConstraints(this.state.constraints, constraints);
    const branchNumber = this.state.branches.length + 1;
    const id = `branch_${branchNumber.toString().padStart(2, '0')}_${strategy}`;
    const hash = contextHash(this.state);
    let created!: RecoveryBranch;
    this.mutate(actor, 'created branch', `${name} recovery future created with ${strategy} strategy.`, {
      affectedEntityIds: [id],
      reversible: true,
      toolName: actor === 'agent' ? 'create_branch' : undefined,
      correlationId,
      visualEvent: { type: 'branch_created', branchId: id },
      mutate: (draft) => {
        created = {
          id,
          name,
          strategy,
          status: 'draft',
          createdAt: makeTimestamp(draft.stateVersion + draft.audit.length + 1),
          createdBy: actor,
          baseContextVersion: draft.contextVersion,
          baseContextHash: hash,
          constraints,
          actions: [],
          assumptions: [],
        };
        draft.branches.push(created);
        draft.ui.selectedBranchId = id;
        draft.ui.atlasView = 'futures';
      },
    });
    return structuredClone(created);
  }

  async simulateBranch(
    branchId: string,
    horizonDays = 30,
    actor: Actor = 'human',
    correlationId?: string,
    signal?: AbortSignal,
  ): Promise<RecoveryBranch> {
    const branch = this.state.branches.find((candidate) => candidate.id === branchId);
    if (!branch) throw new DomainError('NOT_FOUND', `Branch ${branchId} does not exist.`);
    if (signal?.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError');
    const merged = mergeBranchConstraints(this.state.constraints, branch.constraints);
    const startContextVersion = this.state.contextVersion;
    const startContextHash = contextHash(this.state);
    const previous = this.state;
    const pending = structuredClone(previous);
    const pendingBranch = pending.branches.find((candidate) => candidate.id === branchId)!;
    pendingBranch.status = 'simulating';
    pendingBranch.lastError = undefined;
    pending.stateVersion += 1;
    this.replace(pending, previous);

    try {
      const planned = await planBranch({
        scenario: this.state.scenario,
        disruptions: this.state.scenario.disruptions,
        constraints: merged,
        strategy: branch.strategy,
        branchId,
        contextVersion: startContextVersion,
        contextHash: startContextHash,
        horizonDays,
        signal,
        onProgress: (progress) => this.appendVisual({ type: 'simulation_progress', branchId, progress }),
      });
      if (signal?.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError');
      if (this.state.contextVersion !== startContextVersion || contextHash(this.state) !== startContextHash) {
        throw new DomainError('STALE_BRANCH', 'The shared context changed while simulation was running.', {
          nextTools: ['list_constraints', 'simulate_branch'],
        });
      }
      assertSimulationInvariants(this.state.scenario, planned.simulation);
      this.mutate(actor, 'simulated branch', `${branch.name} simulated across ${horizonDays} days.`, {
        affectedEntityIds: [branchId, ...planned.simulation.affectedOrderIds.slice(0, 12)],
        reversible: true,
        toolName: actor === 'agent' ? 'simulate_branch' : undefined,
        correlationId,
        visualEvent: { type: 'simulation_completed', branchId },
        mutate: (draft) => {
          const target = draft.branches.find((candidate) => candidate.id === branchId)!;
          target.actions = planned.actions;
          target.simulation = planned.simulation;
          target.assumptions = planned.assumptions;
          target.baseContextVersion = startContextVersion;
          target.baseContextHash = startContextHash;
          target.status = planned.simulation.hardConstraintViolations.length === 0 ? 'current' : 'invalid';
          target.lastError =
            planned.simulation.hardConstraintViolations.length > 0
              ? planned.simulation.hardConstraintViolations.join(' ')
              : undefined;
          draft.ui.selectedBranchId = branchId;
          draft.ui.atlasView = 'futures';
        },
      });
      return structuredClone(this.state.branches.find((candidate) => candidate.id === branchId)!);
    } catch (error) {
      const current = this.state;
      const failed = structuredClone(current);
      const target = failed.branches.find((candidate) => candidate.id === branchId);
      if (target) {
        target.status = error instanceof DomainError && error.code === 'STALE_BRANCH' ? 'stale' : 'draft';
        target.lastError = error instanceof Error ? error.message : 'Simulation failed.';
      }
      failed.stateVersion += 1;
      this.replace(failed, current);
      throw error;
    }
  }

  compareBranches(branchIds: string[], actor: Actor = 'agent'): RecoveryBranch[] {
    const currentIds = new Set(currentSimulatedBranches(this.state).map((branch) => branch.id));
    const branches = branchIds.map((id) => this.state.branches.find((branch) => branch.id === id));
    if (branches.some((branch) => !branch)) throw new DomainError('NOT_FOUND', 'One or more branches do not exist.');
    if (branchIds.some((id) => !currentIds.has(id))) throw new DomainError('STALE_BRANCH', 'Only current simulations can be compared.');
    this.appendVisual({ type: 'branches_compared', branchIds });
    const previous = this.state;
    const next = structuredClone(previous);
    next.ui.atlasView = 'futures';
    next.ui.selectedBranchId = branchIds[0];
    next.ui.proofPathIds = [];
    next.ui.selectedAuditId = undefined;
    if (actor === 'agent') next.ui.toast = { kind: 'info', message: `${branchIds.length} futures opened in Branchspace.`, id: `toast_compare_${next.stateVersion}` };
    this.replace(next, previous, false);
    return structuredClone(branches as RecoveryBranch[]);
  }

  stagePlan(branchId: string, rationale: string, actor: Actor = 'human', correlationId?: string): StagedPlan {
    const branch = this.state.branches.find((candidate) => candidate.id === branchId);
    if (!branch?.simulation) throw new DomainError('NOT_FOUND', `Current simulation ${branchId} was not found.`);
    if (branch.status === 'stale' || branch.simulation.contextVersion !== this.state.contextVersion || branch.simulation.contextHash !== contextHash(this.state)) {
      throw new DomainError('STALE_BRANCH', 'A stale branch cannot be staged.', { nextTools: ['simulate_branch'] });
    }
    if (branch.status === 'invalid' || branch.simulation.hardConstraintViolations.length > 0) {
      throw new DomainError('CONSTRAINT_VIOLATION', 'An invalid branch cannot be staged.', {
        details: { violations: branch.simulation.hardConstraintViolations },
      });
    }
    if (this.state.stagedPlan && !['rejected', 'revoked'].includes(this.state.stagedPlan.status)) {
      throw new DomainError('WRONG_PHASE', 'A plan is already staged.');
    }
    const planId = `plan_${branch.id}_${this.state.stateVersion + 1}`;
    let staged!: StagedPlan;
    this.mutate(actor, 'staged plan', `${branch.name} moved to human approval review.`, {
      affectedEntityIds: [branch.id, planId],
      reversible: true,
      toolName: actor === 'agent' ? 'stage_plan' : undefined,
      correlationId,
      evidencePath: branch.simulation.criticalPaths[0],
      visualEvent: { type: 'plan_staged', planId },
      mutate: (draft) => {
        staged = {
          id: planId,
          branchId,
          rationale,
          stagedAt: makeTimestamp(draft.stateVersion + draft.audit.length + 1),
          stagedBy: actor,
          contextVersion: draft.contextVersion,
          simulationHash: branch.simulation!.simulationHash,
          status: 'awaiting_approval',
        };
        draft.stagedPlan = staged;
        draft.approval = undefined;
        draft.ui.approvalOpen = true;
        draft.ui.selectedBranchId = branchId;
        const target = draft.branches.find((candidate) => candidate.id === branchId)!;
        target.status = 'staged';
      },
    });
    return structuredClone(staged);
  }

  approveStagedPlan(): ApprovalRecord {
    const staged = this.state.stagedPlan;
    if (!staged || staged.status !== 'awaiting_approval') throw new DomainError('WRONG_PHASE', 'No plan is awaiting approval.');
    const branch = this.state.branches.find((candidate) => candidate.id === staged.branchId)!;
    if (!branch.simulation || staged.contextVersion !== this.state.contextVersion || staged.simulationHash !== branch.simulation.simulationHash) {
      throw new DomainError('STALE_APPROVAL', 'The plan changed after it was staged. Re-simulate and stage again.');
    }
    let approval!: ApprovalRecord;
    this.mutate('human', 'approved plan', `${branch.name} approved; execution capability unlocked.`, {
      affectedEntityIds: [staged.id, branch.id],
      reversible: true,
      evidencePath: branch.simulation.criticalPaths[0],
      visualEvent: { type: 'plan_approved', planId: staged.id },
      mutate: (draft) => {
        approval = {
          id: `approval_${staged.id}`,
          planId: staged.id,
          actor: 'human',
          approvedAt: makeTimestamp(draft.stateVersion + draft.audit.length + 1),
          contextVersion: draft.contextVersion,
          simulationHash: branch.simulation!.simulationHash,
          summaryHash: stableHash({
            cost: branch.simulation!.totalIncrementalCostCents,
            protected: branch.simulation!.protectedRevenueCents,
            delayed: branch.simulation!.delayedOrderIds,
            actions: branch.actions.map((action) => action.id),
          }),
        };
        draft.approval = approval;
        draft.stagedPlan!.status = 'approved';
        draft.ui.approvalOpen = false;
        const target = draft.branches.find((candidate) => candidate.id === staged.branchId)!;
        target.status = 'approved';
      },
    });
    return structuredClone(approval);
  }

  rejectStagedPlan(): void {
    const staged = this.state.stagedPlan;
    if (!staged) return;
    this.mutate('human', 'rejected plan', 'Staged recovery plan rejected by the human reviewer.', {
      affectedEntityIds: [staged.id, staged.branchId],
      reversible: false,
      mutate: (draft) => {
        draft.stagedPlan!.status = 'rejected';
        draft.approval = undefined;
        draft.ui.approvalOpen = false;
        const branch = draft.branches.find((candidate) => candidate.id === staged.branchId);
        if (branch?.simulation) branch.status = 'current';
      },
    });
  }

  applyPlan(planId: string, expectedContextVersion?: number, actor: Actor = 'human', correlationId?: string): { checkpoint: Checkpoint; branch: RecoveryBranch } {
    if (this.state.executedPlanIds.includes(planId)) {
      const checkpoint = this.state.checkpoints.find((candidate) => candidate.planId === planId);
      const branch = this.state.branches.find((candidate) => candidate.id === this.state.stagedPlan?.branchId);
      if (!checkpoint || !branch) throw new DomainError('ALREADY_APPLIED', 'Plan was already applied but its evidence is unavailable.', { recoverable: false });
      return { checkpoint: structuredClone(checkpoint), branch: structuredClone(branch) };
    }
    const staged = this.state.stagedPlan;
    if (!staged || staged.id !== planId) throw new DomainError('NOT_FOUND', `Staged plan ${planId} was not found.`);
    if (staged.status !== 'approved' || !this.state.approval) {
      throw new DomainError('APPROVAL_REQUIRED', 'Human approval is required in the BRANCHLINE interface.', { nextTools: ['get_ops_snapshot'] });
    }
    if (expectedContextVersion !== undefined && expectedContextVersion !== this.state.contextVersion) {
      throw new DomainError('STALE_APPROVAL', 'The expected context version does not match the live context.', {
        details: { expected: expectedContextVersion, actual: this.state.contextVersion },
      });
    }
    if (staged.contextVersion !== this.state.contextVersion || this.state.approval.contextVersion !== this.state.contextVersion) {
      throw new DomainError('STALE_APPROVAL', 'The approval is stale because the shared context changed.');
    }
    const branch = this.state.branches.find((candidate) => candidate.id === staged.branchId)!;
    if (!branch.simulation || branch.simulation.simulationHash !== staged.simulationHash) {
      throw new DomainError('STALE_APPROVAL', 'The approved simulation no longer matches the staged plan.');
    }
    const checkpointId = `checkpoint_${planId}`;
    let checkpoint!: Checkpoint;
    this.mutate(actor, 'applied plan', `${branch.name} collapsed into the live operational reality.`, {
      contextChange: true,
      reason: staged.rationale,
      affectedEntityIds: [...new Set(branch.actions.flatMap((action) => action.affectedEntityIds))],
      reversible: true,
      toolName: actor === 'agent' ? 'apply_plan' : undefined,
      correlationId,
      evidencePath: branch.simulation.criticalPaths[0],
      visualEvent: { type: 'reality_committed', planId },
      mutate: (draft) => {
        checkpoint = {
          id: checkpointId,
          planId,
          createdAt: makeTimestamp(draft.stateVersion + draft.audit.length + 1),
          contextVersion: draft.contextVersion,
          operationalSnapshot: structuredClone(draft.operational),
          snapshotHash: stableHash(draft.operational),
        };
        draft.checkpoints.push(checkpoint);
        draft.operational.committedActions = structuredClone(branch.actions);
        draft.operational.actualMetrics = structuredClone(branch.simulation);
        draft.operational.realityLabel = `Committed · ${branch.name}`;
        draft.executedPlanIds.push(planId);
        draft.stagedPlan!.status = 'executed';
        const target = draft.branches.find((candidate) => candidate.id === branch.id)!;
        target.status = 'executed';
        draft.ui.recoveryOpen = true;
        draft.ui.atlasView = 'network';
      },
    });
    return {
      checkpoint: structuredClone(checkpoint),
      branch: structuredClone(this.state.branches.find((candidate) => candidate.id === branch.id)!),
    };
  }

  verifyPlan(planId: string, actor: Actor = 'human', correlationId?: string): VerificationResult {
    const staged = this.state.stagedPlan;
    if (!staged || staged.id !== planId || staged.status !== 'executed') throw new DomainError('WRONG_PHASE', 'The plan has not been executed.');
    const branch = this.state.branches.find((candidate) => candidate.id === staged.branchId)!;
    const checkpoint = this.state.checkpoints.find((candidate) => candidate.planId === planId);
    const actual = this.state.operational.actualMetrics;
    if (!branch.simulation || !checkpoint || !actual) throw new DomainError('INTERNAL_ERROR', 'Execution evidence is incomplete.', { recoverable: false });
    const metricVariance = {
      protectedRevenueCents: actual.protectedRevenueCents - branch.simulation.protectedRevenueCents,
      totalIncrementalCostCents: actual.totalIncrementalCostCents - branch.simulation.totalIncrementalCostCents,
      delayedOrders: actual.delayedOrders - branch.simulation.delayedOrders,
      emissionsDeltaKg: actual.emissionsDeltaKg - branch.simulation.emissionsDeltaKg,
    };
    const discrepancies = Object.entries(metricVariance)
      .filter(([, value]) => Math.abs(value) > 0)
      .map(([key, value]) => `${key} varied by ${value}.`);
    const verification: VerificationResult = {
      planId,
      verifiedAt: makeTimestamp(this.state.stateVersion + this.state.audit.length + 1),
      status: discrepancies.length === 0 ? 'verified' : 'verified_with_variance',
      metricVariance,
      hardConstraintsPassed: actual.hardConstraintViolations.length === 0,
      changedEntityIds: [...new Set(branch.actions.flatMap((action) => action.affectedEntityIds))],
      checkpointId: checkpoint.id,
      discrepancies,
      simulated: structuredClone(branch.simulation),
      actual: structuredClone(actual),
    };
    this.mutate(actor, 'verified plan', `${branch.name} verified against its simulated promise.`, {
      affectedEntityIds: verification.changedEntityIds,
      reversible: false,
      toolName: actor === 'agent' ? 'verify_plan' : undefined,
      correlationId,
      evidencePath: branch.simulation.criticalPaths[0],
      visualEvent: { type: 'verification_completed', planId },
      mutate: (draft) => {
        draft.verification = verification;
        draft.ui.recoveryOpen = true;
      },
    });
    return structuredClone(verification);
  }

  rollbackPlan(checkpointId: string, reason: string, actor: Actor = 'human', correlationId?: string): Checkpoint {
    const checkpoint = this.state.checkpoints.find((candidate) => candidate.id === checkpointId);
    if (!checkpoint) throw new DomainError('NO_CHECKPOINT', `Checkpoint ${checkpointId} does not exist.`);
    this.mutate(actor, 'rolled back plan', 'Checkpoint restored exactly; execution and rollback remain in the audit trail.', {
      contextChange: true,
      reason,
      affectedEntityIds: checkpoint.operationalSnapshot.committedActions.flatMap((action) => action.affectedEntityIds),
      reversible: false,
      toolName: actor === 'agent' ? 'rollback_plan' : undefined,
      correlationId,
      visualEvent: { type: 'checkpoint_restored', checkpointId },
      mutate: (draft) => {
        draft.operational = structuredClone(checkpoint.operationalSnapshot);
        draft.operational.realityLabel = 'Checkpoint restored';
        draft.verification = undefined;
        draft.ui.recoveryOpen = true;
        draft.ui.atlasView = 'network';
        draft.stagedPlan = undefined;
        draft.approval = undefined;
      },
    });
    return structuredClone(checkpoint);
  }

  reset(): void {
    const previous = this.state;
    clearState();
    const next = createInitialState(previous.resetToken + 1);
    next.ui.toast = { kind: 'success', message: 'Featured demo reset to healthy reality.', id: `toast_reset_${next.resetToken}` };
    this.replace(next, previous);
  }

  dispatch<T>(command: DomainCommand<T>): unknown {
    switch (command.type) {
      case 'TRIGGER_FEATURED_SHOCK':
        return this.triggerFeaturedShock(command.actor, command.correlationId);
      default:
        throw new DomainError('INVALID_INPUT', `Unsupported command type ${command.type}.`);
    }
  }

  updateUI(patch: Partial<AppState['ui']>): void {
    const previous = this.state;
    const next = structuredClone(previous);
    next.ui = { ...next.ui, ...patch };
    this.replace(next, previous, false);
  }
}

export const branchlineStore = new BranchlineStore();

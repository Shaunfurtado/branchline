import { calculateImpact } from '../domain/impact.js';
import { stableHash } from '../domain/hash.js';
import type { AppPhase, AppState, RecoveryBranch } from '../domain/types.js';

export function activeDisruptions(state: AppState) {
  return state.scenario.disruptions.filter((disruption) => disruption.active);
}

export function activeDisruption(state: AppState) {
  return activeDisruptions(state)[0];
}

export function contextHash(state: AppState): string {
  return stableHash({
    disruptions: state.scenario.disruptions.map((disruption) => ({
      id: disruption.id,
      active: disruption.active,
      delayDays: disruption.delayDays,
      durationDays: disruption.durationDays,
      capacityMultiplier: disruption.capacityMultiplier,
    })),
    constraints: state.constraints,
    operational: {
      activeDisruptionIds: state.operational.activeDisruptionIds,
      committedActions: state.operational.committedActions,
      currentDay: state.operational.currentDay,
      realityLabel: state.operational.realityLabel,
    },
  });
}

export function impactSummary(state: AppState) {
  return calculateImpact(
    state.scenario,
    activeDisruptions(state),
    state.constraints,
    state.contextVersion,
    contextHash(state),
  );
}

export function currentSimulatedBranches(state: AppState): RecoveryBranch[] {
  const hash = contextHash(state);
  return state.branches.filter(
    (branch) =>
      branch.simulation &&
      branch.status !== 'stale' &&
      branch.status !== 'invalid' &&
      branch.simulation.contextVersion === state.contextVersion &&
      branch.simulation.contextHash === hash,
  );
}

export function branchById(state: AppState, id: string): RecoveryBranch | undefined {
  return state.branches.find((branch) => branch.id === id);
}

export function computePhase(state: AppState): AppPhase {
  if (state.operational.realityLabel === 'Checkpoint restored') return 'ROLLBACK';
  if (state.verification) return 'VERIFY';
  if (state.executedPlanIds.length > 0 && state.checkpoints.length > 0) return 'COMMIT';
  if (state.stagedPlan?.status === 'approved') return 'COMMIT';
  if (state.stagedPlan?.status === 'awaiting_approval') return 'APPROVE';
  const current = currentSimulatedBranches(state);
  if (current.length > 0) return 'SIMULATE';
  if (state.branches.length > 0) return 'BRANCH';
  if (activeDisruptions(state).length > 0) return 'TRACE';
  return 'OBSERVE';
}

export const ALL_TOOL_NAMES = [
  'get_ops_snapshot',
  'inspect_entity',
  'trace_impact',
  'list_constraints',
  'find_substitutes',
  'read_external_alerts',
  'create_branch',
  'simulate_branch',
  'compare_branches',
  'explain_tradeoff',
  'stage_plan',
  'apply_plan',
  'verify_plan',
  'rollback_plan',
] as const;

export type ToolName = (typeof ALL_TOOL_NAMES)[number];

export function desiredToolNames(state: AppState): ToolName[] {
  const desired: ToolName[] = [
    'get_ops_snapshot',
    'inspect_entity',
    'trace_impact',
    'list_constraints',
    'find_substitutes',
    'read_external_alerts',
  ];
  const disrupted = activeDisruptions(state).length > 0;
  const executed = state.executedPlanIds.length > 0 && Boolean(state.operational.actualMetrics);
  if (disrupted && !executed) desired.push('create_branch');
  if (state.branches.length > 0 && !executed) desired.push('simulate_branch');
  const current = currentSimulatedBranches(state);
  if (current.length >= 1 && !state.stagedPlan && !executed) {
    desired.push('explain_tradeoff', 'stage_plan');
  } else if (current.length >= 1 && !executed) {
    desired.push('explain_tradeoff');
  }
  if (current.length >= 2 && !executed) desired.push('compare_branches');
  if (
    state.stagedPlan?.status === 'approved' &&
    state.approval?.contextVersion === state.contextVersion &&
    !state.executedPlanIds.includes(state.stagedPlan.id)
  ) {
    desired.push('apply_plan');
  }
  if (executed) desired.push('verify_plan');
  if (executed && state.checkpoints.length > 0) desired.push('rollback_plan');
  return [...new Set(desired)];
}

export function lockedToolReason(state: AppState, toolName: ToolName): string {
  if (desiredToolNames(state).includes(toolName)) return 'Registered now';
  const disrupted = activeDisruptions(state).length > 0;
  const current = currentSimulatedBranches(state);
  switch (toolName) {
    case 'create_branch':
      return disrupted ? 'Execution already began' : 'No active disruption';
    case 'simulate_branch':
      return state.branches.length ? 'Execution already began' : 'Create a branch first';
    case 'compare_branches':
      return current.length < 2 ? 'Simulate two current branches first' : 'Unavailable in the current phase';
    case 'explain_tradeoff':
      return current.length < 1 ? 'Simulate a current branch first' : 'Unavailable in the current phase';
    case 'stage_plan':
      if (state.branches.some((branch) => branch.status === 'stale')) return 'Context changed; re-simulation required';
      return current.length < 1 ? 'Simulate a valid branch first' : 'A plan is already staged';
    case 'apply_plan':
      if (state.stagedPlan?.status === 'awaiting_approval') return 'Waiting for human approval';
      if (state.stagedPlan?.status === 'revoked') return 'Context changed; re-simulation required';
      return 'Stage and approve a current plan first';
    case 'verify_plan':
      return 'Apply an approved plan first';
    case 'rollback_plan':
      return 'No executed checkpoint';
    default:
      return state.webmcp.supported ? 'Unavailable' : 'WebMCP unavailable in this browser';
  }
}

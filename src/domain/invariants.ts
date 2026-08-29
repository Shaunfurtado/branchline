import type { AppState, RecoveryBranch, ScenarioData, SimulationResult } from './types.js';

export function assertSimulationInvariants(scenario: ScenarioData, result: SimulationResult): void {
  for (const [orderId, mix] of Object.entries(result.orderSourceMix)) {
    const order = scenario.orders.find((candidate) => candidate.id === orderId);
    if (order?.productId === 'prod_orion' && (mix.sup_voltra ?? 0) > 0) {
      throw new Error(`Invariant failed: Voltra supplied ORION-X on ${orderId}.`);
    }
    for (const quantity of Object.values(mix)) {
      if (quantity < 0) throw new Error(`Invariant failed: negative allocation on ${orderId}.`);
    }
  }
  if (result.onTimeOrders + result.delayedOrders !== scenario.orders.length) {
    throw new Error('Invariant failed: order outcome counts do not reconcile.');
  }
}

export function branchIsCurrent(branch: RecoveryBranch, state: AppState): boolean {
  return Boolean(
    branch.simulation &&
      branch.status !== 'stale' &&
      branch.simulation.contextVersion === state.contextVersion &&
      branch.simulation.contextHash === branch.baseContextHash,
  );
}

export function assertMonotonicVersions(previous: AppState, next: AppState): void {
  if (next.stateVersion < previous.stateVersion) throw new Error('stateVersion must be monotonic.');
  if (next.contextVersion < previous.contextVersion) throw new Error('contextVersion must be monotonic.');
}

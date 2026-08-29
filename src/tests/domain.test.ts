import assert from 'node:assert/strict';
import test from 'node:test';

import { contextHash, desiredToolNames, impactSummary } from '../app/selectors.js';
import { createFeaturedScenario } from '../data/featuredScenario.js';
import { validateScenario } from '../data/scenarioValidation.js';
import { isSupplierProductCompatible, mergeBranchConstraints } from '../domain/constraints.js';
import { DomainError } from '../domain/errors.js';
import { calculateImpact } from '../domain/impact.js';
import { BranchlineStore, createInitialState } from '../store/branchlineStore.js';

async function simulatedStore(strategy: 'service_first' | 'cost_guard' | 'balanced' | 'resilience' = 'balanced') {
  const store = new BranchlineStore(createInitialState());
  store.triggerFeaturedShock('human');
  const branch = store.createBranch(`Test ${strategy}`, strategy, {}, 'agent');
  const simulated = await store.simulateBranch(branch.id, 30, 'agent');
  return { store, branch: simulated };
}

test('featured scenario validates and contains the required deterministic world', () => {
  const scenario = createFeaturedScenario();
  const validation = validateScenario(scenario);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(scenario.suppliers.length, 12);
  assert.equal(scenario.factories.length, 3);
  assert.equal(scenario.hubs.length, 3);
  assert.ok(scenario.lanes.length >= 8);
  assert.equal(scenario.orders.length, 24);
  assert.ok(scenario.customers.length >= 8);
  const apex = scenario.orders.find((order) => order.id === 'order_1082');
  assert.deepEqual(
    { customerId: apex?.customerId, productId: apex?.productId, quantity: apex?.quantity, dueDay: apex?.dueDay },
    { customerId: 'cus_apex', productId: 'prod_orion', quantity: 18, dueDay: 8 },
  );
});

test('NoriCell shock produces the tuned causal headline from data', () => {
  const store = new BranchlineStore(createInitialState());
  store.triggerFeaturedShock('human');
  const impact = impactSummary(store.getState());
  assert.equal(impact.affectedOrders, 16);
  assert.deepEqual(impact.blockedFactories.sort(), ['fac_blr', 'fac_pnq'].sort());
  assert.equal(impact.exposedRevenueCents, 2_843_000_000);
  assert.equal(impact.batteryShortfallCells, 48_300);
  assert.ok(impact.criticalPaths.some((path) => path.includes('sup_nori') && path.includes('order_1082')));
});

test('hard compatibility rejects Voltra for ORION in the domain engine', () => {
  const scenario = createFeaturedScenario();
  assert.equal(isSupplierProductCompatible(scenario, 'sup_voltra', 'cmp_battery_cell', 'prod_orion'), false);
  assert.equal(isSupplierProductCompatible(scenario, 'sup_voltra', 'cmp_battery_cell', 'prod_lynx'), true);
});

test('simulation is deterministic for identical state and strategy', async () => {
  const first = await simulatedStore('balanced');
  const second = await simulatedStore('balanced');
  assert.equal(first.branch.simulation?.simulationHash, second.branch.simulation?.simulationHash);
  assert.deepEqual(first.branch.actions, second.branch.actions);
  assert.deepEqual(first.branch.simulation?.orderDeliveryDays, second.branch.simulation?.orderDeliveryDays);
});

test('strategy outputs are materially different, valid, and derived', async () => {
  const results = await Promise.all(
    (['service_first', 'cost_guard', 'balanced', 'resilience'] as const).map(async (strategy) => (await simulatedStore(strategy)).branch),
  );
  for (const branch of results) {
    assert.equal(branch.status, 'current', `${branch.strategy}: ${branch.lastError ?? ''}`);
    assert.ok(branch.simulation);
    assert.equal(branch.simulation.hardConstraintViolations.length, 0);
    assert.ok(branch.simulation.totalIncrementalCostCents <= 30_000_000);
    assert.equal(branch.simulation.onTimeOrders + branch.simulation.delayedOrders, 24);
  }
  assert.equal(new Set(results.map((branch) => branch.simulation?.simulationHash)).size, 4);
  assert.equal(
    new Set(
      results.map((branch) =>
        branch.actions.map((action) => `${action.type}:${action.supplierId ?? ''}:${action.orderId ?? ''}:${action.quantity ?? 0}`).join('|'),
      ),
    ).size,
    4,
  );
  const service = results.find((branch) => branch.strategy === 'service_first')!;
  const cost = results.find((branch) => branch.strategy === 'cost_guard')!;
  const balanced = results.find((branch) => branch.strategy === 'balanced')!;
  assert.ok(service.simulation!.protectedRevenueCents > cost.simulation!.protectedRevenueCents);
  assert.ok(cost.simulation!.totalIncrementalCostCents < service.simulation!.totalIncrementalCostCents);
  assert.ok(balanced.simulation!.protectedRevenueCents / balanced.simulation!.exposedRevenueCents > 0.9);
  assert.ok(balanced.simulation!.delayedOrders >= 1 && balanced.simulation!.delayedOrders <= 3);
});

test('Cost Guard exposes the Apex tradeoff before a human lock', async () => {
  const { branch } = await simulatedStore('cost_guard');
  assert.ok(branch.simulation?.delayedOrderIds.includes('order_1082'));
  assert.ok(branch.actions.some((action) => action.type === 'DEFER_ORDER' && action.orderId === 'order_1082'));
});

test('human Apex lock invalidates old futures and recomputation changes allocation', async () => {
  const { store, branch: before } = await simulatedStore('balanced');
  const beforeHash = before.simulation!.simulationHash;
  const beforeContext = store.getState().contextVersion;
  store.protectOrder('order_1082', true, 'human');
  const stale = store.getState().branches.find((candidate) => candidate.id === before.id)!;
  assert.equal(stale.status, 'stale');
  assert.equal(store.getState().contextVersion, beforeContext + 1);
  assert.ok(store.getState().constraints.humanLockedOrderIds.includes('order_1082'));
  assert.ok(!desiredToolNames(store.getState()).includes('stage_plan'));

  const after = await store.simulateBranch(before.id, 30, 'agent');
  assert.equal(after.status, 'current');
  assert.notEqual(after.simulation!.simulationHash, beforeHash);
  assert.ok((after.simulation!.orderDeliveryDays.order_1082 ?? 99) <= 8);
  assert.ok(after.actions.some((action) => action.type === 'REALLOCATE_INVENTORY' && action.orderId === 'order_1082'));
  assert.ok(after.simulation!.orderSourceMix.order_1082?.sup_helix);
});

test('branch constraints can only make global constraints stricter', () => {
  const global = createInitialState().constraints;
  assert.throws(
    () => mergeBranchConstraints(global, { maxExtraCostCents: global.maxExtraCostCents + 1 }),
    (error: unknown) => error instanceof DomainError && error.code === 'CONSTRAINT_VIOLATION',
  );
  assert.throws(
    () => mergeBranchConstraints(global, { protectTiers: [] }),
    (error: unknown) => error instanceof DomainError && error.code === 'CONSTRAINT_VIOLATION',
  );
  const stricter = mergeBranchConstraints(global, { maxExtraCostCents: 20_000_000, maxDelayedOrders: 3, protectTiers: [1, 2] });
  assert.equal(stricter.maxExtraCostCents, 20_000_000);
  assert.equal(stricter.maxDelayedOrders, 3);
  assert.deepEqual(stricter.protectTiers, [1, 2]);
});

test('stale and invalid branches cannot be staged', async () => {
  const { store, branch } = await simulatedStore('balanced');
  store.updateConstraints({ maxDelayedOrders: 5 });
  assert.throws(
    () => store.stagePlan(branch.id, 'stale branch should fail', 'agent'),
    (error: unknown) => error instanceof DomainError && error.code === 'STALE_BRANCH',
  );

  const invalidStore = new BranchlineStore(createInitialState());
  invalidStore.triggerFeaturedShock('human');
  const invalid = invalidStore.createBranch('Impossible budget', 'balanced', { maxExtraCostCents: 1_000 }, 'agent');
  const simulated = await invalidStore.simulateBranch(invalid.id, 30, 'agent');
  assert.equal(simulated.status, 'invalid');
  assert.throws(
    () => invalidStore.stagePlan(simulated.id, 'invalid branch should fail', 'agent'),
    (error: unknown) => error instanceof DomainError && error.code === 'CONSTRAINT_VIOLATION',
  );
});

test('approval is human-only, current-context-bound, and required before apply', async () => {
  const { store, branch } = await simulatedStore('balanced');
  const plan = store.stagePlan(branch.id, 'stage for review', 'agent');
  assert.throws(
    () => store.applyPlan(plan.id, store.getState().contextVersion, 'agent'),
    (error: unknown) => error instanceof DomainError && error.code === 'APPROVAL_REQUIRED',
  );
  const approval = store.approveStagedPlan();
  assert.equal(approval.actor, 'human');
  store.updateConstraints({ noAirFreight: true });
  assert.equal(store.getState().stagedPlan?.status, 'revoked');
  assert.equal(store.getState().approval, undefined);
  assert.throws(
    () => store.applyPlan(plan.id, store.getState().contextVersion, 'agent'),
    (error: unknown) => error instanceof DomainError && ['APPROVAL_REQUIRED', 'STALE_APPROVAL'].includes(error.code),
  );
});

test('apply is idempotent, creates a checkpoint first, verifies, and rollback restores exact operations', async () => {
  const { store, branch } = await simulatedStore('balanced');
  store.protectOrder('order_1082', true, 'human');
  const current = await store.simulateBranch(branch.id, 30, 'agent');
  const plan = store.stagePlan(current.id, 'balanced current future', 'agent');
  store.approveStagedPlan();
  const before = structuredClone(store.getState().operational);
  const auditBefore = store.getState().audit.length;
  const applied = store.applyPlan(plan.id, store.getState().contextVersion, 'agent');
  assert.equal(applied.checkpoint.snapshotHash, applied.checkpoint.snapshotHash);
  assert.deepEqual(applied.checkpoint.operationalSnapshot, before);
  assert.equal(store.getState().checkpoints.length, 1);
  assert.equal(store.getState().operational.actualMetrics?.hardConstraintViolations.length, 0);
  assert.equal(store.getState().approval?.actor, 'human');

  const retried = store.applyPlan(plan.id, undefined, 'agent');
  assert.equal(retried.checkpoint.id, applied.checkpoint.id);
  assert.equal(store.getState().checkpoints.length, 1);

  const verified = store.verifyPlan(plan.id, 'agent');
  assert.equal(verified.status, 'verified');
  assert.equal(verified.hardConstraintsPassed, true);
  assert.ok((verified.actual.orderDeliveryDays.order_1082 ?? 99) <= 8);

  store.rollbackPlan(applied.checkpoint.id, 'supplier agreement was not signed', 'agent');
  assert.deepEqual(
    { ...store.getState().operational, realityLabel: before.realityLabel },
    before,
  );
  assert.equal(store.getState().operational.realityLabel, 'Checkpoint restored');
  assert.equal(store.getState().phase, 'ROLLBACK');
  assert.ok(store.getState().audit.length > auditBefore);
  assert.equal(store.getState().audit.at(-1)?.verb, 'rolled back plan');
  assert.ok(store.getState().audit.some((event) => event.verb === 'applied plan'));
});

test('state and context versions are monotonic across the canonical flow', async () => {
  const store = new BranchlineStore(createInitialState());
  let state = store.getState();
  let stateVersion = state.stateVersion;
  let contextVersion = state.contextVersion;
  const check = () => {
    state = store.getState();
    assert.ok(state.stateVersion >= stateVersion);
    assert.ok(state.contextVersion >= contextVersion);
    stateVersion = state.stateVersion;
    contextVersion = state.contextVersion;
  };
  store.triggerFeaturedShock('human'); check();
  const branch = store.createBranch('Balanced', 'balanced', {}, 'agent'); check();
  await store.simulateBranch(branch.id, 30, 'agent'); check();
  store.protectOrder('order_1082', true, 'human'); check();
  await store.simulateBranch(branch.id, 30, 'agent'); check();
  const plan = store.stagePlan(branch.id, 'current', 'agent'); check();
  store.approveStagedPlan(); check();
  store.applyPlan(plan.id, store.getState().contextVersion, 'agent'); check();
  store.verifyPlan(plan.id, 'agent'); check();
});

test('impact metrics change when synthetic source data changes', () => {
  const state = createInitialState();
  state.scenario.disruptions[0]!.active = true;
  const original = calculateImpact(state.scenario, state.scenario.disruptions, state.constraints, state.contextVersion, contextHash(state));
  const altered = structuredClone(state.scenario);
  const affected = altered.orders.find((order) => order.id === original.affectedOrderIds[0])!;
  affected.revenueCents += 123_450_000;
  const changed = calculateImpact(altered, altered.disruptions, state.constraints, state.contextVersion, 'changed');
  assert.equal(changed.exposedRevenueCents - original.exposedRevenueCents, 123_450_000);
});

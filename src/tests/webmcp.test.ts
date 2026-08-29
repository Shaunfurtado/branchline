import assert from 'node:assert/strict';
import test from 'node:test';

import { ALL_TOOL_NAMES, desiredToolNames } from '../app/selectors.js';
import { BranchlineStore, branchlineStore, createInitialState } from '../store/branchlineStore.js';
import { toolDefinitions } from '../webmcp/definitions.js';
import { getLocalToolHandler } from '../webmcp/handlers.js';
import { WebMCPRegistry } from '../webmcp/registry.js';
import { toolSchemas, validateToolInput } from '../webmcp/schemas.js';

const signal = () => new AbortController().signal;

async function singletonBalanced() {
  branchlineStore.reset();
  branchlineStore.triggerFeaturedShock('human');
  const branch = branchlineStore.createBranch('Balanced Recovery', 'balanced', {}, 'agent');
  return branchlineStore.simulateBranch(branch.id, 30, 'agent');
}

test('exact fourteen tools have serializable strict schemas and names under budget', () => {
  assert.equal(ALL_TOOL_NAMES.length, 14);
  assert.deepEqual(Object.keys(toolDefinitions).sort(), [...ALL_TOOL_NAMES].sort());
  for (const name of ALL_TOOL_NAMES) {
    assert.ok(name.length < 30, name);
    const schema = toolSchemas[name];
    assert.equal(schema.additionalProperties, false, name);
    assert.doesNotThrow(() => JSON.stringify(schema));
    assert.ok(toolDefinitions[name].description.length <= 220, name);
  }
});

test('read-only and untrusted annotations are correct', () => {
  const readOnly = ['get_ops_snapshot', 'inspect_entity', 'trace_impact', 'list_constraints', 'find_substitutes', 'read_external_alerts', 'compare_branches', 'explain_tradeoff', 'verify_plan'];
  for (const name of ALL_TOOL_NAMES) {
    assert.equal(toolDefinitions[name].annotations?.readOnlyHint, readOnly.includes(name), name);
    assert.equal(toolDefinitions[name].annotations?.untrustedContentHint, name === 'read_external_alerts', name);
  }
});

test('runtime validation rejects extra and malformed properties', () => {
  for (const name of ['get_ops_snapshot', 'list_constraints', 'read_external_alerts'] as const) {
    assert.throws(() => validateToolInput(name, { unexpected: true }));
  }
  assert.throws(() => validateToolInput('inspect_entity', { entity_id: 'sup_nori', extra: 1 }));
  assert.throws(() => validateToolInput('trace_impact', { source_id: 'sup_nori', max_depth: 99 }));
  assert.throws(() => validateToolInput('create_branch', { name: 'x', strategy: 'invented' }));
  assert.throws(() => validateToolInput('compare_branches', { branch_ids: ['a', 'a'] }));
});

test('untrusted alerts remain escaped data and are never interpreted as markup', async () => {
  branchlineStore.reset();
  const result = await getLocalToolHandler('read_external_alerts')({ limit: 5 }, signal());
  assert.equal(result.ok, true);
  const json = JSON.stringify(result);
  assert.match(json, /<img src=x onerror=alert\(1\)>/);
  assert.match(json, /unverified/);
});

test('tool output envelopes are compact and structured', async () => {
  branchlineStore.reset();
  const result = await getLocalToolHandler('get_ops_snapshot')({}, signal());
  assert.equal(result.ok, true);
  assert.equal(result.code, 'OK');
  assert.equal(typeof result.state_version, 'number');
  assert.equal(typeof result.context_version, 'number');
  assert.ok(JSON.stringify(result).length < 12_000);
});

test('human and tools operate the same singleton state', async () => {
  const branch = await singletonBalanced();
  branchlineStore.protectOrder('order_1082', true, 'human');
  const listed = await getLocalToolHandler('list_constraints')({}, signal());
  assert.equal(listed.ok, true);
  assert.match(JSON.stringify(listed), /order_1082/);
  const stale = branchlineStore.getState().branches.find((candidate) => candidate.id === branch.id)!;
  assert.equal(stale.status, 'stale');
  const simulated = await getLocalToolHandler('simulate_branch')({ branch_id: branch.id, horizon_days: 30 }, signal());
  assert.equal(simulated.ok, true);
  assert.ok((branchlineStore.getState().branches[0]!.simulation!.orderDeliveryDays.order_1082 ?? 99) <= 8);
});

test('dynamic desired-tool lifecycle gates consequential execution', async () => {
  const store = new BranchlineStore(createInitialState());
  assert.deepEqual(desiredToolNames(store.getState()), ALL_TOOL_NAMES.slice(0, 6));
  store.triggerFeaturedShock('human');
  assert.ok(desiredToolNames(store.getState()).includes('create_branch'));
  const draft = store.createBranch('Balanced', 'balanced', {}, 'agent');
  assert.ok(desiredToolNames(store.getState()).includes('simulate_branch'));
  const current = await store.simulateBranch(draft.id, 30, 'agent');
  assert.ok(desiredToolNames(store.getState()).includes('stage_plan'));
  assert.ok(!desiredToolNames(store.getState()).includes('apply_plan'));
  const plan = store.stagePlan(current.id, 'stage current branch', 'agent');
  assert.ok(!desiredToolNames(store.getState()).includes('apply_plan'));
  store.approveStagedPlan();
  assert.ok(desiredToolNames(store.getState()).includes('apply_plan'));
  store.applyPlan(plan.id, store.getState().contextVersion, 'agent');
  assert.ok(desiredToolNames(store.getState()).includes('verify_plan'));
  assert.ok(desiredToolNames(store.getState()).includes('rollback_plan'));
});

test('context change revokes apply capability immediately', async () => {
  const store = new BranchlineStore(createInitialState());
  store.triggerFeaturedShock('human');
  const draft = store.createBranch('Balanced', 'balanced', {}, 'agent');
  const current = await store.simulateBranch(draft.id, 30, 'agent');
  store.stagePlan(current.id, 'stage', 'agent');
  store.approveStagedPlan();
  assert.ok(desiredToolNames(store.getState()).includes('apply_plan'));
  store.protectOrder('order_1082', true, 'human');
  assert.ok(!desiredToolNames(store.getState()).includes('apply_plan'));
  assert.equal(store.getState().approval, undefined);
  assert.equal(store.getState().stagedPlan?.status, 'revoked');
});

test('cancelled simulation leaves no partial saved result', async () => {
  const store = new BranchlineStore(createInitialState());
  store.triggerFeaturedShock('human');
  const branch = store.createBranch('Cancelled', 'balanced', {}, 'agent');
  const controller = new AbortController();
  controller.abort(new DOMException('Cancelled in test', 'AbortError'));
  await assert.rejects(store.simulateBranch(branch.id, 30, 'agent', undefined, controller.signal));
  const saved = store.getState().branches.find((candidate) => candidate.id === branch.id)!;
  assert.equal(saved.status, 'draft');
  assert.equal(saved.simulation, undefined);
  assert.deepEqual(saved.actions, []);
});

test('native registry prevents duplicates and unregisters with AbortController signals', async () => {
  branchlineStore.reset();
  const registered = new Map<string, WebMCPToolDefinition>();
  const calls: string[] = [];
  const fakeModelContext = {
    async registerTool(definition: WebMCPToolDefinition, options: { signal: AbortSignal }) {
      calls.push(definition.name);
      if (registered.has(definition.name)) throw new Error(`duplicate ${definition.name}`);
      registered.set(definition.name, definition);
      options.signal.addEventListener('abort', () => registered.delete(definition.name), { once: true });
    },
    async getTools() { return [...registered.values()]; },
    addEventListener() {},
    removeEventListener() {},
  };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { modelContext: fakeModelContext } });
  const registry = new WebMCPRegistry();
  try {
    registry.start();
    await registry.reconcile();
    assert.deepEqual([...registered.keys()].sort(), [...ALL_TOOL_NAMES.slice(0, 6)].sort());
    const baseCallCount = calls.length;
    await registry.reconcile();
    assert.equal(calls.length, baseCallCount);

    branchlineStore.triggerFeaturedShock('human');
    await registry.reconcile();
    assert.ok(registered.has('create_branch'));

    const branch = branchlineStore.createBranch('Balanced', 'balanced', {}, 'agent');
    await branchlineStore.simulateBranch(branch.id, 30, 'agent');
    await registry.reconcile();
    assert.ok(registered.has('stage_plan'));
    const plan = branchlineStore.stagePlan(branch.id, 'stage', 'agent');
    await registry.reconcile();
    assert.ok(!registered.has('apply_plan'));
    branchlineStore.approveStagedPlan();
    await registry.reconcile();
    assert.ok(registered.has('apply_plan'));
    branchlineStore.updateConstraints({ maxDelayedOrders: 5 });
    await registry.reconcile();
    assert.ok(!registered.has('apply_plan'));
    assert.ok(!registered.has('stage_plan'));
    assert.equal(branchlineStore.getState().stagedPlan?.status, 'revoked');

    // Keep the plan variable used to ensure this path was truly staged.
    assert.match(plan.id, /^plan_/);
  } finally {
    registry.stop();
    assert.equal(registered.size, 0);
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

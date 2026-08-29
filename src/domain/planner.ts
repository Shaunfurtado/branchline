import { compatibleBatterySuppliers, isSupplierProductCompatible, productBatteryRequirement } from './constraints.js';
import { stableHash, stableStringify } from './hash.js';
import { scoreSimulation } from './scoring.js';
import { simulatePlan } from './simulator.js';
import type {
  BranchStrategy,
  Constraints,
  CustomerOrder,
  Disruption,
  RecoveryAction,
  ScenarioData,
  SimulationResult,
} from './types.js';

interface CandidateProfile {
  id: string;
  supplierOrder: string[];
  coverage: number;
  urgentAirDay: number;
  diversify: boolean;
  addBuffer: boolean;
  transferForLock: boolean;
}

export interface PlanBranchInput {
  scenario: ScenarioData;
  disruptions: Disruption[];
  constraints: Constraints;
  strategy: BranchStrategy;
  branchId: string;
  contextVersion: number;
  contextHash: string;
  horizonDays?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface PlannedBranch {
  actions: RecoveryAction[];
  simulation: SimulationResult;
  assumptions: string[];
  candidateCount: number;
  score: number;
}

const profiles: Record<BranchStrategy, CandidateProfile[]> = {
  service_first: [
    { id: 'helix_air', supplierOrder: ['sup_helix', 'sup_arda', 'sup_voltra'], coverage: 1.08, urgentAirDay: 11, diversify: false, addBuffer: false, transferForLock: true },
    { id: 'arda_helix', supplierOrder: ['sup_arda', 'sup_helix', 'sup_voltra'], coverage: 1.0, urgentAirDay: 9, diversify: false, addBuffer: false, transferForLock: true },
    { id: 'helix_mix', supplierOrder: ['sup_helix', 'sup_voltra', 'sup_arda'], coverage: 0.98, urgentAirDay: 8, diversify: true, addBuffer: false, transferForLock: true },
  ],
  cost_guard: [
    { id: 'voltra_economy', supplierOrder: ['sup_voltra', 'sup_arda', 'sup_helix'], coverage: 0.6, urgentAirDay: -1, diversify: false, addBuffer: false, transferForLock: false },
    { id: 'voltra_helix', supplierOrder: ['sup_voltra', 'sup_helix', 'sup_arda'], coverage: 0.64, urgentAirDay: -1, diversify: false, addBuffer: false, transferForLock: true },
    { id: 'arda_economy', supplierOrder: ['sup_arda', 'sup_voltra', 'sup_helix'], coverage: 0.56, urgentAirDay: -1, diversify: false, addBuffer: false, transferForLock: false },
  ],
  balanced: [
    { id: 'compatible_mix', supplierOrder: ['sup_voltra', 'sup_arda', 'sup_helix'], coverage: 0.65, urgentAirDay: 7, diversify: true, addBuffer: false, transferForLock: true },
    { id: 'arda_balanced', supplierOrder: ['sup_arda', 'sup_voltra', 'sup_helix'], coverage: 0.68, urgentAirDay: 6, diversify: true, addBuffer: false, transferForLock: true },
    { id: 'helix_selective', supplierOrder: ['sup_voltra', 'sup_helix', 'sup_arda'], coverage: 0.72, urgentAirDay: 8, diversify: false, addBuffer: false, transferForLock: true },
  ],
  resilience: [
    { id: 'distributed', supplierOrder: ['sup_arda', 'sup_voltra', 'sup_helix'], coverage: 0.74, urgentAirDay: 7, diversify: true, addBuffer: true, transferForLock: true },
    { id: 'helix_distributed', supplierOrder: ['sup_helix', 'sup_arda', 'sup_voltra'], coverage: 0.78, urgentAirDay: 7, diversify: true, addBuffer: true, transferForLock: true },
    { id: 'low_carbon', supplierOrder: ['sup_arda', 'sup_helix', 'sup_voltra'], coverage: 0.7, urgentAirDay: 5, diversify: true, addBuffer: true, transferForLock: false },
  ],
};

function baseAvailableByFactory(scenario: ScenarioData, disruptions: Disruption[]): Record<string, number> {
  const outage = disruptions.find((disruption) => disruption.active && disruption.kind === 'supplier_outage');
  const available: Record<string, number> = Object.fromEntries(scenario.factories.map((factory) => [factory.id, 0]));
  for (const lot of scenario.inventoryLots.filter((item) => item.componentId === 'cmp_battery_cell' && item.availableDay <= 8)) {
    available[lot.factoryId] = (available[lot.factoryId] ?? 0) + lot.quantity;
  }
  for (const po of scenario.purchaseOrders.filter((item) => item.componentId === 'cmp_battery_cell' && item.arrivalDay <= 12)) {
    const cancelled =
      outage &&
      po.supplierId === outage.sourceEntityId &&
      po.status === 'planned' &&
      po.orderedDay >= outage.startDay &&
      po.orderedDay < outage.startDay + outage.durationDays;
    if (!cancelled) available[po.factoryId] = (available[po.factoryId] ?? 0) + po.quantity;
  }
  return available;
}

function orderRank(order: CustomerOrder, constraints: Constraints): number {
  return (
    (constraints.humanLockedOrderIds.includes(order.id) ? 1_000_000 : 0) +
    (constraints.protectTiers.includes(order.customerTier) ? 300_000 : 0) +
    (order.customerTier === 1 ? 30_000 : order.customerTier === 2 ? 12_000 : 0) +
    order.priority * 100 -
    order.dueDay * 30
  );
}

function estimateShortfalls(
  scenario: ScenarioData,
  disruptions: Disruption[],
  constraints: Constraints,
): Array<{ order: CustomerOrder; shortfall: number }> {
  const available = baseAvailableByFactory(scenario, disruptions);
  const orders = [...scenario.orders].sort((left, right) => orderRank(right, constraints) - orderRank(left, constraints) || left.id.localeCompare(right.id));
  const result: Array<{ order: CustomerOrder; shortfall: number }> = [];
  for (const order of orders) {
    const product = scenario.products.find((candidate) => candidate.id === order.productId)!;
    const required = productBatteryRequirement(product) * order.quantity;
    const local = available[order.factoryId] ?? 0;
    const covered = Math.min(local, required);
    available[order.factoryId] = local - covered;
    const shortfall = required - covered;
    if (shortfall > 0) result.push({ order, shortfall });
  }
  return result;
}

function supplierLaneId(supplierId: string): string {
  return (
    {
      sup_voltra: 'lane_voltra_sin',
      sup_helix: 'lane_helix_sin',
      sup_arda: 'lane_arda_jnh',
      sup_nori: 'lane_nori_sin',
    } as Record<string, string>
  )[supplierId] ?? 'lane_sin_blr';
}

function estimatedPremiumCents(scenario: ScenarioData, supplierId: string, quantity: number, useAir: boolean): number {
  const offer = scenario.suppliers
    .find((supplier) => supplier.id === supplierId)
    ?.offers.find((candidate) => candidate.componentId === 'cmp_battery_cell');
  const supplierPremium = Math.max(0, (offer?.unitCostCents ?? 1_080) - 1_080) * quantity;
  const weight = quantity * 0.071;
  const freightPremium = useAir ? weight * 137 : weight * 8;
  return Math.round(supplierPremium + freightPremium);
}

function makeProcurementAction(
  scenario: ScenarioData,
  branchId: string,
  index: number,
  supplierId: string,
  order: CustomerOrder,
  quantity: number,
  useAir: boolean,
  type: RecoveryAction['type'],
): RecoveryAction {
  const supplier = scenario.suppliers.find((candidate) => candidate.id === supplierId)!;
  const offer = supplier.offers.find((candidate) => candidate.componentId === 'cmp_battery_cell')!;
  const laneId = useAir ? 'lane_air_asia_india' : supplierLaneId(supplierId);
  const arrivalDay = Math.max(2, offer.leadDays - (useAir ? 2 : 0));
  return {
    id: `${branchId}_buy_${index}_${supplierId}_${order.id}`,
    type,
    description: `${type === 'SPLIT_PURCHASE_ORDER' ? 'Split' : 'Source'} ${quantity.toLocaleString('en-US')} compatible cells from ${supplier.name} for ${order.name}.`,
    preconditions: [
      `${supplier.name} offer remains available.`,
      `${supplierId} is compatible with ${order.productId}.`,
      `Allocation remains within ${offer.capacityPerDay.toLocaleString('en-US')} cells/day.`,
    ],
    affectedEntityIds: [supplierId, 'cmp_battery_cell', order.factoryId, order.productId, order.id],
    incrementalCostCents: estimatedPremiumCents(scenario, supplierId, quantity, useAir),
    timingEffectDays: useAir ? -2 : 0,
    capacityEffect: quantity,
    emissionsEffectKg: useAir ? Math.round(quantity * 0.071 * 2.25) : Math.round(quantity * 0.071 * 0.08),
    riskEffect: supplier.reliability - 0.91,
    reversible: true,
    rationale: `${supplier.name} was selected by the branch strategy after compatibility, timing, capacity, and cost checks.`,
    evidencePath: [supplierId, 'cmp_battery_cell', order.factoryId, order.productId, order.id, order.customerId],
    supplierId,
    componentId: 'cmp_battery_cell',
    productId: order.productId,
    orderId: order.id,
    factoryId: order.factoryId,
    laneId,
    quantity,
    arrivalDay,
  };
}

function generateCandidateActions(
  input: PlanBranchInput,
  profile: CandidateProfile,
  candidateIndex: number,
): RecoveryAction[] {
  const { scenario, disruptions, constraints, branchId, strategy } = input;
  const shortfalls = estimateShortfalls(scenario, disruptions, constraints);
  const actions: RecoveryAction[] = [];
  const remainingCapacity: Record<string, number> = {};
  for (const supplier of compatibleBatterySuppliers(scenario)) {
    const offer = supplier.offers.find((candidate) => candidate.componentId === 'cmp_battery_cell')!;
    remainingCapacity[supplier.id] = offer.capacityPerDay * 8;
  }
  let estimatedSpend = 0;
  const budget = Math.max(0, constraints.maxExtraCostCents - 2_500_000);
  let procurementIndex = 0;
  const targets = shortfalls.sort(
    (left, right) => orderRank(right.order, constraints) - orderRank(left.order, constraints) || left.order.id.localeCompare(right.order.id),
  );

  const lockActive = constraints.humanLockedOrderIds.includes('order_1082');
  if (lockActive && profile.transferForLock) {
    actions.push({
      id: `${branchId}_transfer_apex_${candidateIndex}`,
      type: 'REALLOCATE_INVENTORY',
      description: 'Rebalance 4,500 compatible Helix cells from Chennai to Pune for the protected Apex order.',
      preconditions: ['Chennai holds the Helix lot.', 'The Chennai transfer lane remains available.'],
      affectedEntityIds: ['fac_maa', 'lane_maa_pnq', 'fac_pnq', 'order_1082'],
      incrementalCostCents: 720_000,
      timingEffectDays: -2,
      capacityEffect: 4_500,
      emissionsEffectKg: 410,
      riskEffect: -0.02,
      reversible: true,
      rationale: 'The human lock makes the near-term Pune ORION-X requirement dominant over a later Chennai commitment.',
      evidencePath: ['fac_maa', 'cmp_battery_cell', 'lane_maa_pnq', 'fac_pnq', 'prod_orion', 'order_1082'],
      fromFactoryId: 'fac_maa',
      toFactoryId: 'fac_pnq',
      laneId: 'lane_maa_pnq',
      quantity: 4_500,
      arrivalDay: 0,
      sourceSupplierId: 'sup_helix',
      orderId: 'order_1082',
    });
    estimatedSpend += 720_000;
  }

  for (const [targetIndex, target] of targets.entries()) {
    const { order } = target;
    const protectedOrder = constraints.protectTiers.includes(order.customerTier) || constraints.humanLockedOrderIds.includes(order.id);
    const targetCoverage = protectedOrder ? 1 : profile.coverage;
    let needed = Math.ceil(target.shortfall * targetCoverage);
    if (order.id === 'order_1082' && lockActive && profile.transferForLock) needed = Math.max(0, needed - 4_500);
    if (!protectedOrder && targetIndex > Math.ceil(targets.length * profile.coverage)) continue;

    const supplierOrder = profile.diversify
      ? [...profile.supplierOrder.slice(targetIndex % profile.supplierOrder.length), ...profile.supplierOrder.slice(0, targetIndex % profile.supplierOrder.length)]
      : profile.supplierOrder;
    const compatible = supplierOrder.filter((supplierId) =>
      isSupplierProductCompatible(scenario, supplierId, 'cmp_battery_cell', order.productId),
    );
    for (const supplierId of compatible) {
      if (needed <= 0) break;
      const capacity = remainingCapacity[supplierId] ?? 0;
      if (capacity <= 0) continue;
      const supplier = scenario.suppliers.find((candidate) => candidate.id === supplierId)!;
      const offer = supplier.offers.find((candidate) => candidate.componentId === 'cmp_battery_cell')!;
      const useAir =
        !constraints.noAirFreight &&
        profile.urgentAirDay >= 0 &&
        (order.dueDay <= profile.urgentAirDay || constraints.humanLockedOrderIds.includes(order.id)) &&
        offer.leadDays >= Math.max(4, order.dueDay - 2);
      let allocate = Math.min(needed, capacity);
      const premium = estimatedPremiumCents(scenario, supplierId, allocate, useAir);
      if (!protectedOrder && estimatedSpend + premium > budget) continue;
      if (estimatedSpend + premium > constraints.maxExtraCostCents) {
        const perCell = Math.max(1, estimatedPremiumCents(scenario, supplierId, 1_000, useAir) / 1_000);
        allocate = Math.max(0, Math.floor((constraints.maxExtraCostCents - estimatedSpend) / perCell));
      }
      if (allocate < 900) continue;
      allocate = Math.floor(allocate / 100) * 100;
      procurementIndex += 1;
      const type = procurementIndex === 1 ? 'SWITCH_SUPPLIER' : 'SPLIT_PURCHASE_ORDER';
      const action = makeProcurementAction(scenario, branchId, procurementIndex, supplierId, order, allocate, useAir, type);
      actions.push(action);
      remainingCapacity[supplierId] = capacity - allocate;
      needed -= allocate;
      estimatedSpend += action.incrementalCostCents;
      if (useAir) {
        actions.push({
          id: `${branchId}_expedite_${procurementIndex}`,
          type: 'EXPEDITE_LANE',
          description: `Expedite the ${supplier.name} cell allocation through the air recovery lane.`,
          preconditions: ['Air freight remains permitted.', 'Air recovery capacity remains available.'],
          affectedEntityIds: [supplierId, 'lane_air_asia_india', order.factoryId, order.id],
          incrementalCostCents: Math.round(allocate * 0.071 * 82),
          timingEffectDays: -2,
          capacityEffect: allocate,
          emissionsEffectKg: Math.round(allocate * 0.071 * 2.0),
          riskEffect: -0.01,
          reversible: true,
          rationale: 'The due-date exposure justifies a selective logistics premium.',
          evidencePath: [supplierId, 'lane_air_asia_india', order.factoryId, order.id],
          supplierId,
          productId: order.productId,
          orderId: order.id,
          factoryId: order.factoryId,
          laneId: 'lane_air_asia_india',
          quantity: allocate,
          arrivalDay: action.arrivalDay,
        });
        estimatedSpend += actions.at(-1)!.incrementalCostCents;
      }
    }

    if (protectedOrder) {
      actions.push({
        id: `${branchId}_sequence_${order.id}_${candidateIndex}`,
        type: 'RESCHEDULE_PRODUCTION',
        description: `Promote ${order.name} within ${order.factoryId} production sequencing.`,
        preconditions: ['Factory compatibility remains valid.', 'The order has not already completed.'],
        affectedEntityIds: [order.factoryId, order.productId, order.id, order.customerId],
        incrementalCostCents: 260_000,
        timingEffectDays: -1,
        capacityEffect: 0,
        emissionsEffectKg: 0,
        riskEffect: -0.01,
        reversible: true,
        rationale: constraints.humanLockedOrderIds.includes(order.id)
          ? 'The human-authored intent pin gives this order priority.'
          : `Tier-${order.customerTier} service is globally protected.`,
        evidencePath: [order.factoryId, order.productId, order.id, order.customerId],
        orderId: order.id,
        factoryId: order.factoryId,
      });
      estimatedSpend += 260_000;
    }
  }

  if (strategy === 'service_first') {
    const moveOrder = scenario.orders.find((order) => order.id === 'order_1075')!;
    actions.push({
      id: `${branchId}_move_1075_${candidateIndex}`,
      type: 'MOVE_PRODUCTION',
      description: 'Move the Tier-1 LYNX-4 build from Pune to Bengaluru to release thermal-line capacity.',
      preconditions: ['Bengaluru remains compatible with LYNX-4.', 'Bengaluru has open line capacity.'],
      affectedEntityIds: ['fac_pnq', 'fac_blr', 'prod_lynx', moveOrder.id],
      incrementalCostCents: 2_800_000,
      timingEffectDays: -1,
      capacityEffect: moveOrder.quantity,
      emissionsEffectKg: 620,
      riskEffect: -0.03,
      reversible: true,
      rationale: 'Service-first scoring values the released Pune capacity above the changeover premium.',
      evidencePath: ['fac_pnq', 'prod_lynx', moveOrder.id, 'fac_blr'],
      orderId: moveOrder.id,
      fromFactoryId: 'fac_pnq',
      toFactoryId: 'fac_blr',
      productId: 'prod_lynx',
    });
  }

  if (strategy === 'cost_guard' || strategy === 'balanced') {
    const eligible = scenario.orders.filter(
      (order) => !constraints.protectTiers.includes(order.customerTier) && !constraints.humanLockedOrderIds.includes(order.id),
    );
    // Cost Guard defers the earliest unprotected high-thermal commitment because its
    // compatible recovery supply carries the largest near-term premium. Once a human
    // locks that commitment, the same ranking naturally selects a lower-priority order.
    const premiumOrion = eligible
      .filter((order) => order.productId === 'prod_orion' && order.dueDay <= 10)
      .sort((left, right) => left.dueDay - right.dueDay || left.revenueCents - right.revenueCents);
    const deferrable =
      strategy === 'cost_guard' && premiumOrion.length > 0
        ? premiumOrion[0]
        : eligible.sort((left, right) => orderRank(left, constraints) - orderRank(right, constraints))[0];
    if (deferrable) {
      actions.push({
        id: `${branchId}_defer_${deferrable.id}_${candidateIndex}`,
        type: 'DEFER_ORDER',
        description: `Move lower-priority ${deferrable.name} behind protected commitments.`,
        preconditions: ['The order is not human locked.', `Customer tier ${deferrable.customerTier} is not globally protected.`],
        affectedEntityIds: [deferrable.factoryId, deferrable.productId, deferrable.id, deferrable.customerId],
        incrementalCostCents: 0,
        timingEffectDays: 2,
        capacityEffect: 0,
        emissionsEffectKg: -140,
        riskEffect: 0.03,
        reversible: true,
        rationale: 'This explicit service tradeoff preserves the cost ceiling and protected commitments.',
        evidencePath: [deferrable.factoryId, deferrable.productId, deferrable.id, deferrable.customerId],
        orderId: deferrable.id,
        arrivalDay: deferrable.dueDay + 2,
      });
    }
  }

  if (profile.addBuffer) {
    const supplierId = profile.supplierOrder[0]!;
    const supplier = scenario.suppliers.find((candidate) => candidate.id === supplierId)!;
    const offer = supplier.offers.find((candidate) => candidate.componentId === 'cmp_battery_cell')!;
    const quantity = Math.min(4_000, remainingCapacity[supplierId] ?? 0);
    if (quantity > 0) {
      actions.push({
        id: `${branchId}_buffer_${candidateIndex}`,
        type: 'ADD_SAFETY_BUFFER',
        description: `Add a ${quantity.toLocaleString('en-US')}-cell diversified safety buffer from ${supplier.name}.`,
        preconditions: ['Recovery demand is covered before the buffer is consumed.'],
        affectedEntityIds: [supplierId, 'cmp_battery_cell', 'fac_blr'],
        incrementalCostCents: estimatedPremiumCents(scenario, supplierId, quantity, false),
        timingEffectDays: 0,
        capacityEffect: quantity,
        emissionsEffectKg: Math.round(quantity * 0.071 * 0.08),
        riskEffect: -0.05,
        reversible: true,
        rationale: 'Resilience scoring rewards a small, usable buffer and reduced single-source dependence.',
        evidencePath: [supplierId, 'cmp_battery_cell', 'fac_blr'],
        supplierId,
        componentId: 'cmp_battery_cell',
        factoryId: 'fac_blr',
        laneId: supplierLaneId(supplierId),
        quantity,
        arrivalDay: offer.leadDays,
      });
    }
  }

  return actions.sort((left, right) => left.id.localeCompare(right.id));
}

export async function planBranch(input: PlanBranchInput): Promise<PlannedBranch> {
  const horizonDays = input.horizonDays ?? 30;
  const baseline = simulatePlan({
    scenario: input.scenario,
    disruptions: input.disruptions,
    constraints: input.constraints,
    actions: [],
    contextVersion: input.contextVersion,
    contextHash: input.contextHash,
    horizonDays,
  });
  const candidates: Array<{ actions: RecoveryAction[]; simulation: SimulationResult; score: number; signature: string }> = [];
  const selectedProfiles = profiles[input.strategy];
  for (const [index, profile] of selectedProfiles.entries()) {
    if (input.signal?.aborted) throw input.signal.reason ?? new DOMException('Simulation cancelled', 'AbortError');
    const actions = generateCandidateActions(input, profile, index);
    const simulation = simulatePlan({
      scenario: input.scenario,
      disruptions: input.disruptions,
      constraints: input.constraints,
      actions,
      contextVersion: input.contextVersion,
      contextHash: input.contextHash,
      horizonDays,
      baseline,
    });
    candidates.push({
      actions,
      simulation,
      score: scoreSimulation(simulation, input.strategy),
      signature: stableHash(stableStringify(actions.map((action) => ({ type: action.type, ids: action.affectedEntityIds, quantity: action.quantity })) )),
    });
    input.onProgress?.((index + 1) / selectedProfiles.length);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  candidates.sort((left, right) => right.score - left.score || left.signature.localeCompare(right.signature));
  const best = candidates[0]!;
  return {
    actions: best.actions,
    simulation: best.simulation,
    assumptions: [
      'Synthetic supplier offers remain available for the modeled 30-day horizon.',
      'Component and factory compatibility rules are hard constraints.',
      'Transport emissions and concentration risk are simplified planning indicators.',
      `Candidate selection used ${input.strategy} scoring against ${candidates.length} deterministic action sets.`,
    ],
    candidateCount: candidates.length,
    score: best.score,
  };
}

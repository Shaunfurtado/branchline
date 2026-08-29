import { isSupplierProductCompatible, productBatteryRequirement } from './constraints.js';
import { stableHash } from './hash.js';
import type {
  Constraints,
  CausalStep,
  CustomerOrder,
  DailySnapshot,
  Disruption,
  InventoryLot,
  Product,
  RecoveryAction,
  ScenarioData,
  SimulationResult,
} from './types.js';

interface MutableLot extends InventoryLot {
  remaining: number;
}

interface OrderProgress {
  order: CustomerOrder;
  factoryId: string;
  produced: number;
  completionDay: number | null;
  sourceMix: Record<string, number>;
  notBeforeDay: number;
  priorityBoost: number;
}

export interface SimulationInput {
  scenario: ScenarioData;
  disruptions: Disruption[];
  constraints: Constraints;
  actions: RecoveryAction[];
  contextVersion: number;
  contextHash: string;
  horizonDays?: number;
  baseline?: SimulationResult;
}

function activeOutage(disruptions: Disruption[]): Disruption | undefined {
  return disruptions.find((disruption) => disruption.active && disruption.kind === 'supplier_outage');
}

function activeLaneDelay(disruptions: Disruption[]): Disruption | undefined {
  return disruptions.find((disruption) => disruption.active && disruption.kind === 'lane_delay');
}

function supplierOffer(scenario: ScenarioData, supplierId: string) {
  return scenario.suppliers
    .find((supplier) => supplier.id === supplierId)
    ?.offers.find((offer) => offer.componentId === 'cmp_battery_cell');
}

function laneForAction(scenario: ScenarioData, action: RecoveryAction) {
  if (action.laneId) return scenario.lanes.find((lane) => lane.id === action.laneId);
  const supplierLane = scenario.lanes.find((lane) => lane.fromId === action.supplierId);
  return supplierLane;
}

function createBaseLots(input: SimulationInput): { lots: MutableLot[]; violations: string[] } {
  const { scenario, disruptions, actions } = input;
  const violations: string[] = [];
  const outage = activeOutage(disruptions);
  const laneDelay = activeLaneDelay(disruptions);
  const lots: MutableLot[] = scenario.inventoryLots
    .filter((lot) => lot.componentId === 'cmp_battery_cell')
    .map((lot) => ({ ...structuredClone(lot), remaining: lot.quantity }));

  for (const purchaseOrder of scenario.purchaseOrders.filter((po) => po.componentId === 'cmp_battery_cell')) {
    const disruptedProduction =
      outage &&
      purchaseOrder.supplierId === outage.sourceEntityId &&
      purchaseOrder.status === 'planned' &&
      purchaseOrder.orderedDay >= outage.startDay &&
      purchaseOrder.orderedDay < outage.startDay + outage.durationDays;
    if (disruptedProduction || purchaseOrder.status === 'cancelled') continue;
    const delayed = laneDelay && purchaseOrder.laneId === laneDelay.sourceEntityId ? laneDelay.delayDays ?? 0 : 0;
    lots.push({
      id: `lot_${purchaseOrder.id}`,
      componentId: purchaseOrder.componentId,
      factoryId: purchaseOrder.factoryId,
      sourceSupplierId: purchaseOrder.supplierId,
      quantity: purchaseOrder.quantity,
      remaining: purchaseOrder.quantity,
      availableDay: purchaseOrder.arrivalDay + delayed,
    });
  }

  if (outage?.sourceEntityId === 'sup_nori') {
    const offer = supplierOffer(scenario, 'sup_nori');
    if (offer) {
      for (let productionDay = outage.startDay + outage.durationDays; productionDay <= (input.horizonDays ?? 30); productionDay += 1) {
        const arrivalDay = productionDay + offer.leadDays + (laneDelay?.delayDays ?? 0);
        const splits = [
          ['fac_blr', 0.4],
          ['fac_pnq', 0.3],
          ['fac_maa', 0.3],
        ] as const;
        for (const [factoryId, share] of splits) {
          const quantity = Math.floor(offer.capacityPerDay * share);
          lots.push({
            id: `lot_nori_resume_${productionDay}_${factoryId}`,
            componentId: 'cmp_battery_cell',
            factoryId,
            sourceSupplierId: 'sup_nori',
            quantity,
            remaining: quantity,
            availableDay: arrivalDay,
          });
        }
      }
    }
  }

  for (const action of actions) {
    if (
      (action.type === 'SWITCH_SUPPLIER' ||
        action.type === 'SPLIT_PURCHASE_ORDER' ||
        action.type === 'ADD_SAFETY_BUFFER') &&
      action.componentId === 'cmp_battery_cell' &&
      action.supplierId &&
      action.factoryId &&
      action.quantity &&
      action.arrivalDay !== undefined
    ) {
      lots.push({
        id: `lot_action_${action.id}`,
        componentId: 'cmp_battery_cell',
        factoryId: action.factoryId,
        sourceSupplierId: action.supplierId,
        quantity: action.quantity,
        remaining: action.quantity,
        availableDay: action.arrivalDay,
      });
    }
  }

  for (const action of actions.filter((candidate) => candidate.type === 'REALLOCATE_INVENTORY')) {
    if (!action.fromFactoryId || !action.toFactoryId || !action.quantity || action.arrivalDay === undefined) continue;
    let remainingToMove = action.quantity;
    const sourceLots = lots
      .filter(
        (lot) =>
          lot.factoryId === action.fromFactoryId &&
          lot.availableDay <= 0 &&
          (!action.sourceSupplierId || lot.sourceSupplierId === action.sourceSupplierId),
      )
      .sort((left, right) => left.id.localeCompare(right.id));
    const movedBySource: Record<string, number> = {};
    for (const lot of sourceLots) {
      const amount = Math.min(lot.remaining, remainingToMove);
      lot.remaining -= amount;
      movedBySource[lot.sourceSupplierId] = (movedBySource[lot.sourceSupplierId] ?? 0) + amount;
      remainingToMove -= amount;
      if (remainingToMove === 0) break;
    }
    if (remainingToMove > 0) {
      violations.push(`Inventory transfer ${action.id} exceeds available source inventory by ${remainingToMove} cells.`);
    }
    for (const [sourceSupplierId, quantity] of Object.entries(movedBySource)) {
      lots.push({
        id: `lot_transfer_${action.id}_${sourceSupplierId}`,
        componentId: 'cmp_battery_cell',
        factoryId: action.toFactoryId,
        sourceSupplierId,
        quantity,
        remaining: quantity,
        availableDay: action.arrivalDay,
      });
    }
  }
  return { lots, violations };
}

function consumeCells(
  scenario: ScenarioData,
  lots: MutableLot[],
  factoryId: string,
  productId: string,
  day: number,
  quantity: number,
): Record<string, number> | null {
  const eligible = lots
    .filter(
      (lot) =>
        lot.factoryId === factoryId &&
        lot.availableDay <= day &&
        lot.remaining > 0 &&
        isSupplierProductCompatible(scenario, lot.sourceSupplierId, 'cmp_battery_cell', productId),
    )
    .sort((left, right) => left.availableDay - right.availableDay || left.sourceSupplierId.localeCompare(right.sourceSupplierId));
  const available = eligible.reduce((sum, lot) => sum + lot.remaining, 0);
  if (available < quantity) return null;
  const mix: Record<string, number> = {};
  let remaining = quantity;
  for (const lot of eligible) {
    const used = Math.min(remaining, lot.remaining);
    lot.remaining -= used;
    mix[lot.sourceSupplierId] = (mix[lot.sourceSupplierId] ?? 0) + used;
    remaining -= used;
    if (remaining === 0) break;
  }
  return mix;
}

function actionCosts(scenario: ScenarioData, actions: RecoveryAction[]) {
  let supplier = 0;
  let logistics = 0;
  let production = 0;
  let emissions = 0;
  for (const action of actions) {
    if (
      (action.type === 'SWITCH_SUPPLIER' || action.type === 'SPLIT_PURCHASE_ORDER' || action.type === 'ADD_SAFETY_BUFFER') &&
      action.supplierId &&
      action.quantity
    ) {
      const offer = supplierOffer(scenario, action.supplierId);
      supplier += Math.max(0, (offer?.unitCostCents ?? 1_080) - 1_080) * action.quantity;
      const lane = laneForAction(scenario, action);
      if (lane) {
        const weightKg = action.quantity * 0.071;
        logistics += Math.max(0, lane.costPerKgCents - 18) * weightKg;
        const baseGrams = weightKg * lane.distanceKm * 12;
        const actualGrams = weightKg * lane.distanceKm * lane.emissionsGramsPerKgKm;
        emissions += (actualGrams - baseGrams) / 1_000;
      }
    }
    if (action.type === 'EXPEDITE_LANE') {
      logistics += action.incrementalCostCents;
      emissions += action.emissionsEffectKg;
    }
    if (action.type === 'MOVE_PRODUCTION' || action.type === 'RESCHEDULE_PRODUCTION') {
      production += action.incrementalCostCents;
      emissions += action.emissionsEffectKg;
    }
    if (action.type === 'REALLOCATE_INVENTORY') {
      logistics += action.incrementalCostCents;
      emissions += action.emissionsEffectKg;
    }
  }
  return {
    supplier: Math.round(supplier),
    logistics: Math.round(logistics),
    production: Math.round(production),
    emissions: Math.round(emissions),
  };
}

function priorityScore(progress: OrderProgress, constraints: Constraints, day: number): number {
  const { order } = progress;
  const locked = constraints.humanLockedOrderIds.includes(order.id) ? 1_000_000 : 0;
  const protectedTier = constraints.protectTiers.includes(order.customerTier) ? 300_000 : 0;
  const tier = order.customerTier === 1 ? 30_000 : order.customerTier === 2 ? 12_000 : 0;
  const urgency = Math.max(-30, 30 - (order.dueDay - day)) * 500;
  return locked + protectedTier + tier + urgency + order.priority * 100 + progress.priorityBoost;
}

function buildCausalProof(
  scenario: ScenarioData,
  constraints: Constraints,
  actions: RecoveryAction[],
  result: Pick<SimulationResult, 'orderDeliveryDays' | 'orderSourceMix' | 'delayedOrderIds'>,
) {
  const steps: CausalStep[] = [
    {
      observation: 'NoriCell capacity falls to zero for the 12-day containment window.',
      entityIds: ['disrupt_nori_12d', 'sup_nori'],
      kind: 'observation' as const,
    },
    {
      observation: 'The missing NC-2170 flow propagates to battery inventory, production lines, products, and customer orders.',
      entityIds: ['sup_nori', 'cmp_battery_cell', 'fac_pnq', 'prod_orion'],
      kind: 'observation' as const,
    },
    {
      observation: 'Voltra is excluded from ORION-X because its V-2170 offer does not meet the product compatibility rule.',
      entityIds: ['sup_voltra', 'prod_orion'],
      kind: 'observation' as const,
    },
  ];
  const order1082Mix = result.orderSourceMix.order_1082 ?? {};
  for (const supplierId of ['sup_arda', 'sup_helix']) {
    const quantity = order1082Mix[supplierId] ?? 0;
    if (quantity > 0) {
      const supplier = scenario.suppliers.find((candidate) => candidate.id === supplierId)!;
      steps.push({
        observation: `${supplier.name} contributes ${quantity.toLocaleString('en-US')} compatible cells to the protected Apex path.`,
        entityIds: [supplierId, 'cmp_battery_cell', 'order_1082'],
        kind: 'action' as const,
      });
    }
  }
  const transfer = actions.find((action) => action.type === 'REALLOCATE_INVENTORY' && action.toFactoryId === 'fac_pnq');
  if (transfer) {
    steps.push({
      observation: `${transfer.quantity?.toLocaleString('en-US')} cells are rebalanced to Pune so the protected order can enter production before T+8.`,
      entityIds: transfer.evidencePath,
      kind: 'action' as const,
    });
  }
  if (constraints.humanLockedOrderIds.includes('order_1082')) {
    steps.push({
      observation: `The human-authored lock elevates order_1082 above otherwise attractive Tier-2 allocations; delivery is T+${result.orderDeliveryDays.order_1082 ?? '—'}.`,
      entityIds: ['order_1082', 'cus_apex'],
      kind: 'observation' as const,
    });
  }
  const alternative = result.delayedOrderIds.find((id) => id !== 'order_1082');
  if (alternative) {
    steps.push({
      observation: `Without the protected-order allocation, ${alternative} would retain its original slot; instead it becomes the lower-priority tradeoff.`,
      entityIds: [alternative, 'order_1082'],
      kind: 'counterfactual' as const,
    });
  }
  return steps;
}

function rawSimulation(input: SimulationInput): SimulationResult {
  const horizonDays = input.horizonDays ?? 30;
  const { scenario, constraints, actions } = input;
  const { lots, violations } = createBaseLots(input);
  const products = new Map<string, Product>(scenario.products.map((product) => [product.id, product]));
  const factories = new Map(scenario.factories.map((factory) => [factory.id, factory]));
  const orderProgress: OrderProgress[] = scenario.orders.map((order) => {
    const move = actions.find((action) => action.type === 'MOVE_PRODUCTION' && action.orderId === order.id);
    const defer = actions.find((action) => action.type === 'DEFER_ORDER' && action.orderId === order.id);
    const resequence = actions.find((action) => action.type === 'RESCHEDULE_PRODUCTION' && action.orderId === order.id);
    return {
      order,
      factoryId: move?.toFactoryId ?? order.factoryId,
      produced: 0,
      completionDay: null,
      sourceMix: {},
      notBeforeDay: Math.max(order.releaseDay, defer?.arrivalDay ?? order.releaseDay),
      priorityBoost: resequence ? 80_000 : 0,
    };
  });

  const dailySnapshots: DailySnapshot[] = [];
  let cumulativeCompletedVehicles = 0;
  for (let day = 0; day <= horizonDays; day += 1) {
    const capacity = new Map(scenario.factories.map((factory) => [factory.id, factory.capacityPerDay]));
    const candidates = orderProgress
      .filter((progress) => progress.produced < progress.order.quantity && progress.notBeforeDay <= day)
      .sort(
        (left, right) =>
          priorityScore(right, constraints, day) - priorityScore(left, constraints, day) ||
          left.order.dueDay - right.order.dueDay ||
          left.order.id.localeCompare(right.order.id),
      );

    for (const progress of candidates) {
      const product = products.get(progress.order.productId)!;
      const factory = factories.get(progress.factoryId);
      if (!factory || !factory.compatibleProductIds.includes(product.id)) {
        const message = `Factory ${progress.factoryId} is not compatible with ${product.id}.`;
        if (!violations.includes(message)) violations.push(message);
        continue;
      }
      let availableCapacity = capacity.get(progress.factoryId) ?? 0;
      const cellsPerVehicle = productBatteryRequirement(product);
      while (availableCapacity > 0 && progress.produced < progress.order.quantity) {
        const mix = consumeCells(scenario, lots, progress.factoryId, product.id, day, cellsPerVehicle);
        if (!mix) break;
        for (const [supplierId, quantity] of Object.entries(mix)) {
          progress.sourceMix[supplierId] = (progress.sourceMix[supplierId] ?? 0) + quantity;
        }
        progress.produced += 1;
        cumulativeCompletedVehicles += 1;
        availableCapacity -= 1;
        if (progress.produced === progress.order.quantity) progress.completionDay = day + 1;
      }
      capacity.set(progress.factoryId, availableCapacity);
    }

    const availableBatteryCells = lots
      .filter((lot) => lot.availableDay <= day)
      .reduce((sum, lot) => sum + lot.remaining, 0);
    const complete = orderProgress.filter((progress) => progress.completionDay !== null);
    const delayed = orderProgress.filter(
      (progress) => progress.completionDay === null || (progress.completionDay ?? horizonDays + 1) > progress.order.dueDay,
    );
    const onTimeRevenue = complete
      .filter((progress) => (progress.completionDay ?? horizonDays + 1) <= progress.order.dueDay)
      .reduce((sum, progress) => sum + progress.order.revenueCents, 0);
    dailySnapshots.push({
      day,
      availableBatteryCells,
      vehiclesCompleted: cumulativeCompletedVehicles,
      ordersCompleted: complete.length,
      onTimeRevenueCents: onTimeRevenue,
      revenueAtRiskCents: delayed.reduce((sum, progress) => sum + progress.order.revenueCents, 0),
      delayedOrderIds: delayed.map((progress) => progress.order.id),
      activeShipments: lots.filter((lot) => lot.availableDay > day).length,
      emissionsDeltaKg: 0,
    });
  }

  const orderDeliveryDays: Record<string, number | null> = {};
  const orderSourceMix: Record<string, Record<string, number>> = {};
  const delayedOrderIds: string[] = [];
  const unfulfilledOrderIds: string[] = [];
  let maxDelayDays = 0;
  let onTimeOrders = 0;
  let onTimeRevenueCents = 0;
  let latenessPenalties = 0;
  for (const progress of orderProgress) {
    orderDeliveryDays[progress.order.id] = progress.completionDay;
    orderSourceMix[progress.order.id] = progress.sourceMix;
    if (progress.completionDay === null) {
      delayedOrderIds.push(progress.order.id);
      unfulfilledOrderIds.push(progress.order.id);
      const delay = Math.max(1, horizonDays + 1 - progress.order.dueDay);
      maxDelayDays = Math.max(maxDelayDays, delay);
      // Expected penalties use a conservative modeled probability of contractual
      // enforcement rather than treating every synthetic maximum penalty as certain.
      latenessPenalties += Math.round(progress.order.latenessPenaltyCentsPerDay * Math.min(delay, 12) * 0.35);
    } else if (progress.completionDay > progress.order.dueDay) {
      delayedOrderIds.push(progress.order.id);
      const delay = progress.completionDay - progress.order.dueDay;
      maxDelayDays = Math.max(maxDelayDays, delay);
      latenessPenalties += Math.round(progress.order.latenessPenaltyCentsPerDay * delay * 0.22);
    } else {
      onTimeOrders += 1;
      onTimeRevenueCents += progress.order.revenueCents;
    }
  }

  const totalRevenue = scenario.orders.reduce((sum, order) => sum + order.revenueCents, 0);
  const revenueAtRiskCents = scenario.orders
    .filter((order) => delayedOrderIds.includes(order.id))
    .reduce((sum, order) => sum + order.revenueCents, 0);
  const costs = actionCosts(scenario, actions);
  const totalIncrementalCostCents = costs.supplier + costs.logistics + costs.production + latenessPenalties;
  const supplierAllocations: Record<string, number> = {};
  for (const progress of orderProgress) {
    for (const [supplierId, quantity] of Object.entries(progress.sourceMix)) {
      supplierAllocations[supplierId] = (supplierAllocations[supplierId] ?? 0) + quantity;
      if (supplierId === 'sup_voltra' && progress.order.productId === 'prod_orion') {
        violations.push(`Voltra V-2170 cells were allocated to ORION-X on ${progress.order.id}.`);
      }
    }
  }

  const totalCells = Object.values(supplierAllocations).reduce((sum, quantity) => sum + quantity, 0);
  const supplierConcentration =
    totalCells === 0
      ? 1
      : Object.values(supplierAllocations).reduce((sum, quantity) => sum + (quantity / totalCells) ** 2, 0);
  const baselineConcentration = 0.82;
  const resilienceDelta = baselineConcentration - supplierConcentration;

  for (const orderId of constraints.humanLockedOrderIds) {
    if (delayedOrderIds.includes(orderId)) violations.push(`Human-locked order ${orderId} is delayed.`);
  }
  for (const order of scenario.orders) {
    if (constraints.protectTiers.includes(order.customerTier) && delayedOrderIds.includes(order.id)) {
      violations.push(`Protected Tier-${order.customerTier} order ${order.id} is delayed.`);
    }
  }
  if (delayedOrderIds.length > constraints.maxDelayedOrders) {
    violations.push(`Delayed orders ${delayedOrderIds.length} exceed the maximum ${constraints.maxDelayedOrders}.`);
  }
  if (totalIncrementalCostCents > constraints.maxExtraCostCents) {
    violations.push(
      `Incremental cost ${totalIncrementalCostCents} cents exceeds the maximum ${constraints.maxExtraCostCents} cents.`,
    );
  }
  if (constraints.noAirFreight && actions.some((action) => laneForAction(scenario, action)?.mode === 'air')) {
    violations.push('Air freight is used while the no-air-freight constraint is active.');
  }
  if (constraints.maxEmissionsDeltaKg !== undefined && costs.emissions > constraints.maxEmissionsDeltaKg) {
    violations.push(`Emissions delta ${costs.emissions} kg exceeds the configured maximum.`);
  }

  for (const supplier of scenario.suppliers) {
    const offer = supplierOffer(scenario, supplier.id);
    if (!offer) continue;
    const procured = actions
      .filter((action) => action.supplierId === supplier.id && action.quantity)
      .reduce((sum, action) => sum + (action.quantity ?? 0), 0);
    const maximum = offer.capacityPerDay * 8;
    if (procured > maximum) violations.push(`${supplier.name} allocation ${procured} exceeds bounded 8-day capacity ${maximum}.`);
  }

  const baseline = input.baseline;
  const exposedRevenueCents = baseline?.revenueAtRiskCents ?? revenueAtRiskCents;
  const protectedRevenueCents = Math.max(0, exposedRevenueCents - revenueAtRiskCents);
  const affectedOrderIds = baseline?.delayedOrderIds ?? delayedOrderIds;
  const uniqueViolations = [...new Set(violations)];
  const checks = [
    {
      id: 'compatibility',
      label: 'Product and supplier compatibility',
      hard: true,
      passed: !uniqueViolations.some((message) => message.includes('Voltra') || message.includes('compatible')),
      evidence: 'Compatibility is enforced during lot consumption and again after allocation.',
    },
    {
      id: 'protected_customers',
      label: 'Protected customers and human locks',
      hard: true,
      passed: !uniqueViolations.some((message) => message.includes('Protected Tier') || message.includes('Human-locked')),
      evidence: `${constraints.humanLockedOrderIds.length} human lock(s); tiers ${constraints.protectTiers.join(', ')} protected.`,
    },
    {
      id: 'budget',
      label: 'Incremental cost ceiling',
      hard: true,
      passed: totalIncrementalCostCents <= constraints.maxExtraCostCents,
      evidence: `${totalIncrementalCostCents} of ${constraints.maxExtraCostCents} cents.`,
    },
    {
      id: 'delay_limit',
      label: 'Maximum delayed orders',
      hard: true,
      passed: delayedOrderIds.length <= constraints.maxDelayedOrders,
      evidence: `${delayedOrderIds.length} of ${constraints.maxDelayedOrders} delayed orders.`,
    },
  ];

  const partial: SimulationResult = {
    horizonDays,
    contextVersion: input.contextVersion,
    contextHash: input.contextHash,
    simulationHash: '',
    affectedOrders: affectedOrderIds.length,
    affectedOrderIds,
    onTimeOrders,
    delayedOrders: delayedOrderIds.length,
    delayedOrderIds,
    maxDelayDays,
    weightedServiceLevel: totalRevenue === 0 ? 1 : onTimeRevenueCents / totalRevenue,
    exposedRevenueCents,
    revenueAtRiskCents,
    protectedRevenueCents,
    incrementalSupplierCostCents: costs.supplier,
    incrementalLogisticsCostCents: costs.logistics,
    productionChangeoverCostCents: costs.production,
    expectedLatenessPenaltiesCents: latenessPenalties,
    totalIncrementalCostCents,
    supplierConcentration,
    resilienceDelta,
    emissionsDeltaKg: costs.emissions,
    hardConstraintViolations: uniqueViolations,
    softTradeoffs: [
      delayedOrderIds.length > 0 ? `${delayedOrderIds.length} lower-priority commitment(s) move beyond due date.` : 'No orders are delayed.',
      costs.emissions > 0 ? 'Faster routing raises the simplified emissions indicator.' : 'No material emissions increase is modeled.',
      supplierConcentration < baselineConcentration ? 'Supply is more diversified than the disrupted baseline.' : 'Supply remains concentrated.',
    ],
    reversibleActionCount: actions.filter((action) => action.reversible).length,
    totalActionCount: actions.length,
    criticalPaths: [
      ['sup_nori', 'cmp_battery_cell', 'fac_pnq', 'prod_orion', 'order_1082', 'cus_apex'],
      ['sup_nori', 'cmp_battery_cell', 'fac_maa', 'prod_atlas', 'order_1072', 'cus_sable'],
    ],
    dailySnapshots,
    orderDeliveryDays,
    orderSourceMix,
    supplierAllocations,
    constraintChecks: checks,
    causalProof: [],
    completedVehicleCount: orderProgress.reduce((sum, progress) => sum + progress.produced, 0),
    unfulfilledOrderIds,
  };
  partial.causalProof = buildCausalProof(scenario, constraints, actions, partial);
  partial.simulationHash = stableHash({
    contextHash: input.contextHash,
    actions,
    metrics: {
      delayedOrderIds,
      totalIncrementalCostCents,
      supplierAllocations,
      orderDeliveryDays,
    },
  });
  return partial;
}

export function simulatePlan(input: SimulationInput): SimulationResult {
  const hasDisruption = input.disruptions.some((disruption) => disruption.active);
  if (!hasDisruption) {
    const { baseline: _ignored, ...withoutBaseline } = input;
    return rawSimulation(withoutBaseline);
  }
  const baseline =
    input.baseline ??
    rawSimulation((() => {
      const { baseline: _ignored, ...withoutBaseline } = input;
      return { ...withoutBaseline, actions: [] };
    })());
  return rawSimulation({ ...input, baseline });
}

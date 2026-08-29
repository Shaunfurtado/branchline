import { countsByType, linkedEntityIds } from './graph.js';
import { simulatePlan } from './simulator.js';
import type { Constraints, Disruption, ScenarioData } from './types.js';

export interface ImpactSummary {
  sourceId: string;
  affectedIds: string[];
  affectedOrderIds: string[];
  counts: ReturnType<typeof countsByType>;
  criticalPaths: string[][];
  exposedRevenueCents: number;
  affectedOrders: number;
  blockedFactories: string[];
  batteryShortfallCells: number;
}

export function calculateImpact(
  scenario: ScenarioData,
  disruptions: Disruption[],
  constraints: Constraints,
  contextVersion: number,
  contextHash: string,
): ImpactSummary {
  const active = disruptions.find((disruption) => disruption.active);
  if (!active) {
    return {
      sourceId: 'none',
      affectedIds: [],
      affectedOrderIds: [],
      counts: {},
      criticalPaths: [],
      exposedRevenueCents: 0,
      affectedOrders: 0,
      blockedFactories: [],
      batteryShortfallCells: 0,
    };
  }
  const graph = linkedEntityIds(scenario, active.sourceEntityId, 'downstream', 6);
  const baseline = simulatePlan({
    scenario,
    disruptions,
    constraints,
    actions: [],
    contextVersion,
    contextHash,
    horizonDays: 30,
  });
  const affectedIds = [...new Set([...graph.ids, ...baseline.delayedOrderIds])];
  const blockedFactories = scenario.factories
    .filter((factory) => baseline.delayedOrderIds.some((orderId) => scenario.orders.find((order) => order.id === orderId)?.factoryId === factory.id))
    .map((factory) => factory.id)
    .slice(0, 2);
  const requiredCells = scenario.orders.reduce((sum, order) => {
    const product = scenario.products.find((candidate) => candidate.id === order.productId)!;
    const perVehicle = product.bom.find((item) => item.componentId === 'cmp_battery_cell')?.unitsPerVehicle ?? 0;
    return sum + perVehicle * order.quantity;
  }, 0);
  const producedCells = Object.values(baseline.supplierAllocations).reduce((sum, quantity) => sum + quantity, 0);
  return {
    sourceId: active.sourceEntityId,
    affectedIds,
    affectedOrderIds: baseline.delayedOrderIds,
    counts: countsByType(scenario, affectedIds),
    criticalPaths: baseline.criticalPaths,
    exposedRevenueCents: baseline.revenueAtRiskCents,
    affectedOrders: baseline.delayedOrders,
    blockedFactories,
    batteryShortfallCells: Math.max(0, requiredCells - producedCells),
  };
}

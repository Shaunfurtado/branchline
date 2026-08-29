import type { ScenarioData } from '../domain/types.js';

export interface ScenarioValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateScenario(scenario: ScenarioData): ScenarioValidationResult {
  const errors: string[] = [];
  const entities = [
    ...scenario.suppliers,
    ...scenario.components,
    ...scenario.factories,
    ...scenario.lines,
    ...scenario.lanes,
    ...scenario.hubs,
    ...scenario.products,
    ...scenario.orders,
    ...scenario.customers,
  ];
  const ids = new Set<string>();
  for (const entity of entities) {
    if (ids.has(entity.id)) errors.push(`Duplicate entity ID: ${entity.id}`);
    ids.add(entity.id);
    if (!Number.isFinite(entity.atlasPosition.x) || !Number.isFinite(entity.causalPosition.y)) {
      errors.push(`Invalid position: ${entity.id}`);
    }
  }
  if (scenario.suppliers.length < 12) errors.push('At least 12 suppliers are required.');
  if (scenario.hubs.length < 3) errors.push('At least three hubs are required.');
  if (scenario.lanes.length < 8) errors.push('At least eight lanes are required.');
  if (scenario.orders.length !== 24) errors.push('Featured scenario must contain exactly 24 orders.');
  if (scenario.customers.length < 8) errors.push('At least eight customers are required.');

  const requiredIds = [
    'sup_nori',
    'sup_voltra',
    'sup_helix',
    'sup_arda',
    'fac_blr',
    'fac_pnq',
    'fac_maa',
    'prod_lynx',
    'prod_orion',
    'prod_atlas',
    'prod_nova',
    'order_1082',
  ];
  for (const id of requiredIds) if (!ids.has(id)) errors.push(`Missing required entity: ${id}`);

  const voltra = scenario.suppliers.find((supplier) => supplier.id === 'sup_voltra');
  const voltraOffer = voltra?.offers.find((offer) => offer.componentId === 'cmp_battery_cell');
  if (voltraOffer?.compatibilityProductIds.includes('prod_orion')) {
    errors.push('Voltra must not be compatible with ORION-X.');
  }
  const lockOrder = scenario.orders.find((order) => order.id === 'order_1082');
  if (!lockOrder || lockOrder.productId !== 'prod_orion' || lockOrder.customerId !== 'cus_apex') {
    errors.push('order_1082 does not match the required Apex Health ORION-X order.');
  }
  for (const edge of scenario.edges) {
    if (!ids.has(edge.fromId) || !ids.has(edge.toId)) errors.push(`Broken edge: ${edge.id}`);
  }
  for (const lot of scenario.inventoryLots) {
    if (lot.quantity < 0) errors.push(`Negative inventory lot: ${lot.id}`);
    if (!ids.has(lot.factoryId) || !ids.has(lot.componentId) || !ids.has(lot.sourceSupplierId)) {
      errors.push(`Invalid inventory references: ${lot.id}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function assertScenarioValid(scenario: ScenarioData): void {
  const result = validateScenario(scenario);
  if (!result.valid) throw new Error(`Featured scenario is invalid:\n${result.errors.join('\n')}`);
}

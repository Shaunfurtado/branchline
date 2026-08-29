import { DomainError } from './errors.js';
import type { BranchConstraints, Constraints, Product, ScenarioData, Supplier } from './types.js';

export function isSupplierProductCompatible(
  scenario: ScenarioData,
  supplierId: string,
  componentId: string,
  productId: string,
): boolean {
  if (supplierId === 'sup_voltra' && productId === 'prod_orion') return false;
  const supplier = scenario.suppliers.find((candidate) => candidate.id === supplierId);
  const offer = supplier?.offers.find((candidate) => candidate.componentId === componentId);
  return Boolean(offer?.compatibilityProductIds.includes(productId));
}

export function compatibleBatterySuppliers(scenario: ScenarioData, productId?: string): Supplier[] {
  return scenario.suppliers.filter((supplier) => {
    const offer = supplier.offers.find((candidate) => candidate.componentId === 'cmp_battery_cell');
    if (!offer) return false;
    return productId ? isSupplierProductCompatible(scenario, supplier.id, 'cmp_battery_cell', productId) : true;
  });
}

export function productBatteryRequirement(product: Product): number {
  return product.bom.find((item) => item.componentId === 'cmp_battery_cell')?.unitsPerVehicle ?? 0;
}

export function mergeBranchConstraints(global: Constraints, branch: BranchConstraints): Constraints {
  if (branch.maxExtraCostCents !== undefined && branch.maxExtraCostCents > global.maxExtraCostCents) {
    throw new DomainError('CONSTRAINT_VIOLATION', 'A branch may not weaken the global maximum cost constraint.', {
      details: { global: global.maxExtraCostCents, requested: branch.maxExtraCostCents },
    });
  }
  if (branch.maxDelayedOrders !== undefined && branch.maxDelayedOrders > global.maxDelayedOrders) {
    throw new DomainError('CONSTRAINT_VIOLATION', 'A branch may not allow more delays than the global constraint.', {
      details: { global: global.maxDelayedOrders, requested: branch.maxDelayedOrders },
    });
  }
  if (global.noAirFreight && branch.noAirFreight === false) {
    throw new DomainError('CONSTRAINT_VIOLATION', 'A branch may not re-enable air freight when it is globally prohibited.');
  }
  const branchTiers = branch.protectTiers ?? [];
  const protectsAllGlobal =
    branch.protectTiers === undefined || global.protectTiers.every((tier) => branchTiers.includes(tier));
  if (!protectsAllGlobal) {
    throw new DomainError('CONSTRAINT_VIOLATION', 'A branch may not remove a globally protected customer tier.');
  }
  const maxEmissionsDeltaKg =
    global.maxEmissionsDeltaKg === undefined
      ? branch.maxEmissionsDeltaKg
      : branch.maxEmissionsDeltaKg === undefined
        ? global.maxEmissionsDeltaKg
        : Math.min(global.maxEmissionsDeltaKg, branch.maxEmissionsDeltaKg);
  return {
    ...global,
    maxExtraCostCents: Math.min(global.maxExtraCostCents, branch.maxExtraCostCents ?? global.maxExtraCostCents),
    protectTiers: [...new Set([...global.protectTiers, ...branchTiers])].sort() as Array<1 | 2 | 3>,
    maxDelayedOrders: Math.min(global.maxDelayedOrders, branch.maxDelayedOrders ?? global.maxDelayedOrders),
    noAirFreight: global.noAirFreight || Boolean(branch.noAirFreight),
    maxEmissionsDeltaKg,
  };
}

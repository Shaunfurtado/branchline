import type { BranchStrategy, SimulationResult } from './types.js';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreSimulation(result: SimulationResult, strategy: BranchStrategy): number {
  const service = clamp01(result.weightedServiceLevel);
  const protectedRatio = result.exposedRevenueCents === 0 ? 1 : clamp01(result.protectedRevenueCents / result.exposedRevenueCents);
  const cost = 1 - clamp01(result.totalIncrementalCostCents / 30_000_000);
  const delay = 1 - clamp01(result.delayedOrders / 8);
  const maxDelay = 1 - clamp01(result.maxDelayDays / 10);
  const resilience = clamp01((result.resilienceDelta + 0.35) / 0.7);
  const emissions = 1 - clamp01(Math.max(0, result.emissionsDeltaKg) / 85_000);
  const reversible = result.totalActionCount === 0 ? 1 : result.reversibleActionCount / result.totalActionCount;
  const invalidPenalty = result.hardConstraintViolations.length * 4;

  const score =
    strategy === 'service_first'
      ? service * 0.38 + protectedRatio * 0.32 + delay * 0.13 + maxDelay * 0.09 + cost * 0.05 + reversible * 0.03
      : strategy === 'cost_guard'
        ? cost * 0.48 + service * 0.2 + protectedRatio * 0.14 + delay * 0.08 + emissions * 0.06 + resilience * 0.04
        : strategy === 'resilience'
          ? resilience * 0.34 + protectedRatio * 0.24 + service * 0.17 + cost * 0.1 + emissions * 0.08 + reversible * 0.07
          : protectedRatio * 0.27 + service * 0.22 + cost * 0.18 + resilience * 0.13 + delay * 0.1 + emissions * 0.06 + reversible * 0.04;
  return score - invalidPenalty;
}

export const SCORING_FORMULAS = {
  service_first: '0.38 service + 0.32 protected revenue + 0.13 delay count + 0.09 max delay + 0.05 cost + 0.03 reversibility',
  cost_guard: '0.48 cost + 0.20 service + 0.14 protected revenue + 0.08 delay count + 0.06 emissions + 0.04 resilience',
  balanced: '0.27 protected revenue + 0.22 service + 0.18 cost + 0.13 resilience + 0.10 delay count + 0.06 emissions + 0.04 reversibility',
  resilience: '0.34 resilience + 0.24 protected revenue + 0.17 service + 0.10 cost + 0.08 emissions + 0.07 reversibility',
} as const;

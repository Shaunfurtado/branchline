# Domain model and simulation

## Synthetic world

BRANCHLINE models **Asterion Mobility**, a fictional commercial EV-platform manufacturer.

| Entity | Count | Notes |
|---|---:|---|
| Suppliers | 12 | Four battery suppliers plus motors, inverters, control, frames, thermal, brakes, glass, sensors |
| Components | 9 | Battery cells plus supporting component families |
| Factories | 3 | Bengaluru, Pune, Chennai |
| Products | 4 | LYNX-4, ORION-X, ATLAS-C, NOVA-M |
| Hubs | 3 | Synthetic consolidation/distribution hubs |
| Transport lanes | 10 | Cost, capacity, duration, distance, mode, emissions factor |
| Customers | 8 | Tiers 1–3 |
| Orders | 24 | Quantity, due date, revenue, penalty, priority, compatible plant |
| Inventory lots | 7 | Plant, source supplier, available day, integer quantity |
| Purchase orders | 7 | Supplier, plant, lane, order/arrival day, status |

Money is integer cents. Inventory and order quantities are integers. Time is integer day `0–30`.

## Required compatibility invariant

`sup_voltra` may not provide V-2170 cells to `prod_orion`.

This is enforced in `isSupplierProductCompatible`, lot eligibility, candidate generation, simulation allocation, constraint checks, and post-simulation invariants. It is not a UI-only warning.

## Featured shock

The default state is healthy. Activating `disrupt_nori_12d` sets NoriCell capacity to zero for days 0–11. `calculateImpact` traverses the graph and computes the headline from affected orders and current constraints.

Verified featured values:

```text
Affected orders:       16
Critically constrained plants: 2
Exposed revenue:       $28.43M
Near-term cell shortfall: 48,300
```

Changing order revenue, demand, inventory, due dates, or supplier data changes the headline. A unit test asserts that exposure moves when the source data changes.

## Order priority

Each order receives a deterministic daily priority score based on:

```text
human lock
+ globally protected customer tier
+ customer tier
+ due-date urgency
+ explicit order priority
+ strategy/action boost
```

A human lock dominates other terms. Globally protected Tier-1 orders cannot be sacrificed by a valid branch. Branch-local constraints may only tighten global constraints.

`order_1082` is a Tier-2 ORION-X order for Apex Health Logistics, quantity 18, due T+8. Before a lock, `cost_guard` defers it as an economical high-thermal tradeoff. After the human lock, recomputation prioritizes it, moves scarce Helix inventory to Pune, and transfers the delay to lower-priority `order_1094`.

## Recovery actions

The planner supports:

- `SWITCH_SUPPLIER`
- `SPLIT_PURCHASE_ORDER`
- `EXPEDITE_LANE`
- `REALLOCATE_INVENTORY`
- `RESCHEDULE_PRODUCTION`
- `MOVE_PRODUCTION`
- `DEFER_ORDER`
- `ADD_SAFETY_BUFFER`

Every action carries preconditions, affected IDs, cost, timing, capacity, emissions, risk, reversibility, rationale, and an evidence path.

## Candidate generation

For each strategy, the planner:

1. calculates battery need by product, plant, and due date;
2. identifies shortfall under active disruptions;
3. ranks compatible supplier offers;
4. enumerates deterministic supplier/source profiles;
5. selects lane and expedite alternatives;
6. considers inventory movement and production resequencing;
7. identifies only eligible low-priority deferrals;
8. builds bounded action candidates;
9. simulates every candidate;
10. rejects any hard violation;
11. scores valid candidates by strategy;
12. breaks ties by stable action signature.

Candidate enumeration is bounded and cooperatively yields to keep the UI responsive. Cancellation checks occur before and between expensive phases; no partial simulation result is saved.

## Daily simulation

For every day in the horizon:

1. apply active supplier and lane disruption effects;
2. make eligible supplier/PO production available;
3. advance and receive lots;
4. apply inventory transfers;
5. enforce supplier/product compatibility;
6. rank orders under current constraints;
7. enforce plant/product compatibility;
8. enforce daily factory capacity;
9. consume integer battery inventory;
10. record source mix and production completion;
11. calculate order delivery timing;
12. record daily inventory, in-transit supply, completed orders, and revenue risk.

The simulator never consumes a partial vehicle’s cell requirement. Lots cannot become negative. Allocation is constrained by source lots and plant capacity.

## Metrics

```text
revenue_at_risk = Σ revenue for projected-late or unfulfilled orders
revenue_protected = disrupted_baseline_revenue_at_risk − branch_revenue_at_risk
weighted_service_level = on_time_revenue / total_revenue
incremental_supplier_cost = Σ max(0, substitute_unit_cost − Nori_base_cost) × quantity
incremental_logistics_cost = route/mode delta + explicit expedite and transfer costs
incremental_production_cost = changeover/resequence/move costs
expected_lateness_penalty = probability-weighted penalty for late/unfulfilled commitments
incremental_cost = supplier + logistics + production + expected_lateness_penalty
supplier_concentration = Σ source_share²
resilience_delta = disrupted_baseline_concentration − branch_concentration
emissions_delta = Σ shipped_weight × lane_distance × mode_factor relative to baseline
```

Expected lateness uses a synthetic planning weight rather than claiming every contractual penalty will occur: 0.22 of the modeled penalty for fulfilled-late orders and 0.35 for unfulfilled orders.

Risk, concentration, and emissions are explicitly labeled simplified synthetic planning indicators.

## Strategy scores

All inputs are normalized to `[0,1]`; invalid candidates receive a rejection penalty. Exact weights from `src/domain/scoring.ts`:

```text
service_first =
  0.38 service + 0.32 protected revenue + 0.13 delay count
  + 0.09 max delay + 0.05 cost + 0.03 reversibility

cost_guard =
  0.48 cost + 0.20 service + 0.14 protected revenue
  + 0.08 delay count + 0.06 emissions + 0.04 resilience

balanced =
  0.27 protected revenue + 0.22 service + 0.18 cost
  + 0.13 resilience + 0.10 delay count + 0.06 emissions
  + 0.04 reversibility

resilience =
  0.34 resilience + 0.24 protected revenue + 0.17 service
  + 0.10 cost + 0.08 emissions + 0.07 reversibility
```

Featured pre-lock outputs, derived from the current seed:

| Strategy | Extra cost | Protected revenue | Delayed | Apex delivery |
|---|---:|---:|---:|---:|
| Service First | $288,256.80 | $28.43M | 0 | T+1 |
| Cost Guard | $262,159.08 | $24.542M | 2 | T+24 |
| Balanced | $256,328.72 | $26.558M | 1 | T+4 |
| Resilience | $263,180.86 | $26.558M | 1 | T+4 |

After the Apex human lock, the balanced result is $258,848.72, protects $26.558M, delays one lower-priority order, and projects Apex at T+1.

## Execution and rollback

A staged branch can execute only when:

- its simulation is current by version and hash;
- it has zero hard violations;
- an exact human approval exists;
- the approval context and simulation hashes still match;
- it has not already executed.

Apply creates a checkpoint before changing operational state. It records committed actions and actual metrics as the deterministic transaction result. A retry with the same plan is idempotent. Verification checks simulated-versus-actual variance and all hard constraints. Rollback restores the checkpoint’s operational snapshot exactly and keeps the original execution and rollback evidence in the audit trail.

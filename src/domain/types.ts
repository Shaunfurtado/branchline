export type Actor = 'human' | 'agent' | 'system';

export type EntityType =
  | 'supplier'
  | 'component'
  | 'factory'
  | 'line'
  | 'lane'
  | 'hub'
  | 'product'
  | 'order'
  | 'customer';

export type EntityStatus =
  | 'healthy'
  | 'watch'
  | 'at_risk'
  | 'blocked'
  | 'recovering'
  | 'recovered';

export interface Point {
  x: number;
  y: number;
}

export interface BaseEntity {
  id: string;
  type: EntityType;
  name: string;
  status: EntityStatus;
  risk: number;
  atlasPosition: Point;
  causalPosition: Point;
}

export interface SupplierOffer {
  componentId: string;
  supplierId: string;
  sku: string;
  capacityPerDay: number;
  unitCostCents: number;
  leadDays: number;
  compatibilityProductIds: string[];
  reliability: number;
  emissionsFactor: number;
}

export interface Supplier extends BaseEntity {
  type: 'supplier';
  region: string;
  country: string;
  offers: SupplierOffer[];
  reliability: number;
}

export interface Component extends BaseEntity {
  type: 'component';
  category: string;
  unitWeightKg: number;
  thermalClass?: string;
}

export interface Factory extends BaseEntity {
  type: 'factory';
  city: string;
  capacityPerDay: number;
  compatibleProductIds: string[];
  lineIds: string[];
}

export interface ProductionLine extends BaseEntity {
  type: 'line';
  factoryId: string;
  capacityPerDay: number;
  compatibleProductIds: string[];
}

export type TransportMode = 'sea' | 'rail' | 'road' | 'air';

export interface TransportLane extends BaseEntity {
  type: 'lane';
  fromId: string;
  toId: string;
  mode: TransportMode;
  transitDays: number;
  costPerKgCents: number;
  distanceKm: number;
  capacityUnitsPerDay: number;
  emissionsGramsPerKgKm: number;
  isPacificExpress?: boolean;
}

export interface DistributionHub extends BaseEntity {
  type: 'hub';
  city: string;
  region: string;
}

export interface BillOfMaterialItem {
  componentId: string;
  unitsPerVehicle: number;
  requiredThermalClass?: string;
}

export interface Product extends BaseEntity {
  type: 'product';
  code: string;
  description: string;
  unitRevenueCents: number;
  compatibleFactoryIds: string[];
  bom: BillOfMaterialItem[];
}

export interface Customer extends BaseEntity {
  type: 'customer';
  tier: 1 | 2 | 3;
  region: string;
}

export interface CustomerOrder extends BaseEntity {
  type: 'order';
  customerId: string;
  customerTier: 1 | 2 | 3;
  productId: string;
  factoryId: string;
  quantity: number;
  dueDay: number;
  releaseDay: number;
  revenueCents: number;
  latenessPenaltyCentsPerDay: number;
  priority: number;
}

export interface InventoryLot {
  id: string;
  componentId: string;
  factoryId: string;
  sourceSupplierId: string;
  quantity: number;
  availableDay: number;
}

export interface InventoryPosition {
  componentId: string;
  factoryId: string;
  quantity: number;
  sourceSupplierId: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  componentId: string;
  factoryId: string;
  quantity: number;
  orderedDay: number;
  arrivalDay: number;
  unitCostCents: number;
  laneId: string;
  status: 'planned' | 'in_transit' | 'received' | 'cancelled';
}

export type DisruptionKind = 'supplier_outage' | 'lane_delay';

export interface Disruption {
  id: string;
  kind: DisruptionKind;
  name: string;
  sourceEntityId: string;
  affectedComponentId?: string;
  startDay: number;
  durationDays: number;
  capacityMultiplier?: number;
  delayDays?: number;
  cause: string;
  active: boolean;
}

export interface ConstraintProvenance {
  actor: Actor;
  reason: string;
  createdAt: string;
}

export interface Constraints {
  maxExtraCostCents: number;
  protectTiers: Array<1 | 2 | 3>;
  maxDelayedOrders: number;
  noAirFreight: boolean;
  maxEmissionsDeltaKg?: number;
  humanLockedOrderIds: string[];
  prohibitedSubstitutions: Array<{ supplierId: string; productId: string; reason: string }>;
  provenance: Record<string, ConstraintProvenance>;
}

export type RecoveryActionType =
  | 'SWITCH_SUPPLIER'
  | 'SPLIT_PURCHASE_ORDER'
  | 'EXPEDITE_LANE'
  | 'REALLOCATE_INVENTORY'
  | 'RESCHEDULE_PRODUCTION'
  | 'MOVE_PRODUCTION'
  | 'DEFER_ORDER'
  | 'ADD_SAFETY_BUFFER';

export interface RecoveryAction {
  id: string;
  type: RecoveryActionType;
  description: string;
  preconditions: string[];
  affectedEntityIds: string[];
  incrementalCostCents: number;
  timingEffectDays: number;
  capacityEffect: number;
  emissionsEffectKg: number;
  riskEffect: number;
  reversible: boolean;
  rationale: string;
  evidencePath: string[];
  supplierId?: string;
  componentId?: string;
  productId?: string;
  orderId?: string;
  fromFactoryId?: string;
  toFactoryId?: string;
  factoryId?: string;
  laneId?: string;
  quantity?: number;
  arrivalDay?: number;
  sourceSupplierId?: string;
}

export interface DailySnapshot {
  day: number;
  availableBatteryCells: number;
  vehiclesCompleted: number;
  ordersCompleted: number;
  onTimeRevenueCents: number;
  revenueAtRiskCents: number;
  delayedOrderIds: string[];
  activeShipments: number;
  emissionsDeltaKg: number;
}

export interface ConstraintCheck {
  id: string;
  label: string;
  hard: boolean;
  passed: boolean;
  evidence: string;
}

export interface CausalStep {
  observation: string;
  entityIds: string[];
  kind: 'observation' | 'assumption' | 'action' | 'counterfactual';
}

export interface SimulationResult {
  horizonDays: number;
  contextVersion: number;
  contextHash: string;
  simulationHash: string;
  affectedOrders: number;
  affectedOrderIds: string[];
  onTimeOrders: number;
  delayedOrders: number;
  delayedOrderIds: string[];
  maxDelayDays: number;
  weightedServiceLevel: number;
  exposedRevenueCents: number;
  revenueAtRiskCents: number;
  protectedRevenueCents: number;
  incrementalSupplierCostCents: number;
  incrementalLogisticsCostCents: number;
  productionChangeoverCostCents: number;
  expectedLatenessPenaltiesCents: number;
  totalIncrementalCostCents: number;
  supplierConcentration: number;
  resilienceDelta: number;
  emissionsDeltaKg: number;
  hardConstraintViolations: string[];
  softTradeoffs: string[];
  reversibleActionCount: number;
  totalActionCount: number;
  criticalPaths: string[][];
  dailySnapshots: DailySnapshot[];
  orderDeliveryDays: Record<string, number | null>;
  orderSourceMix: Record<string, Record<string, number>>;
  supplierAllocations: Record<string, number>;
  constraintChecks: ConstraintCheck[];
  causalProof: CausalStep[];
  completedVehicleCount: number;
  unfulfilledOrderIds: string[];
}

export type BranchStrategy = 'service_first' | 'cost_guard' | 'balanced' | 'resilience';
export type BranchStatus =
  | 'draft'
  | 'simulating'
  | 'current'
  | 'stale'
  | 'staged'
  | 'approved'
  | 'executed'
  | 'cancelled'
  | 'invalid';

export interface BranchConstraints {
  maxExtraCostCents?: number;
  protectTiers?: Array<1 | 2 | 3>;
  maxDelayedOrders?: number;
  noAirFreight?: boolean;
  maxEmissionsDeltaKg?: number;
}

export interface RecoveryBranch {
  id: string;
  name: string;
  strategy: BranchStrategy;
  status: BranchStatus;
  createdAt: string;
  createdBy: Actor;
  baseContextVersion: number;
  baseContextHash: string;
  constraints: BranchConstraints;
  actions: RecoveryAction[];
  simulation?: SimulationResult;
  assumptions: string[];
  staleReason?: string;
  lastError?: string;
}

export interface StagedPlan {
  id: string;
  branchId: string;
  rationale: string;
  stagedAt: string;
  stagedBy: Actor;
  contextVersion: number;
  simulationHash: string;
  status: 'awaiting_approval' | 'approved' | 'rejected' | 'executed' | 'revoked';
}

export interface ApprovalRecord {
  id: string;
  planId: string;
  actor: 'human';
  approvedAt: string;
  contextVersion: number;
  simulationHash: string;
  summaryHash: string;
}

export interface OperationalSnapshot {
  activeDisruptionIds: string[];
  committedActions: RecoveryAction[];
  statusOverrides: Record<string, EntityStatus>;
  currentDay: number;
  realityLabel: string;
  actualMetrics?: SimulationResult;
}

export interface Checkpoint {
  id: string;
  planId: string;
  createdAt: string;
  contextVersion: number;
  operationalSnapshot: OperationalSnapshot;
  snapshotHash: string;
}

export interface VerificationResult {
  planId: string;
  verifiedAt: string;
  status: 'verified' | 'verified_with_variance' | 'failed';
  metricVariance: Record<string, number>;
  hardConstraintsPassed: boolean;
  changedEntityIds: string[];
  checkpointId: string;
  discrepancies: string[];
  simulated: SimulationResult;
  actual: SimulationResult;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: Actor;
  verb: string;
  summary: string;
  reason?: string;
  affectedEntityIds: string[];
  reversible: boolean;
  toolName?: string;
  correlationId?: string;
  stateVersion: number;
  contextVersion: number;
  evidencePath?: string[];
}

export interface ToolActivityEvent {
  id: string;
  timestamp: string;
  toolName: string;
  status: 'started' | 'completed' | 'error' | 'cancelled';
  durationMs?: number;
  actor: 'agent';
  inputSummary: string;
  affectedIds: string[];
  outputSummary?: string;
  correlationId: string;
}

export type VisualEvent =
  | { id: string; type: 'shock_started'; sourceId: string; createdAt: string }
  | { id: string; type: 'scan_started'; createdAt: string }
  | { id: string; type: 'impact_traced'; pathIds: string[]; createdAt: string }
  | { id: string; type: 'entity_focused'; entityId: string; createdAt: string }
  | { id: string; type: 'substitutes_found'; entityIds: string[]; createdAt: string }
  | { id: string; type: 'branch_created'; branchId: string; createdAt: string }
  | { id: string; type: 'simulation_progress'; branchId: string; progress: number; createdAt: string }
  | { id: string; type: 'simulation_completed'; branchId: string; createdAt: string }
  | { id: string; type: 'branches_compared'; branchIds: string[]; createdAt: string }
  | { id: string; type: 'human_constraint_added'; entityId: string; createdAt: string }
  | { id: string; type: 'branches_stale'; branchIds: string[]; createdAt: string }
  | { id: string; type: 'plan_staged'; planId: string; createdAt: string }
  | { id: string; type: 'plan_approved'; planId: string; createdAt: string }
  | { id: string; type: 'reality_committed'; planId: string; createdAt: string }
  | { id: string; type: 'verification_completed'; planId: string; createdAt: string }
  | { id: string; type: 'checkpoint_restored'; checkpointId: string; createdAt: string }
  | { id: string; type: 'causal_proof'; pathIds: string[]; createdAt: string };

export type VisualEventInput = VisualEvent extends infer Event
  ? Event extends VisualEvent
    ? Omit<Event, 'id' | 'createdAt'>
    : never
  : never;

export type AppPhase =
  | 'OBSERVE'
  | 'TRACE'
  | 'BRANCH'
  | 'SIMULATE'
  | 'APPROVE'
  | 'COMMIT'
  | 'VERIFY'
  | 'ROLLBACK';

export type AtlasView = 'network' | 'causality' | 'futures';

export interface WebMCPRegistrationState {
  supported: boolean;
  registeredNames: string[];
  registrationErrors: Record<string, string>;
  lastReconciledAt?: string;
  nativeDiscoveredNames: string[];
}

export interface UIState {
  atlasView: AtlasView;
  selectedEntityId?: string;
  selectedBranchId?: string;
  selectedAuditId?: string;
  proofPathIds: string[];
  futuresDay: number;
  capabilityDockOpen: boolean;
  aboutOpen: boolean;
  approvalOpen: boolean;
  recoveryOpen: boolean;
  debugOpen: boolean;
  cinematicMode: boolean;
  audioEnabled: boolean;
  toast?: { kind: 'info' | 'success' | 'warning' | 'error'; message: string; id: string };
}

export interface ScenarioData {
  id: string;
  name: string;
  manufacturer: string;
  suppliers: Supplier[];
  components: Component[];
  factories: Factory[];
  lines: ProductionLine[];
  lanes: TransportLane[];
  hubs: DistributionHub[];
  products: Product[];
  customers: Customer[];
  orders: CustomerOrder[];
  inventoryLots: InventoryLot[];
  purchaseOrders: PurchaseOrder[];
  disruptions: Disruption[];
  edges: GraphEdge[];
  externalAlerts: ExternalAlert[];
}

export interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
  kind: 'supplies' | 'ships' | 'feeds' | 'builds' | 'fulfills' | 'serves' | 'depends_on';
  weight: number;
}

export interface ExternalAlert {
  id: string;
  source: string;
  receivedAt: string;
  trustStatus: 'unverified';
  category: 'supplier' | 'logistics' | 'quality';
  text: string;
  relatedEntityIds: string[];
}

export interface AppState {
  scenario: ScenarioData;
  operational: OperationalSnapshot;
  constraints: Constraints;
  branches: RecoveryBranch[];
  stagedPlan?: StagedPlan;
  approval?: ApprovalRecord;
  checkpoints: Checkpoint[];
  verification?: VerificationResult;
  audit: AuditEvent[];
  toolActivity: ToolActivityEvent[];
  visualEvents: VisualEvent[];
  stateVersion: number;
  contextVersion: number;
  phase: AppPhase;
  ui: UIState;
  webmcp: WebMCPRegistrationState;
  invocationCount: Record<string, number>;
  executedPlanIds: string[];
  resetToken: number;
}

export interface DomainCommand<T = unknown> {
  id: string;
  actor: Actor;
  type: string;
  payload: T;
  reason?: string;
  correlationId?: string;
  createdAt: string;
}

export type ToolFailureCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'WRONG_PHASE'
  | 'STALE_BRANCH'
  | 'CONSTRAINT_VIOLATION'
  | 'APPROVAL_REQUIRED'
  | 'STALE_APPROVAL'
  | 'ALREADY_APPLIED'
  | 'NO_CHECKPOINT'
  | 'CANCELLED'
  | 'INTERNAL_ERROR';

export interface ToolSuccess<T> {
  ok: true;
  code: 'OK';
  summary: string;
  state_version: number;
  context_version: number;
  data: T;
  affected_ids?: string[];
  next_tools?: string[];
}

export interface ToolFailure {
  ok: false;
  code: ToolFailureCode;
  summary: string;
  recoverable: boolean;
  state_version: number;
  context_version: number;
  details?: Record<string, unknown>;
  next_tools?: string[];
}

export type ToolEnvelope<T> = ToolSuccess<T> | ToolFailure;

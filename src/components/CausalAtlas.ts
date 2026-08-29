import { impactSummary } from '../app/selectors.js';
import { entityById } from '../domain/graph.js';
import type { AppState, BaseEntity, CustomerOrder, EntityStatus, GraphEdge } from '../domain/types.js';
import { renderBranchspace } from './Branchspace.js';
import { classNames, escapeHtml } from './html.js';

function statusFor(state: AppState, entity: BaseEntity): EntityStatus {
  return state.operational.statusOverrides[entity.id] ?? entity.status;
}

function shapeFor(entity: BaseEntity, compact = false): string {
  const x = entity.atlasPosition.x;
  const y = entity.atlasPosition.y;
  const small = compact ? 0.78 : 1;
  switch (entity.type) {
    case 'supplier':
      return `<path d="M${x} ${y - 18 * small} L${x + 18 * small} ${y} L${x} ${y + 18 * small} L${x - 18 * small} ${y} Z"/>`;
    case 'component':
      return `<path d="M${x - 19} ${y - 10}l8-8h22l8 8-8 8h-22z"/><path class="shape-secondary" d="M${x - 15} ${y + 2}l7-7h18l7 7-7 7h-18z"/>`;
    case 'factory':
      return `<path d="M${x - 26 * small} ${y}l13-${22 * small}h${26 * small}l13 ${22 * small}-${13} ${22 * small}h-${26 * small}z"/>`;
    case 'hub':
      return `<circle cx="${x}" cy="${y}" r="${14 * small}"/><circle class="shape-secondary" cx="${x}" cy="${y}" r="${6 * small}"/>`;
    case 'product':
      return `<rect x="${x - 27 * small}" y="${y - 18 * small}" width="${54 * small}" height="${36 * small}" rx="${8 * small}"/>`;
    case 'order':
      return `<rect x="${x - 30 * small}" y="${y - 13 * small}" width="${60 * small}" height="${26 * small}" rx="${13 * small}"/><path class="order-flag" d="M${x - 24 * small} ${y - 7 * small}v${14 * small}"/>`;
    case 'customer':
      return `<rect x="${x - 40 * small}" y="${y - 18 * small}" width="${80 * small}" height="${36 * small}" rx="${3 * small}"/>`;
    case 'lane':
    case 'line':
      return `<circle cx="${x}" cy="${y}" r="${8 * small}"/>`;
  }
}

function nodeLabel(entity: BaseEntity): string {
  if (entity.type === 'order') return entity.id.replace('order_', '#');
  if (entity.type === 'supplier' && !['sup_nori', 'sup_voltra', 'sup_helix', 'sup_arda'].includes(entity.id)) return entity.name.split(' ')[0]!;
  return entity.name;
}

function renderNode(
  state: AppState,
  entity: BaseEntity,
  options: { affected: Set<string>; proof: Set<string>; substitute: Set<string>; compact?: boolean; label?: string; step?: number },
): string {
  const status = statusFor(state, entity);
  const selected = state.ui.selectedEntityId === entity.id;
  const locked = state.constraints.humanLockedOrderIds.includes(entity.id);
  const proofActive = options.proof.size > 0;
  const dimmed = (proofActive && !options.proof.has(entity.id)) || (options.affected.size > 0 && !options.affected.has(entity.id) && !proofActive);
  return `
    <g class="atlas-node type-${entity.type} status-${status} ${classNames(selected && 'is-selected', locked && 'has-human-intent', options.substitute.has(entity.id) && 'is-substitute', options.proof.has(entity.id) && 'is-proof', dimmed && 'is-dimmed')}"
       data-action="inspect-entity" data-id="${entity.id}" tabindex="0" role="button" aria-label="Inspect ${escapeHtml(entity.name)}, ${status.replace('_', ' ')}">
      <g class="node-shape">${shapeFor(entity, options.compact)}</g>
      ${locked ? `<g class="human-pin" transform="translate(${entity.atlasPosition.x + 24} ${entity.atlasPosition.y - 24})"><path d="M0-10l8 8-8 12-8-12z"/><circle r="3"/></g>` : ''}
      ${options.step ? `<g class="proof-step" transform="translate(${entity.atlasPosition.x - 22} ${entity.atlasPosition.y - 22})"><circle r="10"/><text y="4" text-anchor="middle">${options.step}</text></g>` : ''}
      <text class="node-label" x="${entity.atlasPosition.x}" y="${entity.atlasPosition.y + (entity.type === 'order' ? 29 : 34)}" text-anchor="middle">${escapeHtml(options.label ?? nodeLabel(entity))}</text>
      <title>${escapeHtml(entity.name)} · ${status.replace('_', ' ')}</title>
    </g>`;
}

function edgePath(from: BaseEntity, to: BaseEntity): string {
  const x1 = from.atlasPosition.x;
  const y1 = from.atlasPosition.y;
  const x2 = to.atlasPosition.x;
  const y2 = to.atlasPosition.y;
  const bend = Math.max(24, Math.abs(x2 - x1) * 0.38);
  return `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

function renderEdge(
  state: AppState,
  edge: GraphEdge,
  from: BaseEntity,
  to: BaseEntity,
  affected: Set<string>,
  proof: Set<string>,
): string {
  const proofEdge = proof.has(from.id) && proof.has(to.id);
  const affectedEdge = affected.has(from.id) && affected.has(to.id);
  const dimmed = proof.size > 0 ? !proofEdge : affected.size > 0 && !affectedEdge;
  return `<path class="flow-edge kind-${edge.kind} ${classNames(proofEdge && 'is-proof', affectedEdge && 'is-affected', dimmed && 'is-dimmed')}" d="${edgePath(from, to)}" marker-end="url(#edgeArrow)"/>`;
}

function networkEntities(state: AppState): BaseEntity[] {
  const visibleOrders = state.scenario.orders.filter((order) =>
    ['order_1071', 'order_1072', 'order_1073', 'order_1075', 'order_1078', 'order_1082', 'order_1083', 'order_1088', 'order_1090'].includes(order.id),
  );
  const customerIds = new Set(visibleOrders.map((order) => order.customerId));
  return [
    ...state.scenario.suppliers,
    ...state.scenario.hubs,
    ...state.scenario.factories,
    ...state.scenario.products,
    ...visibleOrders,
    ...state.scenario.customers.filter((customer) => customerIds.has(customer.id)),
  ];
}

function renderNetwork(state: AppState): string {
  const impact = impactSummary(state);
  const affected = new Set(impact.affectedIds);
  const proof = new Set(state.ui.proofPathIds);
  const latest = state.visualEvents.at(-1);
  const substitute = new Set(latest?.type === 'substitutes_found' ? latest.entityIds : []);
  const entities = networkEntities(state);
  const entityIds = new Set(entities.map((entity) => entity.id));
  const edges: GraphEdge[] = [
    ...state.scenario.lanes.map((lane) => ({ id: `visual_${lane.id}`, fromId: lane.fromId, toId: lane.toId, kind: 'ships' as const, weight: 1 })),
    ...state.scenario.edges.filter(
      (edge) => entityIds.has(edge.fromId) && entityIds.has(edge.toId) && ['builds', 'fulfills', 'serves'].includes(edge.kind),
    ),
  ];
  return `
    <svg class="atlas-svg network-svg" viewBox="0 0 1000 640" role="img" aria-label="Asterion Mobility synthetic supply network">
      <defs>
        <pattern id="atlasGrid" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M36 0H0V36" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width=".65"/></pattern>
        <radialGradient id="mapVignette"><stop offset="0" stop-color="transparent"/><stop offset="1" stop-color="currentColor" stop-opacity=".28"/></radialGradient>
        <marker id="edgeArrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0L8 3L0 6z"/></marker>
        <filter id="nodeGlow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect class="atlas-grid" width="1000" height="640" fill="url(#atlasGrid)"/>
      <path class="map-contour contour-a" d="M42 420C155 330 180 470 300 395S485 205 590 290 720 535 934 422"/>
      <path class="map-contour contour-b" d="M12 210C150 175 235 260 352 198S560 70 740 172 835 330 984 280"/>
      <path class="map-contour contour-c" d="M105 570C270 520 345 590 500 530S745 455 915 545"/>
      <g class="edge-layer">
        ${edges
          .map((edge) => {
            const from = entityById(state.scenario, edge.fromId);
            const to = entityById(state.scenario, edge.toId);
            return from && to ? renderEdge(state, edge, from, to, affected, proof) : '';
          })
          .join('')}
      </g>
      <g class="node-layer">
        ${entities.map((entity) => renderNode(state, entity, { affected, proof, substitute, compact: entity.type === 'supplier' && !['sup_nori', 'sup_voltra', 'sup_helix', 'sup_arda'].includes(entity.id) })).join('')}
      </g>
      ${state.scenario.disruptions.some((item) => item.id === 'disrupt_nori_12d' && item.active) ? '<g class="shock-wave" transform="translate(145 205)"><circle r="26"/><circle r="26"/><circle r="26"/></g>' : ''}
      ${state.constraints.humanLockedOrderIds.includes('order_1082') ? '<path class="human-intent-wave" d="M849 340 C790 330 760 375 735 375 S650 380 570 325"/>' : ''}
      ${latest?.type === 'scan_started' ? '<rect class="scan-sweep" x="0" y="0" width="1000" height="640"/>' : ''}
      ${state.operational.actualMetrics ? '<g class="commit-overlay"><path d="M185 310C420 110 720 125 940 310C720 495 420 510 185 310Z"/><text x="500" y="46" text-anchor="middle">REALITY COMMITTED · FLOWS RECONFIGURED</text></g>' : ''}
    </svg>`;
}

function cloneAt(entity: BaseEntity, x: number, y: number): BaseEntity {
  return { ...entity, atlasPosition: { x, y } };
}

function renderCausality(state: AppState): string {
  const impact = impactSummary(state);
  const affected = new Set(impact.affectedIds);
  const proof = new Set(state.ui.proofPathIds);
  const latest = state.visualEvents.at(-1);
  const substitute = new Set(latest?.type === 'substitutes_found' ? latest.entityIds : []);
  const batterySuppliers = ['sup_nori', 'sup_voltra', 'sup_helix', 'sup_arda'].map((id, index) =>
    cloneAt(entityById(state.scenario, id)!, 95, 120 + index * 105),
  );
  const component = cloneAt(entityById(state.scenario, 'cmp_battery_cell')!, 300, 278);
  const factories = state.scenario.factories.map((factory, index) => cloneAt(factory, 485, 155 + index * 155));
  const products = state.scenario.products.map((product, index) => cloneAt(product, 655, 95 + index * 125));
  const orderIds = [...new Set(['order_1082', ...impact.affectedOrderIds])].slice(0, 9);
  const orders = orderIds.map((id, index) => cloneAt(entityById(state.scenario, id)!, 825, 62 + index * 57));
  const customerIds = [...new Set(orders.map((order) => (order as CustomerOrder).customerId))];
  const customers = customerIds.map((id, index) => cloneAt(entityById(state.scenario, id)!, 1000, 87 + index * 75));
  const entities = [...batterySuppliers, component, ...factories, ...products, ...orders, ...customers];
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const edgeList: GraphEdge[] = [];
  for (const supplier of batterySuppliers) edgeList.push({ id: `c_${supplier.id}`, fromId: supplier.id, toId: component.id, kind: 'supplies', weight: 1 });
  for (const factory of factories) edgeList.push({ id: `c_component_${factory.id}`, fromId: component.id, toId: factory.id, kind: 'feeds', weight: 1 });
  for (const factory of factories) {
    for (const productId of (factory as typeof state.scenario.factories[number]).compatibleProductIds) {
      if (byId.has(productId)) edgeList.push({ id: `c_${factory.id}_${productId}`, fromId: factory.id, toId: productId, kind: 'builds', weight: 1 });
    }
  }
  for (const order of orders as CustomerOrder[]) {
    edgeList.push({ id: `c_${order.productId}_${order.id}`, fromId: order.productId, toId: order.id, kind: 'fulfills', weight: 1 });
    edgeList.push({ id: `c_${order.id}_${order.customerId}`, fromId: order.id, toId: order.customerId, kind: 'serves', weight: 1 });
  }
  const proofSteps = new Map<string, number>();
  state.ui.proofPathIds.forEach((id, index) => proofSteps.set(id, index + 1));
  return `
    <svg class="atlas-svg causality-svg" viewBox="0 0 1100 610" role="img" aria-label="Directed causal dependency graph">
      <defs>
        <pattern id="causalGrid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="currentColor" stroke-opacity=".1" stroke-width=".6"/></pattern>
        <marker id="edgeArrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0 0L8 3L0 6z"/></marker>
      </defs>
      <rect class="atlas-grid" width="1100" height="610" fill="url(#causalGrid)"/>
      <g class="layer-labels">
        <text x="95" y="36" text-anchor="middle">SUPPLY</text><text x="300" y="36" text-anchor="middle">COMPONENT</text><text x="485" y="36" text-anchor="middle">FACTORY</text><text x="655" y="36" text-anchor="middle">PRODUCT</text><text x="825" y="36" text-anchor="middle">ORDER</text><text x="1000" y="36" text-anchor="middle">CUSTOMER</text>
      </g>
      <g class="edge-layer">${edgeList
        .map((edge) => {
          const from = byId.get(edge.fromId);
          const to = byId.get(edge.toId);
          return from && to ? renderEdge(state, edge, from, to, affected, proof) : '';
        })
        .join('')}</g>
      <g class="node-layer">${entities
        .map((entity) => renderNode(state, entity, { affected, proof, substitute, compact: entity.type === 'order', step: proofSteps.get(entity.id) }))
        .join('')}</g>
      ${state.scenario.disruptions.some((item) => item.id === 'disrupt_nori_12d' && item.active) ? '<g class="shock-wave" transform="translate(95 120)"><circle r="26"/><circle r="26"/><circle r="26"/></g>' : ''}
      ${state.constraints.humanLockedOrderIds.includes('order_1082') ? '<path class="human-intent-wave causal-intent" d="M825 62C755 62 720 220 655 220S560 310 485 310S380 278 300 278"/>' : ''}
      ${latest?.type === 'scan_started' ? '<rect class="scan-sweep" x="0" y="0" width="1100" height="610"/>' : ''}
    </svg>`;
}

export function renderCausalAtlas(state: AppState): string {
  const latest = state.visualEvents.at(-1);
  return `
    <main class="atlas-panel ${classNames(latest?.type === 'reality_committed' && 'is-committing', latest?.type === 'checkpoint_restored' && 'is-rewinding')}" aria-label="Causal Atlas">
      <div class="atlas-toolbar">
        <div>
          <span class="eyebrow">Causal Atlas</span>
          <h1>${state.ui.atlasView === 'futures' ? 'Parallel recovery futures' : state.ui.atlasView === 'causality' ? 'Consequence topology' : 'Living operational world'}</h1>
        </div>
        <div class="view-switcher" role="tablist" aria-label="Atlas view">
          ${(['network', 'causality', 'futures'] as const)
            .map(
              (view) => `<button role="tab" aria-selected="${state.ui.atlasView === view}" class="${state.ui.atlasView === view ? 'is-active' : ''}" data-action="set-view" data-view="${view}">${view.charAt(0).toUpperCase() + view.slice(1)}</button>`,
            )
            .join('')}
        </div>
        <div class="atlas-live-key"><span class="live-pulse"></span><span>${state.operational.realityLabel}</span></div>
      </div>
      <div class="atlas-stage" data-view="${state.ui.atlasView}">
        ${state.ui.atlasView === 'network' ? renderNetwork(state) : state.ui.atlasView === 'causality' ? renderCausality(state) : renderBranchspace(state)}
        <div class="atlas-corner-label top-left"><span>ASTERION MOBILITY</span><small>SYNTHETIC TWIN · DAY ${state.operational.currentDay}</small></div>
        <div class="atlas-corner-label bottom-right"><span>STATE v${state.stateVersion}</span><small>CONTEXT v${state.contextVersion}</small></div>
        ${latest ? `<div class="visual-event-caption event-${latest.type}"><span class="event-glyph"></span>${escapeHtml(latest.type.replaceAll('_', ' ').toUpperCase())}</div>` : ''}
      </div>
      <div class="atlas-accessibility-summary" aria-live="polite">
        ${state.scenario.disruptions.some((item) => item.active) ? `${impactSummary(state).affectedOrders} orders are currently exposed.` : 'All orders are projected on time in the healthy baseline.'}
      </div>
    </main>`;
}

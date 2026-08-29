import { downstreamIds, entityById, upstreamIds } from '../domain/graph.js';
import type { AppState, CustomerOrder, Supplier } from '../domain/types.js';
import { formatMoney, formatNumber, relativeDay } from './format.js';
import { escapeHtml } from './html.js';

export function renderEntityInspector(state: AppState): string {
  const id = state.ui.selectedEntityId;
  if (!id) return '';
  const entity = entityById(state.scenario, id);
  if (!entity) return '';
  const order = entity.type === 'order' ? (entity as CustomerOrder) : undefined;
  const supplier = entity.type === 'supplier' ? (entity as Supplier) : undefined;
  const status = state.operational.statusOverrides[id] ?? entity.status;
  const upstream = upstreamIds(state.scenario, id, 12);
  const downstream = downstreamIds(state.scenario, id, 12);
  const locked = order ? state.constraints.humanLockedOrderIds.includes(order.id) : false;
  const selectedBranch = state.branches.find((branch) => branch.id === state.ui.selectedBranchId);
  const delivery = order ? selectedBranch?.simulation?.orderDeliveryDays[order.id] : undefined;
  return `
    <aside class="entity-inspector" role="dialog" aria-label="Entity inspector">
      <header>
        <div><span class="eyebrow">${entity.type.toUpperCase()} · ${escapeHtml(entity.id)}</span><h2>${escapeHtml(entity.name)}</h2></div>
        <button class="close-button" data-action="close-inspector" aria-label="Close inspector">×</button>
      </header>
      <div class="entity-status-line status-${status}"><span></span><strong>${status.replace('_', ' ').toUpperCase()}</strong><small>risk ${(entity.risk * 100).toFixed(0)}%</small></div>
      ${
        order
          ? `<section class="inspector-order ${locked ? 'is-locked' : ''}">
              <div class="order-hero"><span class="intent-pin">${locked ? '◆' : '◇'}</span><div><strong>${escapeHtml(state.scenario.customers.find((customer) => customer.id === order.customerId)?.name ?? order.customerId)}</strong><small>Tier ${order.customerTier} · ${escapeHtml(state.scenario.products.find((product) => product.id === order.productId)?.name ?? order.productId)}</small></div></div>
              <dl class="detail-grid">
                <div><dt>Quantity</dt><dd>${order.quantity} vehicles</dd></div>
                <div><dt>Due</dt><dd>T+${order.dueDay}</dd></div>
                <div><dt>Revenue</dt><dd>${formatMoney(order.revenueCents, false)}</dd></div>
                <div><dt>Projected</dt><dd>${delivery === undefined ? 'Not simulated' : relativeDay(delivery)}</dd></div>
                <div><dt>Factory</dt><dd>${escapeHtml(state.scenario.factories.find((factory) => factory.id === order.factoryId)?.name ?? order.factoryId)}</dd></div>
                <div><dt>Penalty/day</dt><dd>${formatMoney(order.latenessPenaltyCentsPerDay)}</dd></div>
              </dl>
              <button class="${locked ? 'secondary-action gold-action' : 'primary-action gold-action'}" data-action="toggle-order-lock" data-id="${order.id}">${locked ? 'Remove human protection' : 'Protect this order'}</button>
              <p class="inspector-note">A lock changes the shared context, invalidates stale futures, and is visible to the agent’s next WebMCP call.</p>
            </section>`
          : ''
      }
      ${
        supplier
          ? `<section>
              <h3>Supplier offers</h3>
              <dl class="detail-grid"><div><dt>Region</dt><dd>${escapeHtml(supplier.region)}</dd></div><div><dt>Reliability</dt><dd>${(supplier.reliability * 100).toFixed(0)}%</dd></div></dl>
              <div class="offer-list">${supplier.offers
                .map(
                  (offer) => `<div><span>${escapeHtml(offer.sku)}</span><strong>${formatNumber(offer.capacityPerDay)}/day</strong><small>${formatMoney(offer.unitCostCents, false)} per unit · ${offer.leadDays} days</small>${offer.compatibilityProductIds.includes('prod_orion') ? '<em class="compatible">ORION compatible</em>' : '<em class="incompatible">Not ORION compatible</em>'}</div>`,
                )
                .join('')}</div>
            </section>`
          : ''
      }
      <section class="link-inspector">
        <h3>Semantic links</h3>
        <div><span>Upstream</span>${upstream.length ? upstream.map((link) => `<button data-action="inspect-entity" data-id="${link}">${escapeHtml(link)}</button>`).join('') : '<small>None</small>'}</div>
        <div><span>Downstream</span>${downstream.length ? downstream.map((link) => `<button data-action="inspect-entity" data-id="${link}">${escapeHtml(link)}</button>`).join('') : '<small>None</small>'}</div>
      </section>
      <section class="accessible-record">
        <h3>Accessible record</h3>
        <table><tbody><tr><th>ID</th><td>${escapeHtml(entity.id)}</td></tr><tr><th>Type</th><td>${entity.type}</td></tr><tr><th>Status</th><td>${status}</td></tr><tr><th>Upstream links</th><td>${upstream.length}</td></tr><tr><th>Downstream links</th><td>${downstream.length}</td></tr></tbody></table>
      </section>
    </aside>`;
}

import { activeDisruption, impactSummary } from '../app/selectors.js';
import { FEATURED_DEMO_PROMPT } from '../data/featuredScenario.js';
import type { AppState } from '../domain/types.js';
import { formatMoney, formatNumber } from './format.js';
import { escapeHtml } from './html.js';

export function renderConstraintPanel(state: AppState): string {
  const disruption = activeDisruption(state);
  const impact = impactSummary(state);
  const locked = state.constraints.humanLockedOrderIds.includes('order_1082');
  const curveball = state.scenario.disruptions.find((item) => item.id === 'disrupt_pacific_delay')?.active ?? false;
  const latestEvents = [...state.audit].slice(-7).reverse();
  return `
    <aside class="left-rail" aria-label="Incident and constraints">
      <section class="rail-section incident-section">
        <div class="section-heading">
          <div><span class="eyebrow">Incident surface</span><h2>${disruption ? 'Active disruption' : 'Operationally stable'}</h2></div>
          <span class="severity-badge ${disruption ? 'critical' : 'healthy'}">${disruption ? 'SEV-1' : 'STABLE'}</span>
        </div>
        ${
          disruption
            ? `<div class="incident-card is-active">
                <div class="incident-symbol" aria-hidden="true">×</div>
                <div><strong>${escapeHtml(disruption.name)}</strong><span>${escapeHtml(disruption.cause)}</span></div>
                <dl><div><dt>Source</dt><dd>NoriCell</dd></div><div><dt>Window</dt><dd>T+0–12</dd></div><div><dt>Capacity</dt><dd>0%</dd></div></dl>
              </div>`
            : `<div class="incident-card healthy-card">
                <div class="incident-symbol" aria-hidden="true">✓</div>
                <div><strong>Supply network nominal</strong><span>All synthetic routes and production lines are flowing.</span></div>
              </div>
              <button class="primary-action shock-action" data-action="trigger-shock"><span class="button-pulse"></span>Trigger featured supplier shock</button>`
        }
        <div class="external-alert-strip" title="External alerts are unverified evidence">
          <span class="alert-glyph" aria-hidden="true">!</span>
          <span><strong>${state.scenario.externalAlerts.length} external alerts</strong><small>Untrusted · validate operationally</small></span>
          <button data-action="show-alerts" class="mini-button">Review</button>
        </div>
      </section>

      <section class="rail-section impact-section" aria-label="Computed headline impact">
        <div class="section-heading compact"><span class="eyebrow">Computed exposure</span><span class="data-origin">LIVE ENGINE</span></div>
        <div class="impact-grid">
          <div class="impact-number critical-number"><strong data-count="${impact.affectedOrders}">${impact.affectedOrders}</strong><span>Affected orders</span></div>
          <div class="impact-number"><strong>${formatMoney(impact.exposedRevenueCents)}</strong><span>Exposed revenue</span></div>
          <div class="impact-number"><strong>${impact.blockedFactories.length}</strong><span>Critical plants</span></div>
          <div class="impact-number"><strong>${formatNumber(impact.batteryShortfallCells)}</strong><span>Cell shortfall</span></div>
        </div>
        <button class="trace-button" data-action="trace-impact" ${disruption ? '' : 'disabled'}><span aria-hidden="true">⌁</span> Trace consequence chain</button>
      </section>

      <section class="rail-section constraints-section">
        <div class="section-heading compact"><span class="eyebrow">Shared constraints</span><span class="context-chip">ctx ${state.contextVersion}</span></div>
        <label class="field-row">
          <span>Maximum extra cost</span>
          <span class="field-value">${formatMoney(state.constraints.maxExtraCostCents, false)}</span>
          <input aria-label="Maximum extra cost in dollars" type="range" min="100000" max="500000" step="10000" value="${state.constraints.maxExtraCostCents / 100}" data-action="constraint-budget">
        </label>
        <div class="constraint-row">
          <div><span class="constraint-icon hard">H</span><strong>Protect customer tiers</strong><small>Tier 1 is a hard commitment</small></div>
          <div class="tier-toggles" role="group" aria-label="Protected customer tiers">
            ${([1, 2, 3] as const)
              .map(
                (tier) => `<button class="tier-toggle ${state.constraints.protectTiers.includes(tier) ? 'is-active' : ''}" data-action="toggle-tier" data-tier="${tier}" aria-pressed="${state.constraints.protectTiers.includes(tier)}">T${tier}</button>`,
              )
              .join('')}
          </div>
        </div>
        <label class="switch-row">
          <span><strong>No air freight</strong><small>Hard routing constraint</small></span>
          <input type="checkbox" data-action="constraint-air" ${state.constraints.noAirFreight ? 'checked' : ''}>
          <span class="switch-control" aria-hidden="true"></span>
        </label>
        <label class="field-row compact-field">
          <span>Maximum delayed orders</span>
          <select data-action="constraint-delays" aria-label="Maximum delayed orders">
            ${[2, 3, 4, 5, 6, 8]
              .map((value) => `<option value="${value}" ${value === state.constraints.maxDelayedOrders ? 'selected' : ''}>${value}</option>`)
              .join('')}
          </select>
        </label>
        <div class="hard-rule"><span class="rule-mark">⊘</span><span><strong>Voltra V-2170 → ORION-X</strong><small>System-enforced incompatibility</small></span></div>
      </section>

      <section class="rail-section intent-section ${locked ? 'has-intent' : ''}">
        <div class="section-heading compact"><span class="eyebrow">Human intent</span>${locked ? '<span class="human-chip">HUMAN AUTHORED</span>' : ''}</div>
        <button class="intent-order" data-action="inspect-entity" data-id="order_1082">
          <span class="intent-pin" aria-hidden="true">${locked ? '◆' : '◇'}</span>
          <span><strong>Apex Health · order_1082</strong><small>ORION-X · 18 vehicles · due T+8</small></span>
          <span class="tier-label">T2</span>
        </button>
        <button class="${locked ? 'secondary-action gold-action' : 'primary-action gold-action'}" data-action="protect-apex">
          ${locked ? 'Remove protection' : 'Protect this order'}
        </button>
        ${locked ? '<p class="intent-note">All simulations from the prior context are stale. The next agent call sees this exact lock.</p>' : '<p class="intent-note">This Tier-2 order is deliberately vulnerable in at least one attractive recovery future.</p>'}
      </section>

      <section class="rail-section scenario-controls">
        <label class="switch-row subtle-switch">
          <span><strong>Pacific lane curveball</strong><small>Add a deterministic 3-day delay</small></span>
          <input type="checkbox" data-action="curveball" ${curveball ? 'checked' : ''} ${disruption ? '' : 'disabled'}>
          <span class="switch-control" aria-hidden="true"></span>
        </label>
        <button class="prompt-copy" data-action="copy-demo-prompt" data-prompt="${escapeHtml(FEATURED_DEMO_PROMPT)}">
          <span aria-hidden="true">⧉</span><span><strong>Copy canonical agent prompt</strong><small>Exact judge workflow · no execution before approval</small></span>
        </button>
      </section>

      <section class="rail-section event-mini-stream">
        <div class="section-heading compact"><span class="eyebrow">Causal event stream</span><button class="link-button" data-action="focus-audit">Open audit</button></div>
        <ol>
          ${latestEvents
            .map(
              (event) => `<li class="actor-${event.actor}" data-action="select-audit" data-id="${event.id}">
                <span class="actor-dot"></span><span><strong>${escapeHtml(event.summary)}</strong><small>${event.actor.toUpperCase()} · v${event.contextVersion}</small></span>
              </li>`,
            )
            .join('')}
        </ol>
      </section>
    </aside>`;
}

import type { AppState } from '../domain/types.js';
import { formatMoney, formatPercent } from './format.js';
import { escapeHtml } from './html.js';

export function renderApprovalSurface(state: AppState): string {
  const staged = state.stagedPlan;
  if (!state.ui.approvalOpen || !staged) return '';
  const branch = state.branches.find((candidate) => candidate.id === staged.branchId);
  const result = branch?.simulation;
  if (!branch || !result) return '';
  const currentContext = staged.contextVersion === state.contextVersion;
  return `
    <div class="overlay-backdrop approval-backdrop"></div>
    <section class="approval-surface" role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <header>
        <div class="approval-symbol" aria-hidden="true"><span></span><span></span></div>
        <div><span class="eyebrow">Human authority boundary</span><h2 id="approval-title">Approve a simulated future</h2><p>No live operational state has changed. Approval unlocks one exact, current plan for execution.</p></div>
        <button class="close-button" data-action="return-compare" aria-label="Return to comparison">×</button>
      </header>
      <div class="approval-context ${currentContext ? 'is-current' : 'is-stale'}">
        <span>${currentContext ? 'CURRENT CONTEXT' : 'STALE CONTEXT'}</span>
        <strong>${escapeHtml(branch.name)}</strong>
        <small>branch ctx ${staged.contextVersion} · live ctx ${state.contextVersion} · simulation ${result.simulationHash.slice(0, 10)}</small>
      </div>
      <div class="approval-grid">
        <section class="approval-summary">
          <div class="approval-metrics">
            <div><span>Incremental cost</span><strong>${formatMoney(result.totalIncrementalCostCents, false)}</strong><small>ceiling ${formatMoney(state.constraints.maxExtraCostCents, false)}</small></div>
            <div><span>Revenue protected</span><strong>${formatMoney(result.protectedRevenueCents)}</strong><small>${result.exposedRevenueCents ? formatPercent(result.protectedRevenueCents / result.exposedRevenueCents) : '100%'} of exposure</small></div>
            <div><span>Orders on time</span><strong>${result.onTimeOrders}/${state.scenario.orders.length}</strong><small>${result.delayedOrders} delayed</small></div>
            <div><span>Risk concentration</span><strong>${result.supplierConcentration.toFixed(2)}</strong><small>${result.resilienceDelta >= 0 ? '+' : ''}${result.resilienceDelta.toFixed(2)} resilience</small></div>
            <div><span>Emissions change*</span><strong>${result.emissionsDeltaKg >= 0 ? '+' : ''}${result.emissionsDeltaKg.toLocaleString('en-US')} kg</strong><small>simplified indicator</small></div>
            <div><span>Reversibility</span><strong>${result.reversibleActionCount}/${result.totalActionCount}</strong><small>checkpoint created at commit</small></div>
          </div>
          <div class="approval-constraints">
            <h3>Hard-constraint proof</h3>
            ${result.constraintChecks
              .map(
                (check) => `<div class="constraint-check ${check.passed ? 'passed' : 'failed'}"><span>${check.passed ? '✓' : '!'}</span><div><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.evidence)}</small></div></div>`,
              )
              .join('')}
            <div class="constraint-check ${state.constraints.humanLockedOrderIds.includes('order_1082') && (result.orderDeliveryDays.order_1082 ?? 99) <= 8 ? 'passed' : state.constraints.humanLockedOrderIds.includes('order_1082') ? 'failed' : 'neutral'}">
              <span>${state.constraints.humanLockedOrderIds.includes('order_1082') ? ((result.orderDeliveryDays.order_1082 ?? 99) <= 8 ? '◆' : '!') : '◇'}</span>
              <div><strong>Apex Health human intent</strong><small>${state.constraints.humanLockedOrderIds.includes('order_1082') ? `Protected · delivery T+${result.orderDeliveryDays.order_1082 ?? '—'}` : 'No human lock is active.'}</small></div>
            </div>
          </div>
        </section>
        <section class="approval-actions">
          <div class="rationale-block"><span class="eyebrow">Agent rationale</span><p>${escapeHtml(staged.rationale)}</p></div>
          <h3>Top recovery actions</h3>
          <ol>
            ${branch.actions
              .slice(0, 8)
              .map(
                (action) => `<li><span class="action-type">${action.type.replaceAll('_', ' ')}</span><p>${escapeHtml(action.description)}</p><small>${action.reversible ? 'Reversible' : 'Irreversible'} · ${action.affectedEntityIds.length} entities · ${formatMoney(action.incrementalCostCents)}</small></li>`,
              )
              .join('')}
          </ol>
          <button class="evidence-link" data-action="explain-branch" data-id="${branch.id}">Open causal evidence path <span>→</span></button>
        </section>
      </div>
      <footer>
        <div class="execution-lock"><span class="lock-icon">${state.approval ? '◇' : '◆'}</span><span><strong>${state.approval ? 'Execution unlocked' : 'apply_plan is not registered'}</strong><small>${state.approval ? 'The exact approved plan may now be applied.' : 'Only this human interface can create approval.'}</small></span></div>
        <div class="approval-buttons">
          <button class="quiet-action" data-action="return-compare">Return to compare</button>
          <button class="secondary-action" data-action="reject-plan">Reject</button>
          <button class="approve-action" data-action="approve-plan" ${currentContext && result.hardConstraintViolations.length === 0 ? '' : 'disabled'}><span>◆</span>Approve and unlock execution</button>
        </div>
      </footer>
    </section>`;
}

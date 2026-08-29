import type { AppState } from '../domain/types.js';
import { formatMoney, formatPercent } from './format.js';
import { escapeHtml } from './html.js';

export function renderRecoveryReport(state: AppState): string {
  if (!state.ui.recoveryOpen || !state.operational.actualMetrics) return '';
  const actual = state.operational.actualMetrics;
  const staged = state.stagedPlan;
  const branch = state.branches.find((candidate) => candidate.id === staged?.branchId);
  const checkpoint = state.checkpoints.find((candidate) => candidate.planId === staged?.id);
  const verified = state.verification;
  const apexDay = actual.orderDeliveryDays.order_1082;
  return `
    <div class="overlay-backdrop recovery-backdrop" data-action="close-recovery"></div>
    <section class="recovery-panel" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <header>
        <div class="recovery-seal ${verified?.hardConstraintsPassed ? 'is-verified' : ''}" aria-hidden="true"><span>✓</span></div>
        <div><span class="eyebrow">${verified ? 'VERIFY · evidence complete' : 'COMMIT · reality changed'}</span><h2 id="recovery-title">${verified ? 'Recovery verified' : 'Reality committed'}</h2><p>${escapeHtml(branch?.name ?? 'Approved recovery')} is now the live synthetic operational state.</p></div>
        <button class="close-button" data-action="close-recovery" aria-label="Close recovery result">×</button>
      </header>
      <div class="recovery-hero">
        <div><span>Revenue protected</span><strong>${formatMoney(actual.protectedRevenueCents)}</strong><small>${actual.exposedRevenueCents ? formatPercent(actual.protectedRevenueCents / actual.exposedRevenueCents, 1) : '100%'} of computed exposure</small></div>
        <div><span>Incremental cost</span><strong>${formatMoney(actual.totalIncrementalCostCents, false)}</strong><small>${actual.totalIncrementalCostCents <= state.constraints.maxExtraCostCents ? 'Within approved ceiling' : 'Above approved ceiling'}</small></div>
        <div><span>Orders recovered</span><strong>${actual.onTimeOrders}/${state.scenario.orders.length}</strong><small>${actual.delayedOrders} delayed lower-priority order(s)</small></div>
        <div><span>Hard violations</span><strong class="${actual.hardConstraintViolations.length ? 'metric-bad' : 'metric-good'}">${actual.hardConstraintViolations.length}</strong><small>Voltra → ORION rule enforced in engine</small></div>
      </div>
      <div class="recovery-body">
        <section>
          <div class="section-heading compact"><span class="eyebrow">Commit evidence</span><span class="status-chip-inline">${verified?.status?.replaceAll('_', ' ').toUpperCase() ?? 'AWAITING VERIFICATION'}</span></div>
          <dl class="recovery-evidence">
            <div><dt>Apex Health order</dt><dd class="${(apexDay ?? 99) <= 8 ? 'metric-good' : 'metric-bad'}">${apexDay === null || apexDay === undefined ? 'Unfulfilled' : `T+${apexDay}`} ${state.constraints.humanLockedOrderIds.includes('order_1082') ? '· human protected' : ''}</dd></div>
            <div><dt>Supplier concentration</dt><dd>${actual.supplierConcentration.toFixed(3)} · resilience ${actual.resilienceDelta >= 0 ? '+' : ''}${actual.resilienceDelta.toFixed(3)}</dd></div>
            <div><dt>Emissions indicator*</dt><dd>${actual.emissionsDeltaKg >= 0 ? '+' : ''}${actual.emissionsDeltaKg.toLocaleString('en-US')} kg CO₂e</dd></div>
            <div><dt>Reversible actions</dt><dd>${actual.reversibleActionCount}/${actual.totalActionCount}</dd></div>
            <div><dt>Checkpoint</dt><dd>${escapeHtml(checkpoint?.id ?? 'not available')}</dd></div>
            <div><dt>Human approvals</dt><dd>${state.approval ? '1 exact approval' : '0'}</dd></div>
          </dl>
          ${verified ? `<div class="verification-proof ${verified.hardConstraintsPassed ? 'passed' : 'failed'}"><span>${verified.hardConstraintsPassed ? '✓' : '!'}</span><div><strong>${verified.hardConstraintsPassed ? 'Simulated promise matched live state' : 'Verification found a constraint failure'}</strong><small>${verified.discrepancies.length ? verified.discrepancies.map(escapeHtml).join(' · ') : 'Zero metric variance. All committed action evidence is traceable to the checkpoint.'}</small></div></div>` : ''}
        </section>
        <section>
          <div class="section-heading compact"><span class="eyebrow">Changed operational objects</span><span>${branch?.actions.length ?? 0} actions</span></div>
          <ol class="committed-actions">
            ${(branch?.actions ?? []).slice(0, 9).map((action) => `<li><span>${action.type.replaceAll('_', ' ')}</span><p>${escapeHtml(action.description)}</p><small>${action.affectedEntityIds.slice(0, 4).map(escapeHtml).join(' → ')}</small></li>`).join('')}
          </ol>
        </section>
      </div>
      <footer>
        <div class="synthetic-disclosure">*Simplified synthetic planning indicator. No real operational system was changed.</div>
        <div class="recovery-actions">
          <button class="quiet-action" data-action="export-report">Export recovery report</button>
          <button class="secondary-action" data-action="explain-branch" data-id="${escapeHtml(branch?.id ?? '')}">Causal proof</button>
          ${!verified && staged ? `<button class="primary-action verify-action" data-action="manual-verify">Verify plan</button>` : ''}
          ${checkpoint ? `<button class="rollback-action" data-action="manual-rollback" data-id="${checkpoint.id}">Rollback checkpoint</button>` : ''}
        </div>
      </footer>
    </section>`;
}

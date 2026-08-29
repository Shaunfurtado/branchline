import { activeDisruption, currentSimulatedBranches } from '../app/selectors.js';
import type { AppState, RecoveryBranch } from '../domain/types.js';
import { formatMoney, formatPercent, titleCase } from './format.js';
import { classNames, escapeHtml } from './html.js';

function statusLabel(branch: RecoveryBranch): string {
  return (
    {
      draft: 'DRAFT',
      simulating: 'SIMULATING',
      current: 'CURRENT',
      stale: 'STALE',
      staged: 'STAGED',
      approved: 'APPROVED',
      executed: 'EXECUTED',
      cancelled: 'CANCELLED',
      invalid: 'INVALID',
    } as const
  )[branch.status];
}

function branchCard(state: AppState, branch: RecoveryBranch): string {
  const result = branch.simulation;
  const selected = state.ui.selectedBranchId === branch.id;
  const canStage = branch.status === 'current' && result?.hardConstraintViolations.length === 0 && !state.stagedPlan;
  const isApexProtected = result ? (result.orderDeliveryDays.order_1082 ?? 99) <= 8 : false;
  return `
    <article class="branch-card strategy-${branch.strategy} status-${branch.status} ${selected ? 'is-selected' : ''}" data-action="select-branch" data-id="${branch.id}">
      <header>
        <div class="branch-glyph"><span></span></div>
        <div><span class="branch-status">${statusLabel(branch)}</span><h3>${escapeHtml(branch.name)}</h3><small>${titleCase(branch.strategy)}</small></div>
        <button class="card-focus" data-action="select-branch" data-id="${branch.id}" aria-label="Focus ${escapeHtml(branch.name)}">↗</button>
      </header>
      ${
        result
          ? `<div class="branch-metric-grid">
              <div><span>Protected</span><strong>${formatMoney(result.protectedRevenueCents)}</strong></div>
              <div><span>Extra cost</span><strong>${formatMoney(result.totalIncrementalCostCents)}</strong></div>
              <div><span>On time</span><strong>${result.onTimeOrders}/${state.scenario.orders.length}</strong></div>
              <div><span>Delayed</span><strong>${result.delayedOrders}</strong></div>
            </div>
            <div class="branch-bars">
              <label><span>Service</span><i><b style="--value:${Math.round(result.weightedServiceLevel * 100)}%"></b></i><em>${formatPercent(result.weightedServiceLevel)}</em></label>
              <label><span>Diversity</span><i><b style="--value:${Math.round(Math.max(0, result.resilienceDelta + 0.2) * 100)}%"></b></i><em>${result.resilienceDelta >= 0 ? '+' : ''}${result.resilienceDelta.toFixed(2)}</em></label>
            </div>
            <div class="branch-signals">
              <span class="${result.hardConstraintViolations.length ? 'signal-bad' : 'signal-good'}">${result.hardConstraintViolations.length ? `${result.hardConstraintViolations.length} hard violation(s)` : '0 hard violations'}</span>
              <span class="${isApexProtected ? 'signal-gold' : 'signal-muted'}">Apex ${isApexProtected ? 'T+8 protected' : 'at risk'}</span>
              <span>${result.emissionsDeltaKg >= 0 ? '+' : ''}${result.emissionsDeltaKg.toLocaleString('en-US')} kg CO₂e*</span>
            </div>`
          : `<div class="branch-draft-visual"><span class="draft-line"></span><p>Strategy authored against context v${branch.baseContextVersion}. Run the deterministic 30-day simulation to materialize this future.</p></div>`
      }
      ${branch.status === 'stale' ? `<div class="stale-explanation"><span>⌁</span><p><strong>Shared context changed</strong>${escapeHtml(branch.staleReason ?? 'Re-simulation required.')}</p></div>` : ''}
      ${branch.status === 'invalid' ? `<div class="stale-explanation invalid-explanation"><span>!</span><p><strong>Candidate violates hard constraints</strong>${escapeHtml(result?.hardConstraintViolations[0] ?? branch.lastError ?? 'Adjust constraints and re-simulate.')}</p></div>` : ''}
      <footer>
        ${branch.status === 'draft' || branch.status === 'stale' || branch.status === 'invalid' ? `<button class="secondary-action" data-action="simulate-branch" data-id="${branch.id}">${branch.status === 'stale' ? 'Re-simulate' : 'Simulate 30 days'}</button>` : ''}
        ${result && branch.status !== 'stale' ? `<button class="quiet-action" data-action="explain-branch" data-id="${branch.id}">Causal proof</button>` : ''}
        ${canStage ? `<button class="primary-action" data-action="stage-branch" data-id="${branch.id}">Stage for approval</button>` : ''}
      </footer>
    </article>`;
}

export function renderBranchChamber(state: AppState): string {
  const current = currentSimulatedBranches(state);
  const canCompare = current.length >= 2;
  const applied = state.stagedPlan?.status === 'executed';
  return `
    <aside class="right-rail" aria-label="Branch Chamber">
      <div class="chamber-heading">
        <div><span class="eyebrow">Branch Chamber</span><h2>Recovery futures</h2></div>
        <span class="branch-count">${state.branches.length}/4</span>
      </div>
      ${
        !activeDisruption(state)
          ? `<section class="chamber-empty">
              <div class="future-seed"><i></i><i></i><i></i></div>
              <h3>One reality. No fork.</h3>
              <p>Trigger the supplier shock to unlock semantic recovery planning.</p>
              <button class="primary-action" data-action="trigger-shock">Trigger featured shock</button>
            </section>`
          : `<section class="branch-builder">
              <div class="builder-title"><span>Manual branch builder</span><small>Same command bus as WebMCP</small></div>
              <div class="strategy-buttons">
                <button data-action="create-branch" data-strategy="service_first"><i></i><span>Service First</span></button>
                <button data-action="create-branch" data-strategy="cost_guard"><i></i><span>Cost Guard</span></button>
                <button data-action="create-branch" data-strategy="balanced"><i></i><span>Balanced</span></button>
                <button data-action="create-branch" data-strategy="resilience"><i></i><span>Resilience</span></button>
              </div>
              ${state.branches.length === 0 ? '<button class="trio-action" data-action="create-demo-trio"><span>⌘</span>Create three canonical futures</button>' : ''}
            </section>`
      }
      <div class="branch-list" aria-live="polite">
        ${state.branches.length ? state.branches.map((branch) => branchCard(state, branch)).join('') : ''}
      </div>
      ${
        state.branches.length
          ? `<section class="chamber-actions">
              <button class="compare-action" data-action="compare-current" ${canCompare ? '' : 'disabled'}>
                <span class="compare-glyph"><i></i><i></i><i></i></span>
                <span><strong>Open Branchspace comparison</strong><small>${canCompare ? `${current.length} current simulations available` : 'Simulate two current branches first'}</small></span>
              </button>
              ${state.stagedPlan?.status === 'approved' ? `<button class="commit-action" data-action="manual-apply"><span class="commit-mark">◆</span><span><strong>Commit approved future</strong><small>Manual UI uses the same apply operation</small></span></button>` : ''}
              ${applied && !state.verification ? `<button class="verify-action" data-action="manual-verify"><span>✓</span>Verify committed reality</button>` : ''}
            </section>`
          : ''
      }
      <div class="synthetic-disclosure">Synthetic operational twin. No real orders, purchases, shipments, or production systems are changed.</div>
    </aside>`;
}

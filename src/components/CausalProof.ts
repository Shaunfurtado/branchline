import type { AppState } from '../domain/types.js';
import { escapeHtml } from './html.js';

export function renderCausalProof(state: AppState): string {
  if (state.ui.proofPathIds.length === 0) return '';
  const branch = state.branches.find((candidate) => candidate.id === state.ui.selectedBranchId && candidate.simulation);
  const audit = state.audit.find((event) => event.id === state.ui.selectedAuditId);
  const steps = branch?.simulation?.causalProof ?? (audit?.evidencePath ?? []).map((id, index) => ({
    observation: `${index + 1}. Evidence entity ${id}`,
    entityIds: [id],
    kind: 'observation' as const,
  }));
  return `
    <section class="causal-proof-panel" aria-label="Causal Proof">
      <header><div><span class="eyebrow">Causal Proof</span><h2>${branch ? escapeHtml(branch.name) : 'Audit evidence path'}</h2></div><button class="close-button" data-action="close-proof" aria-label="Close causal proof">×</button></header>
      <ol>
        ${steps
          .slice(0, 8)
          .map(
            (step, index) => `<li class="proof-${step.kind}"><span>${index + 1}</span><div><strong>${step.kind.toUpperCase()}</strong><p>${escapeHtml(step.observation)}</p><small>${step.entityIds.map((id) => escapeHtml(id)).join(' → ')}</small></div></li>`,
          )
          .join('')}
      </ol>
      <footer><span><i class="proof-observation"></i>Observation</span><span><i class="proof-action"></i>Action</span><span><i class="proof-counterfactual"></i>Counterfactual</span></footer>
    </section>`;
}

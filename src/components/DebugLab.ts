import { ALL_TOOL_NAMES, type ToolName } from '../app/selectors.js';
import type { AppState } from '../domain/types.js';
import { escapeHtml } from './html.js';

const examples: Record<ToolName, string> = {
  get_ops_snapshot: '{}',
  inspect_entity: '{\n  "entity_id": "order_1082",\n  "include_links": true\n}',
  trace_impact: '{\n  "source_id": "sup_nori",\n  "direction": "downstream",\n  "max_depth": 5\n}',
  list_constraints: '{}',
  find_substitutes: '{\n  "component_id": "cmp_battery_cell",\n  "product_id": "prod_orion",\n  "needed_by_day": 8,\n  "quantity": 16200\n}',
  read_external_alerts: '{\n  "limit": 5\n}',
  create_branch: '{\n  "name": "Balanced Recovery",\n  "strategy": "balanced"\n}',
  simulate_branch: '{\n  "branch_id": "branch_01_balanced",\n  "horizon_days": 30\n}',
  compare_branches: '{\n  "branch_ids": ["branch_01_service_first", "branch_02_cost_guard", "branch_03_balanced"]\n}',
  explain_tradeoff: '{\n  "branch_id": "branch_03_balanced",\n  "focus": "all"\n}',
  stage_plan: '{\n  "branch_id": "branch_03_balanced",\n  "rationale": "Best current service, cost, and resilience tradeoff."\n}',
  apply_plan: '{\n  "plan_id": "replace-with-current-plan-id"\n}',
  verify_plan: '{\n  "plan_id": "replace-with-current-plan-id"\n}',
  rollback_plan: '{\n  "checkpoint_id": "replace-with-current-checkpoint-id",\n  "reason": "Supplier agreement was not signed."\n}',
};

export function renderDebugLab(state: AppState, selected: ToolName, output: string): string {
  if (!state.ui.debugOpen) return '';
  const native = state.webmcp.supported;
  return `
    <div class="overlay-backdrop debug-backdrop" data-action="close-debug"></div>
    <section class="debug-lab" role="dialog" aria-modal="true" aria-labelledby="debug-title">
      <header><div><span class="eyebrow">Developer capability lab</span><h2 id="debug-title">Native tool inspection</h2><p>${native ? 'Calls can run through document.modelContext.executeTool when the tool is currently registered.' : 'Native WebMCP is unavailable. Local execution below is explicitly a handler test harness—not a browser agent call.'}</p></div><button class="close-button" data-action="close-debug" aria-label="Close developer lab">×</button></header>
      <div class="debug-status ${native ? 'supported' : 'unsupported'}"><span class="status-dot"></span><div><strong>${native ? 'Native ModelContext detected' : 'Local harness mode'}</strong><small>Registered: ${state.webmcp.registeredNames.join(', ') || 'none'} · discovered: ${state.webmcp.nativeDiscoveredNames.join(', ') || 'none'}</small></div><button class="mini-button" data-action="refresh-native-tools">Refresh getTools()</button></div>
      <div class="debug-grid">
        <section class="debug-tool-list"><span class="eyebrow">Fourteen semantic tools</span>${ALL_TOOL_NAMES.map((name) => `<button class="${selected === name ? 'is-selected' : ''} ${state.webmcp.registeredNames.includes(name) ? 'is-live' : 'is-locked'}" data-action="debug-select-tool" data-id="${name}"><span>${state.webmcp.registeredNames.includes(name) ? '◆' : '◇'}</span><code>${name}</code></button>`).join('')}</section>
        <section class="debug-executor">
          <label><span>Tool</span><strong><code>${selected}</code></strong></label>
          <label><span>JSON input</span><textarea id="debug-input" spellcheck="false">${escapeHtml(examples[selected])}</textarea></label>
          <div class="debug-actions"><button class="secondary-action" data-action="debug-load-example" data-id="${selected}">Reset example</button><button class="primary-action" data-action="debug-execute" data-id="${selected}">${native && state.webmcp.registeredNames.includes(selected) ? 'Execute native tool' : 'Run local handler test'}</button></div>
          <div class="debug-output"><span class="eyebrow">Structured output</span><pre>${escapeHtml(output || 'No tool executed in this session.')}</pre></div>
        </section>
      </div>
      <footer><span>There is no approval bypass in this lab.</span><span>Context v${state.contextVersion} · state v${state.stateVersion}</span></footer>
    </section>`;
}

export { examples as debugExamples };

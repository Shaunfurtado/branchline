import { impactSummary } from '../app/selectors.js';
import type { AppState, AuditEvent, ToolActivityEvent } from '../domain/types.js';
import { formatMoney } from './format.js';
import { escapeHtml } from './html.js';

function activityItem(event: ToolActivityEvent): string {
  return `<button class="activity-item actor-agent status-${event.status}" data-action="select-tool-activity" data-id="${event.id}">
    <span class="activity-time">${event.timestamp.slice(11, 19)}</span>
    <span class="activity-symbol">A</span>
    <span><strong>${escapeHtml(event.toolName)}</strong><small>${escapeHtml(event.outputSummary ?? event.status)}</small></span>
    <em>${event.durationMs === undefined ? '' : `${event.durationMs}ms`}</em>
  </button>`;
}

function auditItem(event: AuditEvent): string {
  return `<button class="activity-item actor-${event.actor}" data-action="select-audit" data-id="${event.id}">
    <span class="activity-time">${event.timestamp.slice(11, 19)}</span>
    <span class="activity-symbol">${event.actor === 'human' ? 'H' : event.actor === 'agent' ? 'A' : 'S'}</span>
    <span><strong>${escapeHtml(event.verb)}</strong><small>${escapeHtml(event.summary)}</small></span>
    <em>v${event.contextVersion}</em>
  </button>`;
}

export function renderAuditTimeline(state: AppState): string {
  const impact = impactSummary(state);
  const actual = state.operational.actualMetrics;
  const startedCalls = state.toolActivity.filter((event) => event.status === 'started');
  const affectedEntities = new Set(state.audit.flatMap((event) => event.affectedEntityIds)).size;
  const inspectedEntities = new Set(state.toolActivity.flatMap((event) => event.affectedIds)).size;
  const timelineItems = [
    ...state.toolActivity.slice(-4).map((event) => ({ timestamp: event.timestamp, html: activityItem(event) })),
    ...state.audit.slice(-5).map((event) => ({ timestamp: event.timestamp, html: auditItem(event) })),
  ]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 7);
  return `
    <footer class="bottom-rail" aria-label="Time, audit, and semantic activity">
      <section class="time-control">
        <div class="time-heading"><span class="eyebrow">Operational horizon</span><strong>T+${state.ui.futuresDay}</strong></div>
        <div class="scrubber-shell">
          <input type="range" min="0" max="30" step="1" value="${state.ui.futuresDay}" data-action="time-scrubber" aria-label="Projected day">
          <div class="scrubber-ticks"><span>NOW</span><span>T+7</span><span>T+14</span><span>T+30</span></div>
        </div>
        <div class="reality-compare">
          <div><span>Before</span><strong>${formatMoney(impact.exposedRevenueCents)}</strong><small>revenue exposed</small></div>
          <i aria-hidden="true">→</i>
          <div><span>Committed</span><strong>${actual ? formatMoney(actual.protectedRevenueCents) : '—'}</strong><small>revenue protected</small></div>
        </div>
      </section>
      <section class="metric-strip" aria-label="Honest derived metrics">
        <div><span>Semantic calls</span><strong>${startedCalls.length}</strong></div>
        <div><span>Entities inspected</span><strong>${inspectedEntities}</strong></div>
        <div><span>Entities affected</span><strong>${affectedEntities}</strong></div>
        <div><span>Human approvals</span><strong>${state.approval ? 1 : 0}</strong></div>
        <div><span>Checkpoints</span><strong>${state.checkpoints.length}</strong></div>
        <div><span>Hard violations</span><strong class="${actual?.hardConstraintViolations.length ? 'metric-bad' : 'metric-good'}">${actual?.hardConstraintViolations.length ?? '—'}</strong></div>
      </section>
      <section class="semantic-stream">
        <div class="stream-heading"><span class="eyebrow">Semantic activity</span><button class="link-button" data-action="focus-audit">Expand</button></div>
        <div class="stream-items">${timelineItems.map((item) => item.html).join('')}</div>
      </section>
    </footer>`;
}

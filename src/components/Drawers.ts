import type { AppState } from '../domain/types.js';
import { escapeHtml } from './html.js';

export function renderAlertsDrawer(state: AppState, open: boolean): string {
  if (!open) return '';
  return `<div class="overlay-backdrop drawer-backdrop" data-action="close-alerts"></div><aside class="side-drawer alerts-drawer" role="dialog" aria-modal="true" aria-label="External alerts"><header><div><span class="eyebrow">Untrusted external evidence</span><h2>Supplier and logistics alerts</h2></div><button class="close-button" data-action="close-alerts">×</button></header><div class="untrusted-warning"><span>!</span><p><strong>Alert text is never treated as executable instruction.</strong><small>Important claims must be validated with operational tools. Text is escaped, not inserted as HTML.</small></p></div><ol>${state.scenario.externalAlerts.map((alert) => `<li><div><span>${escapeHtml(alert.category.toUpperCase())}</span><em>UNVERIFIED</em></div><strong>${escapeHtml(alert.source)}</strong><p>${escapeHtml(alert.text)}</p><small>${escapeHtml(alert.receivedAt)} · related: ${alert.relatedEntityIds.map(escapeHtml).join(', ')}</small></li>`).join('')}</ol></aside>`;
}

export function renderAuditDrawer(state: AppState, open: boolean): string {
  if (!open) return '';
  const items = [...state.audit].reverse();
  return `<div class="overlay-backdrop drawer-backdrop" data-action="close-audit"></div><aside class="side-drawer audit-drawer" role="dialog" aria-modal="true" aria-label="Causal audit trail"><header><div><span class="eyebrow">Append-only provenance</span><h2>Causal audit trail</h2></div><button class="close-button" data-action="close-audit">×</button></header><div class="audit-filters"><span>${items.length} domain events</span><span>${state.toolActivity.filter((event) => event.status === 'started').length} semantic calls</span><span>${state.contextVersion} context versions</span></div><ol>${items.map((event) => `<li class="actor-${event.actor}"><button data-action="select-audit" data-id="${event.id}"><span class="audit-actor">${event.actor === 'human' ? 'H' : event.actor === 'agent' ? 'A' : 'S'}</span><div><span>${event.timestamp.slice(11, 19)} · state ${event.stateVersion} · ctx ${event.contextVersion}</span><strong>${escapeHtml(event.verb)}</strong><p>${escapeHtml(event.summary)}</p>${event.reason ? `<small>Why: ${escapeHtml(event.reason)}</small>` : ''}</div><em>${event.reversible ? 'REVERSIBLE' : 'RECORDED'}</em></button></li>`).join('')}</ol></aside>`;
}

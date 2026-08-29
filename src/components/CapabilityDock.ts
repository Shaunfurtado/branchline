import { ALL_TOOL_NAMES, desiredToolNames, lockedToolReason, type ToolName } from '../app/selectors.js';
import type { AppState } from '../domain/types.js';
import { toolMetadata } from '../webmcp/definitions.js';
import { escapeHtml } from './html.js';

function lastStatus(state: AppState, name: string): string {
  return [...state.toolActivity].reverse().find((event) => event.toolName === name)?.status ?? 'never invoked';
}

function toolRow(state: AppState, name: ToolName, registered: boolean): string {
  const metadata = toolMetadata[name];
  const reason = registered ? 'Available to the browser agent now' : lockedToolReason(state, name);
  return `<div class="capability-row ${registered ? 'is-registered' : 'is-locked'}">
    <span class="capability-state" aria-hidden="true">${registered ? '◆' : '◇'}</span>
    <div class="capability-copy">
      <div><strong>${escapeHtml(metadata.title)}</strong><code>${name}</code></div>
      <p>${escapeHtml(reason)}</p>
      <span class="capability-tags">
        <i>${metadata.readOnly ? 'READ ONLY' : 'STATEFUL'}</i>
        ${metadata.untrusted ? '<i class="untrusted-tag">UNTRUSTED CONTENT</i>' : ''}
        <i>${state.invocationCount[name] ?? 0} CALLS</i>
        <i>${lastStatus(state, name).toUpperCase()}</i>
      </span>
    </div>
  </div>`;
}

export function renderCapabilityDock(state: AppState): string {
  if (!state.ui.capabilityDockOpen) return '';
  const registered = new Set(state.webmcp.registeredNames as ToolName[]);
  const desired = new Set(desiredToolNames(state));
  const locked = ALL_TOOL_NAMES.filter((name) => !registered.has(name));
  return `
    <div class="overlay-backdrop dock-backdrop" data-action="close-capabilities"></div>
    <aside class="capability-dock" aria-label="Agent Capability Surface" role="dialog" aria-modal="true">
      <header>
        <div><span class="eyebrow">Live WebMCP lifecycle</span><h2>Agent Capability Surface</h2><p>Only native, currently registered tools are available to the browser agent.</p></div>
        <button class="close-button" data-action="close-capabilities" aria-label="Close capability surface">×</button>
      </header>
      <div class="support-panel ${state.webmcp.supported ? 'supported' : 'unsupported'}">
        <span class="status-dot"></span>
        <div><strong>${state.webmcp.supported ? 'Native WebMCP detected' : 'Native WebMCP unavailable'}</strong><small>${state.webmcp.supported ? `${state.webmcp.registeredNames.length} registered · ${state.webmcp.nativeDiscoveredNames.length} confirmed through getTools()` : 'The human application remains fully usable. No production polyfill is active.'}</small></div>
      </div>
      <section>
        <div class="dock-section-heading"><span>Registered now</span><strong>${registered.size}</strong></div>
        <div class="capability-list">
          ${registered.size ? [...registered].map((name) => toolRow(state, name, true)).join('') : '<div class="dock-empty">No site tools are registered in this browser environment.</div>'}
        </div>
      </section>
      <section>
        <div class="dock-section-heading"><span>Locked capabilities</span><strong>${locked.length}</strong></div>
        <div class="capability-list locked-list">
          ${locked.map((name) => toolRow(state, name, false)).join('')}
        </div>
      </section>
      ${Object.keys(state.webmcp.registrationErrors).length ? `<section class="registry-errors"><span class="eyebrow">Registration diagnostics</span>${Object.entries(state.webmcp.registrationErrors).map(([name, error]) => `<p><code>${escapeHtml(name)}</code>${escapeHtml(error)}</p>`).join('')}</section>` : ''}
      <footer>
        <span>${desired.size} tools satisfy product preconditions.</span>
        <span>${registered.size} are actually registered.</span>
      </footer>
    </aside>`;
}

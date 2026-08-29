import { ALL_TOOL_NAMES } from '../app/selectors.js';
import type { AppState } from '../domain/types.js';
import { classNames } from './html.js';

const phases = ['OBSERVE', 'TRACE', 'BRANCH', 'SIMULATE', 'APPROVE', 'COMMIT', 'VERIFY', 'ROLLBACK'] as const;

export function renderCommandBar(state: AppState): string {
  const currentIndex = phases.indexOf(state.phase);
  const registeredCount = state.webmcp.registeredNames.length;
  const supportLabel = state.webmcp.supported ? `${registeredCount} registered` : 'unavailable';
  return `
    <header class="command-bar" aria-label="BRANCHLINE command bar">
      <div class="brand-block">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <div class="wordmark">BRANCHLINE</div>
          <div class="tagline">Fork reality. Simulate the consequences. Commit the future.</div>
        </div>
      </div>
      <nav class="phase-track" aria-label="Recovery lifecycle">
        ${phases
          .map(
            (phase, index) => `
            <span class="phase-step ${classNames(index === currentIndex && 'is-current', index < currentIndex && 'is-past')}" aria-current="${index === currentIndex ? 'step' : 'false'}">
              <span class="phase-index">${String(index + 1).padStart(2, '0')}</span>${phase}
            </span>`,
          )
          .join('')}
      </nav>
      <div class="command-status">
        <div class="reality-chip">
          <span class="eyebrow">Reality</span>
          <strong>v${state.contextVersion}</strong>
          <span class="state-version">state ${state.stateVersion}</span>
        </div>
        <button class="status-chip ${state.webmcp.supported ? 'is-connected' : 'is-unsupported'}" data-action="toggle-capabilities" aria-label="Open Agent Capability Surface">
          <span class="status-dot"></span>
          <span><span class="eyebrow">Site tools</span><strong>${supportLabel}</strong></span>
          <span class="count-ring">${state.webmcp.supported ? registeredCount : '—'}</span>
        </button>
        <button class="icon-button ${state.ui.audioEnabled ? 'is-active' : ''}" data-action="toggle-audio" aria-pressed="${state.ui.audioEnabled}" title="Cinematic audio, muted by default">
          <span aria-hidden="true">${state.ui.audioEnabled ? '◉' : '○'}</span><span class="sr-only">Toggle cinematic audio</span>
        </button>
        <button class="icon-button ${state.ui.cinematicMode ? 'is-active' : ''}" data-action="toggle-cinematic" aria-pressed="${state.ui.cinematicMode}" title="Cinematic mode">
          <span aria-hidden="true">⌁</span><span class="sr-only">Toggle cinematic mode</span>
        </button>
        <button class="text-button" data-action="toggle-about">Architecture</button>
        <button class="text-button danger-quiet" data-action="reset-demo">Reset</button>
      </div>
      <span class="sr-only">${ALL_TOOL_NAMES.length} possible semantic capabilities.</span>
    </header>`;
}

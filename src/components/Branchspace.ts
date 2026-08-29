import type { AppState, RecoveryBranch } from '../domain/types.js';
import { formatMoney, formatPercent, titleCase } from './format.js';
import { classNames, escapeHtml } from './html.js';

const laneOffsets = [-165, -55, 55, 165];

function branchColorClass(branch: RecoveryBranch): string {
  if (branch.status === 'stale') return 'stale';
  if (branch.status === 'invalid') return 'invalid';
  if (branch.status === 'approved' || branch.status === 'executed') return 'approved';
  return branch.strategy;
}

function snapshotFor(branch: RecoveryBranch, day: number) {
  if (!branch.simulation) return undefined;
  return branch.simulation.dailySnapshots.reduce((closest, snapshot) =>
    Math.abs(snapshot.day - day) < Math.abs(closest.day - day) ? snapshot : closest,
  );
}

export function renderBranchspace(state: AppState): string {
  const branches = state.branches.slice(0, 4);
  const selectedId = state.ui.selectedBranchId ?? branches[0]?.id;
  if (branches.length === 0) {
    return `
      <div class="empty-branchspace">
        <div class="future-origin large-origin"><span></span></div>
        <div><span class="eyebrow">Branchspace dormant</span><h3>No recovery futures yet</h3><p>Create a strategy branch from the Branch Chamber. Every future will remain attached to this shared reality.</p></div>
      </div>`;
  }
  const timeX = 205 + (state.ui.futuresDay / 30) * 630;
  return `
    <div class="branchspace-shell" aria-label="Parallel recovery futures">
      <svg class="branchspace-svg" viewBox="0 0 1000 610" role="img" aria-label="${branches.length} recovery futures extending from the current reality">
        <defs>
          <linearGradient id="futureFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-opacity="0.88"/><stop offset="1" stop-opacity="0.18"/></linearGradient>
          <filter id="softGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <pattern id="branchGrid" width="42" height="42" patternUnits="userSpaceOnUse"><path d="M42 0H0V42" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width=".6"/></pattern>
        </defs>
        <rect class="branch-grid" width="1000" height="610" fill="url(#branchGrid)"/>
        <g class="origin-axis">
          <line x1="185" y1="80" x2="185" y2="540"/>
          <circle cx="185" cy="310" r="30"/>
          <circle cx="185" cy="310" r="12"/>
          <text x="185" y="358" text-anchor="middle">CURRENT REALITY</text>
          <text x="185" y="377" text-anchor="middle">context v${state.contextVersion}</text>
        </g>
        <g class="time-axis">
          ${[0, 7, 14, 30]
            .map((day) => {
              const x = 205 + (day / 30) * 630;
              return `<line x1="${x}" y1="60" x2="${x}" y2="558"/><text x="${x}" y="582" text-anchor="middle">T+${day}</text>`;
            })
            .join('')}
          <line class="scrub-line" x1="${timeX}" y1="52" x2="${timeX}" y2="558"/>
          <path class="scrub-head" d="M${timeX - 7} 48h14l-7 9z"/>
        </g>
        ${branches
          .map((branch, index) => {
            const offset = laneOffsets[index] ?? 0;
            const endY = 310 + offset;
            const selected = branch.id === selectedId;
            const current = branch.simulation && branch.status !== 'stale' && branch.status !== 'invalid';
            const snapshot7 = snapshotFor(branch, 7);
            const snapshot14 = snapshotFor(branch, 14);
            const snapshot30 = snapshotFor(branch, 30);
            const path = `M185 310 C310 310 320 ${endY} 445 ${endY} S720 ${endY} 855 ${endY}`;
            return `
              <g class="future-lane ${branchColorClass(branch)} ${selected ? 'is-selected' : ''}" data-action="select-branch" data-id="${branch.id}" tabindex="0" role="button" aria-label="Select ${escapeHtml(branch.name)} future">
                <path class="future-shadow" d="${path}"/>
                <path class="future-ribbon" d="${path}"/>
                <path class="future-flow" d="${path}" pathLength="100"/>
                ${branch.status === 'stale' ? `<path class="fracture" d="M492 ${endY - 15}l11 12-10 12 12 11"/><text class="stale-label" x="515" y="${endY - 19}">STALE · ctx changed</text>` : ''}
                ${branch.status === 'invalid' ? `<g class="violation-marker" transform="translate(495 ${endY})"><circle r="13"/><text y="5" text-anchor="middle">!</text></g>` : ''}
                <g class="future-label" transform="translate(300 ${endY - 25})">
                  <text class="future-name">${escapeHtml(branch.name)}</text>
                  <text class="future-strategy" y="17">${titleCase(branch.strategy)} · ${branch.status.toUpperCase()}</text>
                </g>
                ${[7, 14, 30]
                  .map((day) => {
                    const x = 205 + (day / 30) * 630;
                    const snapshot = day === 7 ? snapshot7 : day === 14 ? snapshot14 : snapshot30;
                    return `<g class="snapshot-node" transform="translate(${x} ${endY})"><circle r="${selected ? 8 : 6}"/><text y="-14" text-anchor="middle">${snapshot ? `${snapshot.ordersCompleted}/${state.scenario.orders.length}` : '—'}</text></g>`;
                  })
                  .join('')}
                <g class="future-terminal" transform="translate(875 ${endY - 31})">
                  <rect width="110" height="62" rx="6"/>
                  ${branch.simulation
                    ? `<text x="10" y="18">${formatMoney(branch.simulation.protectedRevenueCents)} protected</text>
                       <text x="10" y="35">${formatMoney(branch.simulation.totalIncrementalCostCents)} cost</text>
                       <text x="10" y="52">${branch.simulation.delayedOrders} delayed · ${formatPercent(branch.simulation.weightedServiceLevel)}</text>`
                    : `<text x="10" y="25">Draft future</text><text x="10" y="45">Not simulated</text>`}
                </g>
              </g>`;
          })
          .join('')}
        ${state.operational.actualMetrics ? '<g class="commit-convergence"><circle cx="185" cy="310" r="48"/><text x="185" y="316" text-anchor="middle">COMMITTED</text></g>' : ''}
      </svg>
      <div class="branchspace-legend">
        <span><i class="legend-origin"></i>Shared present</span>
        <span><i class="legend-current"></i>Current simulation</span>
        <span><i class="legend-stale"></i>Stale context</span>
        <span><i class="legend-human"></i>Human constraint</span>
      </div>
    </div>`;
}

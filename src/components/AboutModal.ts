import type { AppState } from '../domain/types.js';

export function renderAboutModal(state: AppState): string {
  if (!state.ui.aboutOpen) return '';
  return `
    <div class="overlay-backdrop about-backdrop" data-action="close-about"></div>
    <section class="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <header><div><span class="eyebrow">Why WebMCP</span><h2 id="about-title">One live reality. Two equal interfaces.</h2><p>BRANCHLINE exposes operational semantics without separating the agent from the world the human is editing.</p></div><button class="close-button" data-action="close-about" aria-label="Close architecture">×</button></header>
      <div class="architecture-diagram" aria-label="Human interface and WebMCP share one command bus and domain engine">
        <div class="architecture-node human-node"><span>HUMAN INTERFACE</span><strong>Atlas · locks · approval</strong><small>Gold intent</small></div>
        <div class="architecture-lines"><i></i><i></i><b>SHARED COMMAND BUS</b></div>
        <div class="architecture-node engine-node"><span>DOMAIN ENGINE</span><strong>One state · one context</strong><small>Deterministic simulation</small></div>
        <div class="architecture-lines inverse"><i></i><i></i><b>TYPED CAPABILITIES</b></div>
        <div class="architecture-node agent-node"><span>AGENT INTERFACE</span><strong>Native WebMCP tools</strong><small>Violet activity</small></div>
      </div>
      <div class="about-grid">
        <section><span class="about-index">01</span><h3>Shared state, not a copy</h3><p>Human edits increment the same context version used by every tool. Old simulations become stale immediately.</p></section>
        <section><span class="about-index">02</span><h3>Capabilities follow preconditions</h3><p>Tools register and unregister as the operational phase changes. <code>apply_plan</code> does not exist before human approval.</p></section>
        <section><span class="about-index">03</span><h3>Consequences stay visible</h3><p>Semantic calls focus entities, trace causal paths, sprout futures, commit a branch, verify evidence, and rewind a checkpoint.</p></section>
        <section><span class="about-index">04</span><h3>Human authority is explicit</h3><p>No tool can create approval. The human approves the exact simulated diff in this page, against a current context hash.</p></section>
      </div>
      <footer><div><strong>BRANCHLINE</strong><span>An agent-native operational recovery control plane.</span></div><button class="secondary-action" data-action="open-debug">Developer capability lab</button></footer>
    </section>`;
}

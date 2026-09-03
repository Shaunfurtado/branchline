/* =============================================================================
   BRANCHLINE — Interactive product tour / onboarding walkthrough
   Self-contained, framework-free. Appended to <body> so it survives the
   app's in-place re-renders of #app. No application logic is modified.
   ============================================================================= */
(function () {
  'use strict';

  var STORAGE_KEY = 'branchline_tour_done';

  var steps = [
    {
      target: null,
      step: 'Welcome',
      title: 'BRANCHLINE in 60 seconds',
      body:
        'This is an operational recovery control plane for a supply chain. The story is simple: ' +
        'when a disruption hits, the system traces every consequence, a human and an AI agent fork ' +
        'recovery futures, and ONLY the future a human approves is committed. This tour points at ' +
        'every part of the screen so you can read the live demo like a story. ~60 seconds.',
      cta: null
    },
    {
      target: '.command-bar',
      step: 'Your map',
      title: 'Command bar — the recovery lifecycle',
      body:
        'Your compass. The center stepper is the lifecycle: Healthy → Disrupted → Branched → ' +
        'Simulated → Staged → Approved → Executed. Watch it fill in as you run the demo. The right ' +
        'side shows the live twin version and whether WebMCP (the agent channel) is connected.',
      cta: null
    },
    {
      target: '.left-rail',
      step: 'The problem',
      title: 'Incident & shared constraints',
      body:
        'What went wrong and what we are allowed to do. Here: a 12-day NoriCell battery outage and ' +
        'the revenue it exposes, plus the constraints both the human and the agent must respect — ' +
        'budget, protected tiers, locked human orders, and the hard Voltra→ORION incompatibility. ' +
        'Anything you change here updates the same live state the agent reads.',
      cta: { label: 'Try it: trigger the disruption', action: 'trigger-shock' }
    },
    {
      target: '.atlas-panel',
      step: 'The twin',
      title: 'Causal Atlas — the live operational twin',
      body:
        'A custom causal graph of suppliers, components, plants, products, customers and orders. ' +
        'When the shock lands, the affected supply paths turn red and ripple outward. Click any ' +
        'node to trace a consequence and watch its proof path highlight in violet.',
      cta: null
    },
    {
      target: '.right-rail',
      step: 'The futures',
      title: 'Branch Chamber — fork recovery futures',
      body:
        'This is where recovery plans are born. Pick a strategy (Service First, Cost Guard, Balanced, ' +
        'Resilient Mesh) and the system forks a future, simulates it against the live context, and ' +
        'scores it. Fork several and compare them side by side before committing to one.',
      cta: { label: 'Try it: fork three futures', action: 'create-demo-trio' }
    },
    {
      target: '.bottom-rail',
      step: 'The proof',
      title: 'Timeline, metrics & audit trail',
      body:
        'The evidence. Scrub the day-by-day recovery horizon, compare before/after metrics, and read ' +
        'the audit trail and the activity stream — it records exactly what the human and the agent did, ' +
        'and when. Nothing happens here that is not also logged.',
      cta: null
    },
    {
      target: '[data-action="toggle-capabilities"]',
      step: 'The agent',
      title: 'Agent Capability Surface (WebMCP)',
      body:
        'BRANCHLINE exposes 14 typed WebMCP tools to a browser agent. They register and unregister ' +
        'live as preconditions change — notice that apply_plan only appears AFTER a human approves the ' +
        'exact plan. Open it to see the real native registry and why each tool is locked or live.',
      cta: { label: 'Open the capability surface', action: 'toggle-capabilities' }
    },
    {
      target: null,
      step: 'Go',
      title: "You're ready to judge it",
      body:
        'Run it: trigger the shock, fork a few futures, stage a plan, then approve the exact simulated ' +
        'diff in the approval surface — only then can it be applied, verified, and rolled back to a ' +
        'checkpoint. Reset (top bar) restores the healthy twin at any time. Reopen this tour with the ' +
        'button at the bottom-right.',
      cta: null
    }
  ];

  var current = -1;
  var backdrop, spotlight, card;
  var hasDont = false;

  function hasLocalStorage() {
    try { return typeof localStorage !== 'undefined'; } catch (e) { return false; }
  }
  function getDone() {
    if (!hasLocalStorage()) return false;
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }
  function setDone() {
    if (!hasLocalStorage()) return;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  function buildLauncher() {
    if (document.querySelector('.bl-tour-launcher')) return;
    var btn = document.createElement('button');
    btn.className = 'bl-tour-launcher';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open product tour');
    btn.innerHTML = '<span class="bl-tour-glyph">?</span> Take the tour';
    btn.addEventListener('click', function () { open(0); });
    document.body.appendChild(btn);
  }

  function ensureNodes() {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.className = 'bl-tour-backdrop';
    backdrop.addEventListener('click', function (e) {
      // Let clicks reach the highlighted UI (so "Try" cues can be pressed); only
      // ignore backdrop clicks that are not on the card or launcher.
      if (e.target === backdrop) return;
    });
    spotlight = document.createElement('div');
    spotlight.className = 'bl-tour-spotlight';
    spotlight.style.display = 'none';
    card = document.createElement('div');
    card.className = 'bl-tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'false');
    card.setAttribute('aria-label', 'Product tour');
    document.body.appendChild(backdrop);
    document.body.appendChild(spotlight);
    document.body.appendChild(card);
  }

  function clearSpotlight() {
    if (spotlight) spotlight.style.display = 'none';
  }

  function positionFor(step) {
    var el = step.target ? document.querySelector(step.target) : null;
    if (!el) {
      // Centered welcome / closing card.
      spotlight.style.display = 'none';
      var w = Math.min(340, window.innerWidth - 32);
      var h = card.offsetHeight || 260;
      var left = Math.max(16, (window.innerWidth - w) / 2);
      var top = Math.max(16, (window.innerHeight - h) / 2);
      card.style.left = left + 'px';
      card.style.top = top + 'px';
      return;
    }
    var rect = el.getBoundingClientRect();
    var pad = 6;
    var top = Math.max(8, rect.top - pad);
    var left = Math.max(8, rect.left - pad);
    var width = Math.min(window.innerWidth - 16, rect.width + pad * 2);
    var height = Math.min(window.innerHeight - 16, rect.height + pad * 2);
    spotlight.style.display = 'block';
    spotlight.style.top = top + 'px';
    spotlight.style.left = left + 'px';
    spotlight.style.width = width + 'px';
    spotlight.style.height = height + 'px';

    // Place the card adjacent to the spotlight, flipping to fit the viewport.
    var cw = 340;
    var chEstimate = 280;
    var gap = 16;
    var placeRight = left + width + gap + cw <= window.innerWidth - 12;
    var placeBelow = top + height + gap + chEstimate <= window.innerHeight - 12;
    var cx, cy;
    if (placeRight) { cx = left + width + gap; cy = Math.min(Math.max(12, top), window.innerHeight - chEstimate - 12); }
    else if (placeBelow) { cx = Math.min(Math.max(12, left), window.innerWidth - cw - 12); cy = top + height + gap; }
    else { cx = Math.max(12, left + width - cw); cy = Math.max(12, top - gap - chEstimate); }
    card.style.left = cx + 'px';
    card.style.top = cy + 'px';
  }

  function render() {
    var step = steps[current];
    var isLast = current === steps.length - 1;
    var isFirst = current === 0;
    var progress = steps.map(function (_, i) {
      return '<i class="' + (i <= current ? 'is-active' : '') + '"></i>';
    }).join('');

    var ctaHtml = '';
    if (step.cta) {
      ctaHtml =
        '<div class="bl-tour-cta"><span>➜</span><span>'+ escapeHtml(step.cta.label) +'</span></div>';
    }

    var dontHtml = isFirst
      ? '<label class="bl-tour-dont"><input type="checkbox"' + (hasDont ? ' checked' : '') + ' id="bl-tour-dont"> Don\'t show this automatically again</label>'
      : '';

    card.innerHTML =
      '<div class="bl-tour-step">' + escapeHtml(step.step) + ' · ' + (current + 1) + '/' + steps.length + '</div>' +
      '<h3>' + escapeHtml(step.title) + '</h3>' +
      '<p>' + escapeHtml(step.body) + '</p>' +
      ctaHtml +
      '<div class="bl-tour-progress">' + progress + '</div>' +
      dontHtml +
      '<div class="bl-tour-actions">' +
        '<button class="bl-tour-skip" type="button">Skip tour</button>' +
        (isFirst ? '' : '<button class="bl-tour-back" type="button">Back</button>') +
        '<button class="bl-tour-next" type="button">' + (isLast ? 'Start exploring' : 'Next') + '</button>' +
      '</div>';

    // Wire controls
    card.querySelector('.bl-tour-skip').addEventListener('click', close);
    var nextBtn = card.querySelector('.bl-tour-next');
    nextBtn.addEventListener('click', function () {
      if (step.cta && !isLast) {
        // Pressing Next on a "Try" step also performs the cue, then advances.
        triggerCue(step.cta.action);
      }
      if (isLast) close(); else open(current + 1);
    });
    if (!isFirst) {
      card.querySelector('.bl-tour-back').addEventListener('click', function () { open(current - 1); });
    }
    var dont = card.querySelector('#bl-tour-dont');
    if (dont) {
      dont.addEventListener('change', function () { hasDont = dont.checked; });
    }
    if (step.cta) {
      var ctaEl = card.querySelector('.bl-tour-cta');
      if (ctaEl) {
        ctaEl.style.cursor = 'pointer';
        ctaEl.addEventListener('click', function () { triggerCue(step.cta.action); open(current + 1); });
      }
    }

    // Position after layout
    requestAnimationFrame(function () {
      positionFor(step);
      card.classList.add('is-open');
    });
  }

  function triggerCue(action) {
    var el = document.querySelector('[data-action="' + action + '"]');
    if (el) {
      // Use a real click so the app's delegated handler runs.
      el.click();
    }
  }

  function open(index) {
    ensureNodes();
    current = index;
    backdrop.classList.add('is-open');
    card.classList.remove('is-open');
    render();
  }

  function close() {
    if (hasDont) setDone();
    if (backdrop) backdrop.classList.remove('is-open');
    if (card) card.classList.remove('is-open');
    clearSpotlight();
    current = -1;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function onResize() {
    if (current < 0) return;
    positionFor(steps[current]);
  }

  function onKey(e) {
    if (current < 0) return;
    if (e.key === 'Escape') { close(); }
    else if (e.key === 'ArrowRight') { if (current < steps.length - 1) open(current + 1); }
    else if (e.key === 'ArrowLeft') { if (current > 0) open(current - 1); }
  }

  function init() {
    buildLauncher();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    document.addEventListener('keydown', onKey);

    var params = new URLSearchParams(window.location.search);
    var forceTour = params.get('tour');
    var auto = forceTour !== '0' && (forceTour === '1' || !getDone());
    if (auto) {
      // Wait for the app to render before measuring element positions.
      var start = function () { open(0); };
      if (document.readyState === 'complete') setTimeout(start, 500);
      else window.addEventListener('load', function () { setTimeout(start, 500); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

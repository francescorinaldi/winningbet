# Wave 1 — UX Critical Fixes (Accessibility + Mobile + Errors)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add essential accessibility, error handling, and mobile UX to make the site usable for paying users at launch.

**Architecture:** Six independent tasks targeting shared.js (utilities), styles.css (visual), and HTML files (attributes). All frontend-only changes — no backend modifications. New utilities in shared.js use `var` (not `const`/`let`) to remain globals in the non-module script loading model. All CSS uses existing custom properties.

**Tech Stack:** Vanilla JS (IIFE, `var` globals), CSS custom properties, HTML ARIA attributes. No libraries.

**Branch:** `feat/wave1-ux-critical-fixes` (from `main`)

**Issue:** #57

---

## Task 1: Error handling with retry UI (1.1)

**Files:**

- Modify: `public/shared.js` — add `setErrorState()` utility
- Modify: `public/script.js` — replace silent `.catch()` blocks in `loadMatches`, `loadResults`, `loadTrackRecord`, `loadTipsFromAPI`
- Modify: `public/dashboard.js` — replace silent `.catch()` blocks in `loadTodayTips`, `loadHistory`, `loadSchedule`
- Modify: `public/styles.css` — add `.error-state` styles

### Step 1: Add error state CSS to styles.css

Add before the `/* --- Animations ---` section (~line 1740):

```css
/* --- Error State --- */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px 24px;
  text-align: center;
}

.error-state__icon {
  color: var(--red);
  opacity: 0.6;
}

.error-state__message {
  color: var(--text-secondary);
  font-size: 0.9rem;
  max-width: 320px;
}

.error-state__retry {
  margin-top: 4px;
}
```

### Step 2: Add `setErrorState()` to shared.js

Add after `formatMatchDate()` function (after line 346):

```js
// ==========================================
// ERROR STATE UI
// ==========================================

/**
 * Mostra uno stato di errore con icona, messaggio e bottone retry.
 * @param {HTMLElement} container - Elemento DOM da svuotare e riempire
 * @param {string} message - Messaggio di errore per l'utente
 * @param {Function} [retryFn] - Callback per il bottone "Riprova"
 */
function setErrorState(container, message, retryFn) {
  if (!container) return;
  container.textContent = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'error-state';
  wrapper.setAttribute('role', 'alert');

  // Error icon (SVG built via DOM)
  var icon = document.createElement('div');
  icon.className = 'error-state__icon';
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '10');
  var line1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line1.setAttribute('d', 'M12 8v4');
  var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line2.setAttribute('d', 'M12 16h.01');
  svg.appendChild(circle);
  svg.appendChild(line1);
  svg.appendChild(line2);
  icon.appendChild(svg);

  var msg = document.createElement('p');
  msg.className = 'error-state__message';
  msg.textContent = message;

  wrapper.appendChild(icon);
  wrapper.appendChild(msg);

  if (typeof retryFn === 'function') {
    var btn = document.createElement('button');
    btn.className = 'btn btn-outline btn-sm error-state__retry';
    btn.textContent = 'Riprova';
    btn.addEventListener('click', retryFn);
    wrapper.appendChild(btn);
  }

  container.appendChild(wrapper);
}
```

Update the `/* exported ... */` comment on line 15 to include `setErrorState`.

### Step 3: Wire error states into script.js

Replace silent `.catch()` blocks in the 4 key data-loading functions. Each should call `setErrorState()` with the appropriate container and retry function.

**`loadTrackRecord` (~line 828):**

```js
// Before:
} catch (err) {
  console.error('loadTrackRecord failed:', err);
  resetTrackRecordUI();
}

// After:
} catch (err) {
  console.error('loadTrackRecord failed:', err);
  setErrorState(
    document.getElementById('resultsList'),
    'Errore nel caricamento dei risultati.',
    loadTrackRecord
  );
}
```

**`loadTipsFromAPI` (~line 942):**

```js
// Before:
} catch (err) {
  console.error('loadTipsFromAPI failed:', err);
  loadTips();
}

// After:
} catch (err) {
  console.error('loadTipsFromAPI failed:', err);
  setErrorState(
    document.getElementById('tipsGrid'),
    'Errore nel caricamento dei pronostici.',
    loadTipsFromAPI
  );
}
```

Apply the same pattern to `loadMatches` and `loadResults` — find their catch blocks and replace with `setErrorState()` calling the appropriate container (`#matchesScroll` for matches, `#resultsList` for results).

### Step 4: Wire error states into dashboard.js

Same pattern for `loadTodayTips`, `loadHistory`, `loadSchedule`. Each catch block should call `setErrorState()` with:

- `loadTodayTips` → container `#dashTipsGrid`, retry `loadTodayTips`
- `loadHistory` → container `#dashHistoryList`, retry `loadHistory`
- `loadSchedule` → container `#schedineGrid`, retry `loadSchedule`

### Step 5: Run lint and verify

Run: `npm run lint`
Expected: zero errors

### Step 6: Commit

```bash
git add public/shared.js public/script.js public/dashboard.js public/styles.css
git commit -m "feat(a11y): add error state UI with retry button (Wave 1.1)"
```

---

## Task 2: Focus-visible on all interactive elements (1.2)

**Files:**

- Modify: `public/styles.css` — add `:focus-visible` rules

### Step 1: Add focus-visible styles

Add right after the `.btn-block` rule (~line 237), before the Particle Canvas section:

```css
/* --- Focus-visible (accessibility) --- */
.btn:focus-visible,
.filter-btn:focus-visible,
.league-btn:focus-visible,
.dash-tab:focus-visible,
.faq-question:focus-visible,
.hamburger:focus-visible,
.lang-toggle:focus-visible,
.toggle-switch input:focus-visible + .toggle-slider,
.pref-select:focus-visible,
.pref-input:focus-visible,
.team-search-input:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

/* Remove default outline on mouse click */
.btn:focus:not(:focus-visible),
.filter-btn:focus:not(:focus-visible),
.league-btn:focus:not(:focus-visible),
.dash-tab:focus:not(:focus-visible),
.faq-question:focus:not(:focus-visible),
.hamburger:focus:not(:focus-visible),
.lang-toggle:focus:not(:focus-visible) {
  outline: none;
}
```

### Step 2: Run lint and verify

Run: `npm run lint`
Test: Tab through the page in Chrome — every interactive element should show a gold outline.

### Step 3: Commit

```bash
git add public/styles.css
git commit -m "feat(a11y): add :focus-visible on all interactive elements (Wave 1.2)"
```

---

## Task 3: Mobile menu — backdrop, ESC, slide animation (1.3)

**Files:**

- Modify: `public/shared.js` — enhance `initMobileMenu()`
- Modify: `public/styles.css` — add slide-in transition for `.nav-links`

### Step 1: Update mobile menu CSS

Replace the existing `.nav-links` mobile styles in the `@media (max-width: 768px)` block (~line 1880):

```css
.nav-links {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 15, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  z-index: 1002;
  padding: 80px 24px 40px;
  display: flex;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  visibility: hidden;
}

.nav-links.open {
  transform: translateX(0);
  visibility: visible;
}
```

Remove the old `display: none` / `display: flex` pattern. The menu is always in the DOM, slid off-screen.

### Step 2: Enhance `initMobileMenu()` in shared.js

Replace the function body with:

```js
function initMobileMenu() {
  var hamburger = document.getElementById('hamburger');
  var navLinks = document.getElementById('navLinks');
  if (!hamburger || !navLinks) return;

  function closeMenu() {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function openMenu() {
    hamburger.classList.add('active');
    navLinks.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-controls', 'navLinks');

  hamburger.addEventListener('click', function (e) {
    e.stopPropagation();
    if (navLinks.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Close on link click
  navLinks.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  // Close on backdrop click (clicking the overlay itself, not items)
  navLinks.addEventListener('click', function (e) {
    if (e.target === navLinks) closeMenu();
  });

  // Close on ESC key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMenu();
      hamburger.focus();
    }
  });
}
```

### Step 3: Run lint and verify

Run: `npm run lint`
Test: Open mobile menu (Chrome DevTools responsive), verify slide-in animation, ESC closes, clicking backdrop closes.

### Step 4: Commit

```bash
git add public/shared.js public/styles.css
git commit -m "feat(a11y): mobile menu slide animation, ESC close, ARIA (Wave 1.3)"
```

---

## Task 4: prefers-reduced-motion (1.4)

**Files:**

- Modify: `public/styles.css` — add `prefers-reduced-motion` media query
- Modify: `public/shared.js` — add `REDUCED_MOTION` constant, conditionally disable particles animation
- Modify: `public/script.js` — skip counter animation if reduced motion

### Step 1: Add reduced-motion CSS

Add at the very end of styles.css (after all responsive breakpoints):

```css
/* --- Reduced Motion ---
   Disabilita tutte le animazioni per utenti che preferiscono meno movimento.
   Testare con Chrome DevTools > Rendering > prefers-reduced-motion: reduce
*/
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  .hero-glow,
  .hero-glow--red {
    animation: none;
  }

  .reveal {
    opacity: 1;
    transform: none;
  }

  .scroll-line {
    animation: none;
  }

  .loading-spinner {
    animation: spin 0.8s linear infinite; /* Keep spinner functional */
  }
}
```

### Step 2: Add `REDUCED_MOTION` constant to shared.js

Add after the `TIER_LEVELS` declaration (~line 35):

```js
// ==========================================
// ACCESSIBILITY: REDUCED MOTION
// ==========================================

var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

Update the `/* exported ... */` comment on line 15 to include `REDUCED_MOTION`.

### Step 3: Skip particle animation if reduced motion

In shared.js `initParticles()`, add an early return after the canvas check (~line 113):

```js
function initParticles(options) {
  var canvas = document.getElementById('particles');
  if (!canvas) return;

  // Reduced motion: draw a single static frame instead of animating
  if (REDUCED_MOTION) {
    var sCtx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    for (var s = 0; s < 20; s++) {
      sCtx.beginPath();
      sCtx.arc(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        Math.random() * 1.5 + 0.5, 0, Math.PI * 2
      );
      sCtx.fillStyle = 'rgba(212, 168, 83, ' + (Math.random() * 0.3 + 0.1) + ')';
      sCtx.fill();
    }
    return;
  }

  // ... rest of existing function
```

### Step 4: Skip counter animation if reduced motion

In script.js `animateCounter()` (~line 67), add at the top of the function:

```js
function animateCounter(el) {
  const target = parseInt(el.getAttribute('data-count'), 10);
  if (isNaN(target) || target === 0) return;

  // Reduced motion: show final value immediately
  if (typeof REDUCED_MOTION !== 'undefined' && REDUCED_MOTION) {
    el.textContent = target.toLocaleString(getLocale());
    return;
  }

  // ... rest of existing function
```

### Step 5: Run lint and verify

Run: `npm run lint`
Test: Chrome DevTools > Rendering > "Emulate CSS media feature prefers-reduced-motion" > reduce. Verify: no animations, particles static, counters show final value.

### Step 6: Commit

```bash
git add public/styles.css public/shared.js public/script.js
git commit -m "feat(a11y): respect prefers-reduced-motion across site (Wave 1.4)"
```

---

## Task 5: ARIA labels and live regions (1.5)

**Files:**

- Modify: `public/index.html` — add ARIA attributes
- Modify: `public/dashboard.html` — add ARIA attributes (tabs, live regions)
- Modify: `public/script.js` — update FAQ accordion to toggle `aria-expanded`
- Modify: `public/dashboard.js` — update tab switching to manage `aria-selected`

### Step 1: Add ARIA to index.html

**Loading spinners** — add `role="status"` and `aria-label`:

```html
<div class="matches-loading" role="status" aria-label="Caricamento">
  <div class="tips-loading" role="status" aria-label="Caricamento">
    <div class="results-loading" role="status" aria-label="Caricamento"></div>
  </div>
</div>
```

**Dynamic content containers** — add `aria-live="polite"`:

```html
<div class="matches-scroll" id="matchesScroll" aria-live="polite">
  <div class="tips-grid" id="tipsGrid" aria-live="polite">
    <div class="results-list" id="resultsList" aria-live="polite"></div>
  </div>
</div>
```

**FAQ accordion** — add `aria-expanded` on each `.faq-question`:

```html
<button class="faq-question" aria-expanded="false"></button>
```

**League selector** — add `role="tablist"` on container, `role="tab"` on buttons:

```html
<div class="league-selector" id="leagueSelector" role="tablist" aria-label="Seleziona lega">
  <button class="league-btn active" data-league="all" role="tab" aria-selected="true">Tutte</button>
  <button class="league-btn" data-league="serie-a" role="tab" aria-selected="false">Serie A</button>
  <!-- etc. for all league buttons -->
</div>
```

### Step 2: Add ARIA to dashboard.html

**Tab navigation** — add `role="tablist"`, `role="tab"`, `aria-controls`, `aria-selected`:

```html
<div class="dash-tabs" role="tablist" aria-label="Sezioni dashboard">
  <button
    class="dash-tab active"
    data-tab="tips"
    role="tab"
    aria-selected="true"
    aria-controls="panelTips"
  >
    Tips di Oggi
  </button>
  <button
    class="dash-tab"
    data-tab="schedine"
    role="tab"
    aria-selected="false"
    aria-controls="panelSchedule"
  >
    Schedine
  </button>
  <button
    class="dash-tab"
    data-tab="history"
    role="tab"
    aria-selected="false"
    aria-controls="panelHistory"
  >
    Storico
  </button>
</div>
```

**Tab panels** — add `role="tabpanel"`:

```html
<section class="dash-panel" id="panelTips" role="tabpanel">
  <section class="dash-panel" id="panelSchedule" role="tabpanel" style="display: none">
    <section class="dash-panel" id="panelHistory" role="tabpanel" style="display: none">
      <section class="dash-panel" id="panelAccount" role="tabpanel" style="display: none"></section>
    </section>
  </section>
</section>
```

**Dynamic containers** — add `aria-live="polite"`:

```html
<div class="dash-tips-grid" id="dashTipsGrid" aria-live="polite">
  <div class="dash-history-list" id="dashHistoryList" aria-live="polite">
    <div class="schedine-grid" id="schedineGrid" aria-live="polite"></div>
  </div>
</div>
```

**Loading spinners** — add `role="status"` and `aria-label="Caricamento"` to all `.tips-loading` divs.

### Step 3: Update FAQ accordion in script.js

In the FAQ click handler (~line 264), toggle `aria-expanded`:

```js
question.addEventListener('click', () => {
  const isActive = item.classList.contains('active');
  faqItems.forEach((i) => {
    i.classList.remove('active');
    i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
  });
  if (!isActive) {
    item.classList.add('active');
    question.setAttribute('aria-expanded', 'true');
  }
});
```

### Step 4: Update tab switching in dashboard.js

Find the `setupTabs()` function and ensure it updates `aria-selected` when switching tabs:

```js
// Inside the tab click handler, after toggling .active class:
tabs.forEach(function (t) {
  t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
});
```

### Step 5: Run lint and verify

Run: `npm run lint`
Test: Use browser accessibility inspector (Chrome > Elements > Accessibility tree). Verify tabs, live regions, aria-expanded on FAQ.

### Step 6: Commit

```bash
git add public/index.html public/dashboard.html public/script.js public/dashboard.js
git commit -m "feat(a11y): add ARIA labels, live regions, tab roles (Wave 1.5)"
```

---

## Task 6: Colorblind-safe status indicators (1.6)

**Files:**

- Modify: `public/styles.css` — add text/icon indicators alongside color
- Modify: `public/dashboard.js` — add text labels to status badges

### Step 1: Add colorblind-safe CSS

Add after the error-state styles:

```css
/* --- Colorblind-safe status indicators --- */
.status-icon {
  font-size: 0.75em;
  margin-right: 4px;
}
```

### Step 2: Add status helper in dashboard.js

Add a helper function near the top of the dashboard IIFE:

```js
/**
 * Returns a DOM span with accessible status icon + label.
 * @param {string} status - 'won' | 'lost' | 'pending' | 'void'
 * @returns {HTMLElement} span element with icon + text
 */
function buildStatusLabel(status) {
  var icons = { won: '\u2713', lost: '\u2717', pending: '\u23F3', void: '\u2014' };
  var labels = { won: 'Vinto', lost: 'Perso', pending: 'In corso', void: 'Annullato' };

  var span = document.createElement('span');
  span.className = 'status-label';

  var iconSpan = document.createElement('span');
  iconSpan.className = 'status-icon';
  iconSpan.setAttribute('aria-hidden', 'true');
  iconSpan.textContent = icons[status] || '';

  var textNode = document.createTextNode(labels[status] || status);

  span.appendChild(iconSpan);
  span.appendChild(textNode);
  return span;
}
```

Then use `buildStatusLabel()` when rendering history items and form dots (find all places where status badges are created with color-only indication and add the icon+text approach).

### Step 3: Run lint and verify

Run: `npm run lint`
Test: In Chrome DevTools, use "Emulate vision deficiency" > Protanopia. Verify status indicators are distinguishable without color.

### Step 4: Commit

```bash
git add public/styles.css public/dashboard.js
git commit -m "feat(a11y): colorblind-safe status indicators with icons (Wave 1.6)"
```

---

## Final Steps

### Update CHANGELOG.md

Add a Wave 1 entry under the latest date:

```markdown
## [Unreleased]

### Added — Wave 1: UX Critical Fixes (#57)

- Error handling UI with retry button on all data-loading sections (1.1)
- `:focus-visible` on all interactive elements (1.2)
- Mobile menu: slide animation, ESC close, backdrop click, ARIA (1.3)
- `prefers-reduced-motion` support: static particles, instant counters, no transitions (1.4)
- ARIA labels, live regions, tab roles on index + dashboard (1.5)
- Colorblind-safe status indicators with text icons (1.6)
```

### Run full verification

```bash
npm run lint          # Zero errors
npm run format:check  # All formatted
```

Manual checks:

- Tab navigation works on all interactive elements (gold outline)
- FAQ accordion toggles `aria-expanded`
- Dashboard tabs update `aria-selected`
- Mobile menu slides in/out, ESC closes
- `prefers-reduced-motion: reduce` disables all animations except spinner
- Error retry button works (simulate network off in DevTools)
- Status indicators visible without color (Chrome vision deficiency emulation)

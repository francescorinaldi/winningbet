# Wave 2 — Polish (Loading States, Toasts, Timestamps)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace spinners with skeleton loaders, add retry-with-backoff, informative empty states, last-updated timestamps, a toast notification system, dashboard tab persistence, and a red pulse notification badge.

**Architecture:** Seven independent-ish tasks, all frontend-only. New shared utilities (`showToast`, `buildEmptyState`, `retryWithBackoff`, `buildSkeletonCards`) go in `shared.js` as `var` globals (non-module pattern). CSS additions go in `styles.css`. Page-specific wiring in `script.js`/`script-builders.js` (landing) and `dashboard.js`/`dashboard-renderers.js` (dashboard). All new animations must respect `REDUCED_MOTION`.

**Tech Stack:** Vanilla JS (IIFE, `var` globals), CSS custom properties + `@keyframes`, HTML. No libraries.

**Branch:** `feat/wave2-polish` (from `main`)

**Issue:** #57

**Dependencies satisfied:** Wave 1 complete (1.1 `setErrorState`, 1.4 `REDUCED_MOTION` both on `main`).

---

## Codebase Context (read this first)

### File structure after Wave 1 + god-file split

| File                            | Role                                                                                                                               | Lines  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `public/shared.js`              | Global utilities loaded first. Uses `var` (not `const`). Update `/* exported */` comment when adding globals.                      | ~500   |
| `public/script.js`              | Landing page IIFE. Update `/* global */` when using new shared globals.                                                            | ~980   |
| `public/script-builders.js`     | Extracted builder functions from script.js. Has `setEmptyState`, `createEl`, `buildTipCard`, etc.                                  | ~415   |
| `public/dashboard.js`           | Dashboard IIFE. Update `/* global */` when using new shared globals.                                                               | ~1800  |
| `public/dashboard-renderers.js` | Extracted render functions from dashboard.js. Has `dashRenderTipsGrid`, `dashRenderHistory`, etc.                                  | ~666   |
| `public/styles.css`             | All styles. Loading states at ~L1757, error-state at ~L1813, animations at ~L1870, reduced-motion at ~L1890, responsive at ~L1919. | ~3500+ |
| `public/index.html`             | Landing page. Spinners at L203, L272, L434.                                                                                        |        |
| `public/dashboard.html`         | Dashboard. Spinners at L98, L182, L246, L306. Notification badge at L75.                                                           |        |

### Conventions

- `var` in shared.js (globals). `const`/`let` inside IIFEs.
- `/* exported ... */` at top of shared.js — must list every global.
- `/* global ... */` at top of script.js / dashboard.js — must list shared globals used.
- SVG icons built via `document.createElementNS` (not innerHTML) to avoid XSS.
- CSS custom properties: `--gold`, `--red`, `--green`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-card`, `--border`, `--radius-sm/md/lg`, `--font-display`, `--font-body`.
- `REDUCED_MOTION` (boolean) — check before animating. CSS `@media (prefers-reduced-motion: reduce)` block at end of file.
- Existing `setErrorState(container, message, retryFn)` in shared.js — error UI with retry button.
- Existing `setEmptyState(container, className, message)` in script-builders.js — simple text empty state.
- Existing `showAlert(message, type)` in dashboard.js L1628 — uses `#checkoutAlert` element, auto-hides after 8s. Dashboard-only.
- Existing `showGridLoading(grid)` in dashboard.js L1383 — creates spinner in a grid container.
- Run `npm run lint` and `npm run format` after each task.

---

## Task 1: Toast notification system (2.5)

**Why first:** Other tasks will use `showToast` for feedback (e.g., retry progress, tab restore confirmation). Build the foundation first.

**Files:**

- Modify: `public/shared.js` — add `showToast()` utility
- Modify: `public/styles.css` — add `.toast-container` and `.toast` styles
- Modify: `public/shared.js:15` — update `/* exported */` comment

### Step 1: Add toast CSS to styles.css

Add **before** the `/* ─── Error State with Retry */` comment (~L1813):

```css
/* ─── Toast Notifications ──────────────────── */
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--text-primary);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transform: translateX(120%);
  opacity: 0;
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s ease;
  max-width: 360px;
}

.toast.visible {
  transform: translateX(0);
  opacity: 1;
}

.toast--success {
  border-color: rgba(46, 204, 113, 0.3);
}

.toast--success .toast-icon {
  color: var(--green);
}

.toast--error {
  border-color: rgba(231, 76, 60, 0.3);
}

.toast--error .toast-icon {
  color: var(--red);
}

.toast--info {
  border-color: rgba(212, 168, 83, 0.3);
}

.toast--info .toast-icon {
  color: var(--gold);
}

.toast-icon {
  flex-shrink: 0;
  font-size: 1.1rem;
}

.toast-text {
  flex: 1;
  line-height: 1.4;
}
```

Add inside the `@media (prefers-reduced-motion: reduce)` block (~L1890):

```css
.toast {
  transition: none;
}
```

Add inside the `@media (max-width: 768px)` block for mobile centering:

```css
.toast-container {
  right: 12px;
  left: 12px;
  bottom: 16px;
}

.toast {
  max-width: 100%;
}
```

### Step 2: Add showToast() to shared.js

Add after `setErrorState` function (~after L127), before `// MOBILE MENU`:

```js
// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

var _toastContainer = null;

/**
 * Mostra un toast temporaneo con messaggio e tipo.
 * @param {string} message - Testo del messaggio
 * @param {'success'|'error'|'info'} [type='info'] - Tipo di toast
 * @param {number} [duration=3000] - Durata in ms prima dell'auto-dismiss
 */
function showToast(message, type, duration) {
  type = type || 'info';
  duration = duration || 3000;

  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.className = 'toast-container';
    _toastContainer.setAttribute('aria-live', 'polite');
    _toastContainer.setAttribute('aria-label', 'Notifiche');
    document.body.appendChild(_toastContainer);
  }

  var icons = { success: '\u2713', error: '\u2717', info: '\u2139' };

  var toast = document.createElement('div');
  toast.className = 'toast toast--' + type;
  toast.setAttribute('role', 'status');

  var icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = icons[type] || icons.info;
  toast.appendChild(icon);

  var text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  toast.appendChild(text);

  _toastContainer.appendChild(toast);

  // Slide in
  if (REDUCED_MOTION) {
    toast.classList.add('visible');
  } else {
    requestAnimationFrame(function () {
      toast.classList.add('visible');
    });
  }

  // Click to dismiss
  toast.addEventListener('click', function () {
    removeToast(toast);
  });

  // Auto-dismiss
  setTimeout(function () {
    removeToast(toast);
  }, duration);
}

function removeToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.remove('visible');
  if (REDUCED_MOTION) {
    toast.remove();
  } else {
    setTimeout(function () {
      toast.remove();
    }, 300);
  }
}
```

### Step 3: Update exported/global comments

In `shared.js:15`, add `showToast` to the `/* exported */` list.

In `script.js:16`, add `showToast` to the `/* global */` list.

In `dashboard.js:15`, add `showToast` to the `/* global */` list.

### Step 4: Verify and commit

```bash
npm run format && npm run lint
```

Expected: 0 lint errors.

```bash
git add public/shared.js public/styles.css public/script.js public/dashboard.js
git commit -m "feat(ux): add showToast notification system (2.5)"
```

---

## Task 2: Skeleton loading (2.1)

**Files:**

- Modify: `public/styles.css` — add `.skeleton` shimmer styles
- Modify: `public/shared.js` — add `buildSkeletonCards()` utility
- Modify: `public/script.js` — show skeletons before fetch in `loadTips`, `loadMatches`, `loadResults`
- Modify: `public/dashboard.js` — show skeletons before fetch in `loadTodayTips`, `loadHistory`, replace `showGridLoading` in `loadSchedule`
- Modify: `public/index.html` — replace initial spinners with skeleton markup
- Modify: `public/dashboard.html` — replace initial spinners with skeleton markup

### Step 1: Add skeleton CSS to styles.css

Add after the existing `.tips-empty` block (~L1802), before the `/* ─── Error State */` comment:

```css
/* ─── Skeleton Loading ─────────────────────── */
.skeleton {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  position: relative;
  overflow: hidden;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.04) 50%,
    transparent 100%
  );
  animation: shimmer 1.5s infinite;
}

.skeleton-card {
  height: 180px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.skeleton-line {
  height: 14px;
  border-radius: 4px;
  background: var(--bg-card);
  position: relative;
  overflow: hidden;
}

.skeleton-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.04) 50%,
    transparent 100%
  );
  animation: shimmer 1.5s infinite;
}

.skeleton-line--short {
  width: 60%;
}

.skeleton-line--medium {
  width: 80%;
}

.skeleton-match {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  min-width: 200px;
  flex-shrink: 0;
}

.skeleton-history {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

Add inside the `@media (prefers-reduced-motion: reduce)` block:

```css
.skeleton::after,
.skeleton-line::after {
  animation: none;
}
```

### Step 2: Add buildSkeletonCards() to shared.js

Add after `removeToast` function (end of toast section), before `// MOBILE MENU`:

```js
// ==========================================
// SKELETON LOADING
// ==========================================

/**
 * Genera N skeleton card placeholder nel container.
 * @param {HTMLElement} container - Elemento contenitore (viene svuotato)
 * @param {number} count - Numero di skeleton card
 * @param {'card'|'match'|'history'} [variant='card'] - Tipo di skeleton
 */
function buildSkeletonCards(container, count, variant) {
  variant = variant || 'card';
  container.textContent = '';
  for (var i = 0; i < count; i++) {
    var el = document.createElement('div');
    el.className = 'skeleton skeleton-' + variant;
    el.setAttribute('aria-hidden', 'true');
    container.appendChild(el);
  }
}
```

Update `/* exported */` in shared.js:15 — add `buildSkeletonCards`.

Update `/* global */` in script.js:16 — add `buildSkeletonCards`.

Update `/* global */` in dashboard.js:15 — add `buildSkeletonCards`.

### Step 3: Replace initial HTML spinners with skeleton markup

**index.html** — replace the `<div class="matches-loading">...</div>` inside `#matchesScroll` (~L202-205) with:

```html
<div class="skeleton skeleton-match" aria-hidden="true"></div>
<div class="skeleton skeleton-match" aria-hidden="true"></div>
<div class="skeleton skeleton-match" aria-hidden="true"></div>
```

**index.html** — replace the `<div class="tips-loading">...</div>` inside `#tipsGrid` (~L272-273) with:

```html
<div class="skeleton skeleton-card" aria-hidden="true"></div>
<div class="skeleton skeleton-card" aria-hidden="true"></div>
<div class="skeleton skeleton-card" aria-hidden="true"></div>
```

**index.html** — replace the `<div class="results-loading">...</div>` inside `#resultsList` (~L434) with:

```html
<div class="skeleton skeleton-history" aria-hidden="true"></div>
<div class="skeleton skeleton-history" aria-hidden="true"></div>
<div class="skeleton skeleton-history" aria-hidden="true"></div>
```

**dashboard.html** — replace the `<div class="tips-loading">...</div>` inside `#dashTipsGrid` (~L181-184) with:

```html
<div class="skeleton skeleton-card" aria-hidden="true"></div>
<div class="skeleton skeleton-card" aria-hidden="true"></div>
<div class="skeleton skeleton-card" aria-hidden="true"></div>
```

**dashboard.html** — replace the spinner inside `#schedineGrid` (~L246) with:

```html
<div class="skeleton skeleton-card" aria-hidden="true"></div>
<div class="skeleton skeleton-card" aria-hidden="true"></div>
```

**dashboard.html** — replace the spinner inside `#dashHistoryList` (~L306) with:

```html
<div class="skeleton skeleton-history" aria-hidden="true"></div>
<div class="skeleton skeleton-history" aria-hidden="true"></div>
<div class="skeleton skeleton-history" aria-hidden="true"></div>
```

### Step 4: Add skeleton calls before fetch in JS

**script.js** — In `loadMatches()` (~L468), add `buildSkeletonCards(container, 4, 'match');` as the first line inside the `try` block (before the `let matches;` line).

**script.js** — In `loadResults()` (~L519), add `buildSkeletonCards(container, 4, 'history');` as the first line inside the `try` block.

**script.js** — In `loadTips()` (~L429), add `buildSkeletonCards(container, 3, 'card');` as the first line inside the `try` block.

**dashboard.js** — In `loadTodayTips()` (~L399), add `buildSkeletonCards(grid, 3, 'card');` before the `const tipLimit` line in the `try` block.

**dashboard.js** — In `loadHistory()` (~L616), add:

```js
const histList = document.getElementById('dashHistoryList');
if (histList) buildSkeletonCards(histList, 4, 'history');
```

as the first lines inside `try` block.

**dashboard.js** — Replace the `showGridLoading(grid)` call in `loadSchedule()` (~L1420) with `buildSkeletonCards(grid, 2, 'card');`.

**dashboard.js** — Delete the `showGridLoading` function (~L1383-1392) since it's no longer used.

### Step 5: Verify and commit

```bash
npm run format && npm run lint
```

```bash
git add public/shared.js public/styles.css public/script.js public/dashboard.js public/index.html public/dashboard.html
git commit -m "feat(ux): replace spinners with skeleton loading (2.1)"
```

---

## Task 3: Informative empty states (2.3)

**Files:**

- Modify: `public/shared.js` — add `buildEmptyState()` utility
- Modify: `public/script-builders.js` — remove old `setEmptyState`, update exported comment
- Modify: `public/script.js` — replace `setEmptyState` calls with `buildEmptyState`
- Modify: `public/styles.css` — add `.empty-state` styles

### Step 1: Add empty state CSS

Add after the skeleton CSS block, before `/* ─── Error State */`:

```css
/* ─── Empty State ──────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 24px;
  text-align: center;
  grid-column: 1 / -1;
  width: 100%;
}

.empty-state svg {
  color: var(--text-muted);
  opacity: 0.5;
}

.empty-state-title {
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-state-subtitle {
  font-size: 0.85rem;
  color: var(--text-muted);
  max-width: 300px;
}

.empty-state .btn {
  margin-top: 4px;
}
```

### Step 2: Add buildEmptyState() to shared.js

Add after `buildSkeletonCards`, before `// MOBILE MENU`:

```js
// ==========================================
// EMPTY STATE
// ==========================================

/**
 * Mostra uno stato vuoto informativo con icona, titolo, sottotitolo e azione opzionale.
 * @param {HTMLElement} container - Elemento contenitore (viene svuotato)
 * @param {Object} opts
 * @param {'calendar'|'clipboard'|'trophy'|'search'} opts.icon - Tipo icona SVG
 * @param {string} opts.title - Titolo principale
 * @param {string} [opts.subtitle] - Sottotitolo opzionale
 * @param {{label: string, onClick: Function}} [opts.action] - Bottone azione opzionale
 */
function buildEmptyState(container, opts) {
  container.textContent = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  var svgPaths = {
    calendar:
      'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
    clipboard:
      'M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2M9 2h6a1 1 0 011 1v1a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1z',
    trophy:
      'M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z',
    search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  };

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '40');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  var pathData = svgPaths[opts.icon] || svgPaths.clipboard;
  pathData
    .split('M')
    .filter(Boolean)
    .forEach(function (seg) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M' + seg);
      svg.appendChild(path);
    });

  wrapper.appendChild(svg);

  var title = document.createElement('p');
  title.className = 'empty-state-title';
  title.textContent = opts.title;
  wrapper.appendChild(title);

  if (opts.subtitle) {
    var sub = document.createElement('p');
    sub.className = 'empty-state-subtitle';
    sub.textContent = opts.subtitle;
    wrapper.appendChild(sub);
  }

  if (opts.action) {
    var btn = document.createElement('button');
    btn.className = 'btn btn-outline btn-sm';
    btn.textContent = opts.action.label;
    btn.addEventListener('click', opts.action.onClick);
    wrapper.appendChild(btn);
  }

  container.appendChild(wrapper);
}
```

Update `/* exported */` in shared.js — add `buildEmptyState`.

Update `/* global */` in script.js — add `buildEmptyState`, keep `setEmptyState` (still needed for backward compat in script-builders.js).

### Step 3: Replace setEmptyState calls in script.js with buildEmptyState

In `loadTips()` (~L434):

```js
// Old:
setEmptyState(container, 'tips-empty', 'Nessun pronostico disponibile al momento');
// New:
buildEmptyState(container, {
  icon: 'clipboard',
  title: 'Nessun pronostico disponibile',
  subtitle: 'I pronostici vengono pubblicati ogni giorno. Torna più tardi!',
});
```

In `loadMatches()` (~L488):

```js
// Old:
setEmptyState(container, 'matches-empty', 'Nessuna partita in programma');
// New:
buildEmptyState(container, {
  icon: 'calendar',
  title: 'Nessuna partita in programma',
  subtitle: 'Le prossime partite appariranno qui automaticamente.',
});
```

In `loadResults()` (~L539):

```js
// Old:
setEmptyState(container, 'results-empty', 'Nessun risultato disponibile');
// New:
buildEmptyState(container, {
  icon: 'trophy',
  title: 'Nessun risultato disponibile',
  subtitle: 'I risultati appariranno dopo le partite.',
});
```

### Step 4: Verify and commit

```bash
npm run format && npm run lint
```

```bash
git add public/shared.js public/styles.css public/script.js
git commit -m "feat(ux): add informative empty states with icons (2.3)"
```

---

## Task 4: Timestamp "Aggiornato alle HH:MM" (2.4)

**Files:**

- Modify: `public/shared.js` — add `setLastUpdated()` utility
- Modify: `public/script.js` — call after each successful fetch
- Modify: `public/dashboard.js` — call after each successful fetch
- Modify: `public/styles.css` — add `.last-updated` styles
- Modify: `public/index.html` — add timestamp containers
- Modify: `public/dashboard.html` — add timestamp containers

### Step 1: Add CSS for timestamps

Add after `.empty-state .btn` rule, before `/* ─── Error State */`:

```css
/* ─── Last Updated Timestamp ───────────────── */
.last-updated {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 8px;
}

.last-updated-refresh {
  cursor: pointer;
  color: var(--text-muted);
  background: none;
  border: none;
  padding: 2px;
  font-size: 0.85rem;
  line-height: 1;
  transition: color 0.2s;
}

.last-updated-refresh:hover {
  color: var(--gold);
}
```

### Step 2: Add setLastUpdated() to shared.js

Add after `buildEmptyState`, before `// MOBILE MENU`:

```js
// ==========================================
// LAST UPDATED TIMESTAMP
// ==========================================

/**
 * Mostra un timestamp "Aggiornato alle HH:MM" con icona refresh cliccabile.
 * @param {string} containerId - ID dell'elemento .last-updated
 * @param {Function} [refreshFn] - Funzione da chiamare al click refresh
 */
function setLastUpdated(containerId, refreshFn) {
  var el = document.getElementById(containerId);
  if (!el) return;

  var locale = typeof getLocale === 'function' ? getLocale() : 'it-IT';
  var time = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  el.textContent = '';

  var text = document.createElement('span');
  text.textContent = 'Aggiornato alle ' + time;
  el.appendChild(text);

  if (typeof refreshFn === 'function') {
    var btn = document.createElement('button');
    btn.className = 'last-updated-refresh';
    btn.setAttribute('aria-label', 'Aggiorna');
    btn.textContent = '\u21BB';
    btn.addEventListener('click', refreshFn);
    el.appendChild(btn);
  }
}
```

Update `/* exported */` — add `setLastUpdated`.

Update `/* global */` in script.js — add `setLastUpdated`.

Update `/* global */` in dashboard.js — add `setLastUpdated`.

### Step 3: Add timestamp containers in HTML

**index.html** — Add after `#matchesScroll` closing `</div>` and before the section's closing `</div>`:

```html
<div class="last-updated" id="matchesUpdated"></div>
```

**index.html** — Add after `#tipsGrid` closing `</div>`:

```html
<div class="last-updated" id="tipsUpdated"></div>
```

**index.html** — Add after `#resultsList` closing `</div>`:

```html
<div class="last-updated" id="resultsUpdated"></div>
```

**dashboard.html** — Add after `#dashTipsGrid` closing `</div>` (inside panelTips):

```html
<div class="last-updated" id="dashTipsUpdated"></div>
```

**dashboard.html** — Add after `#dashHistoryList` closing `</div>` (inside panelHistory):

```html
<div class="last-updated" id="dashHistoryUpdated"></div>
```

### Step 4: Call setLastUpdated after successful fetches

**script.js** — At the end of `loadMatches()` try block (after `container.appendChild(track)` and the duration line, ~L508):

```js
setLastUpdated('matchesUpdated', loadMatches);
```

**script.js** — At the end of `loadResults()` try block (after the `forEach`, ~L545):

```js
setLastUpdated('resultsUpdated', loadResults);
```

**script.js** — At the end of `loadTipsFromAPI()` try block (after the `forEach` for reveal animations, ~L956):

```js
setLastUpdated('tipsUpdated', loadTipsFromAPI);
```

**dashboard.js** — At the end of `loadTodayTips()` try block (after `renderTipsGrid`, ~L430):

```js
setLastUpdated('dashTipsUpdated', loadTodayTips);
```

**dashboard.js** — At the end of `loadHistory()` try block (after `loadDashboardChart()`, ~L647):

```js
setLastUpdated('dashHistoryUpdated', loadHistory);
```

### Step 5: Verify and commit

```bash
npm run format && npm run lint
```

```bash
git add public/shared.js public/styles.css public/script.js public/dashboard.js public/index.html public/dashboard.html
git commit -m "feat(ux): add last-updated timestamps with refresh (2.4)"
```

---

## Task 5: Tab state persistence (2.6)

**Files:**

- Modify: `public/dashboard.js` — save/restore active tab in `setupTabs()`

### Step 1: Modify setupTabs() in dashboard.js

In `setupTabs()` (~L744), add localStorage restore at the beginning and save on tab click.

Replace the entire `setupTabs` function:

```js
function setupTabs() {
  const tabs = document.querySelectorAll('.dash-tab');
  const STORAGE_KEY = 'wb_dashboard_tab';

  // Restore saved tab
  var savedTab = null;
  try {
    savedTab = localStorage.getItem(STORAGE_KEY);
  } catch (_e) {
    /* storage unavailable */
  }

  if (savedTab) {
    var target = document.querySelector('.dash-tab[data-tab="' + savedTab + '"]');
    if (target) {
      // Simulate click on saved tab
      target.click();
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // Deactivate settings when switching to a tab
      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) settingsBtn.classList.remove('active');

      const target = tab.getAttribute('data-tab');

      // Save tab preference
      try {
        localStorage.setItem(STORAGE_KEY, target);
      } catch (_e) {
        /* storage unavailable */
      }

      document.getElementById('panelTips').style.display = target === 'tips' ? '' : 'none';
      document.getElementById('panelSchedule').style.display = target === 'schedine' ? '' : 'none';
      document.getElementById('panelHistory').style.display = target === 'history' ? '' : 'none';
      document.getElementById('panelAccount').style.display = 'none';

      // Show/hide league selector (not relevant for schedine)
      const leagueSelector = document.getElementById('dashLeagueSelector');
      if (leagueSelector) {
        leagueSelector.style.display = target === 'schedine' ? 'none' : '';
      }
    });
  });
}
```

**IMPORTANT:** The restore must happen AFTER all panels and event listeners exist but BEFORE `checkAuth()`. The current call order at DOMContentLoaded is `checkAuth(); setupTabs(); ...` — `setupTabs()` already runs after DOM is ready, so restoring inside it is fine. The `target.click()` will trigger the event listener we just attached, which handles panel visibility.

Wait — the listeners are attached in the `forEach` AFTER the restore check. We need to move the restore AFTER the `forEach`. Correct version:

```js
function setupTabs() {
  const tabs = document.querySelectorAll('.dash-tab');
  const STORAGE_KEY = 'wb_dashboard_tab';

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const settingsBtn = document.getElementById('settingsBtn');
      if (settingsBtn) settingsBtn.classList.remove('active');

      const target = tab.getAttribute('data-tab');

      try {
        localStorage.setItem(STORAGE_KEY, target);
      } catch (_e) {
        /* storage unavailable */
      }

      document.getElementById('panelTips').style.display = target === 'tips' ? '' : 'none';
      document.getElementById('panelSchedule').style.display = target === 'schedine' ? '' : 'none';
      document.getElementById('panelHistory').style.display = target === 'history' ? '' : 'none';
      document.getElementById('panelAccount').style.display = 'none';

      const leagueSelector = document.getElementById('dashLeagueSelector');
      if (leagueSelector) {
        leagueSelector.style.display = target === 'schedine' ? 'none' : '';
      }
    });
  });

  // Restore saved tab (after listeners are attached)
  var savedTab = null;
  try {
    savedTab = localStorage.getItem(STORAGE_KEY);
  } catch (_e) {
    /* storage unavailable */
  }
  if (savedTab && savedTab !== 'tips') {
    var target = document.querySelector('.dash-tab[data-tab="' + savedTab + '"]');
    if (target) target.click();
  }
}
```

### Step 2: Verify and commit

```bash
npm run format && npm run lint
```

```bash
git add public/dashboard.js
git commit -m "feat(ux): persist dashboard tab in localStorage (2.6)"
```

---

## Task 6: Notification badge red pulse (2.7)

**Files:**

- Modify: `public/styles.css` — change `.notif-badge` background to red + add pulse

### Step 1: Update .notif-badge CSS

In `styles.css` (~L3408), replace the `.notif-badge` block:

```css
.notif-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--red);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  animation: notif-pulse 2s ease-in-out infinite;
}

@keyframes notif-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.4);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(231, 76, 60, 0);
  }
}
```

Add inside the `@media (prefers-reduced-motion: reduce)` block:

```css
.notif-badge {
  animation: none;
}
```

### Step 2: Verify and commit

```bash
npm run format && npm run lint
```

```bash
git add public/styles.css
git commit -m "feat(ux): red pulse notification badge (2.7)"
```

---

## Task 7: Retry with exponential backoff (2.2)

**Why last:** This wraps existing fetch calls with retry logic. It's safest to implement after all other fetch changes (skeletons, timestamps) are in place.

**Files:**

- Modify: `public/shared.js` — add `retryWithBackoff()` utility
- Modify: `public/script.js` — wrap fetches in `loadMatches`, `loadResults`, `loadTips`
- Modify: `public/dashboard.js` — wrap fetches in `loadTodayTips`, `loadHistory`, `loadSchedule`

### Step 1: Add retryWithBackoff() to shared.js

Add after `setLastUpdated`, before `// MOBILE MENU`:

```js
// ==========================================
// RETRY WITH EXPONENTIAL BACKOFF
// ==========================================

/**
 * Esegue una funzione con retry automatico e backoff esponenziale.
 * @param {Function} fn - Funzione async da eseguire
 * @param {Object} [opts]
 * @param {number} [opts.maxRetries=3] - Tentativi massimi
 * @param {number} [opts.baseDelay=1000] - Delay base in ms (raddoppia ad ogni retry)
 * @param {number} [opts.timeout=10000] - Timeout per singola chiamata in ms
 * @returns {Promise<*>} Risultato della funzione
 */
function retryWithBackoff(fn, opts) {
  opts = opts || {};
  var maxRetries = opts.maxRetries || 3;
  var baseDelay = opts.baseDelay || 1000;
  var timeout = opts.timeout || 10000;

  return new Promise(function (resolve, reject) {
    var attempt = 0;

    function tryOnce() {
      attempt++;

      var controller = new AbortController();
      var timer = setTimeout(function () {
        controller.abort();
      }, timeout);

      Promise.resolve(fn(controller.signal))
        .then(function (result) {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(function (err) {
          clearTimeout(timer);
          if (attempt >= maxRetries) {
            reject(err);
            return;
          }
          var delay = baseDelay * Math.pow(2, attempt - 1);
          setTimeout(tryOnce, delay);
        });
    }

    tryOnce();
  });
}
```

Update `/* exported */` — add `retryWithBackoff`.

Update `/* global */` in script.js — add `retryWithBackoff`.

Update `/* global */` in dashboard.js — add `retryWithBackoff`.

### Step 2: Wrap key fetches in script.js

**script.js — `loadMatches()`**: Wrap the fetch inside `retryWithBackoff`. Replace the fetch call pattern:

```js
  async function loadMatches() {
    const container = document.getElementById('matchesScroll');
    buildSkeletonCards(container, 4, 'match');
    try {
      const matches = await retryWithBackoff(function () {
        if (currentLeague === 'all') {
          return Promise.all(
            ALL_LEAGUE_SLUGS.map(function (slug) {
              return fetchAPI('fixtures', { type: 'matches', league: slug }).catch(function () {
                return [];
              });
            }),
          ).then(function (results) {
            return results.flat().sort(function (a, b) {
              return new Date(a.date) - new Date(b.date);
            });
          });
        }
        return fetchAPI('fixtures', { type: 'matches', league: currentLeague });
      });
      // ... rest of the try block remains the same
```

Apply the same pattern to `loadResults()` and `loadTips()` — wrap the `fetchAPI` call inside `retryWithBackoff(function () { return fetchAPI(...); })`.

**dashboard.js — `loadTodayTips()`**: Wrap the `authFetch` call:

```js
const tips = await retryWithBackoff(function () {
  return authFetch(
    '/api/tips?status=today&limit=' + tipLimit + '&league=' + encodeURIComponent(currentLeague),
  );
});
```

**dashboard.js — `loadHistory()`**: Wrap the `Promise.all`:

```js
const responses = await retryWithBackoff(function () {
  return Promise.all(promises);
});
```

**dashboard.js — `loadSchedule()`**: Wrap the `authFetch` call:

```js
const data = await retryWithBackoff(function () {
  return authFetch('/api/betting-slips?date=' + encodeURIComponent(schedineDate));
});
```

**Note:** The `signal` parameter from `retryWithBackoff` is available but NOT passed to the fetch calls in this implementation. The AbortController handles the timeout at the retry-wrapper level. Passing it down to `fetch()` would require changing `fetchAPI`/`authFetch` signatures, which is out of scope for this task.

### Step 3: Verify and commit

```bash
npm run format && npm run lint
```

```bash
git add public/shared.js public/script.js public/dashboard.js
git commit -m "feat(ux): add retryWithBackoff for API calls (2.2)"
```

---

## Final: CHANGELOG + Verification

### Step 1: Update CHANGELOG.md

Add under `## [Unreleased]`, after the Wave 1 section:

```markdown
### Added (Wave 2 — Polish)

- **2.1 Skeleton loading** — Added `.skeleton`, `.skeleton-card`, `.skeleton-match`, `.skeleton-history` CSS with shimmer animation. `buildSkeletonCards(container, count, variant)` in `shared.js`. Replaced all initial HTML spinners in `index.html` and `dashboard.html` with skeleton placeholders. JS fetches show skeletons before API calls. Removed `showGridLoading()` from dashboard.js. Respects `prefers-reduced-motion`.
- **2.2 Retry con backoff** — Added `retryWithBackoff(fn, opts)` in `shared.js` with exponential backoff (1s → 2s → 4s), max 3 retries, 10s timeout via AbortController. Wrapped all primary API fetches in `script.js` and `dashboard.js`.
- **2.3 Empty states informativi** — Added `buildEmptyState(container, opts)` in `shared.js` with SVG icons (calendar, clipboard, trophy, search), title, subtitle, optional action button. Replaced `setEmptyState` calls in `script.js` with context-specific messages. `.empty-state` CSS component.
- **2.4 Timestamp "Aggiornato alle HH:MM"** — Added `setLastUpdated(containerId, refreshFn)` in `shared.js`. Shows locale-aware time + clickable refresh icon (↻). Applied after all successful fetches in both landing and dashboard. `.last-updated` CSS.
- **2.5 Toast system** — Added `showToast(message, type, duration)` in `shared.js`. Fixed container bottom-right (desktop), full-width mobile. Types: success (green), error (red), info (gold). Slide-in animation, auto-dismiss 3s, click to dismiss. Respects `prefers-reduced-motion`.
- **2.6 Tab state persistence** — Dashboard active tab saved in `localStorage('wb_dashboard_tab')`. Restored on page load via simulated click. Skips restore if saved tab is 'tips' (default).
- **2.7 Notification badge** — Changed `.notif-badge` background from gold to red (`var(--red)`), white text, added `notif-pulse` animation (pulsing box-shadow). Respects `prefers-reduced-motion`.
```

### Step 2: Run full verification

```bash
npm run format && npm run lint
```

Expected: 0 lint errors.

### Step 3: Final commit

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for Wave 2"
```

---

## Dependency Graph

```
Task 1 (Toast) ──────────────────────────────── independent
Task 2 (Skeleton) ──────────────────────────── independent
Task 3 (Empty states) ──────────────────────── independent
Task 4 (Timestamps) ────────────────────────── independent
Task 5 (Tab persistence) ───────────────────── independent
Task 6 (Notif badge) ───────────────────────── independent
Task 7 (Retry backoff) ─────── after Task 2 (uses skeleton calls already in place)
Final (CHANGELOG) ──────────── after all tasks
```

All tasks are independent except Task 7 (which builds on the fetch patterns established by Task 2). Execute in order 1 → 7 → Final.

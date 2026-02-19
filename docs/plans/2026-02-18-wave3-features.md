# Wave 3 — New Features (Countdown, Share, Bankroll) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new user-facing features: landing page countdown for next tips, share prediction buttons (Clipboard/WhatsApp/Telegram), and a bankroll calculator in the dashboard Account tab.

**Architecture:** All three tasks are client-side only (no API or backend changes). Countdown reuses the existing dashboard.js pattern. Share builds a dropdown on tip cards with formatted text. Bankroll calculator reads the already-loaded dashboard tips and computes fixed-percentage stakes.

**Tech Stack:** Vanilla JS (IIFE pattern), CSS custom properties, DOM API, Clipboard API, WhatsApp/Telegram deep links

---

## Context for Implementer

### File map (after Waves 1 & 2)

| File | Role |
|------|------|
| `public/shared.js` | Shared utilities (var + `/* exported */` pattern). ~786 lines. |
| `public/script.js` | Landing page IIFE. ~1021 lines. |
| `public/script-builders.js` | Landing page DOM builders (buildTipCard, buildMatchCard, etc.). ~408 lines. |
| `public/dashboard.js` | Dashboard IIFE. ~1822 lines. |
| `public/dashboard-renderers.js` | Dashboard DOM builders (dashRenderTipsGrid, dashRenderSchedule, etc.). ~676 lines. |
| `public/index.html` | Landing page HTML. ~807 lines. |
| `public/dashboard.html` | Dashboard HTML. ~617 lines. |
| `public/styles.css` | All CSS. ~3800+ lines. |
| `eslint.config.mjs` | ESLint flat config with browser globals. |
| `CHANGELOG.md` | Changelog (always update). |

### Code conventions (CRITICAL)

- `shared.js` uses `var` (not const/let) — loaded as non-module `<script>`, vars become globals
- `/* exported ... */` comment at top of shared.js must list ALL globals; `/* global ... */` in consuming files must list all shared.js globals used
- SVG icons: use `document.createElementNS` (not innerHTML) for XSS safety
- **NEVER use innerHTML** — always use `textContent` for plain text or safe DOM methods (`createElement`, `appendChild`) for structured content
- `REDUCED_MOTION` boolean in shared.js — respect it for animations
- `@media (prefers-reduced-motion: reduce)` in styles.css disables CSS animations
- Italian language for all user-facing strings
- CSS custom properties: `--gold`, `--red`, `--green`, `--text-primary`, `--text-secondary`, `--text-muted`, `--bg-card`, `--bg-elevated`, `--border`, `--radius-sm/md/lg`, `--font-display`, `--font-body`
- `createEl(tag, className, text)` helper in script-builders.js for DOM creation
- `showToast(message, type, duration)` in shared.js for user feedback

### CRITICAL RULES FOR SUBAGENT

1. **Do NOT create new files.** All code goes into existing files.
2. **Do NOT refactor existing code.** Only add new code.
3. **Do NOT rename variables or functions.**
4. **Stay on the correct branch** — `feat/wave3-features`.
5. **Run `npx prettier --write <file>` and `npm run lint` before committing.**
6. **Commit with the exact message specified in each task.**
7. **Use `var` in shared.js and script-builders.js** (non-module scripts).
8. **Use `const`/`let` inside IIFEs** (script.js, dashboard.js).
9. **NEVER use innerHTML** — use textContent or DOM creation methods only.

---

## Task 1: Landing Page Countdown (3.1)

**Goal:** Show "Prossimi tips tra Xh Ym" countdown in the landing page tips section when there are no tips available. Reuse the countdown pattern already in `dashboard.js:902-952`.

**Files:**
- Modify: `public/index.html` (add countdown container after tips grid)
- Modify: `public/script.js` (add countdown logic, call from loadTips/loadTipsFromAPI)
- Modify: `public/styles.css` (add landing-page countdown styles — reuse dashboard pattern)

### Step 1: Add countdown HTML in index.html

Inside the tips section (after `<div class="last-updated" id="tipsUpdated"></div>` at line 280), add a countdown container:

```html
        <!-- Countdown for next tips -->
        <div class="tips-countdown" id="landingCountdown" style="display: none">
          <span class="countdown-label">Prossimi pronostici tra:</span>
          <span class="countdown-value" id="landingCountdownValue">--:--</span>
        </div>
```

### Step 2: Add countdown functions in script.js

Inside the IIFE (before the init block at line ~1000), add three functions that mirror dashboard.js:

```javascript
  // ==========================================
  // COUNTDOWN — Next Tips
  // ==========================================

  let landingCountdownInterval = null;

  function startLandingCountdown() {
    const el = document.getElementById('landingCountdown');
    const valEl = document.getElementById('landingCountdownValue');
    if (!el || !valEl) return;

    stopLandingCountdown();
    el.style.display = '';

    fetch('/api/fixtures?type=matches&league=' + encodeURIComponent(currentLeague) + '&limit=1')
      .then(function (r) {
        return r.json();
      })
      .then(function (matches) {
        if (!Array.isArray(matches) || matches.length === 0) {
          valEl.textContent = '--:--';
          return;
        }
        const nextDate = new Date(matches[0].date);
        updateLandingCountdown(valEl, nextDate);

        landingCountdownInterval = setInterval(function () {
          updateLandingCountdown(valEl, nextDate);
        }, 60000);
      })
      .catch(function () {
        valEl.textContent = '--:--';
      });
  }

  function stopLandingCountdown() {
    if (landingCountdownInterval) {
      clearInterval(landingCountdownInterval);
      landingCountdownInterval = null;
    }
    const el = document.getElementById('landingCountdown');
    if (el) el.style.display = 'none';
  }

  function updateLandingCountdown(el, targetDate) {
    const now = new Date();
    const diff = targetDate - now;
    if (diff <= 0) {
      el.textContent = 'A breve!';
      return;
    }
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    el.textContent = hours + 'h ' + (mins < 10 ? '0' : '') + mins + 'm';
  }
```

### Step 3: Wire countdown into loadTips and loadTipsFromAPI

In `loadTips()` (script.js:437-477):
- After the `buildEmptyState` call (line ~445-449), add `startLandingCountdown();`
- At the start of the success path (after `container.textContent = '';` at line ~452), add `stopLandingCountdown();`
- In the catch block (line ~474-476), add `startLandingCountdown();`

In `loadTipsFromAPI()` (script.js:904-996):
- After `loadTips(); return;` on line ~923 (no tips from API), the countdown will be triggered by loadTips() itself.
- After the success path renders tips (around line ~982), add `stopLandingCountdown();`

### Step 4: Add CSS for countdown on landing page

In styles.css, the `.tips-countdown` class already exists (from dashboard). It should work for the landing page too since the selector is class-based. If the existing styles are scoped under a dashboard-specific parent, add this after the existing `.tips-countdown` rules (around the dashboard section):

```css
/* Landing page countdown (reuses dashboard pattern) */
.tips-section .tips-countdown {
  text-align: center;
  padding: 1rem 0;
  margin-top: 1rem;
}
```

### Step 5: Lint, format, commit

```bash
npx prettier --write public/index.html public/script.js public/styles.css
npm run lint
git add public/index.html public/script.js public/styles.css
git commit -m "feat(ux): add landing page countdown for next tips (3.1)"
```

---

## Task 2: Share Prediction (3.2)

**Goal:** Add a share button on tip cards with a dropdown (Copy to clipboard, WhatsApp, Telegram). Formatted text with match details + prediction. Only for tips the user can access (free or unlocked). Uses `showToast` for copy confirmation.

**Files:**
- Modify: `public/shared.js` (add `buildShareDropdown` utility function)
- Modify: `public/script-builders.js` (add share button to `buildTipCard`)
- Modify: `public/dashboard-renderers.js` (add share button to `dashRenderTipsGrid`)
- Modify: `public/styles.css` (share button + dropdown styles)

### Step 1: Add `buildShareDropdown` in shared.js

Add a new section before the `// MOBILE MENU` section (after the `retryWithBackoff` function at line ~387):

```javascript
// ==========================================
// SHARE DROPDOWN
// ==========================================

/**
 * Costruisce un dropdown di condivisione con Copia, WhatsApp e Telegram.
 * @param {Object} opts
 * @param {string} opts.text - Testo formattato da condividere
 * @returns {HTMLElement} Elemento .share-wrapper con bottone + dropdown
 */
function buildShareDropdown(opts) {
  var wrapper = document.createElement('div');
  wrapper.className = 'share-wrapper';

  // Share button (SVG share icon)
  var btn = document.createElement('button');
  btn.className = 'share-btn';
  btn.setAttribute('aria-label', 'Condividi');
  btn.setAttribute('aria-expanded', 'false');

  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  var c1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c1.setAttribute('cx', '18');
  c1.setAttribute('cy', '5');
  c1.setAttribute('r', '3');
  var c2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c2.setAttribute('cx', '6');
  c2.setAttribute('cy', '12');
  c2.setAttribute('r', '3');
  var c3 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c3.setAttribute('cx', '18');
  c3.setAttribute('cy', '19');
  c3.setAttribute('r', '3');
  var l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l1.setAttribute('x1', '8.59');
  l1.setAttribute('y1', '13.51');
  l1.setAttribute('x2', '15.42');
  l1.setAttribute('y2', '17.49');
  var l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l2.setAttribute('x1', '15.41');
  l2.setAttribute('y1', '6.51');
  l2.setAttribute('x2', '8.59');
  l2.setAttribute('y2', '10.49');
  svg.appendChild(c1);
  svg.appendChild(c2);
  svg.appendChild(c3);
  svg.appendChild(l1);
  svg.appendChild(l2);
  btn.appendChild(svg);
  wrapper.appendChild(btn);

  // Dropdown
  var dropdown = document.createElement('div');
  dropdown.className = 'share-dropdown';

  // Copy
  var copyBtn = document.createElement('button');
  copyBtn.className = 'share-option';
  copyBtn.textContent = '\uD83D\uDCCB Copia';
  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(opts.text).then(function () {
      showToast('Pronostico copiato!', 'success');
    }).catch(function () {
      showToast('Impossibile copiare', 'error');
    });
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  dropdown.appendChild(copyBtn);

  // WhatsApp
  var waBtn = document.createElement('a');
  waBtn.className = 'share-option';
  waBtn.textContent = '\uD83D\uDCAC WhatsApp';
  waBtn.href = 'https://wa.me/?text=' + encodeURIComponent(opts.text);
  waBtn.target = '_blank';
  waBtn.rel = 'noopener noreferrer';
  waBtn.addEventListener('click', function () {
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  dropdown.appendChild(waBtn);

  // Telegram
  var tgBtn = document.createElement('a');
  tgBtn.className = 'share-option';
  tgBtn.textContent = '\u2708\uFE0F Telegram';
  tgBtn.href = 'https://t.me/share/url?url=https://winningbet.it&text=' + encodeURIComponent(opts.text);
  tgBtn.target = '_blank';
  tgBtn.rel = 'noopener noreferrer';
  tgBtn.addEventListener('click', function () {
    dropdown.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });
  dropdown.appendChild(tgBtn);

  wrapper.appendChild(dropdown);

  // Toggle dropdown
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = dropdown.classList.contains('open');
    // Close all other dropdowns first
    document.querySelectorAll('.share-dropdown.open').forEach(function (d) {
      d.classList.remove('open');
      var parentBtn = d.parentNode.querySelector('.share-btn');
      if (parentBtn) parentBtn.setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      dropdown.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  return wrapper;
}

// Close share dropdowns on click outside
document.addEventListener('click', function () {
  document.querySelectorAll('.share-dropdown.open').forEach(function (d) {
    d.classList.remove('open');
    var parentBtn = d.parentNode.querySelector('.share-btn');
    if (parentBtn) parentBtn.setAttribute('aria-expanded', 'false');
  });
});
```

Update the `/* exported ... */` line in shared.js to include `buildShareDropdown`.

### Step 2: Add share button to buildTipCard in script-builders.js

In `script-builders.js`, in the `buildTipCard` function (line ~277), after the analysis section (line ~365) and before `return card;`:

```javascript
  // Share button (only for accessible tips)
  if (hasAccess) {
    var shareText = '\u26BD ' + match.home + ' vs ' + match.away + '\n';
    shareText += '\uD83C\uDFAF Pronostico: ' + (tip ? (tip.prediction || '') : randomFrom(PREDICTIONS)) + '\n';
    shareText += '\uD83D\uDCCA Quota: ' + (tip ? (tip.odds ? parseFloat(tip.odds).toFixed(2) : '') : randomOdd()) + '\n';
    shareText += '\uD83D\uDCC5 ' + formatMatchDate(match.date) + '\n';
    shareText += '\nda WinningBet \u2014 winningbet.it';

    card.appendChild(buildShareDropdown({ text: shareText }));
  }
```

Update `/* global ... */` in script-builders.js to include `buildShareDropdown, showToast`.

### Step 3: Add share button to dashRenderTipsGrid in dashboard-renderers.js

In `dashboard-renderers.js`, in the `dashRenderTipsGrid` function, after the expand button block (line ~265, before `container.appendChild(card);`):

```javascript
    // Share button (only for future pending tips)
    if (!isPast) {
      var shareText = '\u26BD ' + tip.home_team + ' vs ' + tip.away_team + '\n';
      shareText += '\uD83C\uDFAF Pronostico: ' + (tip.prediction || '') + '\n';
      shareText += '\uD83D\uDCCA Quota: ' + (tip.odds ? parseFloat(tip.odds).toFixed(2) : '') + '\n';
      shareText += '\uD83D\uDCC5 ' + formatMatchDate(tip.match_date) + '\n';
      shareText += '\nda WinningBet \u2014 winningbet.it';

      card.appendChild(buildShareDropdown({ text: shareText }));
    }
```

Update `/* global ... */` in dashboard-renderers.js to include `buildShareDropdown, showToast`.

### Step 4: Add CSS for share button and dropdown

Add to styles.css (after the toast section or near the tip card styles):

```css
/* ── Share Dropdown ───────────────────────── */
.share-wrapper {
  position: relative;
  display: inline-block;
  align-self: flex-end;
  margin-top: 0.5rem;
}

.share-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.share-btn:hover {
  color: var(--gold);
  border-color: var(--gold);
}

.share-dropdown {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow);
  display: none;
  flex-direction: column;
  min-width: 160px;
  z-index: 50;
  overflow: hidden;
}

.share-dropdown.open {
  display: flex;
}

.share-option {
  display: block;
  width: 100%;
  padding: 0.6rem 1rem;
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-family: var(--font-body);
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.share-option:hover {
  background: rgba(212, 168, 83, 0.1);
  color: var(--text-primary);
}

.share-option + .share-option {
  border-top: 1px solid var(--border);
}
```

### Step 5: Lint, format, commit

```bash
npx prettier --write public/shared.js public/script-builders.js public/dashboard-renderers.js public/styles.css
npm run lint
git add public/shared.js public/script-builders.js public/dashboard-renderers.js public/styles.css
git commit -m "feat(ux): add share prediction dropdown (3.2)"
```

---

## Task 3: Bankroll Calculator (3.3)

**Goal:** Add a collapsible bankroll calculator section inside the Account tab of the dashboard. User inputs their bankroll in EUR. Output shows recommended stake per tip using fixed-percentage (2-5%) scaled by confidence. Client-side pure — uses the already-loaded tip cards.

**Files:**
- Modify: `public/dashboard.html` (add bankroll calculator HTML in panelAccount)
- Modify: `public/dashboard.js` (add bankroll calculation logic)
- Modify: `public/styles.css` (add bankroll calculator styles)

### Step 1: Add bankroll calculator HTML in dashboard.html

In `dashboard.html`, inside `<section class="dash-panel" id="panelAccount">`, after the `dash-account-grid` closing `</div>` (around line ~591, just before the panel's closing `</section>` tag), add:

```html
          <!-- Bankroll Calculator -->
          <div class="dash-account-card bankroll-card">
            <h3 class="dash-card-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
              Bankroll Calculator
            </h3>
            <div class="bankroll-calc">
              <div class="bankroll-input-row">
                <label class="pref-label" for="bankrollInput">Il tuo bankroll</label>
                <div class="pref-input-group">
                  <input type="number" class="pref-input" id="bankrollInput" min="10" max="100000" step="10" value="100" />
                  <span class="pref-input-suffix">&euro;</span>
                </div>
              </div>
              <button class="btn btn-outline btn-sm" id="calcBankrollBtn">Calcola stake</button>
              <div class="bankroll-results" id="bankrollResults" style="display: none">
                <div class="bankroll-summary" id="bankrollSummary"></div>
                <div class="bankroll-table-wrapper">
                  <table class="bankroll-table" id="bankrollTable">
                    <thead>
                      <tr>
                        <th>Partita</th>
                        <th>Pronostico</th>
                        <th>Confidence</th>
                        <th>Stake</th>
                      </tr>
                    </thead>
                    <tbody id="bankrollTableBody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
```

### Step 2: Add bankroll calculation logic in dashboard.js

Inside the IIFE (before the HELPERS section, around line ~1774), add:

```javascript
  // ─── BANKROLL CALCULATOR ──────────────────────────────

  function setupBankrollCalculator() {
    const calcBtn = document.getElementById('calcBankrollBtn');
    if (!calcBtn) return;

    calcBtn.addEventListener('click', calculateBankroll);
  }

  function calculateBankroll() {
    const input = document.getElementById('bankrollInput');
    const resultsEl = document.getElementById('bankrollResults');
    const summaryEl = document.getElementById('bankrollSummary');
    const tbodyEl = document.getElementById('bankrollTableBody');
    if (!input || !resultsEl || !summaryEl || !tbodyEl) return;

    const bankroll = parseFloat(input.value) || 100;
    if (bankroll < 10) {
      showToast('Il bankroll minimo \u00E8 10\u20AC', 'error');
      return;
    }

    // Collect today's pending tips from the already-loaded grid
    const tipCards = document.querySelectorAll('#dashTipsGrid .tip-card');
    const tips = [];

    tipCards.forEach(function (card) {
      const predEl = card.querySelector('.pick-value');
      const oddsEl = card.querySelector('.odds-value');
      const confEl = card.querySelector('.confidence-value');
      const teamsEls = card.querySelectorAll('.dash-tip-team');

      if (!predEl || !oddsEl || teamsEls.length < 2) return;

      const confidence = parseInt((confEl && confEl.textContent) || '70', 10);
      const odds = parseFloat(oddsEl.textContent) || 0;
      const prediction = predEl.textContent || '';
      const matchName = teamsEls[0].textContent + ' vs ' + teamsEls[1].textContent;

      if (prediction && odds > 0) {
        tips.push({ matchName: matchName, prediction: prediction, odds: odds, confidence: confidence });
      }
    });

    if (tips.length === 0) {
      showToast('Nessun pronostico disponibile per il calcolo', 'info');
      return;
    }

    // Fixed-percentage staking: 2-5% scaled by confidence
    // confidence 60% -> 2%, confidence 90% -> 5%
    const MIN_PCT = 0.02;
    const MAX_PCT = 0.05;
    const MIN_CONF = 60;
    const MAX_CONF = 90;

    let totalStake = 0;
    tbodyEl.textContent = '';

    tips.forEach(function (tip) {
      const clampedConf = Math.max(MIN_CONF, Math.min(MAX_CONF, tip.confidence));
      const pct = MIN_PCT + ((clampedConf - MIN_CONF) / (MAX_CONF - MIN_CONF)) * (MAX_PCT - MIN_PCT);
      const stake = Math.round(bankroll * pct * 100) / 100;
      totalStake += stake;

      const tr = document.createElement('tr');

      const tdMatch = document.createElement('td');
      tdMatch.textContent = tip.matchName;
      tr.appendChild(tdMatch);

      const tdPred = document.createElement('td');
      tdPred.textContent = tip.prediction;
      tr.appendChild(tdPred);

      const tdConf = document.createElement('td');
      tdConf.textContent = tip.confidence + '%';
      tr.appendChild(tdConf);

      const tdStake = document.createElement('td');
      tdStake.className = 'bankroll-stake-cell';
      tdStake.textContent = stake.toFixed(2) + ' \u20AC';
      tr.appendChild(tdStake);

      tbodyEl.appendChild(tr);
    });

    // Summary (using safe DOM methods — no innerHTML)
    const remainingBankroll = bankroll - totalStake;
    summaryEl.textContent = '';

    const rows = [
      { label: 'Investimento totale:', value: totalStake.toFixed(2) + ' \u20AC' },
      { label: 'Bankroll rimanente:', value: remainingBankroll.toFixed(2) + ' \u20AC' },
      { label: '% investito:', value: ((totalStake / bankroll) * 100).toFixed(1) + '%' },
    ];

    rows.forEach(function (row) {
      const div = document.createElement('div');
      div.className = 'bankroll-summary-row';
      const labelSpan = document.createElement('span');
      labelSpan.textContent = row.label;
      div.appendChild(labelSpan);
      const valueStrong = document.createElement('strong');
      valueStrong.textContent = row.value;
      div.appendChild(valueStrong);
      summaryEl.appendChild(div);
    });

    resultsEl.style.display = '';
  }
```

### Step 3: Wire setupBankrollCalculator into init

In `dashboard.js`, inside the `DOMContentLoaded` handler (line ~67-81), add `setupBankrollCalculator();` after `setupRiskProfileInputs();`:

```javascript
    setupRiskProfileInputs();
    setupBankrollCalculator();
```

### Step 4: Verify `/* global */` in dashboard.js

`showToast` should already be in the `/* global */` comment from Wave 2 — verify, don't duplicate.

### Step 5: Add CSS for bankroll calculator

Add to styles.css (after the preference/account card styles or near the dashboard section):

```css
/* ── Bankroll Calculator ─────────────────── */
.bankroll-calc {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.bankroll-input-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.bankroll-results {
  margin-top: 0.5rem;
}

.bankroll-summary {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: 0.75rem;
}

.bankroll-summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.bankroll-summary-row strong {
  color: var(--gold);
}

.bankroll-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.bankroll-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.bankroll-table th,
.bankroll-table td {
  padding: 0.5rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.bankroll-table th {
  color: var(--text-muted);
  font-weight: 500;
  font-family: var(--font-display);
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bankroll-table td {
  color: var(--text-secondary);
}

.bankroll-stake-cell {
  color: var(--gold);
  font-weight: 600;
  font-family: var(--font-display);
}

@media (max-width: 480px) {
  .bankroll-input-row {
    flex-direction: column;
    align-items: stretch;
  }

  .bankroll-table {
    font-size: 0.75rem;
  }

  .bankroll-table th,
  .bankroll-table td {
    padding: 0.4rem;
  }
}
```

### Step 6: Lint, format, commit

```bash
npx prettier --write public/dashboard.html public/dashboard.js public/styles.css
npm run lint
git add public/dashboard.html public/dashboard.js public/styles.css
git commit -m "feat(ux): add bankroll calculator in dashboard Account tab (3.3)"
```

---

## Task 4: Final Verification + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

### Step 1: Run full lint check

```bash
npm run lint
```

Expected: 0 errors (warnings OK if pre-existing).

### Step 2: Update CHANGELOG.md

Add under the existing Wave 2 section (or create new section if Wave 2 already has a version):

```markdown
### Added (Wave 3 — New Features)
- **Countdown landing page**: "Prossimi tips tra Xh Ym" nella sezione tips quando non ci sono pronostici
- **Share prediction**: Bottone condividi su tip card con dropdown Copia/WhatsApp/Telegram
- **Bankroll calculator**: Calcolatore stake nel tab Account dashboard (2-5% del bankroll scalato per confidence)
```

### Step 3: Commit

```bash
npx prettier --write CHANGELOG.md
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for Wave 3"
```

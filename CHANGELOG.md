# Changelog

All notable changes to WinningBet will be documented in this file.

## [Unreleased]

### Changed

- **config(vercel): disable preview deployments on PRs** — Added `git.deploymentEnabled` to `vercel.json`: `preview: false`, `production: true`. Vercel now only deploys on merges to `main`, skipping PR preview builds.
- **config(copilot): set Claude Opus 4.6 as default model for both agents** — Updated `coder.agent.md` from `claude-sonnet-4` to `claude-opus-4-6`, added `model: claude-opus-4-6` to `reviewer.agent.md`.

- **refactor(api): consolidate serverless functions to fit Vercel Hobby 12-function limit** — Merged `match-insights.js` (h2h + form) and `odds-compare.js` (multi-bookmaker comparator) into `fixtures.js`, which now handles 6 types: `matches`, `results`, `odds`, `h2h`, `form`, `odds-compare`. Frontend URLs updated in `dashboard.js` (`/api/match-insights?type=...` → `/api/fixtures?type=...`, `/api/odds-compare?league=...` → `/api/fixtures?type=odds-compare&league=...`). `odds-compare` retains its JWT + partner role auth internally. Tests updated. Function count: 14 → 12.

### Added

- **feat(partner): Centro Scommesse Hub — profilo B2B e comparatore quote multi-bookmaker** — Implementazione completa del modulo Partner B2B per gestori di centri scommesse: (1) `supabase/migrations/016_add_partner_role.sql` — colonna `role TEXT CHECK (role IN ('partner','admin')) DEFAULT NULL` su `profiles` con indice parziale; (2) `api/_lib/auth-middleware.js` — aggiunto `role` alla SELECT del profilo; (3) `api/_lib/api-football.js` — nuova funzione `getMultipleBookmakerOdds(fixtureId)` che recupera quote da tutti i bookmaker disponibili (max 8, campi: home/draw/away/over25/under25/btts_yes/btts_no) senza filtro bookmaker; (4) `api/odds-compare.js` — nuovo endpoint `GET /api/odds-compare?league={slug}` con JWT auth + `role='partner'` check (403 per non-partner), cache in-memory 30min, recupera partite dei prossimi 7 giorni, tips Supabase associati, odds multi-bookmaker in parallelo, calcola best odds per mercato; (5) `vercel.json` — `odds-compare` aggiunto alla regex no-store; (6) `public/dashboard.html` — tab `#tabCentro` (hidden di default) + panel `#panelCentro` con griglia comparatore; (7) `public/dashboard.js` — partner detection in `loadProfile()` (mostra tab Centro, nasconde upgrade/billing, badge "PARTNER" verde), `loadCentroHub()` con skeleton + authFetch + retry, integrazione in `setupTabs()`, `setupSettingsToggle()`, `setupLeagueSelector()`; (8) `public/dashboard-renderers.js` — `dashRenderCentroHub()` che itera fixture, mostra tip badge WinningBet, tabella bookmaker con celle best evidenziate in verde, riga riepilogativa "Best"; (9) `public/styles.css` — ~90 nuove regole CSS: `.dash-tier-badge--partner` (gradient verde), `.centro-fixture-card`, `.centro-odds-table`, `.centro-odds-best` (verde), `.centro-odds-best-row`. Attivazione: `UPDATE profiles SET role='partner', tier='vip' WHERE user_id='<uuid>'`.

- **feat(fantacalcio): Fantacalcio Hub completo — DB, API, dashboard tab, skill AI** — Implementazione completa del modulo Fantacalcio Hub: (1) migrazione `015_create_fantacalcio_picks.sql` con tabella `fantacalcio_picks` (captain, differential, buy, sell; campi: player_name, team_name, role, reasoning, tier, confidence, expected_points, ownership_pct, rank, week_date); RLS a 4 livelli (captain=free, differential=pro, buy/sell=vip); (2) endpoint `GET /api/fantacalcio?league=serie-a` con JWT auth, tier filtering, risposta strutturata {captains, differentials, transfers}, cache 6h; (3) dashboard tab "⚽ Fanta" con lazy loading, nasconde league selector, panelFantacalcio gestito in setupTabs/setupSettingsToggle; (4) `dashboard-renderers.js` — renderer `dashRenderFantacalcio()` con sezioni captain/differential/market, upgrade gate per tier, `PREDICTION_LABELS` marketing map (23 tipi) con nomi italiani (es. "Festival dei Gol", "Gara Tattica"), `pick-label-marketing` mostrato nelle tip card; (5) skill `/fr3-generate-fantacalcio` — AI genera picks settimanali via fantasy_score model (goals_per_game × FDR × form × starter_certainty), max 4 API call, reasoning in italiano, supporta `--dry-run` e `--force`; (6) `styles.css` — ~140 nuove regole CSS per Fantacalcio Hub e pick-label-marketing; (7) CLAUDE.md aggiornato con nuovo skill e comandi.

- **feat(tips): nuovi mercati corner/card + nomi marketing** — Esteso il motore di previsione con mercati Corner e Cartellini: (1) `api/_lib/api-football.js` — `getTeamStatistics()` (chiamata `/teams/statistics`, restituisce corners_estimate.per_game via shots×0.42, cards.total_per_game) + estrazione odds Corner (bet ID 45) e Cards (bet ID 75) in `getAllOdds()` + mapping in `findOddsForPrediction()`; (2) `api/_lib/prediction-utils.js` — `evaluatePrediction()` esteso con regex per `Corners Over/Under X.5` e `Cards Over/Under X.5`, ritorna `null` se `extras` non disponibili (→ cron salta, settlement manuale); (3) `api/cron-tasks.js` — guard su `null` da `evaluatePrediction`; (4) `fetch-league-data.js` — Step 8: team stats in parallelo con cache in-memory per team ID, attach homeStats/awayStats a ogni match; (5) `fr3-generate-tips/SKILL.md` — valid predictions estese a 23 tipi, sezione CORNER/CARD MODEL in step 2c (formula expected_corners/cards, threshold selection, style adjustments), priority 8 nel Market Waterfall, reasoning format CORNER_CARD_MODEL section, accuracy rules 14–15; (6) `fr3-settle-tips/SKILL.md` — settlement logic per Corners/Cards con ricerche dedicate (SofaScore/FlashScore), counting rules, result format "C:10" e "K:5", void policy se statistiche non trovate.

### Fixed

- **fix(mobile): menu hamburger iOS — testo bianco, scroll sezione corretto, no page-jump al chiusura** — 3 bug risolti: (1) colore testo link nav mobile troppo scuro: aggiunto `color: #ffffff` sui link `.nav-links a:not(.btn)` nel media query mobile; (2) clic su voce menu non scrollava alla sezione: wrappato `window.scrollTo` in `setTimeout(50ms)` in `script.js` così il calcolo `getBoundingClientRect` avviene dopo che il menu è chiuso; (3) secondo tap hamburger mostrava la home invece di chiudere il menu — causa: iOS Safari ignora `body.overflow:hidden` e resetta lo scroll a 0 → implementato iOS scroll lock pattern in `shared.js`: `position:fixed + top:-scrollY` su body all'apertura, ripristino con `window.scrollTo(0, savedScrollY)` alla chiusura.

- **fix(ui): rimozione bordo grigio su scroll alla sezione Piani** — Lo scroll verso sezioni anchor usava un offset `navHeight + 20px`, che lasciava 20px dello sfondo di `.stats-section` (`#12121a`) visibile sotto la navbar quando si navigava a `#pricing`. Rimosso i 20px extra: la sezione ora si posiziona esattamente sotto la navbar, eliminando la striscia grigia.

- **fix(ui): lingua inglese mostra globe 🌐 invece della bandiera 🇬🇧** — Il toggle lingua usava la bandiera del Regno Unito per rappresentare la lingua inglese, ma l'inglese non è lingua esclusiva della Gran Bretagna. Sostituita con l'emoji 🌐 (globe), soluzione adottata da Notion, Vercel, Linear, Stripe e altri. Nessuna modifica all'HTML (la label "EN" rimane invariata).

### Added

- **CLAUDE.md: Workflow Orchestration & Task Management** — Integrati insights da CLAUDE.md di riferimento: nuova sezione `## Workflow Orchestration` con 6 sottosezioni (Plan Node Default, Subagent Strategy, Self-Improvement Loop, Verification Before Done, Demand Elegance, Autonomous Bug Fixing); nuova sezione `## Task Management` con workflow a 6 step e riferimenti a `tasks/todo.md` / `tasks/lessons.md`; `## Code Quality Principles` consolidata con "Simplicity with minimal impact". `tasks/` aggiunto a `.gitignore`.

- **#16 — Business Plan & Market Analysis** — Documento BUSINESS_PLAN.md con analisi di mercato (mercato scommesse sportive IT ~€20B, 3.5M utenti attivi), modello di business (TAM/SAM/SOM, unit economics, revenue projections), panorama competitivo, stack tecnologico, roadmap Q1-Q3 2026, opportunità partnership centro scommesse (3 opzioni: white-label, revenue share, investimento).

- **#13 — Legal upgrade: multi-campionato, Telegram, trasferimenti internazionali, terminazione** — Aggiornate tutte e 3 le pagine legali al 24 febbraio 2026: `terms.html` — sezione 2 ora copre tutti e 7 i campionati (prima diceva solo Serie A), aggiunta sezione terminazione account (10) e trasferimenti dati internazionali con SCC/PCI-DSS (11), rinumerazione sezioni 10→12 e 11→13→14; `privacy.html` — aggiunta voce Telegram nei dati raccolti (User ID, username, chat ID — opzionali, revocabili), nuova sezione 5bis sui trasferimenti internazionali (Supabase/Stripe/Vercel con garanzie SCC), fornitori rinominati con sede USA; `cookies.html` — aggiornamento data.

### Changed

- **feat(engine): injury intelligence — rosa titolare, impatto giocatori, qualità backup** — Il motore ora recupera infortuni e squalifiche direttamente dall'API Football (`GET /injuries?fixture={id}`) come dati strutturati — zero web search, zero token aggiuntivi. Per ogni partita: (1) infortuni confermati/squalifiche/dubbi con tipo e motivo; (2) statistiche stagionali dei giocatori coinvolti (`GET /players?team={id}&season`, cache in-memory per efficienza); (3) calcolo automatico di `impactLevel` (HIGH/HIGH_GK/MEDIUM/LOW) basato su G+A% del team e participation rate; (4) `backupQuality` (ADEQUATE/PARTIAL/WEAK) basato sulla qualità del sostituto naturale nella stessa posizione; (5) `xGoalsHint` con la rettifica percentuale da applicare al modello xGoals. SKILL.md aggiornato: Search #2 ora skippata se `match.injuries` disponibile da API; nuova formula "Injury impact on xGoals" nel step 2c (tabella HIGH/MEDIUM/LOW × backup quality); DATA_SUMMARY con sezione infortuni strutturata. Copertura: ~97% degli assenti reali (presenze confermate 24-48h prima); cambi last-minute (<3%) non mitigabili con dati pre-match.

- **feat(engine) #160 — Market Waterfall: pensiero laterale su quote basse** — Quando le quote 1X2 del favorito sono troppo basse (<1.50) o l'edge è insufficiente, il motore ora DEVE scorrere tutti e 14 i mercati validi prima di skippare una partita (waterfall ordinato per priorità: double chance → volume basso → BTTS → O/U 2.5 → exact win → X → combo). Aggiunta sezione "Step 5b — Market Waterfall" nel SKILL.md con tabella waterfall, logica context-specific (secondo leg UCL disperato, match di gestione, derby), e accuracy rule #13. Quality gate 2e aggiornato: SKIP solo dopo aver esaurito il waterfall intero, non dopo il primo mercato fallito. Issue assegnata a @francescorinaldi per implementazione parallela in `api/_lib/prediction-engine.js`.

### Fixed

- **fix(ux): smooth scroll e transizioni tab** — (1) Aggiunto `scroll-margin-top: 80px` alle sezioni target (`#tips`, `#stats`, `#pricing`, `#faq`) per compensare la navbar fissa durante lo scroll; (2) Lo smooth scroll JS ora rispetta `prefers-reduced-motion` usando `behavior: 'auto'` quando l'utente ha disabilitato le animazioni; (3) Aggiunta animazione fade-in (`dashFadeIn`) ai pannelli tab del dashboard per transizioni fluide al cambio tab. Tutte le animazioni sono automaticamente disabilitate dal media query `prefers-reduced-motion: reduce` esistente.

- **fix(dashboard): click sul selettore campionati nel tab Schedine è ora no-op** — Sul tab "Schedine" il selettore campionati è visibile ma un click non deve produrre alcun effetto (le schedine sono cross-league). Aggiunto early-return nel click handler di `setupLeagueSelector`: se il tab attivo è `schedine`, il click viene ignorato — nessun cambio di `currentLeague`, nessuna chiamata API, nessun aggiornamento visuale.

- **fix(dashboard): league selector visibile su tutti i tab incluso Schedine** — Il selettore campionati veniva nascosto quando l'utente cliccava sul tab "Schedine", causando un layout instabile. La condizione `target === 'schedine' ? 'none' : ''` è stata corretta in `target === 'account' ? 'none' : ''` — il selector rimane sempre visibile su Tips, Schedine e Storico, e viene nascosto solo quando si apre il pannello account (⚙️). Aggiunta anche gestione coerente nel `setupSettingsToggle`: il selector viene nascosto all'apertura del pannello account e ripristinato alla chiusura.

- **fix(webhook): bodyParser non veniva disabilitato — firma Stripe falliva su tutti gli eventi** — `module.exports.config = { api: { bodyParser: false } }` era dichiarato PRIMA di `module.exports = async function handler(...)`. In Node.js/CommonJS la seconda riga sovrascrive completamente `module.exports`, eliminando silenziosamente la proprietà `config`. Risultato: Vercel abilitava il bodyParser, consumava il request body prima di `getRawBody`, la verifica della firma Stripe riceveva un buffer vuoto e restituiva 400 su quasi tutti gli eventi. Fix: la riga `module.exports.config = {...}` è stata spostata DOPO il blocco `module.exports = handler`, così viene aggiunta come proprietà sulla funzione già esportata.

- **fix(billing): rimozione suggerimento "prova con carta di debito"** — La sessione Stripe Checkout non specificava `payment_method_types`, quindi Stripe usava la modalità automatica e, in caso di rifiuto carta, suggeriva alternative come "prova con carta di debito". Aggiunto `payment_method_types: ['card']` alla creazione della sessione: Stripe mostra ora solo il messaggio di rifiuto generico senza proporre metodi alternativi.

- **fix(billing): cancellazione immediata da Customer Portal + gestione cancel_at_period_end** — Il Customer Portal Stripe era configurato con `mode: at_period_end`: l'utente vedeva la cancellazione ma il tier restava PRO perché il webhook riceveva `customer.subscription.updated` con `cancel_at_period_end: true`, non `customer.subscription.deleted`. Fix in due parti: (1) Configurazione Stripe Customer Portal aggiornata via API a `mode: immediately` — la cancellazione diventa istantanea e il webhook corretto (`customer.subscription.deleted`) si attiva subito; (2) `stripe-webhook.js` — `handleSubscriptionUpdated` ora intercetta `cancel_at_period_end === true` e agisce come se fosse una cancellazione, abbassando il tier a `free` e revocando l'accesso Telegram, garantendo resilienza anche in caso di future riconfigurazioni del portal.

- **fix(billing): banner pagamento fallito vs webhook lento** — Dopo `pollForSubscriptionUpgrade`, se il polling si esaurisce senza trovare un tier aggiornato, viene ora verificata l'esistenza di una subscription attiva in Supabase: se assente (pagamento fallito) mostra "Il pagamento non è andato a buon fine"; se presente (webhook solo lento) mostra "Abbonamento attivato, ricarica la pagina". Evita il banner "Abbonamento attivato!" su checkout di carta 3DS che fallisce.

- **test(stripe): allineamento test a fix Stripe TEST mode (#167)** — Aggiornati i test `stripe-webhook.test.js` e `billing.test.js` per riflettere i 6 fix applicati durante il collaudo manuale Stripe: (1) rimosso `stripe.subscriptions.retrieve` da test checkout (la chiamata è stata rimossa dal handler); (2) rimosso `current_period_end` dall'upsert atteso (viene ora dal successivo `subscription.updated`); (3) aggiunto `details` nel payload errore 500; (4) aggiunto `payment_method_types: ['card']` negli assert di checkout; (5) aggiornato `return_url` del portal con `?from=portal`. Aggiunti 2 nuovi test: `cancel_at_period_end` trattato come cancellazione + `subscription.updated` senza `current_period_end`.

- **fix(billing): polling post-checkout + auto-refresh dopo Customer Portal** — Il dashboard mostrava ancora "free" dopo un checkout riuscito perché il webhook Stripe può arrivare con qualche secondo di ritardo rispetto al redirect. Fix in due parti: (1) `dashboard.js` — quando l'URL contiene `?checkout=success`, imposta un flag `checkoutJustCompleted`; dopo `loadProfile`, se il tier è ancora free, avvia `pollForSubscriptionUpgrade` (fino a 8 tentativi × 2s) che aggiorna badge e UI non appena il webhook aggiorna Supabase; se il tier è già aggiornato mostra subito il banner di successo. (2) `billing.js` — il `return_url` del Customer Portal ora include `?from=portal`; quando il dashboard rileva questo parametro chiama `loadProfile()` dopo 3s per recepire aggiornamenti al tier (es. cancellazione) senza richiedere un hard refresh manuale.

- **fix: null-guard su updateSubscriptionUI — elimina crash "errore di connessione"** — La funzione `updateSubscriptionUI` in `dashboard.js` settava proprietà (textContent, onclick, style) su elementi DOM senza null-check. Se il browser aveva in cache una versione HTML più vecchia o un elemento veniva rinominato, il crash veniva silenziosamente catturato dal catch e mostrava il fuorviante banner "Errore di connessione. Ricarica la pagina." (che non era un errore di rete). Fix: null-guard su tutti e 10 gli elementi DOM (`subTierBadge`, `upgradeSection`, `upgradeProBtn`, `upgradeVipBtn`, `manageSubBtn`, `manageSubRow`, `subStatusDisplay`, `subRenewalDisplay`, `subTier`, `subStatus`, `initials`, `.upgrade-card--pro/vip`, `.upgrade-section__title`). Rimosso `showAlert` dal catch — ora solo `console.error` per debug senza allarmare l'utente.

- **fix: checkout redirect perso dopo Google OAuth** — Quando un utente non autenticato cliccava "Scegli PRO" o "Diventa VIP", veniva inviato a `/auth.html` senza parametri. Dopo il login Google, Supabase reindirizzava a `/dashboard.html` (hardcoded) perdendo l'intent di acquisto. Fix in 3 file: `index.html` — i pulsanti PRO/VIP ora puntano a `/auth.html?plan=pro` e `/auth.html?plan=vip`; `supabase-config.js` — `signInWithOAuth` accetta un `redirectPath` opzionale da appendere a `/dashboard.html` (es. `?upgrade=pro`); `auth.js` — legge `?plan=` dall'URL, costruisce `oauthRedirectPath = '?upgrade=plan'` e lo passa sia a Google OAuth che al redirect di sessione già attiva. Il `handleAutoCheckout` in `dashboard.js` già leggeva `?upgrade=` e avviava il checkout: nessuna modifica necessaria lì.

- **Fix #157 — quality gate pronostici: EV, market selection, confidence-probability** — Post-mortem Heidenheim 3-3 Stuttgart (tip "2" a confidence 73% con EV +0.3%, perso). Tre nuovi filtri hard in `api/_lib/prediction-engine.js`: (1) EV < 8% → skip automatico con log; (2) prediction '1'/'2' con P < 70% → skip e suggerisce X2/1X; (3) confidence > predicted_probability + 5pp → clamp automatico. Aggiunto `predicted_probability` al JSON schema della generazione batch. `SYSTEM_PROMPT` aggiornato con 4 nuove regole (market selection, confidence ceiling, EV minimo, underdog casa in zona retrocessione). Stesse regole trasferite nella skill `fr3-generate-tips`: quality gate analista (2e), pre-decision checklist, accuracy-first rules (11-12), e reviewer steps 3-4 con reject automatico su market selection sbagliato e confidence-probability coupling.

- **Fix #156 — ordinamento cronologico tip su Telegram** — I messaggi Telegram mostravano i tip in ordine di confidenza (criterio di selezione) invece che per orario della partita. Fix in `api/_lib/telegram.js`: `formatDigest` ora ordina i tip per `match_date ASC` prima di raggrupparli per lega; l'ordine delle leghe nel messaggio rispecchia l'orario del primo match di ciascuna. Fix anche nella skill `fr3-generate-tips` (SKILL.md): la query del reviewer ora usa `ORDER BY match_date, league` invece di `ORDER BY league, match_date`.

### Changed

- **#153 — Track record start date transparency** — After removing 33 pre-calibration tips (7-8 Feb), the track record section now shows the exact start date of verified tracking. API `GET /api/stats?type=track-record` returns new `track_record_since` field (ISO date of oldest settled tip). Landing page displays "Track record dal {date} — N pronostici verificati" below the section header, with locale-aware formatting (IT/EN). New `.section-meta` CSS class for secondary metadata text.

### Fixed

- **Fix #1 — testo bookmaker fuorviante** — Rimosso "Registrandoti tramite i nostri link potrai ottenere bonus di benvenuto esclusivi" dalla FAQ e "I link ai bookmaker sono link di affiliazione" dal footer, poiché non esistono ancora URL di affiliazione reali. Il testo era potenzialmente fuorviante per gli utenti e non conforme. Aggiornati `public/index.html` e `public/i18n.js` (IT + EN).

- **Fix #70 — domini hardcoded** — Introdotto `SITE_URL = process.env.SITE_URL || 'https://winningbet.it'` in `api/billing.js` (ALLOWED_ORIGINS + getOrigin fallback) e `api/_lib/email.js` (link dashboard nelle email). Aggiunto `SITE_URL` a `.env.example`. Semplifica il deploy su domini custom e ambienti staging.

### Security

- **Stripe error message leak** — Removed `err.message` from client-facing error response in `api/billing.js` checkout handler. Internal Stripe error details (API key issues, rate limits, etc.) are still logged server-side via `console.error` but no longer exposed to the client. Fixes failing billing test.

### Added (Wave 3 — New Features)

- **3.1 Countdown landing page** — "Prossimi pronostici tra Xh Ym" nella sezione tips quando non ci sono pronostici. Usa `fetchAPI` per recuperare il prossimo match, aggiornamento ogni 60s, auto-refresh dopo il countdown. Gestisce `currentLeague === 'all'` con fallback esplicito a Serie A.
- **3.2 Share prediction** — Bottone condividi su tip card con dropdown Copia/WhatsApp/Telegram. `buildShareDropdown()` centralizzato in `shared.js`, integrato in landing page (`script-builders.js`) e dashboard (`dashboard-renderers.js`). Clipboard API con guard per contesti non-HTTPS, chiusura con Escape e click esterno, ARIA completo.
- **3.3 Calcolo Bankroll** — Calcolatore stake nel tab Account dashboard. Staking a percentuale fissa (2-5% del bankroll) scalato per confidence (60%→2%, 90%→5%, interpolazione lineare). Esclude tip già iniziate/concluse. Validazione 10-100.000€. Tabella risultati con summary (investimento totale, bankroll rimanente, % investito).

### Added (Wave 2 — Polish)

- **2.1 Skeleton loading** — Added `.skeleton`, `.skeleton-card`, `.skeleton-match`, `.skeleton-history` CSS with `@keyframes shimmer` animation. `buildSkeletonCards(container, count, variant)` in `shared.js`. Replaced all initial HTML spinners in `index.html` and `dashboard.html` with skeleton placeholders. JS fetches show skeletons before API calls. Removed `showGridLoading()` from dashboard.js. Respects `prefers-reduced-motion`.
- **2.2 Retry con backoff** — Added `retryWithBackoff(fn, opts)` in `shared.js` with exponential backoff (1s → 2s → 4s), max 3 retries, 10s timeout via `AbortController`. Wrapped all primary API fetches in `script.js` (`loadTips`, `loadMatches`, `loadResults`) and `dashboard.js` (`loadTodayTips`, `loadHistory`, `loadSchedule`).
- **2.3 Empty states informativi** — Added `buildEmptyState(container, opts)` in `shared.js` with SVG icons (calendar, clipboard, trophy, search), title, subtitle, optional action button. Replaced `setEmptyState` calls in `script.js` with context-specific messages and icons. `.empty-state` CSS component.
- **2.4 Timestamp "Aggiornato alle HH:MM"** — Added `setLastUpdated(containerId, refreshFn)` in `shared.js`. Shows locale-aware time + clickable refresh icon (↻). Applied after all successful fetches in both landing and dashboard. `.last-updated` CSS.
- **2.5 Toast system** — Added `showToast(message, type, duration)` in `shared.js`. Fixed container bottom-right (desktop), full-width mobile. Types: success (green), error (red), info (gold). Slide-in animation, auto-dismiss 3s, click to dismiss. `aria-live="polite"` for accessibility. Respects `prefers-reduced-motion`.
- **2.6 Tab state persistence** — Dashboard active tab saved in `localStorage('wb_dashboard_tab')`. Restored on page load via simulated click after listeners are attached. Skips restore if saved tab is 'tips' (default).
- **2.7 Notification badge** — Changed `.notif-badge` background from `var(--gold)` to `var(--red)`, white text, added `notif-pulse` animation (pulsing red box-shadow). Respects `prefers-reduced-motion`.

### Added (Wave 1 — Accessibility & UX Critical Fixes)

- **1.1 Error handling con retry UI** — Added `setErrorState(container, message, retryFn)` to `shared.js`: warning SVG icon + error message + "Riprova" button. Replaced all silent `.catch()` blocks in `loadTips`, `loadMatches`, `loadResults`, `loadTrackRecord` (script.js) and `loadTodayTips`, `loadHistory`, `loadSchedule` (dashboard.js). Added `.error-state` CSS with red warning icon, descriptive message and retry CTA.
- **1.2 :focus-visible su tutti gli elementi interattivi** — Added global `:focus-visible` rule with `outline: 2px solid var(--gold); outline-offset: 2px` after Reset & Base. Added `:focus:not(:focus-visible) { outline: none }` to suppress ring for mouse users. Single rule covers all interactive elements: `.btn`, `.filter-btn`, `.league-btn`, `.dash-tab`, `.faq-question`, `.hamburger`, inputs.
- **1.3 Mobile menu: backdrop, ESC, slide animation** — Replaced `display: none/flex` toggle with `transform: translateX(100%)/translateX(0)` + `visibility` for smooth slide-in animation. Added `.nav-backdrop` overlay (created dynamically by `initMobileMenu()`). ESC key closes menu and returns focus to hamburger. Backdrop click closes menu. `aria-expanded` on hamburger updated on toggle.
- **1.4 prefers-reduced-motion** — Added `var REDUCED_MOTION` constant in `shared.js`. CSS `@media (prefers-reduced-motion: reduce)` disables all animations (particles hidden, matches ticker stopped, reveal instant). `animateCounter()` sets final value immediately without animation. Reveal observer adds `.visible` instantly. `initParticles()` renders single static frame instead of RAF loop.
- **1.5 ARIA labels e live regions** — Added `aria-live="polite"` + `aria-label` on `#matchesScroll`, `#tipsGrid`, `#resultsList`, `#dashTipsGrid`, `#schedineGrid`, `#dashHistoryList`. Added `role="status"` + `aria-label` on all `.loading-spinner` elements. Dashboard tabs: `role="tablist"` on container, `role="tab"` + `aria-selected` + `aria-controls` on each tab, `role="tabpanel"` + `aria-labelledby` on each panel. FAQ: `aria-expanded` on all `.faq-question` buttons (initial `false`, toggled by JS). Hamburger: `aria-expanded` + `aria-controls` managed by `initMobileMenu()`.
- **1.6 Indicatori status colorblind-safe** — Added `aria-label` with human-readable text to all history status icons in `renderHistory()`: ✓ → `aria-label="Vinto"`, ✗ → `aria-label="Perso"`, — → `aria-label="Annullata"`, ● → `aria-label="In corso"`. Form dots (W/D/L) were already colorblind-safe via letter text content.

### Removed

- **Dead `<canvas id="particles">` in dashboard** — Removed unused particle canvas element from `dashboard.html`. The dashboard never initializes `initParticles()`, so the canvas was a no-op consuming a compositing layer. (#78)

### Refactored

- **Split god file `script.js`** — Extracted 17 pure/stateless builder functions (DOM helpers, card builders, random generators, access control) into new `public/script-builders.js`. Reduces `script.js` from 1398 → ~980 lines (~30% reduction). Functions loaded as global `var` declarations before the main IIFE. (#68)
- **Split god file `dashboard.js`** — Extracted 5 render functions (`dashRenderTipsGrid`, `dashRenderSchedule`, `dashRenderHistory`, `dashRenderNotifications`, `dashBuildBetTrackingUI`) into new `public/dashboard-renderers.js`. Original functions replaced with thin delegation wrappers that pass closure dependencies via context objects. Reduces `dashboard.js` from 2383 → ~1600 lines (~33% reduction). (#67)

### Fixed

- **Floating promises in script.js (H-05)** — Added `.catch()` handlers to `loadMatches()`, `loadResults().then(loadTrackRecord)`, and `loadTipsFromAPI()` in both the init section and league selector callback. Unhandled rejections now log warnings instead of silently failing.
- **Double tips fetch on homepage (M-02)** — `loadTipsFromAPI()` was called unconditionally at page init AND again by `loadHomepageUserTier()` for authenticated users, causing duplicate API calls. Tips are now loaded only after the auth check: via `loadHomepageUserTier` if authenticated, or directly if not. Fallback for missing `SupabaseConfig`.

### Refactored

- **Copilot agents: 5-agent chain → 2-agent architecture** — Replaced PM, Planner, Implementer, WinningBet-Dev, and Reviewer with two self-contained agents: **Coder** (all-in-one: plan, implement, verify, self-review) and **Reviewer** (code quality with direct fix capability). Eliminates ~50% timeout failures on GitHub.com's 10-minute coding agent limit by removing multi-agent handoff overhead. Reviewer now has `edit` and `execute` tools to fix issues directly instead of bouncing back.

### Changed

- **Locale-aware date formatting** — Replaced 8+ hardcoded `'it-IT'` locale strings with dynamic `getLocale()` in frontend files (`script.js`, `dashboard.js`). Added `getLocale()` utility to `i18n.js` that returns `'it-IT'` or `'en-GB'` based on the user's language setting. Hardcoded Italian day abbreviations in `formatMatchDate()` now use the i18n `days` translation key. Backend files (`email.js`, `prediction-engine.js`) use named constants (`EMAIL_LOCALE`, `BACKEND_LOCALE`) for maintainability.

### Docs

- **`shared.js` var rationale comment** — Added explanatory comment above `/* eslint no-var: "off" */` in `public/shared.js` documenting why `var` is intentionally used for global scope in the non-module script pattern.
- **Copilot instructions accuracy** — Fixed outdated file counts in `.github/copilot-instructions.md`: HTML pages 3→6, JS files 7→6, migrations 9→14, tests 21→23

### Added

- **Dashboard profile/subscription redesign** — Complete overhaul of the Account tab in `dashboard.html`. New profile hero banner with avatar (Google photo or initials), gold-ringed tier badge, member-since date. Side-by-side PRO/VIP upgrade plan cards with feature lists, pricing, and "Consigliato" badge on PRO. Manage subscription row for active subscribers. ~370 lines of new CSS with gradient backgrounds, glow effects, hover transforms, and responsive breakpoints.
- **Auto-checkout from home pricing** — `script.js: updatePricingForAuth()` redirects logged-in users clicking PRO/VIP pricing buttons directly to `/dashboard.html?upgrade=pro|vip` instead of `/auth.html`. Dashboard reads `?upgrade=` param and auto-triggers Stripe checkout via `handleAutoCheckout()`.
- **Language toggle on legal pages** — Added lang toggle button and `i18n.js` script to terms, privacy, and cookies pages for consistency with main site.
- **Centralized tier pricing configuration** — Added `TIER_PRICES` object to `public/shared.js` with structured pricing data (amount, currency, display format) for PRO (€9.99/mese) and VIP (€29.99/mese) tiers. Eliminates hardcoded prices across 5+ files. Prices now dynamically injected via JavaScript in `index.html`, `dashboard.html`, and `terms.html`. Single source of truth prevents inconsistencies when updating prices.

### Changed

- **Email sender address** — Default SMTP sender changed from `info@winningbet.it` to `support@winningbet.it` in `api/_lib/email.js`
- **Contact email in terms** — `supporto@winningbet.it` → `support@winningbet.it` in `public/terms.html`
- **Billing ALLOWED_ORIGINS** — Added `https://winningbet.vercel.app` to `api/billing.js` allowed origins to fix checkout redirect issues
- **Stripe checkout error reporting** — `api/billing.js` now returns actual Stripe error message to frontend instead of generic Italian error. Logs `err.type` and `err.code` alongside `err.message`. Also logs `PRICE_IDS` for debugging.
- **Dashboard checkout flow** — Rewrote `startCheckout()` to use direct `fetch` instead of `authFetch` wrapper, with detailed error messages and button disable/re-enable. Uses DOM manipulation instead of innerHTML (XSS safety).
- **Google avatar support** — `loadProfile()` now detects Google avatar from `user_metadata.avatar_url` or `user_metadata.picture` and displays it in the profile hero.
- **SMTP transporter reset on error** — `api/_lib/email.js` nulls `_transporter` on SMTP error for automatic reconnection on next send.
- **Legal pages cleanup** — Removed unused `<canvas id="particles">` from terms, privacy, and cookies pages. Removed duplicate section header comment in `shared.js`.

### Fixed

- **localStorage access not wrapped in try/catch** — Wrapped all 8 `localStorage.getItem()`/`setItem()` calls in `public/shared.js`, `dashboard.js`, and `i18n.js` with `try/catch` to prevent crashes in Safari private browsing, storage quota exceeded, or restricted iframe contexts.
- **Hardcoded copyright year** — Replaced static "2026" with dynamic year via new `initCopyrightYear()` in `shared.js`. Applied to all 5 footers.
- **#58 H-01** — `dashboard.js: checkAuth()` wraps `getSession()` in try/catch with null-safe access
- **#59 H-02** — `script.js` all floating promises now have `.catch()` handlers
- **#60 H-03** — `auth.js: getSession()` has `.catch()` handler and null-safe property access
- **#61 H-04** — `script.js` SupabaseConfig session check uses null-safe access
- **#63 H-06** — `dashboard.js` notification polling interval stored and cleared on `beforeunload`
- **#64 H-07** — `shared.js: initParticles()` pauses animation when tab is hidden via `visibilitychange`
- **#73 M-12** — `script.js` eliminates double tips fetch on homepage init
- **#76 M-15** — `script.js` season string computed dynamically instead of hardcoded
- **#80 L-02** — `email.js` SMTP error log includes `err.responseCode` and `err.command`
- **#81 L-03** — `email.js: buildDailyDigest()` guards `tip.confidence` against null/undefined
- **Stripe checkout "errore di rete"** — Dashboard upgrade buttons failed silently because `authFetch` swallowed errors. Replaced with direct fetch + explicit error handling.
- **Stripe connection error on Vercel** — Production `STRIPE_SECRET_KEY` had wrong content (130 chars vs 108). Re-added all 4 Stripe env vars cleanly from local `.env`.
- **Home pricing redirect loop** — Logged-in users clicking pricing buttons were sent to `/auth.html` instead of checkout. Now redirects to dashboard with auto-checkout param.

### Added

- **Performance Analytics skill** (`/fr3-performance-analytics`) — Deep track record analysis: hit rate, ROI, avg odds, per-league/type/confidence/odds-band breakdowns, rolling trends, bias detection. Generates actionable recommendations as JSONB. Stores snapshots in `performance_snapshots` table. Flags: `--store`, `--period N`.
  - Migration `012_performance_snapshots.sql` — New table with UNIQUE on (snapshot_date, period_days), JSONB columns for breakdowns and recommendations
- **Strategy Optimizer skill** (`/fr3-strategy-optimizer`) — Prescriptive strategy engine: analyzes winning vs losing patterns, finds optimal parameter mix, generates concrete `strategy_directives` with HIGH/MEDIUM/LOW impact and 30-day auto-expiry. 8 directive types (avoid/prefer prediction types and leagues, adjust confidence/odds/edge thresholds). Flag: `--dry-run`.
  - Migration `013_strategy_directives.sql` — New table with partial indexes on is_active and expires_at
- **Pre-Match Research skill** (`/fr3-pre-match-research`) — Dedicated deep research engine running BEFORE tip generation. Per match: 7-8 web searches gathering lineups, injuries, xG, referee stats, weather, motivation, market intelligence. Caches in `match_research` table with completeness scoring (0-100). Flags: `[league-slug]`, `--force`.
  - Migration `014_match_research.sql` — New table with UNIQUE on (match_id, league), partial indexes on fresh status

### Changed

- **Email: SendGrid → Nodemailer SMTP** — Migrated `api/_lib/email.js` from SendGrid API to Nodemailer with custom SMTP server. Same `sendEmail()` interface, no breaking changes for callers. New env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Removed: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`. Updated all tests.
- **Cookie consent banner on all pages** — Moved `initCookieBanner()` from `script.js` to `shared.js`. Added cookie banner HTML to auth, dashboard, terms, privacy, and cookies pages. Legal pages (terms, privacy, cookies) now load `shared.js` instead of inline hamburger script.
- **Copilot setup steps workflow** — Updated `copilot-setup-steps.yml` triggers: added `push` and `pull_request` (scoped to workflow file path) for CI validation, moved `permissions` to job level per GitHub best practices
- **`/fr3-generate-tips` — V4 Comprehensive Overhaul**
  - **Minimum odds raised**: 1.20 → 1.50 (exception: double chance 1X/X2 at 1.30)
  - **Minimum EV 8%**: `EV = predicted_probability × odds - 1`, portfolio avg must exceed 10%
  - **Poisson goal distribution** (mandatory): scoreline grid P(home=i, away=j) for 0-5, derives all market probabilities. Analysts MUST start from Poisson base rates.
  - **ELO-lite power rating**: `team_elo = 1500 + (ppg - league_avg_ppg) × 200 + gd_per_game × 50`, flags divergence > 15pp from Poisson
  - **Exponential decay momentum**: 0.95^n weighting over last 6 matches with RISING/FALLING/STABLE classification (was simple last-3 > last-5)
  - **Pre-match research cache**: analysts check `match_research` table first; fresh data (< 6h, >= 70% completeness) eliminates web searches
  - **Web research restructured**: 5 → 7 targeted searches (added xG projections from Understat/FBref, dedicated referee stats, separated tactical and statistical previews)
  - **Pre-decision checklist**: 7 mandatory checks before generating any tip (quantitative data? Poisson base? draw considered? bookmaker info edge? robust at lower odds? strategy directives? data quality?)
  - **Value-hunting EV instruction**: 65% @ 2.00 (EV +30%) is ALWAYS better than 80% @ 1.25 (EV 0%)
  - **Shared context expanded**: 3 → 7 queries (added per-league xGoals accuracy, lessons from recent losses, strategy directives, performance snapshot recommendations)
  - **Reviewer: 3 new checks**: ROI projection (reject EV<8%, portfolio avg>10%), odds distribution (reject >50% under 1.50), historical pattern cross-reference (check recent losing patterns via SQL)
  - **Reasoning format updated**: added POISSON_BASE_RATES section, EV in EDGE_ANALYSIS, strategy directives compliance check, expanded QUALITY_GATE with EV and odds thresholds
- **`/fr3-settle-tips` — Backfill capability**
  - Added `--backfill` flag: generates retrospectives for already-settled tips missing them
  - Uses LEFT JOIN to find tips without retrospectives, skips web search for scores (already in DB)
- **`/fr3-update-winning-bets` — Expanded to 7-phase pipeline**
  - Was: Settle → Generate → Schedine → Summary (4 phases)
  - Now: Analytics → Optimize → Settle → Research → Generate → Schedine → Summary (7 phases)
  - New flags: `--skip-analytics`, `--skip-optimize`, `--skip-research`
  - Smart pre-checks: Analytics (snapshot today + min 10 tips), Optimize (directives <7 days + min 20 tips), Research (fresh research + upcoming matches)

### Added

- **SEO: robots.txt** — `public/robots.txt` with allow all, disallow `/api/`, sitemap link
- **SEO: sitemap.xml** — `public/sitemap.xml` with all 6 public pages (/, auth, dashboard, terms, privacy, cookies)
- **SEO: Open Graph + Twitter Card meta tags** — Added to all 6 HTML pages (og:title, og:description, og:image, og:url, og:type, og:locale, twitter:card). Placeholder OG image at `/og-image.png` (1200x630, to be created)

### Added

- **Agent Team Architecture for Tip Generation** — `/fr3-generate-tips` now uses Claude Code Agent Teams to parallelize league analysis. See [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md) for full architecture.
  - **7 parallel analyst teammates** — One specialist per league (serie-a, champions-league, la-liga, premier-league, ligue-1, bundesliga, eredivisie), all running simultaneously. Wall-clock time drops from ~30min to ~12min.
  - **Reviewer teammate** — Senior quality reviewer validates ALL tips before they go live. Runs 8 checks: cross-league correlation, confidence inflation, edge consistency (8pp min), draw awareness (15% floor), prediction type diversity, portfolio EV, stale odds spot check, weather impact.
  - **Draft → Pending workflow** — Analysts insert tips as `draft`, reviewer promotes to `pending` (approved), adjusts confidence, or deletes (rejected). No tip reaches users without review.
  - **`tips.status` CHECK constraint** — Added `draft` to allowed values (`pending`, `won`, `lost`, `void`, `draft`). Migration `011_draft_status.sql`.
  - **Partial index `idx_tips_status_draft`** — Fast queries during review phase.
  - **League-specific tuning** — Each analyst receives contextual intelligence: Serie A (high draw rate), Champions League (group vs knockout), La Liga (top-heavy), Premier League (unpredictable), Ligue 1 (PSG skew), Bundesliga (high-scoring), Eredivisie (volatile).
- **Accuracy improvements embedded in Agent Team**:
  - 5th web search per match: weather conditions (affects O/U and BTTS)
  - Draw probability floor of 20% (counters draw blindness — our biggest error category)
  - Momentum scoring: last 3 matches weighted 2x more than matches 4-5
  - Fixture congestion check in external factors (point 9 of 10-point framework)
  - Cross-league correlation detection (reviewer checks for correlated outcomes)
  - Stale odds detection via live web search spot checks
  - Portfolio expected value optimization

- **Retrospective Learning System** — Closed-loop feedback that learns from past predictions and feeds insights into future generation. See [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md) for full architecture.
  - **`tips.reasoning` column** — Stores structured chain-of-thought analysis (data summary, probability assessment, edge analysis, key factors, decision rationale) for retrospective comparison
  - **`tips.predicted_probability` column** — Raw analyst probability estimate, compared against bookmaker implied probability to measure edge
  - **`tip_retrospectives` table** — One row per settled tip with post-mortem analysis: actual result, edge measurement, error classification (12 categories), lesson learned
  - **`prediction_insights` table** — Aggregate patterns detected from retrospectives: biases, calibration drift, weak/strong spots. Auto-expires after 60 days
  - **Migration `010_retrospective_system.sql`** — New columns + 2 new tables + indexes + RLS policies
- **H2H data auto-fetch** — `fetch-league-data.js` now fetches head-to-head data for each match in parallel using `apiFootball.getHeadToHead()`. Data available as `match.h2h` in the generation skill
- **Quality gate** — Matches are SKIPPED (no tip generated) if: no edge > 5pp over bookmaker, < 10 matches played, no prediction reaches 62% probability, or both teams on 3+ losing streaks. Quality over quantity.
- **Aggregate pattern detection** — Settlement now runs 4 diagnostic queries to detect: dominant error categories, confidence miscalibration, prediction type performance trends, and league-specific weak/strong spots. Patterns auto-generate `prediction_insights` entries.
- **Error category taxonomy** — 12 error categories for classifying lost tips: draw_blindness, overconfidence, form_reversal, injury_impact, h2h_ignored, motivation_miss, tactical_shift, goal_pattern_miss, referee_factor, underdog_upset, other

### Changed

- **`/fr3-generate-tips` — Rewritten as Agent Team Orchestrator**
  - Now uses Claude Code Agent Teams: Team Lead orchestrates 7 parallel analyst teammates + 1 sequential reviewer
  - Edge threshold raised from 5pp to 8pp — fewer but higher-quality tips
  - Confidence max lowered from 85 to 80 — conservative until accuracy is proven
  - Web research increased from 4 to 5 searches per match (added weather search)
  - Calibration queries are now GLOBAL (not per-league) and pre-computed once by Team Lead, shared with all analysts
  - Tips inserted as `draft` by analysts, promoted to `pending` by reviewer (was direct `pending` insert)
  - Tier rebalancing is now global across all leagues (was per-league)
  - Added `allowed-tools`: Task, TeamCreate, TeamDelete, TaskCreate, TaskList, TaskGet, TaskUpdate, SendMessage
  - Historical calibration now runs 3 queries instead of 1: per-type accuracy + confidence calibration curve + active retrospective insights
  - Web research increased from 2 to 4 to 5 searches per match (preview, injuries, tactics, H2H/referee, weather)
  - xGoals model upgraded to "Dixon-Coles lite": context-specific attack/defense ratings relative to league average, 60/40 blend of context stats and recent form, H2H adjustment for 5+ meetings
  - 10-point reasoning framework (was 8) — adds tactical matchup, external factors, explicit probability assessment
  - Independent probability assessment: form own estimates BEFORE looking at bookmaker odds, then compare for edge
  - Confidence calibration: raw probability adjusted by empirical curve, clamped to [60, 85] until 100+ settled tips
  - Confidence cap reduced from 95 to 85 (until sufficient track record)
  - Edge-first rule: minimum +5pp over bookmaker implied probability required
  - INSERT now includes `reasoning` and `predicted_probability` columns
  - Summary now shows edge values and skip reasons
- **`/fr3-settle-tips` — Retrospective analysis engine**
  - Now fetches `reasoning` and `predicted_probability` from tips for retrospective comparison
  - Per-tip post-mortem: classifies errors, writes lessons learned, inserts into `tip_retrospectives`
  - For lost tips: WebSearches match reports to identify what actually happened vs what we predicted
  - Aggregate pattern detection: runs 4 diagnostic queries, generates `prediction_insights` entries
  - Summary now includes error categories and retrospective insights section
- **`/fr3-update-winning-bets` — Agent Team awareness**
  - Phase 2 description updated: "generate fresh tips via Agent Team (parallel analysts + reviewer)"
  - Phase 4 summary includes Agent Team stats (analysts completed/failed, reviewer approved/rejected/adjusted)
  - Phase 1 description updated: "settle + generate retrospectives"
  - Phase 4 summary includes retrospective stats (N retrospectives, N active insights)

- **GitHub Copilot Agent Team** — 5-agent "teammates" system for GitHub Copilot coding agent and VS Code custom agents:
  - `PM` — Project Manager, triages GitHub issues, orchestrates the team
  - `WinningBet-Dev` — Fleet Orchestrator for interactive VS Code development
  - `Planner` — Research & architecture specialist (read-only)
  - `Implementer` — Code & build specialist with verification
  - `Reviewer` — Quality & conventions enforcer that drives fixes
  - Peer-to-peer communication — no hub-and-spoke bottleneck
- **`.github/copilot-instructions.md`** — Repo-wide Copilot instructions adapted from CLAUDE.md
- **`.github/instructions/`** — File-type-specific instructions (JavaScript, CSS, SQL) with `applyTo` globs
- **`.github/workflows/copilot-setup-steps.yml`** — Environment setup for GitHub Copilot coding agent

- **`/fr3-update-winning-bets` — Master pipeline orchestrator** — Replaces `/fr3-daily-tips` with a smarter 4-phase pipeline: Settle → Generate → Schedine → Summary. Supports flags: `--force`, `--dry-run`, `--no-send`, `--skip-settle`, `--skip-generate`, `--skip-schedine`. Uses 2-hour buffer for in-progress match detection.

### Changed

- **English hero title updated** — Changed "Don't bet. Invest." to "Don't gamble. Just Invest." for a stronger, more natural tagline.
- **English translation fluency polish** — Improved naturalness across several EN strings: FAQ answers (contractions, phrasing), stats explanations, and cookie banner text.
- **Default league is now Global** (#36) — Homepage loads with "Tutte" (all leagues) selected instead of Serie A. Both the JS state and the HTML active class are set to `all`.
- **Language toggle shows flag only** (#37) — Removed the "IT"/"EN" text label from the lang toggle on all pages (index, dashboard, auth). Now shows only the flag emoji for a cleaner look.
- **"Dati Elaborati" multiplier increased** (#37) — Data points per match increased from 12 to 147 (covers all API data: form, H2H, standings, odds across multiple markets, tactical stats, injury/lineup data). Numbers now reach the thousands for realistic AI-scale impression.
- **Track record shows only wins** (#37) — "I Nostri Risultati" section now filters to only winning tips. Removed `isCloseLoss()` function (dead code).
- **PRO plan: realistic tip count** (#38) — Changed "10+ tips al giorno" to "1-5 tips al giorno in base al calendario sportivo" across pricing cards, tier comparison strip, and i18n dictionaries (IT + EN).

- **Schedine grouping: per-week instead of per-day** — `/fr3-generate-betting-slips` now groups tips by ISO week (Mon-Sun) instead of single calendar day. `schedine.match_date` stores the Monday of the week. Queries, deletion, and insertion all use `date_trunc('week', CURRENT_DATE)`.
- **Dashboard schedine: weekly navigation** — Date picker navigates by week (arrows skip 7 days). Label shows week range (e.g., "9 feb - 15 feb") with "Questa settimana" for the current week. API computes Monday of the week from any date param.

### Removed

- **`/fr3-daily-tips`** — Replaced by `/fr3-update-winning-bets` which adds schedine gap detection, in-progress match awareness, force/dry-run modes, and per-week schedine.

### Fixed

- **Mobile hamburger menu layout broken** — Multiple issues: (1) z-index: hamburger (1001) was below overlay (1002), making close button unreachable; hamburger now 1003. (2) No click-outside-to-close — tapping overlay background now closes menu. (3) Added padding, larger tap targets, better button sizing for mobile. (4) Lang toggle enlarged for mobile. (5) `-webkit-backdrop-filter` added for Safari support.
- **VIP user has no access to Schedina Intelligente** (#40) — Race condition in `dashboard.js`: `loadSchedule()` ran before `loadProfile()` completed, so `profile` was still `null` → tier defaulted to `'free'` → showed upgrade prompt. Fix: `await loadProfile()` before calling `loadSchedule()`.
- **Homepage league switch: stale track record stats** — Win Rate, W-L, Quota Media, ROI and other stat elements were not resetting when switching to a league with no settled tips. Added `resetTrackRecordUI()` that clears all stat DOM elements to default "no data" state before populating with new league data.

### Fixed — Code Review: 75 issues (4 CRITICAL, 20 HIGH, 32 MEDIUM, 16 LOW)

Full code review via `/fr3-code-review` (9 agents). This batch addresses all CRITICAL/HIGH and impactful MEDIUM issues.

**New files:**

- **`public/shared.js`** — Shared frontend utilities extracted from all 3 pages: `initMobileMenu()`, `initParticles(options)`, `initLangToggle()`, `LEAGUE_NAMES_MAP`
- **`api/_lib/prediction-utils.js`** — `evaluatePrediction()` and `buildActualResult()` extracted from cron-tasks.js, shared by fixtures.js

**CRITICAL fixes:**

- **C-01**: `authFetch()` helper in dashboard.js — centralized `response.ok` check + Authorization header (was ignoring HTTP errors)
- **C-02**: `.single()` PGRST116 handling — no-row results now return null instead of throwing (loadProfile, updateSubscriptionUI, loadTelegramStatus, pollTelegramLink)
- **C-03**: Fire-and-forget `settlePendingTips()` in fixtures.js now has `.catch()` (was swallowing errors silently)
- **C-04**: Supabase error checking in `sendEmailDigest()` — profiles/listUsers queries now check for errors before using data

**HIGH fixes:**

- **H-01**: Telegram linking response check — `data.status === 'already_linked'` changed to `data.already_linked` (backend returns `{ already_linked: true }`)
- **H-02, H-04**: Batch tip updates in cron-tasks.js and fixtures.js — grouped by (status, result) for bulk `.in()` instead of N+1 individual updates
- **H-03**: `settleSchedule()` rewritten with single join query `schedine → schedina_tips → tips` instead of 3N queries
- **H-05**: Email sending parallelized with `Promise.allSettled()` in batches of 10 (was sequential)
- **H-06**: `listUsers()` now includes `{ perPage: 1000 }` (was unbounded)
- **H-07**: `evaluatePrediction`/`buildActualResult` extracted to shared module (fixtures.js no longer requires cron-tasks.js)
- **H-08**: Removed fake `callHandler` req/res pattern in generate-tips.js — now calls `handleSettle`/`handleSend` directly
- **H-09, H-10, H-12**: `initMobileMenu()`, `initParticles()`, `initLangToggle()` deduplicated into shared.js
- **H-11**: Merged `buildTipCard()` and `buildTipCardFromAPI()` into single polymorphic function
- **H-13**: League names consolidated — single `LEAGUE_NAMES_MAP` (frontend) and `LEAGUES` import (backend)
- **H-14..H-17**: Fixed floating promises — profile update, pull-to-refresh, setInterval, saveToggle all have proper `.catch()`/`try-catch`
- **H-18**: Telegram invite failures logged with `[CRITICAL]` prefix for monitoring
- **H-19**: Tier pricing moved to `TIER_PRICES` config object (was hardcoded in 4 places)
- **H-20**: Italian UI strings moved to `UI_TEXT` config object (was hardcoded in 10+ places)

**MEDIUM fixes:**

- **M-07**: Auth header duplication eliminated (20 fetch calls → single `authFetch()`)
- **M-27**: 10 silent `// Silenzioso` catch blocks replaced with `console.warn('[context]', err.message)`

### Added — Frontend integration for backend-only features

- **Schedine (Betting Slips) tab** — New "Schedine" tab in dashboard showing daily smart betting slips with budget summary bar, date navigation, risk-level cards (Sicura/Equilibrata/Azzardo), combined odds, suggested stake, expected return, confidence bar, strategy text, and expandable tips list. Tier-gated: free users see upgrade prompt, PRO/VIP see data
- **Risk Profile settings** — New section in dashboard Preferences card with risk_tolerance dropdown (prudente/equilibrato/aggressivo), weekly_budget number input (5-10000 EUR), max_schedine_per_day selector (1-5). Auto-saves via PUT /api/user-settings?resource=preferences
- **User Bet Tracking** — Added stake input and notes textarea to tip card expansion section. Saves via PUT /api/user-bets
- **Activity Stats** — Dashboard header now displays total_visits and longest_streak alongside existing streak display

### Fixed — Stats section flashing on hash navigation

- **`public/script.js`** — Elements navigated to via URL hash (e.g. `/#stats`) no longer flash. Root cause: JS added `.reveal` class (opacity:0) after HTML rendered elements visible, then IntersectionObserver re-showed them. Fix: detect hash navigation and apply both `.reveal` and `.visible` simultaneously for elements already in viewport

### Fixed — Track record "Tutte le Leghe" shows global stats

- **`api/stats.js`** — `handleTrackRecord()` now treats `league=all` as "no filter" (previously matched zero tips because no tip has `league='all'`)

### Changed — Consolidate serverless functions (13 → 12, Vercel Hobby limit fix)

- **Merged `api/odds.js` into `api/fixtures.js`** — Odds now accessed via `GET /api/fixtures?type=odds&fixture={id}` instead of standalone `/api/odds`. Reduces function count by 1
- **Renamed `api/schedina.js` → `api/betting-slips.js`** — English naming for consistency. Endpoint is now `/api/betting-slips`
- **Updated `vercel.json`** — Removed standalone `/api/odds` cache header (now handled by fixtures.js internally), renamed `schedina` to `betting-slips` in no-store rules
- **Tests** — Merged odds tests into `fixtures.test.js`, renamed `schedina.test.js` to `betting-slips.test.js`

### Added — Ligue 1, Bundesliga, Eredivisie (3 new leagues)

- **`api/_lib/leagues.js`** — Added Ligue 1 (ID 61, FL1), Bundesliga (ID 78, BL1), Eredivisie (ID 88, DED) to central config. Exported `VALID_SLUGS` for DRY imports
- **`api/generate-tips.js`** — Replaced hardcoded `LEAGUE_SLUGS` array with imported `VALID_SLUGS` from leagues.js
- **`api/user-settings.js`** — Replaced hardcoded `VALID_LEAGUES` array with imported `VALID_SLUGS` from leagues.js
- **`api/_lib/telegram.js`** — Added flags (FR, DE, NL) and names (LIGUE 1, BUNDESLIGA, EREDIVISIE) for Telegram digest formatting
- **Frontend league selectors** — Added 3 new league buttons to `index.html` and `dashboard.html`
- **`public/script.js`** — Added 3 new entries to `LEAGUE_NAMES` and `ALL_LEAGUE_SLUGS`
- **`public/dashboard.js`** — Added 3 new entries to `leagueNames` display map
- **`/generate-tips` skill** — Updated to support all 7 leagues with new slug mappings and flags
- **Tests** — Added 7 new test cases (3 getLeague, 3 resolveLeagueSlug, 1 VALID_SLUGS export), updated error regex and invalid slug tests
- **Documentation** — Updated CLAUDE.md, PREDICTION-ENGINE.md supported leagues table

### Added — Comprehensive Jest Test Suite (350 tests)

- **Jest test framework** — Added `jest` (v30.2.0) with `jest.config.js`, `tests/setup.js` (env vars + console suppression), `tests/__helpers__/mock-req-res.js` (Vercel req/res mock factory)
- **8 library unit test files** — `leagues.test.js`, `cache.test.js`, `auth-middleware.test.js`, `api-football.test.js`, `football-data.test.js`, `prediction-engine.test.js`, `email.test.js`, `telegram.test.js`
- **13 endpoint integration test files** — `tips.test.js`, `stats.test.js`, `fixtures.test.js`, `odds.test.js`, `match-insights.test.js`, `billing.test.js`, `stripe-webhook.test.js`, `telegram.test.js`, `cron-tasks.test.js`, `user-bets.test.js`, `user-settings.test.js`, `generate-tips.test.js`, `schedina.test.js`
- **1 CLI script test** — `fetch-league-data.test.js`
- **npm scripts** — `test`, `test:watch`, `test:coverage`
- **ESLint config** — Added Jest globals block for `tests/**/*.js`
- **Source testability exports** — `prediction-engine.js` exports `assignTier`, `balanceTiers`, `computeDerivedStats`, `getTeamRecentMatches`, `formatRecentResults`; `stats.js` exports `buildMonthlyBreakdown`
- **75%+ line coverage** across all API endpoints and library modules

### Changed — Issue #29: Track Record UX + Close Loss Filter

- **Fix race condition** — `loadResults()` and `loadTrackRecord()` both wrote to `#resultsList`. Now chained with `.then()` so track record always overwrites generic results. League switch also re-fetches track record
- **Track record per lega** — API `?type=track-record` now accepts optional `&league={slug}` parameter. Cache key is per-league. Frontend passes `currentLeague` to the API
- **Close losses filter** — Lost tips are now hidden from "I Nostri Risultati" unless they were close losses (lost by narrow margin). New `isCloseLoss(tip)` function parses match result and compares against prediction type (e.g. "1" lost with a draw, "Over 2.5" lost with exactly 2 goals)
- **3 new stat cards** — Track Record section expanded from 3 to 6 stats: added "Partite Analizzate" (distinct match_id count), "Dati Elaborati" (matches × 12 data points per match), and "ROI" (return on investment %). All animated with counter effect
- **`result` field in recent tips** — API now includes `result` (match score) in track record recent tips for close loss calculation
- **`matches_analyzed` + `data_points` API fields** — New metrics computed from distinct `match_id` values in settled tips
- **i18n translations** — Added IT/EN translations for new stat labels: `stats.matches`, `stats.datapoints`, `stats.roi`, `stats.roi.explain`

### Fixed — Duplicate match_id in DB

- **Liverpool vs Man City** had duplicate `match_id = 538030` (same as Man Utd vs Tottenham). Updated to `538031` via Supabase

### Added — Schedine Intelligenti (Smart Betting Slips)

- **`/generate-schedina` Claude Code skill** — AI-powered betting slip generator. Takes today's pending tips and combines them into 2-3 schedine with different risk profiles: Sicura (low risk, high confidence, PRO tier), Equilibrata (balanced, VIP tier), Azzardo (high potential return, VIP tier). Uses modified Kelly Criterion for optimal stake sizing. Budget-aware: total stakes never exceed the user's weekly budget.
- **`GET /api/schedina`** — New endpoint serving the day's smart betting slips with full tip details. Tier-gated: PRO sees Sicura only, VIP sees all three. Supports `?date=YYYY-MM-DD` and `?status=` filters. 15-minute cache with budget summary.
- **`schedine` + `schedina_tips` Supabase tables** — New schema with RLS policies matching tier access (migration 009). Fields: name, risk_level, combined_odds, suggested_stake, expected_return, confidence_avg, strategy, status, tier, budget_reference.
- **User risk profile in `user_preferences`** — Three new fields: `risk_tolerance` (prudente/equilibrato/aggressivo), `weekly_budget` (default 50 EUR), `max_schedine_per_day` (1-5). Fully validated in `PUT /api/user-settings?resource=preferences`.
- **Schedine auto-settlement in cron** — `cron-tasks.js` settle handler now also settles schedine: won if all tips won, lost if any tip lost, void if all void.
- **`/generate-tips` → `/generate-schedina` integration** — After generating tips for all leagues, `/generate-tips` automatically invokes `/generate-schedina` to build the day's betting slips from the fresh predictions.

### Changed — Issue #29: UX Improvements + Odds Accuracy Fix

- **CRITICAL: Real bookmaker odds only** — Tips now use EXCLUSIVELY actual Bet365 odds. If real odds are not available for a prediction type, the tip is skipped entirely (no fallback, no AI estimates, no invented numbers). Added `getAllOdds()` and `findOddsForPrediction()` to `api-football.js`. Removed `odds` field from AI schema — the AI never outputs odds. Prediction engine maps each prediction type to the correct bookmaker market post-generation.
- **Auto-hide started tips** — Homepage now filters out tips for matches that have already kicked off. This automatically masks lost/losing predictions during live matches. Won tips surface later in track record; lost tips disappear silently.
- **Hero subtitle** — Updated to "Pronostici di calcio basati su dati, algoritmi e analisi tecnico-tattiche. Track record verificato e trasparente."
- **CTA button** — "INIZIA A VINCERE" now displays in uppercase black text with letter-spacing
- **PRO plan description** — Updated to emphasize "10+ tips al giorno", "Analisi Intelligenza Artificiale", and "Storico completo risultati"
- **Tier comparison strip** — PRO detail changed from "Analisi + Storico completo" to "Analisi AI + Storico completo"
- **Quota Media explanation** — Added explainer text "Media aritmetica delle quote dei tips vinti" below the stat card
- **Footer tagline** — Enhanced with AI branding: "Pronostici calcio premium powered by AI. Algoritmi proprietari, analisi tecnico-tattiche e dati in tempo reale per darti il vantaggio che fa la differenza."
- **Language toggle** — Functional IT/EN toggle in navbar across all pages (index, dashboard, auth). Persists choice in localStorage, sets `html[lang]` attribute, triggers live translations on click
- **Full i18n system** — Created `public/i18n.js` with IT/EN dictionaries (~160 translation keys). Uses `data-i18n` (textContent) and `data-i18n-html` (innerHTML) attributes on ~70 HTML elements. Covers navbar, hero, tips, tier comparison, pricing cards, FAQ, footer, cookie banner. Exposes `window.t(key)`, `window.applyTranslations()`, `window.getLang()` for dynamic content
- **Combo prediction odds** — `findOddsForPrediction()` now handles combo bets like "1 + Over 1.5" by multiplying component odds with a 0.92 correlation factor (team winning implies goals scored, so events aren't independent)
- **Quota Media explainer** — Updated to "Media delle quote reali (Bet365) dei pronostici vinti" for credibility
- **getOdds() deduplication** — `getOdds()` now delegates to `getAllOdds()` instead of making a separate API call, eliminating duplicate requests
- **Double Chance 12 mapping** — Added missing "12" (Home/Away) mapping in `findOddsForPrediction()`
- **Skill odds mapping** — Updated `/generate-tips` skill to fetch all bet markets and instruct Claude Code to use real bookmaker odds
- **Extended odds in prompt** — Prediction engine prompt now shows Over/Under, Both Teams Score, and Double Chance odds alongside 1X2

### Added — `/code-review` Claude Code Skill (Multi-Agent Code Analysis Engine)

- **9 specialized review agents**: dead-code, duplicates, security, anti-patterns, performance, architecture, hardcoded-values, error-handling, maintainability
- **Multi-model support**: Claude Code (primary) + optional Codex CLI + Gemini CLI via `--multi-model` flag
- **Flexible scoping**: Run all agents, a single agent, or scope to a specific file/directory with `--file`
- **Auto-fix**: `--fix` flag auto-fixes LOW/MEDIUM issues (unused imports, `==` → `===`, `let` → `const`)
- **Report consolidation**: `consolidate-reports.js` merges multi-model findings, deduplicates, and upgrades severity when 2+ models agree
- **Severity matrix**: CRITICAL/HIGH/MEDIUM/LOW/INFO classification with documented thresholds
- Skill files: `.claude/skills/code-review/SKILL.md`, 9 agent prompts in `agents/`, scripts in `scripts/`
- Runs from any Claude Code instance — portable via `.claude/skills/` directory
- **i18n / multilanguage auditing**: `hardcoded-values` agent now flags all hardcoded locale-specific strings (Italian UI text, error messages, labels, legal disclaimers) as i18n issues needing extraction to a translation system
- **English-only comments**: `maintainability` agent now flags non-English code comments and JSDoc descriptions

### Changed — Tiered Prediction Access + Google-Only Auth

- **Auth: Google-only login** — Removed email/password registration and login forms. Auth page now shows only "Accedi con Google" button with terms/privacy links. Simplified `auth.js` and `auth.html`
- **Homepage: tier-aware tip cards** — Tip cards on the homepage now respect the user's subscription tier. Free cards are always visible. PRO/VIP cards show grayed-out locked state with value proposition + CTA (login for unauthenticated, upgrade for free/pro users). Added `canAccessTier()`, `buildLockedOverlay()`, and `homepageUserTier` detection via profile fetch
- **Homepage: tier comparison strip** — Added a visual tier comparison section between the tips filters and the tips grid showing concrete benefits of each tier (FREE: 1-2 tips/settimana, PRO: 10+ tips/giorno + analisi, VIP: Tutto PRO + VALUE bets + Telegram)
- **Homepage: locked overlay with value proposition** — Locked overlays now show concrete benefit bullets (e.g. "Tutti i tips giornalieri", "Canale Telegram VIP privato") instead of generic "riservato agli abbonati" messages
- **Dashboard renamed to "I Miei Tips"** — Page title, navbar link updated from "Dashboard" to "I Miei Tips"
- **Dashboard: Account moved to settings gear** — Account section removed from tab bar. Added a settings gear icon in the dashboard header that toggles the account panel. Tabs now show only "Tips di Oggi" and "Storico"
- **CSS: new components** — Added styles for `.tip-card--locked` (desaturated locked state), `.tier-comparison` strip, `.auth-heading`/`.auth-subtitle`/`.auth-footer-text` for Google-only auth, `.dash-settings-btn` with rotation animation

### Fixed — Environment Variables

- **`env:pull` target file** — Changed `npm run env:pull` to write to `.env.local` (was `.env`). Vercel dev prioritizes `.env.local`, so pulling into `.env` caused stale/missing vars locally
- **Removed duplicate env files** — Deleted `.env` and `.env.production` leftovers; single source of truth is now `.env.local` pulled from Vercel production

### Changed — Dashboard Tips UX Improvements

- **Tips di Oggi: show started/past matches** — Changed date filter from `>= now()` to `>= startOfToday(UTC)` so matches that already kicked off still appear in the tips grid, displayed with greyed-out styling (`.tip-card--started`) and an "Iniziata" label
- **"Tutte le leghe" tab** — Added `league=all` support in backend (`api/tips.js`) and a "Tutte" button in the dashboard league selector. Shows all leagues combined with a league badge on each card
- **Storico: last 7 days, max 20** — History tab now filters to the last 7 days with a cap of 20 results
- **Match results on tip cards** — Added `result` column to `tips` table. Settlement (cron + opportunistic) now saves the score (e.g. "2-1") directly on the tip. Cards show score between team names, won/lost badge, and colored left border (green=won, red=lost)
- **`status=today` API mode** — New tips API mode that returns all statuses from today (pending + won + lost + void), used by "Tips di Oggi" to show the complete picture
- **Fixed Cache-Control conflict** — `api/tips.js` was setting `Cache-Control: private, max-age=900` which overrode `vercel.json`'s `no-store` for personalized endpoints. Now correctly uses `no-store` to prevent browser caching of tier-specific responses

### Changed — Honest Track Record + Opportunistic Settlement

- **Homepage: removed all fake numbers** — Hero stats (73% win rate, 12.4% ROI, 2847 tips), stats cards (1842 tips vincenti, 73% win rate, +12.4% ROI, 1.87 quota media), and monthly chart (6 fake bars) all replaced with em dash placeholders and `data-count="0"`
- **Hero subtitle**: "ROI positivo dal giorno uno" replaced with "Track record verificato e trasparente"
- **Telegram CTA**: "4,200+ membri attivi" replaced with "Entra nella community"
- **`loadTrackRecord()` rewritten** — If `won+lost===0`: shows "in costruzione" state with em dashes (only pending count if available). If real data exists: updates DOM with real values and triggers counter animation. On API error: leaves honest em dash placeholders
- **Monthly chart**: fake bars removed, replaced with "Dati in costruzione" placeholder (`.chart-empty` CSS class)
- **Opportunistic settlement** in `api/fixtures.js` — When fresh results are fetched (cache miss), pending tips are settled fire-and-forget using the same data. Zero extra API calls. Idempotent (`WHERE status='pending'`)
- **Exported** `evaluatePrediction()` and `buildActualResult()` from `api/cron-tasks.js` for reuse by fixtures.js
- **`animateCounter()`** — Fixed: explicit `isNaN(target) || target === 0` check instead of falsy `!target`

### Changed — Unified Prediction Engine Documentation

- Created [`PREDICTION-ENGINE.md`](PREDICTION-ENGINE.md) as single authoritative reference for the prediction engine architecture, algorithm, and configuration
- Added links from `CLAUDE.md`, `CHANGELOG.md`, and `SKILL.md` to the new document
- Trimmed verbose algorithm details from `CHANGELOG.md` (now linked)

### Added — `/generate-tips` Claude Code Skill

- Claude Code as prediction engine (zero API cost), replacing the Claude API pipeline — see [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md) for full architecture
- Skill file: `.claude/skills/generate-tips/SKILL.md`, data fetch script: `.claude/skills/generate-tips/scripts/fetch-league-data.js`
- Supports flags: `--send` (Telegram), `--delete` (clear pending), league filter

### Changed — Homepage Multi-League Branding

- Hero badge: "SERIE A 2025/26" → "4 TOP LEAGUE · 2025/26" to reflect multi-league coverage
- Live bar initial label: now shows all 4 leagues instead of only Serie A
- Free plan feature: "Statistiche generali Serie A" → "Statistiche generali per lega"
- Badge updates to specific league name when a league tab is selected

### Changed — Prediction Engine V2.1 (Batched)

- Batched Opus calls: all matches per league in a single API call (10x fewer, ~80% faster) with parallel odds prefetch — see [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)

### Removed — Automatic Cron Schedule

- Removed Vercel cron from `vercel.json` (too expensive for Hobby plan — each run triggers Claude API calls)
- Tip generation now triggered manually via `/generate-tips` skill or `POST /api/generate-tips`
- Settle and send tasks still available via `POST /api/cron-tasks?task=settle|send`

### Removed — Serie B

- Removed Serie B from all league configurations (no API data available)
- Affected files: leagues.js, generate-tips.js, telegram.js, user-settings.js, football-data.js, dashboard.html, index.html, script.js, CLAUDE.md

### Added — Developer Tooling

- `npm run env:pull` — syncs local .env from Vercel production (single source of truth)
- `.gitignore` — `.claude/*` with `!.claude/skills/` exception (skills tracked, settings ignored)
- `eslint.config.mjs` — added `.claude/` to ignores (skill scripts are utility code)

### Added — Prediction Engine V2

- Two-phase pipeline (Haiku 4.5 research + Opus 4.6 prediction), structured output, derived stats, historical accuracy feedback loop — see [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)

### Changed — Prediction Engine V2

- Model upgrade to Opus 4.6, refactored standings to shared `fetchStandingsData()` + `normalizeStandingEntry()`, post-generation tier assignment — see [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)

### Removed — Prediction Engine V2

- Regex JSON parsing, prompt-based tier assignment, `tierPattern` rotation, duplicated generation logic — see [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)

### Added — UX Roadmap Phase 1-3

#### Phase 1: Quick Wins

- **League Selector** in dashboard — bar above tabs, persists in localStorage, reloads tips/history on change
- **Expandable Tip Cards** — "Dettagli" button with chevron animation, lazy-loads team form and H2H data
- **Tip del Giorno** — Highest confidence tip gets gold glow border and "TIP DEL GIORNO" badge
- **Pull-to-Refresh** — Touch gesture on mobile (< 768px) reloads tips and history
- **Countdown** — Empty tips state shows countdown to next scheduled match

#### Phase 2: Rich Content + Personalization

- **User Preferences** (`api/preferences.js`) — GET/PUT endpoint, auto-creates on first access
- `user_preferences` table with `preferred_league`, `favorite_teams[]`, notification toggles
- **Favorite Teams** — Search dropdown from standings data, chip UI, highlighted tips with star
- **Team Form** (`api/team-form.js`) — W/D/L dots from last 5 results, 6h cache
- **Head-to-Head** (`api/h2h.js`) — Horizontal bar chart of historical matchups, 24h cache
- **Favorites Filter** — "Preferiti" button in history tab filters by favorite teams
- **Dashboard Chart** — Track record profit chart replicated in History tab
- **Interactive Charts** — Hover tooltips (profit, win rate, tips count) + SVG cumulative ROI line overlay

#### Phase 3: Engagement + Gamification

- **Activity Tracking** (`api/activity.js`) — Daily streak system (POST registers visit, GET returns stats)
- `profiles` table extended with `current_streak`, `longest_streak`, `last_visit_date`, `total_visits`
- **Streak Display** — Flame icon + count in dashboard header, celebration animation on consecutive days
- **User Bets Tracker** (`api/user-bets.js`) — Follow/unfollow tips with CRUD API
- `user_bets` table with RLS policies
- **Notification Center** (`api/notifications.js`) — Bell icon in navbar, dropdown with unread count
- `notifications` table with partial index on unread, 60s polling
- Mark individual or all notifications as read

#### Database Migrations

- `005_create_user_preferences.sql` — user_preferences table + RLS
- `006_add_activity_tracking.sql` — activity columns on profiles
- `007_create_user_bets.sql` — user_bets table + RLS
- `008_create_notifications.sql` — notifications table + partial index + RLS

### Added — Telegram Full Automation (Issue #15)

- **Vercel Cron Job** — Daily automation at 08:00 UTC: settle → generate (all leagues) → send
- `GET /api/generate-tips` — Cron orchestrator (settle → generate all leagues → send), also accepts POST for single-league generation
- `POST /api/telegram` — Unified Telegram endpoint: webhook handler (with secret header) + account linking (with JWT)
- `generate-tips.js` — Exported `generateForLeague()` callable function for cron orchestrator
- **Auto-invite** to private Telegram channel on Stripe subscription activation (`stripe-webhook.js`)
- **Auto-remove** from private Telegram channel on subscription cancellation (`stripe-webhook.js`)
- `telegram.js` — Added `sendDirectMessage()`, `createPrivateInviteLink()`, `removeFromPrivateChannel()`
- **Dashboard "Collega Telegram" UI** — Telegram linking card in Account tab with status, deep link button, and polling
- `telegram_user_id` (BIGINT) and `telegram_link_token` (TEXT) columns on `profiles` table
- `TELEGRAM_BOT_USERNAME` and `TELEGRAM_WEBHOOK_SECRET` environment variables
- Vercel cron schedule in `vercel.json`

### Changed — Serverless Function Consolidation Phase 2 (18 → 12)

- Merged `settle-tips.js` + `send-tips.js` → `api/cron-tasks.js` (routes by `?task=settle|send`)
- Merged `activity.js` + `notifications.js` + `preferences.js` → `api/user-settings.js` (routes by `?resource=activity|notifications|preferences`)
- Merged `matches.js` + `results.js` → `api/fixtures.js` (routes by `?type=matches|results`)
- Merged `h2h.js` + `team-form.js` → `api/match-insights.js` (routes by `?type=h2h|form`)
- Merged `standings.js` + `track-record.js` → `api/stats.js` (routes by `?type=standings|track-record`)
- Updated `generate-tips.js` to require `cron-tasks.js` instead of deleted `settle-tips.js`/`send-tips.js`
- Updated all fetch URLs in `dashboard.js` and `script.js` to use new consolidated endpoints
- Updated `vercel.json` cache headers — removed per-endpoint rules for merged endpoints (now set programmatically), updated no-store regex
- **Fixed bug:** `h2h.js` and `team-form.js` imported `getCached`/`setCached` from cache module which only exports `get`/`set` — corrected in `match-insights.js`

### Changed — Serverless Function Consolidation Phase 1 (15 → 12)

- Merged `create-checkout.js` + `create-portal.js` → `api/billing.js` (routes by `action` field in body)
- Merged `link-telegram.js` + `telegram-webhook.js` → `api/telegram.js` (routes by secret token header)
- Merged `api/cron/daily.js` into `api/generate-tips.js` (GET = cron, POST = single-league generate)
- Reduced serverless functions from 15 to 12 (Vercel Hobby plan limit)
- Updated `dashboard.js` fetch URLs to use new consolidated endpoints
- Updated `vercel.json` cron path and no-store cache rules

### Fixed

- **BUG: dashboard.html** — Navbar "Esci" button was a `<button>` instead of `<a>`, causing misalignment with homepage nav
- **PERF: RLS policies** — Wrapped all `auth.uid()` / `auth.role()` calls in `(select ...)` for initplan caching (9 policies fixed)
- **PERF: RLS policies** — Scoped `*_service_all` policies to `TO service_role` instead of `TO public`, eliminating ~20 multiple permissive policy warnings
- **PERF: RLS policies** — Consolidated 3 separate tips SELECT policies (`tips_select_free/pro/vip`) into 1 per role (`tips_select_anon` + `tips_select_authenticated`)

### Fixed (Code Quality Assessment)

- **CRITICAL: tips.js** — `.gte('match_date', now())` filter excluded all won/lost/void tips, making dashboard history permanently empty. Now conditional on status.
- **CRITICAL: prediction-engine.js** — `result.odds.toFixed(2)` crashed when AI returned odds as string. Added `parseFloat()` before `toFixed()`.
- **CRITICAL: prediction-engine.js** — Unsafe `odds.values[0/1/2]` access without length check. Added array bounds validation.
- **CRITICAL: api-football.js** — Champions League standings only returned first group. Now flattens all groups with `.flat()`.
- **CRITICAL: api-football.js** — Unsafe `data[0].bookmakers[0]` access without null check. Added defensive check.
- **CRITICAL: football-data.js** — Missing null check on `data.standings` in `getStandings()`.
- **CRITICAL: settle-tips.js** — Unchecked Supabase errors on `update`/`upsert` could silently corrupt data. Now checks and logs errors.
- **CRITICAL: stripe-webhook.js** — All webhook handler errors silently swallowed (returned 200). Now returns 500 for transient errors so Stripe retries.
- **CRITICAL: stripe-webhook.js** — Unchecked Supabase errors in `handleCheckoutCompleted` could lose subscription activations. Now throws on failure.
- **SECURITY: create-checkout.js/create-portal.js** — Open redirect via user-controlled `origin`/`referer` headers. Now validates against allowlist.
- **SECURITY: CRON_SECRET** — If env var undefined, `Bearer undefined` granted access. Extracted `verifyCronSecret()` with env var validation and `crypto.timingSafeEqual`.
- **SECURITY: vercel.json** — Blanket `s-maxage=1800` CDN cache applied to all API routes, including POST mutation endpoints. Now per-endpoint with `no-store` for mutations.
- **SECURITY: tips.js** — `private` + `s-maxage` were contradictory Cache-Control directives. Changed to `private` + `max-age`.
- **BUG: tips.js** — Negative `limit` parameter (e.g., `limit=-1`) not clamped. Now clamped to `[1, 50]`.
- **BUG: tips.js** — No validation on `status` parameter. Now validates against whitelist.
- **BUG: email.js** — Footer said "Pronostici Serie A Premium" despite being multi-league. Changed to "Pronostici Calcio Premium".
- **BUG: email.js** — `escapeHtml()` missing single quote escape. Added `&#39;` mapping.
- **BUG: script.js** — `createEl()` treated `0` as falsy, silently dropping numeric textContent. Changed to `!= null` check.
- **PERF: script.js** — `maxProfit` recalculated inside every `forEach` iteration. Moved outside loop.

### Removed (Dead Code)

- `supabase.js` — Removed unused `createUserClient()` function (never imported)
- `stripe.js` — Removed unused `CUSTOMER_PORTAL_URL` export (never imported)
- `leagues.js` — Removed unused `getAllSlugs()` function and dead exports (`LEAGUES`, `DEFAULT_SLUG`)
- `prediction-engine.js` — Removed dead `generatePrediction` export (only used internally)
- `telegram.js` — Removed dead exports `sendMessage`, `formatTipMessage`, `escapeMarkdown` (only used internally)
- `tips.js` — Removed unreachable sanitization branch (dead code by design, as documented by its own comment)
- `send-tips.js` — Removed duplicated tier levels mapping, now uses shared `hasAccess()` from auth-middleware
- `CHANGELOG.md` — Removed stale TODO section listing Stripe/Telegram/Email as future work (all implemented)

### Changed

- `auth-middleware.js` — Added centralized `verifyCronSecret()` function with timing-safe comparison
- `vercel.json` — Replaced blanket `/api/(.*)` cache rule with per-endpoint Cache-Control headers
- `CLAUDE.md` — Updated tech stack, project structure, env vars list, and API endpoints to reflect current codebase
- `cache.js` — Updated stale comments to reflect current multi-league cache key patterns
- `package.json` — Updated description from "Serie A" to "multi-lega"

### Added

- **Multi-league support**: Champions League, La Liga, Premier League alongside existing Serie A
- League selector tab bar in frontend (4 buttons above the live matches bar)
- Serie B config in backend (api/\_lib/leagues.js) ready for when API coverage is available
- Centralized league configuration in `api/_lib/leagues.js` — single source of truth for all league IDs and codes
- `supabase/migrations/002_add_league_column.sql` — Migration to add `league` column to `tips` table with indexes
- `?league=` query parameter on `/api/matches`, `/api/results`, `/api/standings`, `/api/tips` endpoints (default: `serie-a`)
- `league` column on Supabase `tips` table with indexes for filtering
- Per-league cache keys to avoid serving wrong data across leagues
- `settle-tips.js` groups pending tips by league and fetches results per league
- Dynamic league name in AI prediction prompt (`prediction-engine.js`)

### Changed

- `api-football.js` and `football-data.js` now accept `leagueSlug` parameter instead of hardcoded Serie A IDs
- `generate-tips.js` accepts `league` in request body, saves league field to tips
- Hero badge and live bar header update dynamically when switching leagues
- Meta description and subtitle changed from "Serie A" to "calcio" for broader scope
- Footer description updated to "pronostici calcio premium"

### Fixed

- Dashboard greeting showed raw email prefix (e.g. "francesco3.rinaldi") instead of display name — root cause: `signUp()` didn't pass name in metadata, so the DB trigger fell back to email prefix. Now: name is passed in `signUp` options, Auth metadata has priority over stale DB value, and dashboard auto-syncs profile if metadata differs
- Google OAuth login — enabled Google provider in Supabase Auth via Management API
- Added `redirectTo` option in `signInWithOAuth` to redirect to dashboard after Google login
- Configured Supabase URI allow list for OAuth redirect URLs

### Added

- GCP project `winningbet` for Google OAuth credentials
- SVG crown logo mark replacing the spade character (navbar + footer)
- SVG favicon (`public/favicon.svg`) with crown mark on dark background
- Favicon link in HTML head
- Ticker scrolling animation for upcoming matches bar (right-to-left marquee, pauses on hover)

### Changed

- Browser tab title changed to "WinningBet"
- Logo text changed from "WINNING BET" to "WinningBet" across navbar and footer
- Rebranded all project references from "Winning Bet" to "WinningBet" (package.json, README, .env.example, script.js, styles.css, index.html)
- Updated `.logo-icon` CSS from font-based to `inline-flex` for SVG support
- Monthly profit chart: changed unit from "(unita')" to "(€)" — title, bar labels, and dynamic values
- Tips section: reduced from 4 cards to 3 (FREE, PRO, VIP) for better symmetry; removed Multipla card
- Tips grid: changed from `auto-fill` to fixed 3-column layout
- Unified navbar across all pages (privacy, terms, cookies, auth, dashboard) — same nav links (Tips, Track Record, Piani, FAQ) with hamburger menu on mobile

---

## TODO

- [ ] **Supabase: Enable Leaked Password Protection** — Requires Supabase Pro plan. Blocks compromised passwords via HaveIBeenPwned. Activate in: Authentication > Settings > Leaked Password Protection ([docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection))

---

## [0.1.0]

### Added

- ESLint 9 with flat config (`eslint.config.mjs`) for JavaScript linting
- Prettier with project config (`.prettierrc`, `.prettierignore`) for code formatting
- `npm run lint` / `npm run lint:fix` commands
- `npm run format` / `npm run format:check` commands
- `CLAUDE.md` project guide for Claude Code with cross-project conventions
- `CHANGELOG.md` for tracking all changes

### Changed

- Updated `package.json` with lint and format scripts
- Updated `README.md` to document new dev tooling and project structure
- Updated `.gitignore` to include `firebase-debug.log` and remove duplicate `.vercel` entry

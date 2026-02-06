# Changelog

All notable changes to WinningBet will be documented in this file.

## [Unreleased]

### Added

- **Multi-league support**: Champions League, La Liga, Premier League alongside existing Serie A
- League selector tab bar in frontend (4 buttons above the live matches bar)
- Serie B config in backend (api/\_lib/leagues.js) ready for when API coverage is available
- Centralized league configuration in `api/_lib/leagues.js` — single source of truth for all league IDs and codes
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

## TODO — Prossimi Step

### 1. Stripe — Pagamenti

- Creare account Stripe e prodotti: **PRO** (€9.99/mese), **VIP** (€29.99/mese)
- Configurare env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_VIP_PRICE_ID`
- Testare checkout flow end-to-end (test mode → produzione)
- Webhook per aggiornare tier utente in Supabase automaticamente

### 2. Telegram — Tip Delivery (FULL AUTOMATED)

- Creare bot Telegram via @BotFather
- Canale pubblico: tips FREE pubblicati automaticamente dopo la generazione
- Canale privato: tips PRO/VIP, accesso riservato agli abbonati
- **Sync completo con il sito**: ogni tip generato da `generate-tips.js` viene pushato automaticamente su Telegram (nessun intervento manuale)
- Gestione automatica accessi: quando un utente si abbona/disabbona, viene aggiunto/rimosso dal canale privato
- Formattazione messaggi Telegram allineata ai tip del sito (match, prediction, confidence, analisi)
- Env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_PUBLIC_CHANNEL_ID`, `TELEGRAM_PRIVATE_CHANNEL_ID`

### 3. Email — Dominio Custom

- Acquistare dominio (es. winningbet.it)
- Configurare provider email con dominio custom (sostituisce SendGrid)
- Email di benvenuto, conferma abbonamento, tip summary giornaliero
- Env vars: da definire in base al provider scelto

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

# Changelog

All notable changes to WinningBet will be documented in this file.

## [Unreleased]

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

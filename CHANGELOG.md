# Changelog

All notable changes to WinningBet will be documented in this file.

## [Unreleased]

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

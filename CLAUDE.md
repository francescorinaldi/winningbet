# WinningBet - Claude Code Project Guide

## Project Overview

Premium multi-league betting predictions platform (Serie A, Champions League, La Liga, Premier League, Ligue 1, Bundesliga, Eredivisie). Vanilla JS frontend + Vercel serverless backend.

## Tech Stack

- **Frontend**: HTML5, CSS3 (custom properties), Vanilla JS (ES6+ IIFE pattern)
- **Backend**: Node.js Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: Claude Code skill `/generate-tips` (primary), Anthropic Claude API (legacy serverless) — see [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)
- **Payments**: Stripe (subscriptions, webhooks, customer portal)
- **APIs**: api-football.com (primary), football-data.org (fallback)
- **Notifications**: Telegram Bot API, SendGrid (email)
- **Deployment**: Vercel
- **Linting**: ESLint 9 (flat config)
- **Formatting**: Prettier
- **Package Manager**: npm

## Project Structure

```
api/                    → Vercel serverless functions (13 endpoints)
api/_lib/               → Shared backend utilities (10 modules)
api/_lib/leagues.js     → Centralized league configuration (IDs, codes, seasons)
api/_lib/telegram.js    → Telegram Bot API client (send tips, invite, kick, DM)
api/billing.js          → Stripe billing (checkout + portal)
api/cron-tasks.js       → Cron tasks (settle tips + schedine + send)
api/fixtures.js         → Matches + results (by league)
api/generate-tips.js    → Cron orchestrator + single-league generation
api/match-insights.js   → H2H + team form
api/odds.js             → Betting odds (by fixture)
api/schedina.js         → Smart betting slips (schedine del giorno)
api/stats.js            → Standings + track record
api/stripe-webhook.js   → Stripe webhook handler
api/telegram.js         → Telegram webhook + account linking
api/tips.js             → Tip listing (filtered by league)
api/user-bets.js        → Follow/unfollow tips
api/user-settings.js    → Activity + notifications + preferences + risk profile
public/                 → Static frontend (HTML, JS, CSS)
public/script.js        → Main landing page logic (IIFE pattern)
public/auth.js          → Authentication logic (Supabase Auth)
public/dashboard.js     → User dashboard logic + Telegram linking
supabase/migrations/    → Database schema migrations (9 files)
.claude/skills/         → Claude Code skills (slash commands)
.claude/skills/generate-tips/     → /generate-tips skill (prediction engine)
.claude/skills/generate-schedina/ → /generate-schedina skill (smart betting slips)
.claude/skills/code-review/       → /code-review skill (multi-agent code analysis)
eslint.config.mjs       → ESLint flat config
.prettierrc             → Prettier config
vercel.json             → Deployment config + caching headers
CHANGELOG.md            → All changes (always update)
```

## Key Commands

```bash
npm run dev           # Start local dev server (vercel dev)
npm run start         # Alias for dev
npm run lint          # ESLint on all JS files
npm run lint:fix      # ESLint with auto-fix
npm run format        # Format all files with Prettier
npm run format:check  # Check formatting without modifying
npm run env:pull      # Sync .env.local from Vercel production (single source of truth)
```

### Claude Code Skills (Slash Commands)

```bash
/generate-tips                      # Generate tips for ALL leagues
/generate-tips serie-a              # Generate for one league only
/generate-tips --send               # Generate and send to Telegram
/generate-tips --delete             # Delete pending tips, then regenerate
/generate-tips serie-a --send       # Combine flags
```

```bash
/generate-schedina                  # Generate schedine from today's tips (default 50 EUR budget)
/generate-schedina --budget 100     # Generate with custom budget
/generate-schedina --send           # Generate and send to Telegram
```

```bash
/code-review                        # Run ALL 9 review agents
/code-review security               # Run only the security agent
/code-review --file api/            # Scope to a directory
/code-review --multi-model          # Also run Codex CLI + Gemini CLI
/code-review --fix                  # Auto-fix LOW/MEDIUM issues
/code-review security --file api/ --multi-model  # Combine flags
```

Full prediction engine architecture: [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)

## API Endpoints

All data endpoints accept an optional `?league={slug}` parameter (default: `serie-a`).
Valid slugs: `serie-a`, `champions-league`, `la-liga`, `premier-league`, `ligue-1`, `bundesliga`, `eredivisie`.

- `POST /api/billing` — Body: `{ action: "checkout", tier }` or `{ action: "portal" }`
- `POST /api/cron-tasks?task=settle|send` — Settle tips or send tips (CRON_SECRET auth)
- `GET /api/fixtures?type=matches|results&league={slug}` — Next 10 matches (2h) or last 10 results (1h)
- `GET/POST /api/generate-tips` — Cron orchestrator (GET) or single-league generation (POST)
- `GET /api/match-insights?type=h2h|form` — Head-to-head (24h) or team form (6h)
- `GET /api/odds?fixture={id}` — Betting odds (30min cache, no league param)
- `GET /api/schedina?date={YYYY-MM-DD}&status={status}` — Smart betting slips (JWT auth, PRO+VIP only)
- `GET /api/stats?type=standings|track-record&league={slug}` — League standings (6h) or track record (1h)
- `POST /api/stripe-webhook` — Stripe event handler (+ auto Telegram invite/kick)
- `POST /api/telegram` — Telegram webhook (with secret header) or account linking (with JWT)
- `GET /api/tips?league={slug}` — Tips filtered by league (15min cache)
- `CRUD /api/user-bets` — Follow/unfollow tips (JWT auth)
- `GET/POST/PUT /api/user-settings?resource=activity|notifications|preferences` — User settings (JWT auth)

## Environment Variables

- `API_FOOTBALL_KEY` — api-sports.io key
- `FOOTBALL_DATA_KEY` — football-data.org key
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_ANON_KEY` — Supabase anon key (frontend, protected by RLS)
- `SUPABASE_SECRET_KEY` — Supabase secret key (backend only, bypasses RLS)
- `ANTHROPIC_API_KEY` — Anthropic Claude API key
- `CRON_SECRET` — Secret for cron job authentication
- `STRIPE_SECRET_KEY` — Stripe secret key
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret
- `STRIPE_PRO_PRICE_ID` — Stripe Price ID for PRO plan
- `STRIPE_VIP_PRICE_ID` — Stripe Price ID for VIP plan
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `TELEGRAM_PUBLIC_CHANNEL_ID` — Public channel chat ID (free tips)
- `TELEGRAM_PRIVATE_CHANNEL_ID` — Private channel chat ID (pro/vip tips)
- `TELEGRAM_BOT_USERNAME` — Bot username (without @) for deep link generation
- `TELEGRAM_WEBHOOK_SECRET` — Secret token for Telegram webhook verification
- `SENDGRID_API_KEY` — SendGrid API key
- `SENDGRID_FROM_EMAIL` — Verified sender email address

## Code Conventions

- Frontend JS uses IIFE pattern — all logic in one `script.js`
- CSS uses custom properties for design tokens (colors, spacing, typography)
- Serverless functions follow primary→fallback API pattern
- Italian language for user-facing content
- 18+ gambling compliance (ADM disclaimer required)

## Important Notes

- No build step — static site served from `public/`
- Never commit `.env` files
- All API keys go through serverless functions (never expose to client)
- Cache-Control headers set in vercel.json for API routes
- **Prefer Claude Code over Claude API** — If something can be done directly by Claude Code (analysis, prediction, data processing, research), do NOT call the Claude/Anthropic API for it. Claude Code IS Claude — use your own capabilities instead of paying for API calls. The `/generate-tips` skill exists for this reason: Claude Code is the prediction engine, not a wrapper around the API.
- **No autonomous API spending** — Never call Claude API, external paid APIs, or any cost-incurring service autonomously. If a check or verification can be done together with the user (e.g. querying Supabase, checking track record data, testing endpoints), always do it collaboratively instead of burning API credits

---

## Working Style (Non-Negotiable)

1. **Think first, act second** — Read codebase for relevant files before making changes
2. **Never speculate** — Read files before answering. Investigate thoroughly
3. **DO NOT INVENT DATA** — Never make up example values; use real data from the codebase
4. **No hacky solutions** — Every solution must be future-proof, scalable, and intelligent
5. **Always update CHANGELOG.md** and relevant docs when making code changes
6. **DO NOT BE LAZY** — Aim for the BEST outcome, not "good enough" workarounds
7. **Understand root causes** — Don't fix symptoms; understand and fix the underlying cause
8. **Check for similar issues** — After finding a bug, search the entire codebase for the same pattern
9. **Keep ALL documentation in sync** — CLAUDE.md, CHANGELOG.md, README.md must reflect current logic
10. **Verify online before suggesting** — Check official docs for latest versions of libraries/APIs
11. **Proactively flag technical debt** — Dead code, unused imports, TODO comments, duplicated logic
12. **No technical debt** — Fix issues immediately; don't leave them for "later"

## Code Quality Principles

- **Simplicity is paramount** — Every change should impact minimal code
- **Reduce technical debt** — Every change should leave the codebase cleaner
- **Remove dead code** — Delete unused functions, commented code, unreachable branches
- **No duplicate functions** — Consolidate similar logic
- **Watch for data flow inconsistencies** — Trace data from API → serverless function → frontend

## Zero Tolerance Policy

- **No hallucinations** — Do not invent files, APIs, commands, outputs, or "facts"
- **No "it works" claims without evidence** — Only claim tests/builds pass if you ran them
- **Branch discipline** — Never commit directly to main; create feature branches
- **Small, reviewable PRs** — Prefer incremental changes over massive diffs
- **Secrets safety** — Never print or commit secrets. Assume `.env` files contain secrets
- **Evidence format** — When running commands, paste exact commands and short outcome summary

## Debugging Process

1. **Understand the cause** — Analyze error messages thoroughly
2. **Fix the issue** — Apply the correct fix
3. **Search for similar issues** — Find ALL occurrences of the same pattern in the codebase
4. **Test** — Run lint, verify in browser, check API responses
5. **Repeat** — If a new error surfaces, go back to step 1

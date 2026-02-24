# WinningBet - Claude Code Project Guide

## Project Overview

Premium multi-league betting predictions platform (Serie A, Champions League, La Liga, Premier League, Ligue 1, Bundesliga, Eredivisie). Vanilla JS frontend + Vercel serverless backend.

## Tech Stack

- **Frontend**: HTML5, CSS3 (custom properties), Vanilla JS (ES6+ IIFE pattern)
- **Backend**: Node.js Vercel Serverless Functions
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: Claude Code skill `/fr3-generate-tips` (primary, Agent Team with parallel analysts + reviewer + retrospective learning), Anthropic Claude API (legacy serverless) — see [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)
- **Payments**: Stripe (subscriptions, webhooks, customer portal)
- **APIs**: api-football.com (primary), football-data.org (fallback)
- **Notifications**: Telegram Bot API, Nodemailer SMTP (email)
- **Deployment**: Vercel
- **Linting**: ESLint 9 (flat config)
- **Formatting**: Prettier
- **Package Manager**: npm

## Project Structure

```
api/                    → Vercel serverless functions (12 endpoints)
api/_lib/               → Shared backend utilities (11 modules)
api/_lib/leagues.js     → Centralized league configuration (IDs, codes, seasons)
api/_lib/prediction-utils.js → Shared prediction evaluation (evaluatePrediction, buildActualResult)
api/_lib/telegram.js    → Telegram Bot API client (send tips, invite, kick, DM)
api/billing.js          → Stripe billing (checkout + portal)
api/cron-tasks.js       → Cron tasks (settle tips + schedine + send)
api/fixtures.js         → Matches + results + odds (by league)
api/generate-tips.js    → Cron orchestrator + single-league generation
api/match-insights.js   → H2H + team form
api/betting-slips.js    → Smart betting slips (schedine della settimana)
api/stats.js            → Standings + track record
api/stripe-webhook.js   → Stripe webhook handler
api/telegram.js         → Telegram webhook + account linking
api/tips.js             → Tip listing (filtered by league)
api/user-bets.js        → Follow/unfollow tips
api/user-settings.js    → Activity + notifications + preferences + risk profile
public/                 → Static frontend (HTML, JS, CSS)
public/shared.js        → Shared frontend utilities (mobile menu, particles, lang toggle, league names)
public/script.js        → Main landing page logic (IIFE pattern)
public/auth.js          → Authentication logic (Supabase Auth)
public/dashboard.js     → User dashboard logic + Telegram linking
supabase/migrations/    → Database schema migrations (14 files)
.claude/skills/                        → Claude Code skills (project-specific)
.claude/skills/fr3-generate-tips/      → /fr3-generate-tips (prediction engine)
.claude/skills/fr3-generate-betting-slips/ → /fr3-generate-betting-slips (smart betting slips)
.claude/skills/fr3-settle-tips/        → /fr3-settle-tips (settlement engine)
.claude/skills/fr3-performance-analytics/ → /fr3-performance-analytics (track record analysis)
.claude/skills/fr3-strategy-optimizer/ → /fr3-strategy-optimizer (prescriptive strategy engine)
.claude/skills/fr3-pre-match-research/ → /fr3-pre-match-research (deep research engine)
.claude/skills/fr3-update-winning-bets/ → /fr3-update-winning-bets (master pipeline orchestrator)
~/.claude/skills/fr3-code-review/      → /fr3-code-review (global, multi-agent code analysis)
eslint.config.mjs       → ESLint flat config
.prettierrc             → Prettier config
vercel.json             → Deployment config + caching headers
CHANGELOG.md            → All changes (always update)
.github/copilot-instructions.md  → Repo-wide Copilot instructions
.github/instructions/            → File-type-specific Copilot instructions (JS, CSS, SQL)
.github/workflows/copilot-setup-steps.yml → Copilot coding agent environment setup
.github/agents/                  → 2 Copilot custom agents (Coder, Reviewer)
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

All custom skills use the `fr3-` prefix for easy identification.

**Prediction & Betting (project-specific):**

```bash
/fr3-generate-tips                      # Generate tips for ALL leagues
/fr3-generate-tips serie-a              # Generate for one league only
/fr3-generate-tips --send               # Generate and send to Telegram
/fr3-generate-tips --delete             # Delete pending tips, then regenerate
/fr3-generate-tips serie-a --send       # Combine flags
```

```bash
/fr3-generate-betting-slips             # Generate schedine from this week's tips (default 50 EUR budget)
/fr3-generate-betting-slips --budget 100 # Generate with custom budget
/fr3-generate-betting-slips --send      # Generate and send to Telegram
```

```bash
/fr3-settle-tips                        # Settle all pending tips with past match dates
/fr3-settle-tips --dry-run              # Preview without updating database
/fr3-settle-tips --backfill             # Generate retrospectives for already-settled tips
```

```bash
/fr3-performance-analytics              # Deep track record analysis (terminal report)
/fr3-performance-analytics --store      # Analyze and store snapshot in Supabase
/fr3-performance-analytics --period 30  # Analyze last 30 days (default: 90)
```

```bash
/fr3-strategy-optimizer                 # Generate strategy directives from patterns
/fr3-strategy-optimizer --dry-run       # Preview directives without storing
```

```bash
/fr3-pre-match-research                 # Research all leagues with matches in next 48h
/fr3-pre-match-research serie-a         # Research one league only
/fr3-pre-match-research --force         # Re-research even if fresh data exists
```

```bash
/fr3-update-winning-bets                # Master pipeline: analytics → optimize → settle → research → generate → schedine (auto)
/fr3-update-winning-bets --force        # Force all phases regardless of checks
/fr3-update-winning-bets --no-send      # Run pipeline without sending to Telegram
/fr3-update-winning-bets --dry-run      # Preview what would happen without executing
/fr3-update-winning-bets --skip-settle  # Skip settlement phase
/fr3-update-winning-bets --skip-generate # Skip tip generation phase
/fr3-update-winning-bets --skip-schedine # Skip betting slips phase
/fr3-update-winning-bets --skip-analytics # Skip performance analytics phase
/fr3-update-winning-bets --skip-optimize  # Skip strategy optimization phase
/fr3-update-winning-bets --skip-research  # Skip pre-match research phase
```

**Code Review (global — works in any repo):**

```bash
/fr3-code-review                        # Run ALL 9 review agents
/fr3-code-review security               # Run only the security agent
/fr3-code-review --file api/            # Scope to a directory
/fr3-code-review --multi-model          # Also run Codex CLI + Gemini CLI
/fr3-code-review --fix                  # Auto-fix LOW/MEDIUM issues
/fr3-code-review security --file api/ --multi-model  # Combine flags
```

Full prediction engine architecture: [PREDICTION-ENGINE.md](PREDICTION-ENGINE.md)

## API Endpoints

All data endpoints accept an optional `?league={slug}` parameter (default: `serie-a`).
Valid slugs: `serie-a`, `champions-league`, `la-liga`, `premier-league`, `ligue-1`, `bundesliga`, `eredivisie`.

- `POST /api/billing` — Body: `{ action: "checkout", tier }` or `{ action: "portal" }`
- `POST /api/cron-tasks?task=settle|send` — Settle tips or send tips (CRON_SECRET auth)
- `GET /api/fixtures?type=matches|results|odds&league={slug}` — Matches (2h), results (1h), or odds (30min, requires &fixture={id})
- `GET/POST /api/generate-tips` — Cron orchestrator (GET) or single-league generation (POST)
- `GET /api/match-insights?type=h2h|form` — Head-to-head (24h) or team form (6h)
- `GET /api/betting-slips?date={YYYY-MM-DD}&status={status}` — Smart betting slips (JWT auth, PRO+VIP only)
- `GET /api/stats?type=standings|track-record&league={slug}` — League standings (6h) or track record (1h)
- `POST /api/stripe-webhook` — Stripe event handler (+ auto Telegram invite/kick)
- `POST /api/telegram` — Telegram webhook (with secret header) or account linking (with JWT)
- `GET /api/tips?league={slug}` — Tips filtered by league (15min cache)
- `CRUD /api/user-bets` — Follow/unfollow tips (JWT auth)
- `GET/POST/PUT /api/user-settings?resource=activity|notifications|preferences` — User settings (JWT auth)

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
- **Prefer Claude Code over Claude API** — If something can be done directly by Claude Code (analysis, prediction, data processing, research), do NOT call the Claude/Anthropic API for it. Claude Code IS Claude — use your own capabilities instead of paying for API calls. The `/fr3-generate-tips` skill exists for this reason: Claude Code is the prediction engine, not a wrapper around the API.
- **No autonomous API spending** — Never call Claude API, external paid APIs, or any cost-incurring service autonomously. If a check or verification can be done together with the user (e.g. querying Supabase, checking track record data, testing endpoints), always do it collaboratively instead of burning API credits

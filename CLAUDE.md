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
.claude/skills/fr3-generate-fantacalcio/ → /fr3-generate-fantacalcio (weekly fantasy football picks)
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

## Copilot Agent Team

Two self-contained agents — optimized for GitHub.com's 10-minute coding agent timeout.

| Agent        | Role                                                   | Entry Point                                    |
| ------------ | ------------------------------------------------------ | ---------------------------------------------- |
| **Coder**    | All-in-one: plans, implements, verifies, self-reviews  | GitHub issues, VS Code                         |
| **Reviewer** | Code quality with fix capability — edits code directly | Optional, invoked by Coder for complex changes |

Coder handles 95% of work autonomously (understand → plan → implement → verify → update docs). Reviewer is lightweight and fixes issues in-place rather than reporting them back.

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
/fr3-generate-fantacalcio               # Generate weekly Fantacalcio picks (Serie A)
/fr3-generate-fantacalcio premier-league # Generate for Premier League FPL
/fr3-generate-fantacalcio --force       # Regenerate even if picks for this week exist
/fr3-generate-fantacalcio --dry-run     # Preview picks without inserting in DB
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
- `SMTP_HOST` — SMTP server hostname
- `SMTP_PORT` — SMTP port (465 for SSL, 587 for STARTTLS)
- `SMTP_USER` — SMTP username
- `SMTP_PASS` — SMTP password
- `SMTP_FROM` — Sender email address

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

---

## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep the main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review `tasks/lessons.md` at session start for relevant context

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First** — Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan** — Check in before starting implementation
3. **Track Progress** — Mark items complete as you go
4. **Explain Changes** — High-level summary at each step
5. **Document Results** — Add review section to `tasks/todo.md`
6. **Capture Lessons** — Update `tasks/lessons.md` after any correction from the user

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

- **Simplicity with minimal impact** — Every change should touch only what's necessary and impact minimal code to reduce the risk of introducing bugs
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

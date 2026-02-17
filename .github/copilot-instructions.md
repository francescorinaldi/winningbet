# WinningBet — Copilot Instructions

## Project Overview

Premium multi-league football betting predictions platform. Vanilla JS frontend + Vercel serverless backend + Supabase PostgreSQL. Italian-language user-facing content, English code.

**Leagues:** Serie A, Champions League, La Liga, Premier League, Ligue 1, Bundesliga, Eredivisie
**Tiers:** FREE (basic tips), PRO (extra tips + schedine), VIP (all tips + all schedine)

## Tech Stack

| Layer         | Technology                                                      |
| ------------- | --------------------------------------------------------------- |
| Frontend      | HTML5, CSS3 (custom properties), Vanilla JS (ES6+ IIFE pattern) |
| Backend       | Node.js 18+ Vercel Serverless Functions (CommonJS)              |
| Database      | Supabase (PostgreSQL + Auth + RLS)                              |
| Payments      | Stripe (subscriptions, webhooks, customer portal)               |
| APIs          | api-football.com (primary), football-data.org (fallback)        |
| Notifications | Telegram Bot API, Nodemailer SMTP                               |
| Testing       | Jest 30 (350+ tests, 75%+ coverage)                             |
| Linting       | ESLint 9 (flat config) + Prettier                               |
| Deployment    | Vercel (auto-deploy from main)                                  |

## Commands

```bash
npm run dev            # vercel dev (local serverless + static)
npm run lint           # ESLint all JS
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier format all
npm run format:check   # Prettier check only
npm test               # Jest all tests
npm run test:coverage  # Jest with coverage report
```

## Architecture

```
api/                    # 12 Vercel serverless functions
api/_lib/               # 11 shared backend modules (cache, auth, APIs, Telegram, etc.)
public/                 # Static frontend (no build step) — 6 HTML pages, 6 JS files, 1 CSS
supabase/migrations/    # 14 incremental SQL migrations
tests/                  # 23 test files (unit + integration)
```

### Backend Pattern

Every serverless function follows: **method check -> auth -> parse params -> check cache -> fetch (primary -> fallback) -> set cache -> return JSON**. CommonJS modules (`require`/`module.exports`). Primary API with automatic fallback to secondary.

### Frontend Pattern

IIFE pattern with `'use strict'`. No frameworks, no build step. CSS custom properties for design tokens. `shared.js` provides mobile menu, particles, i18n toggle. `supabase-config.js` provides the Supabase client.

### Database

PostgreSQL via Supabase. Row-Level Security enforces tier-based access. Service role key (backend only) bypasses RLS. Migrations are numbered `NNN_name.sql`, incremental only.

## League Slugs

All data endpoints accept `?league={slug}`. Default: `serie-a`.
Valid: `serie-a`, `champions-league`, `la-liga`, `premier-league`, `ligue-1`, `bundesliga`, `eredivisie`.

## Naming Conventions

- **Files:** kebab-case (`api/betting-slips.js`, `public/shared.js`)
- **JS variables/functions:** camelCase (`resolveLeagueSlug`, `cacheKey`)
- **CSS custom properties:** kebab-case (`--bg-primary`, `--gold-light`)
- **DB columns:** snake_case (`match_date`, `stripe_customer_id`)
- **DB types/enums:** lowercase (`free`, `pro`, `vip`, `pending`, `won`, `lost`)
- **Branches:** `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`

## Non-Negotiable Rules

1. **Read before writing** — understand existing code before modifying
2. **No secrets in code** — all API keys go through serverless functions, never expose to frontend
3. **No `.env` commits** — `.env` files contain secrets
4. **Branch discipline** — never commit directly to main; use feature branches
5. **Small, reviewable PRs** — prefer incremental changes over massive diffs
6. **Update CHANGELOG.md** — every code change must be logged
7. **Keep docs in sync** — CLAUDE.md, CHANGELOG.md, README.md must reflect current state
8. **No dead code** — delete unused functions, commented-out code, unreachable branches
9. **No duplicate logic** — consolidate similar patterns into shared modules
10. **Italian for user-facing content** — all UI text, tooltips, error messages in Italian
11. **Verify before claiming** — never say "it works" without running lint/tests
12. **Understand root causes** — fix underlying issues, not symptoms

## Key Files to Reference

- `api/_lib/leagues.js` — centralized league config (IDs, codes, seasons)
- `api/_lib/auth-middleware.js` — JWT auth, tier checks, cron auth
- `api/_lib/prediction-utils.js` — shared prediction evaluation logic
- `api/_lib/cache.js` — in-memory TTL cache
- `public/shared.js` — shared frontend utilities
- `public/i18n.js` — Italian/English translations
- `eslint.config.mjs` — ESLint 9 flat config (4 environments)
- `.prettierrc` — `semi: true, singleQuote: true, trailingComma: "all", printWidth: 100`
- `vercel.json` — deployment config, cache headers, security headers

## Anti-Patterns to Avoid

- Adding build steps — this is a static site
- Using `var` — always `const` or `let`
- Loose equality — always `===`
- Floating promises — always `.catch()` or `try-catch`
- N+1 queries — batch with `.in('id', ids)`
- Exposing API keys to frontend — route everything through serverless
- Hardcoding league IDs — use `api/_lib/leagues.js`
- Skipping RLS — respect tier-based access policies

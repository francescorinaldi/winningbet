---
applyTo: '**/*.js,**/*.mjs'
---

# JavaScript Conventions

## General

- ESLint 9 flat config (`eslint.config.mjs`) — 4 environments: api, public, tests, skills
- Prettier: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`
- `eqeqeq: always` — never use `==` or `!=`
- `no-var` — always `const` or `let`
- `prefer-const` — use `const` unless reassignment needed
- No floating promises — always `.catch()` or `try-catch`

## Backend (`api/**/*.js`)

- **Module system:** CommonJS (`require`, `module.exports`)
- **Export pattern:** single `async function handler(req, res)`
- **Standard flow:** method check -> auth -> parse params -> cache check -> fetch -> cache set -> respond
- **Error responses:** `res.status(N).json({ error: 'message' })`
- **Primary-fallback:** `await apiFootball.get().catch(() => footballData.get())`
- **Cache:** use `api/_lib/cache.js` with appropriate TTL
- **Auth:** use `api/_lib/auth-middleware.js` — `authenticate(req)` returns `{ user, profile }`
- **Leagues:** always resolve via `api/_lib/leagues.js` — never hardcode IDs
- **Supabase:** always check `{ data, error }` — `if (error) throw error` before using data

### Key shared modules

| Module                     | Import                                            | Purpose                                   |
| -------------------------- | ------------------------------------------------- | ----------------------------------------- |
| `_lib/supabase.js`         | `{ supabase, supabaseAdmin }`                     | Anon client (RLS) + service role (bypass) |
| `_lib/cache.js`            | `cache`                                           | In-memory Map with TTL                    |
| `_lib/auth-middleware.js`  | `{ authenticate, requireTier, authenticateCron }` | JWT, tier, cron auth                      |
| `_lib/leagues.js`          | `{ LEAGUES, resolveLeagueSlug, getLeagueConfig }` | League configuration                      |
| `_lib/api-football.js`     | Primary football data API client                  |
| `_lib/football-data.js`    | Fallback football data API client                 |
| `_lib/prediction-utils.js` | `{ evaluatePrediction, buildActualResult }`       | Shared evaluation                         |
| `_lib/telegram.js`         | Telegram Bot API client                           |

## Frontend (`public/**/*.js`)

- **Module system:** script (no imports/exports) — IIFE pattern
- **Pattern:** `(function () { 'use strict'; /* ... */ })();`
- **Globals:** declared via `/* global supabase, SupabaseConfig, ... */`
- **DOM queries:** cache element references at top of IIFE
- **Event handlers:** named functions, `{ passive: true }` for scroll/touch
- **API calls:** `fetch('/api/endpoint?params')` with `try-catch`
- **UI text:** Italian (via `public/i18n.js` translation system)
- **No frameworks** — vanilla DOM manipulation only
- **Design tokens:** always use CSS custom properties (`var(--gold)`, `var(--bg-card)`)

## Tests (`tests/**/*.js`)

- **Framework:** Jest 30 (`describe`, `it`, `expect`)
- **Module system:** CommonJS
- **Setup:** `tests/setup.js` runs before all tests
- **Mocks:** manual mocks in `tests/__helpers__/`
- **Naming:** `*.test.js` matching source file name
- **Coverage:** target 75%+ line coverage on `api/` files

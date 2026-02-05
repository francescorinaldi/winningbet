# WinningBet - Claude Code Project Guide

## Project Overview
Premium Serie A betting predictions platform. Vanilla JS frontend + Vercel serverless backend. Zero npm production dependencies.

## Tech Stack
- **Frontend**: HTML5, CSS3 (custom properties), Vanilla JS (ES6+ IIFE pattern)
- **Backend**: Node.js Vercel Serverless Functions
- **APIs**: api-football.com (primary), football-data.org (fallback)
- **Deployment**: Vercel
- **Linting**: ESLint 9 (flat config)
- **Formatting**: Prettier
- **Package Manager**: npm

## Project Structure
```
api/                  → Vercel serverless functions
api/_lib/             → Shared backend utilities (API clients, cache)
public/               → Static frontend (index.html, script.js, styles.css)
eslint.config.mjs     → ESLint flat config
.prettierrc           → Prettier config
vercel.json           → Deployment config + caching headers
CHANGELOG.md          → All changes (always update)
```

## Key Commands
```bash
npm run dev           # Start local dev server (vercel dev)
npm run start         # Alias for dev
npm run lint          # ESLint on all JS files
npm run lint:fix      # ESLint with auto-fix
npm run format        # Format all files with Prettier
npm run format:check  # Check formatting without modifying
```

## API Endpoints
- `GET /api/matches` — Next 10 Serie A matches (2h cache)
- `GET /api/results` — Last 10 results (1h cache)
- `GET /api/odds?fixture={id}` — Betting odds (30min cache)
- `GET /api/standings` — League standings (6h cache)

## Environment Variables
- `API_FOOTBALL_KEY` — api-sports.io key
- `FOOTBALL_DATA_KEY` — football-data.org key

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

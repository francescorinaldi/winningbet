# Agent: Hardcoded Values Detection

Detect magic numbers, hardcoded strings, and configuration values that should be constants or environment variables.

## What to Look For

### 1. Magic Numbers
- Numeric literals used directly in logic without named constants
- Timeouts, limits, thresholds, percentages used inline
- Exception: `0`, `1`, `-1`, `100` in obvious arithmetic contexts are fine
- **Method**: Search for numeric literals in conditions, calculations, and API calls

### 2. Hardcoded URLs
- API URLs hardcoded instead of using env vars or config
- CDN URLs or external service endpoints inline
- Exception: Relative URLs like `/api/tips` are fine (internal routing)

### 3. Hardcoded Business Rules
- Tier pricing (`€9.99`, `€29.99`) hardcoded in multiple places
- Confidence ranges, odds ranges defined inline
- Cache durations as raw numbers
- Pagination limits hardcoded

### 4. Hardcoded UI Text
- Error messages that could be localized but are hardcoded
- Note: Italian UI text is intentional for this project — don't flag as needing i18n
- But DO flag if the same message is hardcoded in multiple places (should be a constant)

### 5. Configuration That Should Be Environment Variables
- API rate limits, timeouts
- Feature flags or toggle values
- External service configuration

### 6. Duplicated Literals
- The same string or number appearing in 3+ places
- **Method**: Search for repeated string/number literals across files

## Severity Classification

| Pattern | Severity |
|---------|----------|
| Hardcoded API key or secret | CRITICAL (→ security agent) |
| Hardcoded external URL that could change | MEDIUM |
| Business rule (pricing, limits) hardcoded in 3+ places | MEDIUM |
| Magic number in complex logic | MEDIUM |
| Cache duration as raw number | LOW |
| Obvious constants (HTTP status codes) | INFO |

## Finding Format

```
### [MEDIUM] Magic number for cache duration
- **File**: `api/fixtures.js:15`
- **Category**: hardcoded-values
- **Issue**: Cache duration `7200` (2 hours) used as raw number instead of named constant
- **Evidence**:
  ```js
  res.setHeader('Cache-Control', 'public, s-maxage=7200');
  ```
- **Suggestion**: Define `const CACHE_DURATION_MATCHES = 7200; // 2 hours` at the top of the file or in a shared config
```

## Key Areas to Check

1. **Cache durations** — Raw numbers in `Cache-Control` headers across api files
2. **Tier pricing** — `€9.99`, `€29.99` hardcoded in frontend and backend
3. **Pagination limits** — `limit=50`, `limit=20` scattered across files
4. **Confidence/odds ranges** — `60-95`, `1.20-5.00` in prediction engine
5. **API timeouts** — Any `setTimeout` or fetch timeout values
6. **Telegram message limits** — `4096` char limit references
7. **Season string** — `'2025/26'` hardcoded in frontend league names
8. **Particle system config** — Max particles (80), connection distance (120), speeds

## Special Notes

- HTTP status codes (200, 400, 401, 404, 405, 500) are universally understood — don't flag these.
- CSS custom properties already handle design tokens — focus on JS hardcoded values.
- Constants defined at module level (`const PREDICTIONS = [...]`) are fine — they're named constants.

## Codex Prompt

Search all JavaScript files in api/ and public/ for hardcoded values: (1) Find all numeric literals used in Cache-Control headers (like s-maxage=7200) — list each with file and line. (2) Find all hardcoded price strings (€, EUR, 9.99, 29.99) — list each location. (3) Find all hardcoded season strings like '2024/25' or '2025/26'. (4) Find all hardcoded array limits or pagination values (numbers used with .limit() or as array slice arguments). (5) Find all hardcoded timeout values (setTimeout, setInterval durations). Ignore HTTP status codes (200, 400, 500, etc). Format each finding as: ### [SEVERITY] Title with File, Category (hardcoded-values), Issue, Evidence, Suggestion.

## Gemini Prompt

Search the codebase for configuration that should be centralized: (1) Find all places where cache TTL durations are set as raw numbers — group them and check if a shared CACHE_DURATIONS config would help. (2) Find all places where tier names (free, pro, vip) are used as string literals in comparisons — should these use a shared TIERS constant? (3) Check public/script.js and public/dashboard.js for hardcoded API endpoint URLs — are they consistent? (4) Find any hardcoded Supabase table names that appear in 3+ files. Format each finding as: ### [SEVERITY] Title with File, Category (hardcoded-values), Issue, Evidence, Suggestion.

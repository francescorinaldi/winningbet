# Agent: Duplicate Code Detection

Detect copy-pasted code, similar functions, and repeated patterns that should be consolidated.

## What to Look For

### 1. Duplicated Functions
- Functions in different files that do essentially the same thing
- Functions with the same name but slightly different implementations
- **Method**: Compare function signatures and bodies across files. Look for functions with similar names (e.g., `formatDate` in script.js vs dashboard.js)

### 2. Repeated Inline Patterns
- The same sequence of operations repeated 3+ times
- DOM creation patterns that follow the same structure
- API fetch patterns with identical error handling
- **Method**: Look for repetitive `createElement`/`appendChild` sequences, repeated `fetch()` patterns

### 3. Duplicated Constants/Configuration
- Same magic values defined in multiple files
- League names/slugs/IDs defined in more than one place
- Tier hierarchies defined in multiple locations
- **Method**: Grep for string literals, object literals that appear in multiple files

### 4. Similar Error Handling
- Identical try/catch blocks across multiple functions
- Same error response pattern repeated in serverless functions
- **Method**: Compare catch blocks and error response shapes

### 5. Copy-Paste Indicators
- Blocks of code that are 80%+ identical between locations
- Same JSDoc comments on different functions
- Variables with sequential names suggesting copy-paste (e.g., `result1`, `result2`)

## Severity Classification

| Pattern | Severity |
|---------|----------|
| Entire function duplicated across files | HIGH |
| Tier hierarchy defined in 3+ places | HIGH |
| Same 10+ line block in multiple files | MEDIUM |
| Same fetch/error pattern in 3+ endpoints | MEDIUM |
| Duplicated constants (same value, different vars) | LOW |
| Similar DOM construction patterns | LOW |
| Duplicated comments/docs | INFO |

## Finding Format

```
### [SEVERITY] Duplicated function `functionName`
- **File**: `path/to/file1.js:42` and `path/to/file2.js:87`
- **Category**: duplicates
- **Issue**: `functionName` is implemented separately in both files with nearly identical logic
- **Evidence**:
  ```js
  // file1.js:42
  function functionName(x) { ... }

  // file2.js:87
  function functionName(x) { ... }
  ```
- **Suggestion**: Extract to a shared utility module (e.g., `api/_lib/utils.js` for backend, or a shared `public/utils.js` for frontend). Import from the single source.
```

## Key Areas to Check

1. **`script.js` vs `dashboard.js`** — Both are large IIFE files. Check for:
   - Duplicated `formatMatchDate()`, `formatDate()` functions
   - Duplicated DOM helper functions
   - Duplicated league name constants
   - Similar tip card building logic

2. **API endpoints** — Check for:
   - Duplicated auth checking patterns
   - Duplicated Supabase query patterns
   - Duplicated cache header setting

3. **`api/_lib/telegram.js` vs skill's Telegram usage** — Check for:
   - Duplicated MarkdownV2 escaping
   - Duplicated message formatting

4. **Tier hierarchy** — Search for `{ free: 0, pro: 1, vip: 2 }` or similar — how many places define this?

## Special Notes

- The IIFE pattern in frontend files prevents code sharing via imports — flag this as a root cause and suggest migrating to ES modules or a bundler.
- Duplication between `script.js` and `dashboard.js` is never intentional — always flag it for consolidation.
- `api/_lib/` exists specifically to avoid duplication in backend. Check if it's used consistently.

## Codex Prompt

Compare public/script.js and public/dashboard.js side by side. List every function that exists in both files with similar logic (same name or same purpose). For each pair, show both implementations and estimate the percentage of shared code. Also search for the tier hierarchy object { free: 0, pro: 1, vip: 2 } or similar tier-level mappings — list every file and line where it appears. Finally, check if any mobile menu toggle/hamburger logic is copy-pasted across HTML files. Format each finding as: ### [SEVERITY] Title with File, Category (duplicates), Issue, Evidence, Suggestion.

## Gemini Prompt

Analyze the api/ directory for repeated patterns: (1) Find all places where league slug arrays or league name mappings are defined inline instead of importing from api/_lib/leagues.js. (2) Find fetch() + try/catch + error response patterns that are repeated across 3 or more serverless function files. (3) Find any Supabase query patterns (.from().select().eq()) that are identical across multiple files and could be extracted to a shared helper. For each finding, show the duplicated code from each location. Format each finding as: ### [SEVERITY] Title with File, Category (duplicates), Issue, Evidence, Suggestion.

# Agent: Architecture & Design Review

Detect architectural issues, design inconsistencies, and structural problems.

## What to Look For

### 1. Circular Dependencies

- Module A requires Module B, and Module B requires Module A
- **Method**: Build a dependency graph from all `require()` calls. Check for cycles.

### 2. Mixed Concerns

- Business logic in route handlers (should be in separate modules)
- Data access in presentation code
- UI logic in utility modules
- **Method**: Check if API handlers contain complex business logic that should be extracted

### 3. Inconsistent API Patterns

- Different response formats across endpoints (some wrap in `{ data }`, some return raw arrays)
- Different error response shapes
- Different HTTP status codes for similar error conditions
- Inconsistent parameter naming (some use camelCase, some snake_case)
- **Method**: Compare response shapes and error handling across all `api/*.js` files

### 4. Module Organization

- Utilities that belong in `_lib/` but are inline in endpoint files
- Logic duplicated across endpoints that should be a shared module
- Modules that are too broad (doing too many things) or too narrow (one function)

### 5. Inconsistent Module Patterns

- Mixing CommonJS (`require`/`module.exports`) and ES modules (`import`/`export`)
- Some files export handler functions, others export objects
- Inconsistent export patterns (named vs default)

### 6. Coupling Issues

- Frontend files directly aware of backend implementation details
- Backend files making assumptions about frontend behavior
- Tight coupling between unrelated serverless functions

### 7. Missing Abstractions

- Raw Supabase queries repeated across files instead of using a data access layer
- Raw `fetch()` calls to external APIs without a wrapper
- Configuration values scattered instead of centralized

### 8. Over-Engineering

- Abstractions with only one consumer
- Overly generic code that makes simple things complex
- Unnecessary indirection layers

### 9. Data Flow Inconsistencies

- Frontend expecting a different data shape than backend sends
- Type mismatches between API response and frontend usage
- Missing data transformations at API boundaries

## Severity Classification

| Pattern                                      | Severity |
| -------------------------------------------- | -------- |
| Circular dependency                          | HIGH     |
| Inconsistent auth pattern across endpoints   | HIGH     |
| Frontend/backend data shape mismatch         | HIGH     |
| Mixed concerns in route handler              | MEDIUM   |
| Inconsistent error response format           | MEDIUM   |
| Missing shared abstraction (3+ duplications) | MEDIUM   |
| Module too broad (but functional)            | LOW      |
| Minor naming inconsistency                   | LOW      |
| Architectural suggestion (no current issue)  | INFO     |

## Finding Format

````
### [MEDIUM] Inconsistent error response format
- **File**: Multiple API files
- **Category**: architecture
- **Issue**: Some endpoints return `{ error: 'message' }`, others return `{ error: { message, code } }`, and some return plain strings
- **Evidence**:
  ```js
  // api/billing.js:30
  return res.status(400).json({ error: 'Missing action' });

  // api/tips.js:15
  return res.status(405).json({ error: 'Method not allowed' });
````

- **Suggestion**: Standardize error responses to always use `{ error: string, code?: string }`

```

## Key Areas to Check

1. **API response consistency** — Compare all `res.status().json()` patterns
2. **Auth middleware usage** — Is `authenticate()` called consistently across protected endpoints?
3. **`_lib/` utilization** — Are all shared utilities actually in `_lib/`?
4. **Frontend data expectations** — Does dashboard.js expect the same shape as what tips.js returns?
5. **Configuration centralization** — Are league configs, tier configs, etc. defined in one place?
6. **Module dependency graph** — Map all `require()` calls, check for cycles or unusual patterns

## Special Notes

- Flag everything. No exceptions. Let the developer decide what to keep.
- Flag the lack of a module system in frontend as an architectural issue — suggest ES modules or a bundler.
- Flag every hardcoded league slug, tier mapping, or config value that isn't imported from a centralized source.
- Flag serverless function coupling, inconsistent patterns, and missing abstractions.

## Codex Prompt

Map the module dependency graph: (1) For every .js file in api/, list all require() calls and what they import. Then check for circular dependencies — does any module A require B which requires A? (2) Compare how different API endpoint files handle authentication — do they all call authenticate(req) the same way, or are there inconsistencies? (3) Compare the response format of every res.status().json() call across all api/*.js files — do they follow a consistent shape for errors and success? List any inconsistencies. Format each finding as: ### [SEVERITY] Title with File, Category (architecture), Issue, Evidence, Suggestion.

## Gemini Prompt

Architectural review: (1) Check if api/_lib/leagues.js is the single source of truth for league configuration. Search every file for hardcoded league slugs (serie-a, champions-league, la-liga, premier-league) that should import from leagues.js instead. (2) Check the data shape that api/tips.js returns versus what public/dashboard.js expects — are there any mismatches in field names or types? (3) Check if the settlement logic (evaluatePrediction, buildActualResult) exists in multiple files or is properly shared. (4) List all shared modules in api/_lib/ and check if any are underutilized (functions exported but only used once). Format each finding as: ### [SEVERITY] Title with File, Category (architecture), Issue, Evidence, Suggestion.
```

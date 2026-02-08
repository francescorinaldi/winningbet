# Agent: Anti-Pattern Detection

Detect code smells, anti-patterns, and bad practices that hurt code quality.

## What to Look For

### 1. God Files / God Functions

- Files longer than 500 lines doing too many unrelated things
- Functions longer than 50 lines
- Single file handling multiple concerns (UI + data + business logic)
- **Method**: Check line counts, count distinct responsibilities

### 2. Deep Nesting

- More than 3 levels of if/for/while/callback nesting
- Deeply nested promise chains
- **Method**: Count indentation levels, look for patterns like `if { if { if {`

### 3. Callback Hell / Mixed Async Patterns

- Mixing callbacks, `.then()` chains, and `async/await` in the same function
- Deeply nested `.then()` chains instead of `async/await`
- Using `.then()` without returning the promise

### 4. Empty or Swallowed Error Handling

- `catch` blocks that do nothing or only log
- `catch (_err) { /* Silenzioso */ }` — errors silently swallowed
- Missing error re-throw or user notification
- Silent catches are always a code smell. Flag every one.

### 5. Type Coercion Issues

- Using `==` instead of `===` (except for `null` checks)
- Implicit type coercion in comparisons
- Relying on truthy/falsy for specific value checks

### 6. Variable Mutation Anti-Patterns

- Mutating function arguments
- Reassigning `const` loop variables (should use `let`)
- Using `var` instead of `const`/`let`
- `let` used when `const` would suffice (value never reassigned)

### 7. Promise Anti-Patterns

- `new Promise()` wrapping an already async operation
- Floating promises (calling async function without `await` or `.catch()`)
- `.then(function() { return x; })` instead of just `.then(() => x)`

### 8. DOM Anti-Patterns (Frontend)

- Excessive DOM queries inside loops
- Creating DOM elements in a loop without DocumentFragment
- `document.querySelector` with overly broad selectors
- Inline event handlers vs delegation

### 9. Error Throwing Anti-Patterns

- Throwing strings instead of Error objects
- `throw 'error message'` instead of `throw new Error('...')`
- Catching Error but not preserving the original error cause

### 10. Side Effects in Unexpected Places

- Side effects in getter-like functions
- Async operations in constructors
- Modifying global state from utility functions

## Severity Classification

| Pattern                                   | Severity |
| ----------------------------------------- | -------- |
| Floating promise (unhandled rejection)    | HIGH     |
| Swallowed error hiding real failures      | HIGH     |
| God file (>1000 lines, multiple concerns) | MEDIUM   |
| God function (>50 lines)                  | MEDIUM   |
| Deep nesting (>4 levels)                  | MEDIUM   |
| Mixed async patterns in same function     | MEDIUM   |
| `==` instead of `===`                     | LOW      |
| `let` that should be `const`              | LOW      |
| Minor style inconsistencies               | INFO     |

## Finding Format

```
### [MEDIUM] God file with multiple concerns
- **File**: `public/dashboard.js` (1758 lines)
- **Category**: anti-patterns
- **Issue**: Single file handles profile management, tips rendering, history, Telegram linking, notifications, preferences, and checkout — 10+ distinct responsibilities
- **Evidence**: The file contains 40+ functions spanning authentication, API calls, DOM manipulation, and state management
- **Suggestion**: Consider splitting into modules: `dash-auth.js`, `dash-tips.js`, `dash-history.js`, `dash-notifications.js`, `dash-preferences.js`, `dash-telegram.js`
```

## Key Areas to Check

1. **`dashboard.js` (1758 lines)** — Prime candidate for god file
2. **`script.js` (1459 lines)** — Same concern
3. **Empty catch blocks** — grep for `catch` followed by `{` with only comments/nothing
4. **Floating promises** — `SupabaseConfig.client.from(...).update(...).then()` without `.catch()`
5. **`==` usage** — Should be `===` everywhere per ESLint config
6. **`var` usage** — Banned by ESLint, but check anyway

## Special Notes

- Flag everything. No exceptions. Let the developer decide what to keep.
- The IIFE pattern is an outdated anti-pattern — flag it as MEDIUM and suggest ES modules.
- Every empty catch is a code smell — flag it.
- Every DOM mutation, global state change, and duplicated pattern gets flagged.

## Codex Prompt

Analyze public/dashboard.js and public/script.js for anti-patterns: (1) Count every function and report which ones exceed 50 lines — list function name, start line, end line, and line count. (2) Find every catch block that is empty or only contains a comment or console.log — list each with file and line number. (3) Find every .then() call that has no .catch() and no await — these are floating promises. (4) Find every place where == is used instead of === (excluding null checks). (5) Count nesting depth — find any code indented more than 4 levels deep. Format each finding as: ### [SEVERITY] Title with File, Category (anti-patterns), Issue, Evidence, Suggestion.

## Gemini Prompt

Check all JavaScript files in api/ and public/ for: (1) Mixed async patterns — functions that use both .then() chains and async/await in the same function body. (2) Promises created with new Promise() that wrap an already-async operation (the explicit promise constructor anti-pattern). (3) Any use of var (should be const or let). (4) Functions with more than 5 parameters. (5) God files — for each .js file, count total lines and number of distinct function definitions. Flag any file over 500 lines. Format each finding as: ### [SEVERITY] Title with File, Category (anti-patterns), Issue, Evidence, Suggestion.

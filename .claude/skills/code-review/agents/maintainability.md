# Agent: Maintainability Review

Detect code that is hard to understand, modify, or maintain.

## What to Look For

### 1. Function Complexity
- Functions longer than 50 lines
- Functions with more than 5 parameters
- Functions with cyclomatic complexity >10 (many if/switch/ternary paths)
- Functions doing more than one thing
- **Method**: Count lines, parameters, branches per function

### 2. Naming Quality
- Single-letter variable names outside of loop indices
- Abbreviated names that aren't obvious (`btn` is fine, `hPL` is not)
- Misleading names (function name doesn't match what it does)
- Inconsistent naming conventions within same file
- **Method**: Scan for short variable names, compare naming patterns

### 3. Code Readability
- Complex ternary expressions (nested ternaries)
- Boolean expressions with 3+ conditions without names
- Long method chains without intermediate variables
- Dense code without whitespace or logical grouping

### 4. Missing Documentation
- Exported functions without JSDoc comments
- Complex algorithms without explanatory comments
- Non-obvious business logic without context
- Note: Don't flag obvious getter/setter functions — only flag where intent is unclear

### 5. Inconsistent Patterns
- Different coding styles in the same file
- Some functions use arrow syntax, others use `function` keyword, inconsistently
- Some error handling uses async/await, others use `.then()`
- **Method**: Compare function declaration styles within files

### 6. Technical Debt Indicators
- TODO/FIXME comments without tracking
- Workarounds with "temporary" labels
- Code commented with dates suggesting it was meant to be removed
- Deprecated patterns still in use

### 7. Testability
- Functions with side effects that make testing difficult
- Global state mutations
- Functions tightly coupled to DOM or external services
- No pure utility functions extracted for unit testing

### 8. Configuration Maintainability
- Config values scattered across files
- No clear separation between dev/prod configuration
- Environment-dependent behavior without clear documentation

## Severity Classification

| Pattern | Severity |
|---------|----------|
| Function >100 lines with 10+ branches | HIGH |
| Misleading function name | HIGH |
| File >1000 lines with no clear structure | MEDIUM |
| Function with 6+ parameters | MEDIUM |
| Nested ternary | MEDIUM |
| Complex boolean without named variable | LOW |
| Missing JSDoc on exported function | LOW |
| Minor naming inconsistency | INFO |
| Improvement suggestion | INFO |

## Finding Format

```
### [MEDIUM] Complex function with too many responsibilities
- **File**: `public/dashboard.js:313-567`
- **Category**: maintainability
- **Issue**: `renderTipsGrid()` is 254 lines long, handling tip card creation, status display, expand functionality, follow buttons, H2H loading, and form loading
- **Evidence**: Function contains 15+ DOM creation blocks, 5+ event listeners, and 3+ conditional rendering paths
- **Suggestion**: Break into smaller functions: `renderTipCard(tip)`, `renderTipHeader(tip)`, `renderTipDetails(tip)`, `attachExpandHandler(card, tip)`
```

## Key Areas to Check

1. **`dashboard.js:renderTipsGrid`** — Very long function, multiple responsibilities
2. **`script.js:buildTipCard` vs `buildTipCardFromAPI`** — Two similar functions
3. **Naming** — Check for `el`, `btn`, `m`, `r`, `d` variables in complex contexts
4. **Nested ternaries** — Search for `? ... ? ... :` patterns
5. **Export patterns** — Are all public API functions documented?
6. **Function parameter counts** — Check functions with many params

## Special Notes

- This is a vanilla JS project — no TypeScript, no framework. Some patterns that would be anti-patterns in React/Vue are standard here.
- The project targets multilanguage support. Flag hardcoded Italian (or any language) strings in UI text, error messages, and user-facing content as i18n issues (defer to the hardcoded-values agent for severity).
- Code comments and JSDoc should be in English. Flag non-English comments as a maintainability issue (LOW severity).
- Variable and function names are in English — this is correct.
- The IIFE pattern means all functions are "private" by default — JSDoc is less critical for internal functions.

## Codex Prompt

Analyze code maintainability in public/dashboard.js and public/script.js: (1) List every function with its line count — flag any over 50 lines. (2) Find functions with 4+ parameters. (3) Find nested ternary expressions (ternary inside ternary). (4) Find boolean expressions with 3+ conditions that are not assigned to a named variable. (5) For each file, count total functions and total lines, then compute the average function length. Which functions are the most complex? Format each finding as: ### [SEVERITY] Title with File, Category (maintainability), Issue, Evidence, Suggestion.

## Gemini Prompt

Review naming and readability across the codebase: (1) Find single-letter variable names (other than i, j, k in loops or common abbreviations like e for event) — list each with context. (2) Find any function whose name does not clearly describe what it does (misleading names). (3) Check exported functions in api/_lib/*.js — do they all have JSDoc comments? List any without. (4) Find any deeply nested object access (4+ levels like a.b.c.d.e) without optional chaining or null checks. (5) Find any non-English code comments or JSDoc descriptions — all comments should be in English for maintainability. Format each finding as: ### [SEVERITY] Title with File, Category (maintainability), Issue, Evidence, Suggestion.

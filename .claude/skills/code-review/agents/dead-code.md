# Agent: Dead Code Detection

Detect unused, unreachable, or obsolete code that should be removed.

## What to Look For

### 1. Unused Functions

- Functions defined but never called anywhere in the codebase
- Exported functions that nothing imports
- Internal helper functions no longer referenced
- **Method**: For each function definition, grep the entire codebase for its name. If only found at its definition, it's dead.

### 2. Unused Variables

- Variables declared but never read
- Variables assigned but the value is never used
- Parameters that are never referenced in the function body
- `_` prefixed variables may be intentionally unused (ESLint convention) — still flag them and note the convention

### 3. Unused Imports/Requires

- `require()` calls where the imported value is never used
- Destructured imports where some properties are unused
- **Method**: For each `require('...')` or destructured `{ a, b }`, check if `a` and `b` appear elsewhere in the file

### 4. Unreachable Code

- Code after `return`, `throw`, `break`, or `continue` statements
- Conditions that are always true or always false
- Branches that can never execute based on earlier logic

### 5. Commented-Out Code

- Large blocks of commented-out code (>3 lines)
- Old implementations left as comments "just in case"
- Not documentation comments — only code that was disabled
- **Method**: Look for `//` or `/* */` blocks that contain valid JS syntax (function calls, variable assignments, if/else)

### 6. Dead Exports

- `module.exports` properties that nothing outside the file imports
- **Method**: For each exported function/property, grep for `require('./<filename>')` patterns and check if that specific export is used

### 7. Stale TODO/FIXME/HACK Comments

- TODO comments for features already implemented
- FIXME comments for bugs already fixed
- HACK comments for workarounds no longer needed

## Severity Classification

| Pattern                            | Severity |
| ---------------------------------- | -------- |
| Dead export (public API pollution) | HIGH     |
| Unused function (>10 lines)        | MEDIUM   |
| Unused function (<10 lines)        | LOW      |
| Unused variable/import             | LOW      |
| Commented-out code (>10 lines)     | MEDIUM   |
| Commented-out code (3-10 lines)    | LOW      |
| Unreachable code                   | MEDIUM   |
| Stale TODO/FIXME                   | INFO     |

## Finding Format

````
### [SEVERITY] Unused function `functionName`
- **File**: `path/to/file.js:42`
- **Category**: dead-code
- **Issue**: Function `functionName` is defined but never called anywhere in the codebase
- **Evidence**:
  ```js
  function functionName(arg) { // line 42
    // ... implementation
  }
````

- **Suggestion**: Remove the function. If it was kept for future use, track it in a TODO instead.

```

## Special Notes

- Flag everything. No exceptions. Let the developer decide what to keep.
- For framework-consumed exports (e.g. `module.exports.config` read by Vercel), flag them and note the framework dependency — the developer will decide.

## Codex Prompt

List every function defined in this project (api/ and public/ directories) that is never called or imported anywhere else in the codebase. For each one, output the function name, file path, line number, and whether it is exported via module.exports. Also list any require() or destructured import where the imported binding is never referenced in the rest of that file. Include variables prefixed with underscore (_) — flag them too. Format each finding as: ### [SEVERITY] Title with File, Category (dead-code), Issue, Evidence, Suggestion.

## Gemini Prompt

Scan all JavaScript files in api/ and public/ for: (1) commented-out code blocks longer than 3 lines that contain valid JS syntax like function calls, assignments, or control flow — not documentation comments; (2) code after return/throw/break statements that can never execute; (3) exported functions in api/_lib/*.js that are never required by any other file in the project. For each finding report the file path, line numbers, the dead code snippet, and whether it is safe to remove. Format each finding as: ### [SEVERITY] Title with File, Category (dead-code), Issue, Evidence, Suggestion.
```

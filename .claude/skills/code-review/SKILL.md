---
name: code-review
description: Run comprehensive code review agents to detect dead code, duplicates, security issues, anti-patterns, performance problems, architecture smells, hardcoded values, error handling gaps, and maintainability issues. Supports multi-model analysis with Claude, Codex CLI, and Gemini CLI.
argument-hint: "[agent-name] [--file path] [--multi-model] [--fix]"
user-invocable: true
allowed-tools: Bash(*), Read, Glob, Grep, Write, Edit, WebSearch
---

# Code Review — Multi-Agent Analysis Engine

You ARE the code reviewer. Analyze the codebase like a senior engineer performing a thorough code audit. Every finding must be backed by evidence (file paths, line numbers, code snippets).

## Configuration

- **Report output**: `code-review-report.md` (project root, gitignored)
- **Severity levels**: CRITICAL, HIGH, MEDIUM, LOW, INFO
- **Agents**: dead-code, duplicates, security, anti-patterns, performance, architecture, hardcoded-values, error-handling, maintainability

## Parse Arguments

From `$ARGUMENTS`:

- No args -> run ALL agents sequentially
- An agent name (e.g., `security`, `dead-code`) -> run only that agent
- `--file <path>` -> scope review to a single file or directory
- `--multi-model` -> after Claude analysis, also run Codex CLI and Gemini CLI, then consolidate
- `--fix` -> after analysis, auto-fix issues where safe to do so (LOW/MEDIUM only)
- Combine: `security --file api/ --multi-model`

## Procedure

### 1. Determine Scope

If `--file` is provided, scope all analysis to that path. Otherwise, analyze the full project:

**Files to analyze** (read via Glob):
- `api/**/*.js` — All serverless functions and libraries
- `public/**/*.js` — All frontend scripts
- `public/**/*.css` — Stylesheets
- `public/**/*.html` — HTML files
- `*.js`, `*.mjs` — Root config files

**Files to SKIP**:
- `node_modules/`, `.vercel/`, `supabase/migrations/`, `.claude/`
- `package-lock.json`, `*.min.js`

### 2. Read Agent Prompts

For each agent to run, read its prompt file from `.claude/skills/code-review/agents/<name>.md`.

Each agent file contains:
- What to look for (specific patterns, anti-patterns)
- How to classify severity
- Example findings format

### 3. Execute Each Agent

For EACH agent, perform the analysis described in its prompt file. Work through the codebase systematically:

1. Read the agent's `.md` file for instructions
2. Use Glob to find relevant files
3. Use Grep to search for specific patterns
4. Read files that need deeper analysis
5. Record ALL findings with:
   - **Severity**: CRITICAL / HIGH / MEDIUM / LOW / INFO
   - **File**: Exact path and line number(s)
   - **Issue**: Clear, specific description
   - **Evidence**: The problematic code snippet
   - **Suggestion**: How to fix it
   - **Category**: Which agent found it

### 4. Run External Models (if --multi-model)

If `--multi-model` flag is present:

```bash
bash .claude/skills/code-review/scripts/run-external-models.sh [scope]
```

This script:
- Checks if `codex` and `gemini` CLIs are installed
- Sends targeted prompts to each model
- Saves output to temp files
- The consolidator merges all findings

Then run the consolidator:
```bash
node .claude/skills/code-review/scripts/consolidate-reports.js
```

### 5. Auto-Fix (if --fix)

If `--fix` flag is present, auto-fix **LOW** and **MEDIUM** issues that are safe to fix:
- Remove unused variables/imports
- Replace `==` with `===`
- Add missing `const` (replace `let` where never reassigned)
- Remove commented-out code blocks
- Fix inconsistent naming

Do NOT auto-fix:
- CRITICAL or HIGH severity issues (need human review)
- Security issues (need careful analysis)
- Architectural changes
- Anything that changes behavior

### 6. Generate Report

Write the consolidated report to `code-review-report.md`:

```markdown
# Code Review Report

**Date**: YYYY-MM-DD
**Scope**: [full project | specific path]
**Models**: [Claude | Claude + Codex + Gemini]
**Agents run**: [list]

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | N     |
| HIGH     | N     |
| MEDIUM   | N     |
| LOW      | N     |
| INFO     | N     |
| **Total**| **N** |

## Critical Issues

### [CRITICAL] Issue Title
- **File**: `path/to/file.js:42`
- **Category**: security
- **Issue**: Description of the problem
- **Evidence**:
  ```js
  // problematic code
  ```
- **Suggestion**: How to fix it

## High Issues
...

## Medium Issues
...

## Low Issues
...

## Info / Suggestions
...

## Auto-Fixed (if --fix)
- [ ] `file.js:10` — Replaced `==` with `===`
- [ ] `file.js:25` — Removed unused variable `foo`
...
```

### 7. Display Summary

After writing the report, display a formatted summary in the terminal:

```
=== CODE REVIEW COMPLETE ===

Scope: [full project | path]
Agents: 9/9 | Models: Claude [+ Codex + Gemini]

CRITICAL: N | HIGH: N | MEDIUM: N | LOW: N | INFO: N

Top issues:
1. [CRITICAL] security — SQL injection in api/tips.js:42
2. [HIGH] dead-code — Unused function loadLegacy() in script.js:380
3. [MEDIUM] duplicates — buildTipCard duplicated in script.js and dashboard.js

Full report: code-review-report.md
```

## Agent Descriptions

| Agent | Focus | Key Patterns |
|-------|-------|-------------|
| `dead-code` | Unused functions, variables, imports, unreachable code, commented-out blocks | `grep` for function defs, cross-ref with usages |
| `duplicates` | Copy-pasted logic, similar functions, repeated patterns | Compare function bodies across files |
| `security` | OWASP top 10, hardcoded secrets, missing auth, XSS, injection | Pattern matching + context analysis |
| `anti-patterns` | God files, deep nesting, callback hell, empty catches, `==` | AST-level patterns |
| `performance` | N+1 queries, unbounded fetches, memory leaks, missing caching | Data flow analysis |
| `architecture` | Circular deps, mixed concerns, inconsistent patterns | Module dependency graph |
| `hardcoded-values` | Magic numbers, hardcoded URLs, config that should be env vars | Literal value scanning |
| `error-handling` | Missing try/catch, swallowed errors, generic catches, inconsistent responses | Error path analysis |
| `maintainability` | Long functions, complex expressions, poor naming, missing types | Complexity metrics |

## Important Notes

- You ARE the reviewer. Analyze code directly — do NOT call the Claude API.
- Every finding MUST include file path, line number, and code evidence.
- Don't flag things that are intentional design choices (e.g., IIFE pattern in frontend).
- Respect the project's conventions (Italian UI text, CommonJS in api/, etc.).
- The report should be actionable — every finding needs a clear fix suggestion.
- Be thorough but avoid false positives. Quality over quantity.
- When uncertain about severity, classify conservatively (lower severity).

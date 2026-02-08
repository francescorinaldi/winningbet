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
- `--multi-model` -> for each agent, also invoke Codex CLI and Gemini CLI with agent-specific prompts
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

### 2. Execute Agents in Parallel

All agents are independent — they analyze different aspects of the same code. **Launch them in parallel using the Task tool** for maximum speed.

#### Parallel Execution Strategy

Use the Task tool to launch multiple subagents simultaneously. Each subagent:
1. Reads its agent prompt from `.claude/skills/code-review/agents/<name>.md`
2. Performs the Claude analysis using native tools (Read, Grep, Glob)
3. If `--multi-model`, also invokes Codex CLI and Gemini CLI (see below)
4. Returns all findings in the standard format

**Launch pattern** (all at once in a single message with multiple Task tool calls):

```
Task: "code-review: dead-code agent"
Task: "code-review: duplicates agent"
Task: "code-review: security agent"
Task: "code-review: anti-patterns agent"
Task: "code-review: performance agent"
Task: "code-review: architecture agent"
Task: "code-review: hardcoded-values agent"
Task: "code-review: error-handling agent"
Task: "code-review: maintainability agent"
```

Each Task prompt should include:
- The full agent instructions (from the `.md` file)
- The scope (which files to analyze)
- Whether `--multi-model` is active
- Instructions to return findings in the standard format

#### Within Each Agent: Multi-Model Flow

If `--multi-model` is active, each agent subagent should:

**Step 1: Claude analysis** — Perform the analysis using native tools (Read, Grep, Glob).

**Step 2: Codex CLI** — Read the `## Codex Prompt` section from the agent's `.md` file and run:

```bash
codex --quiet --approval-mode full-auto "<agent-specific codex prompt>"
```

- `--quiet`: non-interactive, output to stdout
- `--approval-mode full-auto`: auto-approve file reads
- First check: `command -v codex` — skip if not installed

**Step 3: Gemini CLI** — Read the `## Gemini Prompt` section from the agent's `.md` file and run:

```bash
gemini -p "<agent-specific gemini prompt>" --yolo
```

- `-p`: headless mode (single prompt, exits after response)
- `--yolo`: auto-approve tool calls
- First check: `command -v gemini` — skip if not installed

**Note**: Within a single agent, Codex and Gemini can also run in parallel (two Bash calls in the same message), since they're independent.

**Step 4: Merge** — Combine findings from all models for this agent:

1. Parse external model outputs for findings matching: `### [SEVERITY] Title`
2. Deduplicate: same file + same issue = keep the one with more detail
3. **Severity upgrade**: 2+ models agree on same issue → bump one level (LOW→MEDIUM, MEDIUM→HIGH), tag `[MULTI-MODEL]`
4. Unique findings from external models that Claude missed → tag `[codex-only]` or `[gemini-only]`

### 3. Collect Results

After all parallel agents complete, collect their findings into a single list sorted by severity.

### 4. Auto-Fix (if --fix)

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

### 5. Generate Report

Write the consolidated report to `code-review-report.md`:

```markdown
# Code Review Report

**Date**: YYYY-MM-DD
**Scope**: [full project | specific path]
**Models**: [Claude | Claude + Codex + Gemini]
**Agents run**: [list]

## Summary

| Severity | Count | Multi-Model Confirmed |
|----------|-------|-----------------------|
| CRITICAL | N     | N                     |
| HIGH     | N     | N                     |
| MEDIUM   | N     | N                     |
| LOW      | N     | N                     |
| INFO     | N     | N                     |
| **Total**| **N** | **N**                 |

## Critical Issues

### [CRITICAL] Issue Title
- **File**: `path/to/file.js:42`
- **Category**: security
- **Models**: Claude, Codex, Gemini (or just Claude)
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

### 6. Display Summary

After writing the report, display a formatted summary:

```
=== CODE REVIEW COMPLETE ===

Scope: [full project | path]
Agents: 9/9 | Models: Claude [+ Codex + Gemini]

CRITICAL: N | HIGH: N | MEDIUM: N | LOW: N | INFO: N
Multi-model confirmed: N

Top issues:
1. [CRITICAL] security — Webhook auth bypass in api/telegram.js:36
2. [HIGH] performance — N+1 DB queries in api/cron-tasks.js:96
3. [MEDIUM] duplicates — Mobile menu duplicated across 6 files

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
| `hardcoded-values` | Magic numbers, hardcoded URLs, config that should be env vars, hardcoded locale strings (i18n) | Literal value scanning + i18n audit |
| `error-handling` | Missing try/catch, swallowed errors, generic catches, inconsistent responses | Error path analysis |
| `maintainability` | Long functions, complex expressions, poor naming, missing types | Complexity metrics |

## External CLI Reference

### Codex CLI
- **Install**: `npm install -g @openai/codex`
- **Auth**: `export OPENAI_API_KEY=sk-...` or run `codex` once to login with ChatGPT
- **Non-interactive**: `codex --quiet --approval-mode full-auto "prompt"`
- **Docs**: https://developers.openai.com/codex/cli/

### Gemini CLI
- **Install**: `npm install -g @google/gemini-cli`
- **Auth**: Run `gemini` once to login with Google (free: 1000 req/day)
- **Headless**: `gemini -p "prompt" --yolo`
- **Docs**: https://geminicli.com/docs/cli/headless/

## Important Notes

- You ARE the reviewer. Analyze code directly — do NOT call the Claude API.
- Every finding MUST include file path, line number, and code evidence.
- Flag everything that deviates from best practices. No exceptions, no "intentional" passes.
- Flag all hardcoded locale-specific strings (Italian UI text, error messages, labels) as i18n issues — the project targets multilanguage support.
- The report should be actionable — every finding needs a clear fix suggestion.
- Be thorough. Flag everything and let the developer decide what to keep.
- Classify severity based on actual impact, not assumptions about intent.
- External CLI calls are read-only — never pass `--write` or mutation flags.
- If an external CLI fails or times out, log the failure and continue with Claude-only findings.

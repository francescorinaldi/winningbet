#!/usr/bin/env bash
#
# run-external-models.sh — Run code review through Codex CLI and Gemini CLI
#
# Usage:
#   bash .claude/skills/code-review/scripts/run-external-models.sh [scope]
#
# Arguments:
#   scope — Optional file/directory to review (default: full project)
#
# Output:
#   .claude/skills/code-review/.reports/codex-report.md
#   .claude/skills/code-review/.reports/gemini-report.md
#
# Prerequisites:
#   - Codex CLI: npm install -g @openai/codex (requires OpenAI API key or ChatGPT subscription)
#   - Gemini CLI: npm install -g @google/gemini-cli (free with Google account, 1000 req/day)
#
# Both are optional — if not installed, the script skips gracefully.
#
# How it works:
#   - Codex CLI: uses --quiet mode (non-interactive, outputs to stdout) + --approval-mode full-auto
#   - Gemini CLI: uses -p flag (headless/non-interactive, single prompt, exits after response)
#   - Both read the working directory context automatically
#   - Output is captured to markdown files for the consolidator

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="${SCRIPT_DIR}/../.reports"
SCOPE="${1:-}"

mkdir -p "$REPORTS_DIR"

# ─── Shared Review Prompt ────────────────────────────────────────────────────

generate_prompt() {
  cat <<'PROMPT_END'
You are performing a comprehensive code review. Analyze the codebase for:

1. **Security**: SQL injection, XSS, command injection, hardcoded secrets, missing auth, CORS issues
2. **Dead Code**: Unused functions, variables, imports, unreachable code, commented-out code
3. **Duplicates**: Copy-pasted logic, similar functions, repeated patterns
4. **Anti-Patterns**: God files, deep nesting, empty catches, mixed async patterns, == vs ===
5. **Performance**: N+1 queries, unbounded fetches, memory leaks, missing caching
6. **Error Handling**: Missing try/catch, swallowed errors, unchecked results
7. **Hardcoded Values**: Magic numbers, hardcoded URLs, config not in env vars
8. **Maintainability**: Long functions, complex expressions, poor naming

For each issue found, report using this EXACT format so findings can be parsed:

### [SEVERITY] Issue title
- **File**: `path/to/file.js:42`
- **Category**: security|dead-code|duplicates|anti-patterns|performance|error-handling|hardcoded-values|maintainability
- **Issue**: Description of the problem
- **Evidence**:
  ```js
  // problematic code
  ```
- **Suggestion**: How to fix it

Severity must be one of: CRITICAL, HIGH, MEDIUM, LOW, INFO

Focus on actionable findings. Don't report style issues covered by ESLint/Prettier.

Project context:
- Node.js serverless (Vercel) + vanilla JS frontend
- Supabase (PostgreSQL + Auth + RLS)
- Stripe payments, Telegram bot, SendGrid email
- Italian language UI
- CommonJS in api/, IIFE pattern in public/
PROMPT_END
}

# ─── Codex CLI ───────────────────────────────────────────────────────────────
# Docs: https://developers.openai.com/codex/cli/
#
# Key flags:
#   --quiet (-q)           Non-interactive mode, outputs to stdout (no TUI)
#   --approval-mode        full-auto = auto-approve reads (no writes needed for review)
#   --model (-m)           Model selection (default: latest codex model)
#
# Auth: Requires OPENAI_API_KEY env var or ChatGPT login (run `codex` once to authenticate)
#
# The CLI automatically reads the working directory for context.

run_codex() {
  if ! command -v codex &>/dev/null; then
    echo "[SKIP] Codex CLI not found."
    echo "       Install: npm install -g @openai/codex"
    echo "       Auth:    export OPENAI_API_KEY=sk-... (or run 'codex' to login with ChatGPT)"
    echo "# Codex CLI not available — skipped" > "$REPORTS_DIR/codex-report.md"
    return 0
  fi

  echo "[INFO] Running Codex CLI code review..."

  local prompt
  prompt=$(generate_prompt)

  local scope_instruction=""
  if [ -n "$SCOPE" ]; then
    scope_instruction="Focus your review on: $SCOPE."
  fi

  # --quiet: non-interactive, prints assistant output to stdout
  # --approval-mode full-auto: auto-approve file reads (review is read-only)
  codex --quiet --approval-mode full-auto \
    "$scope_instruction Review this codebase for security, performance, and code quality issues. $prompt" \
    > "$REPORTS_DIR/codex-report.md" 2>/dev/null || {
      echo "[WARN] Codex CLI returned non-zero exit code"
      echo "# Codex review failed or timed out" > "$REPORTS_DIR/codex-report.md"
    }

  local lines
  lines=$(wc -l < "$REPORTS_DIR/codex-report.md" 2>/dev/null || echo "0")
  echo "[OK] Codex report: $REPORTS_DIR/codex-report.md ($lines lines)"
}

# ─── Gemini CLI ──────────────────────────────────────────────────────────────
# Docs: https://geminicli.com/docs/cli/headless/
#
# Key flags:
#   -p "prompt"            Headless/non-interactive mode (single prompt, exits after response)
#   --yolo                 Auto-approve tool calls (for read-only review, safe to use)
#   --output-format        text (default) | json | jsonl
#
# Auth: Free with personal Google account (1000 req/day, 60 req/min).
#       Or set GEMINI_API_KEY env var for API key auth.
#       Run `gemini` once interactively to authenticate with Google OAuth.
#
# The -p flag is the key: it makes Gemini CLI process one prompt and exit,
# similar to Codex's --quiet mode. You can also pipe input:
#   cat file.js | gemini -p "Review this code"

run_gemini() {
  if ! command -v gemini &>/dev/null; then
    echo "[SKIP] Gemini CLI not found."
    echo "       Install: npm install -g @google/gemini-cli"
    echo "       Auth:    Run 'gemini' once to login with Google (free tier: 1000 req/day)"
    echo "# Gemini CLI not available — skipped" > "$REPORTS_DIR/gemini-report.md"
    return 0
  fi

  echo "[INFO] Running Gemini CLI code review..."

  local prompt
  prompt=$(generate_prompt)

  local scope_instruction=""
  if [ -n "$SCOPE" ]; then
    scope_instruction="Focus your review on: $SCOPE."
  fi

  # -p: headless mode (non-interactive, single prompt, exits after response)
  # --yolo: auto-approve tool calls (safe for read-only review)
  # Gemini CLI reads the working directory automatically for context
  gemini -p "$scope_instruction Review this codebase for security, performance, and code quality issues. $prompt" \
    --yolo \
    > "$REPORTS_DIR/gemini-report.md" 2>/dev/null || {
      echo "[WARN] Gemini CLI returned non-zero exit code"
      echo "# Gemini review failed or timed out" > "$REPORTS_DIR/gemini-report.md"
    }

  local lines
  lines=$(wc -l < "$REPORTS_DIR/gemini-report.md" 2>/dev/null || echo "0")
  echo "[OK] Gemini report: $REPORTS_DIR/gemini-report.md ($lines lines)"
}

# ─── Main ────────────────────────────────────────────────────────────────────

echo "=== External Model Code Review ==="
echo "Scope: ${SCOPE:-full project}"
echo ""

# Run both in parallel for speed (they're independent)
run_codex &
CODEX_PID=$!

run_gemini &
GEMINI_PID=$!

# Wait for both
wait $CODEX_PID 2>/dev/null || true
echo ""
wait $GEMINI_PID 2>/dev/null || true

echo ""
echo "=== External reviews complete ==="
echo "Reports: $REPORTS_DIR/"
echo ""
echo "Run the consolidator to merge findings:"
echo "  node .claude/skills/code-review/scripts/consolidate-reports.js"

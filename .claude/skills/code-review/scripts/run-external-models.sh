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
#   - codex CLI (npm install -g @openai/codex)
#   - gemini CLI (npm install -g @google/gemini-cli)
#
# Both are optional — if not installed, the script skips gracefully.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORTS_DIR="${SCRIPT_DIR}/../.reports"
SCOPE="${1:-}"

mkdir -p "$REPORTS_DIR"

# ─── Shared Review Prompt ────────────────────────────────────────────────────

generate_prompt() {
  local scope_desc="the full project"
  if [ -n "$SCOPE" ]; then
    scope_desc="$SCOPE"
  fi

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

For each issue found, report:
- Severity: CRITICAL / HIGH / MEDIUM / LOW / INFO
- File path and line number
- Issue description
- Code snippet showing the problem
- Suggested fix

Focus on actionable findings. Don't report style issues covered by ESLint/Prettier.

Project context:
- Node.js serverless (Vercel) + vanilla JS frontend
- Supabase (PostgreSQL + Auth + RLS)
- Stripe payments, Telegram bot, SendGrid email
- Italian language UI
- CommonJS in api/, IIFE pattern in public/
PROMPT_END
}

# ─── Collect File List ───────────────────────────────────────────────────────

collect_files() {
  if [ -n "$SCOPE" ]; then
    if [ -d "$SCOPE" ]; then
      find "$SCOPE" -name "*.js" -o -name "*.mjs" | grep -v node_modules | grep -v .vercel | head -30
    else
      echo "$SCOPE"
    fi
  else
    {
      find api -name "*.js" 2>/dev/null
      find public -name "*.js" 2>/dev/null
      find . -maxdepth 1 -name "*.mjs" 2>/dev/null
    } | grep -v node_modules | grep -v .vercel | sort
  fi
}

# ─── Codex CLI ───────────────────────────────────────────────────────────────

run_codex() {
  if ! command -v codex &>/dev/null; then
    echo "[SKIP] Codex CLI not found. Install with: npm install -g @openai/codex"
    echo "# Codex CLI not available — skipped" > "$REPORTS_DIR/codex-report.md"
    return 0
  fi

  echo "[INFO] Running Codex CLI code review..."

  local prompt
  prompt=$(generate_prompt)

  # Codex CLI in quiet/non-interactive mode
  codex --quiet --approval-mode full-auto \
    "Review this codebase for security, performance, and code quality issues. $prompt" \
    2>/dev/null > "$REPORTS_DIR/codex-report.md" || {
      echo "[WARN] Codex CLI returned non-zero exit code"
      echo "# Codex review failed or timed out" > "$REPORTS_DIR/codex-report.md"
    }

  echo "[OK] Codex report saved to $REPORTS_DIR/codex-report.md"
}

# ─── Gemini CLI ──────────────────────────────────────────────────────────────

run_gemini() {
  if ! command -v gemini &>/dev/null; then
    echo "[SKIP] Gemini CLI not found. Install with: npm install -g @google/gemini-cli"
    echo "# Gemini CLI not available — skipped" > "$REPORTS_DIR/gemini-report.md"
    return 0
  fi

  echo "[INFO] Running Gemini CLI code review..."

  local prompt
  prompt=$(generate_prompt)

  # Gemini CLI in non-interactive mode
  echo "$prompt" | gemini --non-interactive \
    2>/dev/null > "$REPORTS_DIR/gemini-report.md" || {
      echo "[WARN] Gemini CLI returned non-zero exit code"
      echo "# Gemini review failed or timed out" > "$REPORTS_DIR/gemini-report.md"
    }

  echo "[OK] Gemini report saved to $REPORTS_DIR/gemini-report.md"
}

# ─── Main ────────────────────────────────────────────────────────────────────

echo "=== External Model Code Review ==="
echo "Scope: ${SCOPE:-full project}"
echo ""

run_codex
echo ""
run_gemini

echo ""
echo "=== External reviews complete ==="
echo "Reports: $REPORTS_DIR/"
echo ""
echo "Run the consolidator to merge findings:"
echo "  node .claude/skills/code-review/scripts/consolidate-reports.js"

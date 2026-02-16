---
name: fr3-update-winning-bets
description: Master orchestrator that runs the full betting pipeline — settle finished matches, generate fresh tips, build weekly schedine, and send to Telegram. Replaces fr3-daily-tips with smarter checks, per-week schedine, and optional flags. Use when user asks to run the pipeline, update everything, or daily update.
argument-hint: [--skip-settle] [--skip-generate] [--skip-schedine] [--force] [--no-send] [--dry-run]
user-invocable: true
allowed-tools: WebSearch, mcp__plugin_supabase_supabase__execute_sql, Skill
---

# Update WinningBets — Master Pipeline Orchestrator

Smart orchestrator that runs the full betting pipeline in sequence.
Designed to minimize token usage: pre-check each phase, skip what's not needed, exit fast on quiet days.

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Default behavior**: all phases auto, send to Telegram
- **Week definition**: Monday 00:00 to Sunday 23:59 (ISO week)

## Parse Arguments

From `$ARGUMENTS`:

| Flag | Effect |
|------|--------|
| *(none)* | Full auto — checks everything, runs what's needed, sends to Telegram |
| `--skip-settle` | Skip Phase 1 (settlement) |
| `--skip-generate` | Skip Phase 2 (tip generation) |
| `--skip-schedine` | Skip Phase 3 (betting slips) |
| `--force` | Force ALL phases regardless of smart checks |
| `--no-send` | Don't send to Telegram (default is to send) |
| `--dry-run` | Show what each phase WOULD do without executing anything |

Flags can be combined: `--skip-settle --no-send`, `--force --dry-run`, etc.

Derive `SEND_FLAG`:
- If `--no-send` → `SEND_FLAG = ""`
- Otherwise → `SEND_FLAG = " --send"`

## Pipeline Overview

```
Phase 1: SETTLE    → settle finished matches + generate retrospectives  → /fr3-settle-tips
Phase 2: GENERATE  → generate fresh tips if needed                      → /fr3-generate-tips --delete [--send]
Phase 3: SCHEDINE  → build weekly betting slips                         → /fr3-generate-betting-slips [--send]
Phase 4: SUMMARY   → final report with retrospective stats (always runs)
```

Each phase runs only if its pre-check passes (unless `--force`).
Always settle BEFORE generating (settlement updates the track record used for calibration).

## Phase 1: Settle

### Pre-check

```sql
SELECT id, home_team, away_team, prediction, match_date, league
FROM tips
WHERE status = 'pending'
  AND match_date < NOW() - INTERVAL '2 hours'
ORDER BY match_date ASC;
```

The `- INTERVAL '2 hours'` ensures we only try to settle matches that kicked off at least 2 hours ago (enough time for a match to finish, including extra time).

- If **results > 0** OR **--force** → `RUN_SETTLE = true`
- If **results = 0** → `RUN_SETTLE = false`

Report: "Found N tips to settle" or "No tips to settle."

If `--skip-settle` → skip entirely, report "Phase 1: SKIPPED (--skip-settle)"

### Execute

If `RUN_SETTLE = true`:

- Report: "Phase 1: Avvio settlement..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-settle-tips" and skip
- Otherwise → Invoke `/fr3-settle-tips` using the Skill tool
- Wait for completion
- Record result: `SETTLE_RESULT = "done (N settled)"`

If `RUN_SETTLE = false`:
- `SETTLE_RESULT = "skipped (no finished matches)"`

## Phase 2: Generate Tips

### Pre-check

Query 1 — count existing future tips:

```sql
SELECT COUNT(*) as future_tips
FROM tips
WHERE status = 'pending'
  AND match_date >= NOW();
```

Query 2 — check for upcoming matches via **WebSearch**:

- Query: `"football matches today tomorrow schedule Serie A Premier League La Liga Champions League Bundesliga Ligue 1 Eredivisie"`
- Look for matches in the next 24-48 hours

Decision logic:

- If `--force` → `RUN_GENERATE = true`
- If **future_tips < 5** AND upcoming matches exist → `RUN_GENERATE = true`
- If **future_tips >= 5** → `RUN_GENERATE = false`
- If **no upcoming matches** in next 48h → `RUN_GENERATE = false`

Report: "N future tips exist. Upcoming matches: yes/no"

If `--skip-generate` → skip entirely, report "Phase 2: SKIPPED (--skip-generate)"

### Execute

If `RUN_GENERATE = true`:

- Report: "Phase 2: Avvio generazione tips..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-generate-tips --delete [--send]" and skip
- Otherwise → Invoke `/fr3-generate-tips --delete{SEND_FLAG}` using the Skill tool
- Wait for completion
- Record result: `GENERATE_RESULT = "done (N tips generated)"`

**Note:** `/fr3-generate-tips` already invokes `/fr3-generate-betting-slips` automatically at the end (Step 9 in that skill). So if generation runs, Phase 3 can often be skipped. However, Phase 3 still runs its own check to catch edge cases.

If `RUN_GENERATE = false`:
- `GENERATE_RESULT = "skipped (enough tips or no matches)"`

## Phase 3: Schedine (Betting Slips)

### Pre-check

Check if the current week already has schedine:

```sql
SELECT COUNT(*) as existing_schedine
FROM schedine
WHERE match_date = date_trunc('week', CURRENT_DATE)::date;
```

(`date_trunc('week', ...)` returns the Monday of the current ISO week)

Also check if there are pending tips this week that could form schedine:

```sql
SELECT COUNT(*) as week_tips
FROM tips
WHERE status = 'pending'
  AND match_date >= date_trunc('week', CURRENT_DATE)
  AND match_date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days';
```

Decision logic:

- If `--force` → `RUN_SCHEDINE = true`
- If **existing_schedine = 0** AND **week_tips >= 3** → `RUN_SCHEDINE = true`
- If **existing_schedine > 0** → `RUN_SCHEDINE = false` (already built this week)
- If **week_tips < 3** → `RUN_SCHEDINE = false` (not enough tips)

Report: "Week has N schedine, N pending tips"

If `--skip-schedine` → skip entirely, report "Phase 3: SKIPPED (--skip-schedine)"

**Important:** If Phase 2 just ran (and it auto-invokes schedine generation), check again — schedine may already exist now. Query the count again before deciding.

### Execute

If `RUN_SCHEDINE = true`:

- Report: "Phase 3: Avvio generazione schedine..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-generate-betting-slips [--send]" and skip
- Otherwise → Invoke `/fr3-generate-betting-slips{SEND_FLAG}` using the Skill tool
- Wait for completion
- Record result: `SCHEDINE_RESULT = "done (N schedine generated)"`

If `RUN_SCHEDINE = false`:
- `SCHEDINE_RESULT = "skipped (already exist or not enough tips)"`

## Phase 4: Summary

Always runs. Display the final report.

If nothing was done (all phases skipped):

```
=== PIPELINE CHECK COMPLETE ===
No work needed. All phases skipped.
- Settlement: <SETTLE_RESULT>
- Generation: <GENERATE_RESULT>
- Schedine: <SCHEDINE_RESULT>
```

If work was done:

```
=== PIPELINE COMPLETE ===
- Settlement: <SETTLE_RESULT>
- Retrospectives: N generated (N new insights detected)
- Generation: <GENERATE_RESULT>
- Schedine: <SCHEDINE_RESULT>
- Telegram: <sent/not sent>
- Active insights: N feeding into next generation
```

If `--dry-run`:

```
=== DRY RUN COMPLETE ===
- Settlement: would settle N tips
- Retrospectives: would generate N retrospectives
- Generation: would generate tips (N future tips, matches found: yes/no)
- Schedine: would build schedine (N tips available this week)
No changes were made.
```

## Important Notes

- **Exit fast when nothing to do** — Pre-checks use only Supabase queries and one WebSearch. If no work is needed, stop immediately. Minimal token usage on quiet days.
- **Always settle before generating** — Settlement updates the track record, which the generation skill uses for calibration.
- **Phase 2 auto-triggers schedine** — `/fr3-generate-tips` already calls `/fr3-generate-betting-slips` at the end. Phase 3 exists as a safety net for cases where tips exist but schedine don't (e.g., manual tip insertion, or if Phase 2 was skipped).
- **Per-week schedine** — Schedine are grouped by ISO week (Mon-Sun). The `match_date` field on schedine stores the Monday of the week.
- **2-hour buffer for settlement** — Only attempt to settle matches that kicked off 2+ hours ago, avoiding in-progress matches.
- **Send by default** — Telegram sending is ON unless `--no-send` is passed. This matches the expected cron/daily-run behavior.

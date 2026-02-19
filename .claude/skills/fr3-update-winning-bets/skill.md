---
name: fr3-update-winning-bets
description: Master orchestrator that runs the full betting pipeline — analytics, strategy optimization, settlement, pre-match research, tip generation, schedine, and Telegram delivery. Use when user asks to run the pipeline, update everything, or daily update.
argument-hint: [--skip-settle] [--skip-generate] [--skip-schedine] [--skip-analytics] [--skip-optimize] [--skip-research] [--force] [--no-send] [--dry-run]
user-invocable: true
allowed-tools: WebSearch, mcp__plugin_supabase_supabase__execute_sql, Skill
---

# Update WinningBets — Master Pipeline Orchestrator

Smart orchestrator that runs the full betting pipeline in sequence (with some parallel phases).
Designed to minimize token usage: pre-check each phase, skip what's not needed, exit fast on quiet days.

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Default behavior**: all phases auto, send to Telegram
- **Week definition**: Monday 00:00 to Sunday 23:59 (ISO week)

## Parse Arguments

From `$ARGUMENTS`:

| Flag               | Effect                                                               |
| ------------------ | -------------------------------------------------------------------- |
| _(none)_           | Full auto — checks everything, runs what's needed, sends to Telegram |
| `--skip-analytics` | Skip Phase 0 (performance analytics)                                 |
| `--skip-optimize`  | Skip Phase 1 (strategy optimization)                                 |
| `--skip-settle`    | Skip Phase 2 (settlement)                                            |
| `--skip-research`  | Skip Phase 3 (pre-match research)                                    |
| `--skip-generate`  | Skip Phase 4 (tip generation)                                        |
| `--skip-schedine`  | Skip Phase 5 (betting slips)                                         |
| `--force`          | Force ALL phases regardless of smart checks                          |
| `--no-send`        | Don't send to Telegram (default is to send)                          |
| `--dry-run`        | Show what each phase WOULD do without executing anything             |

Flags can be combined: `--skip-settle --no-send`, `--force --dry-run`, etc.

Derive `SEND_FLAG`:

- If `--no-send` → `SEND_FLAG = ""`
- Otherwise → `SEND_FLAG = " --send"`

## Pipeline Overview

```
Phase 0: ANALYTICS  → deep track record analysis + store snapshot          → /fr3-performance-analytics --store
Phase 1: OPTIMIZE   → generate strategy directives from patterns           → /fr3-strategy-optimizer
Phase 2: SETTLE     → settle finished matches + generate retrospectives    → /fr3-settle-tips
Phase 3: RESEARCH   → pre-match research for upcoming matches              → /fr3-pre-match-research  ← can run PARALLEL with Phase 2
Phase 4: GENERATE   → generate fresh tips via Agent Team + reviewer        → /fr3-generate-tips --delete [--send]
Phase 5: SCHEDINE   → build weekly betting slips                           → /fr3-generate-betting-slips [--send]
Phase 6: SUMMARY    → final report (always runs)
```

Each phase runs only if its pre-check passes (unless `--force`).
Order matters: Analytics → Optimize → Settle → (Research ‖ wait) → Generate → Schedine.
Settle BEFORE generating (settlement updates the track record used for calibration).
Analytics and Optimize BEFORE generate (they feed shared context into analysts).

**Phase failure handling:** If a phase fails (skill error, timeout, unexpected output):

- Log the failure: "Phase N: FAILED — {error details}"
- Record `PHASE_RESULT = "FAILED: {reason}"`
- **Continue to the next phase** — phases are independent enough that one failure should not block the entire pipeline
- Exception: if Phase 2 (Settle) fails, still proceed to Generate but note that calibration data may be stale
- Include all failures prominently in the Phase 6 summary

## Pre-flight: Settled tip count (shared by Phase 0 and Phase 1)

Run this ONCE before Phase 0 — reuse the result for both phases:

```sql
SELECT COUNT(*) as settled FROM tips WHERE status IN ('won', 'lost');
```

Store result as `SETTLED_COUNT`.

## Phase 0: Analytics

### Pre-check

```sql
SELECT snapshot_date FROM performance_snapshots
WHERE snapshot_date = CURRENT_DATE AND period_days = 90
LIMIT 1;
```

- If **snapshot exists today** AND NOT `--force` → `RUN_ANALYTICS = false`
- If **SETTLED_COUNT < 10** AND NOT `--force` → `RUN_ANALYTICS = false`
- Otherwise → `RUN_ANALYTICS = true`

If `--skip-analytics` → skip entirely, report "Phase 0: SKIPPED (--skip-analytics)"

### Execute

If `RUN_ANALYTICS = true`:

- Report: "Phase 0: Running performance analytics..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-performance-analytics --store" and skip
- Otherwise → Invoke `/fr3-performance-analytics --store` using the Skill tool
- Record result: `ANALYTICS_RESULT = "done (snapshot stored)"`

If `RUN_ANALYTICS = false`:

- `ANALYTICS_RESULT = "skipped (snapshot exists today or insufficient data)"`

## Phase 1: Optimize

### Pre-check

```sql
SELECT COUNT(*) as active_directives,
  MAX(created_at) as newest_directive
FROM strategy_directives
WHERE is_active = true AND expires_at > NOW();
```

- If **active_directives >= 3** AND **newest_directive > NOW() - INTERVAL '7 days'** AND NOT `--force` → `RUN_OPTIMIZE = false`
- If **SETTLED_COUNT < 20** AND NOT `--force` → `RUN_OPTIMIZE = false`
- Otherwise → `RUN_OPTIMIZE = true`

If `--skip-optimize` → skip entirely, report "Phase 1: SKIPPED (--skip-optimize)"

### Execute

If `RUN_OPTIMIZE = true`:

- Report: "Phase 1: Running strategy optimizer..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-strategy-optimizer" and skip
- Otherwise → Invoke `/fr3-strategy-optimizer` using the Skill tool
- Record result: `OPTIMIZE_RESULT = "done (N directives generated)"`

If `RUN_OPTIMIZE = false`:

- `OPTIMIZE_RESULT = "skipped (directives fresh or insufficient data)"`

## Phase 2: Settle

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

If `--skip-settle` → skip entirely, report "Phase 2: SKIPPED (--skip-settle)"

### Execute

If `RUN_SETTLE = true`:

- Report: "Phase 2: Avvio settlement..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-settle-tips" and skip
- Otherwise → Invoke `/fr3-settle-tips` using the Skill tool
- Wait for completion
- Record result: `SETTLE_RESULT = "done (N settled)"`

If `RUN_SETTLE = false`:

- `SETTLE_RESULT = "skipped (no finished matches)"`

## Phase 3: Research

### Pre-check

Check for upcoming matches in next 48h (reuse the WebSearch from Phase 4 pre-check if possible):

```sql
SELECT COUNT(*) as fresh_research
FROM match_research
WHERE status = 'fresh'
  AND created_at > NOW() - INTERVAL '6 hours'
  AND match_date > NOW()
  AND match_date < NOW() + INTERVAL '48 hours';
```

- If `--force` → `RUN_RESEARCH = true`
- If **no upcoming matches** in next 48h → `RUN_RESEARCH = false`
- If **fresh_research covers most upcoming matches** AND NOT `--force` → `RUN_RESEARCH = false`
- Otherwise → `RUN_RESEARCH = true`

If `--skip-research` → skip entirely, report "Phase 3: SKIPPED (--skip-research)"

### Execute

If `RUN_RESEARCH = true`:

- Report: "Phase 3: Running pre-match research..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-pre-match-research" and skip
- Otherwise → Invoke `/fr3-pre-match-research` using the Skill tool
- Record result: `RESEARCH_RESULT = "done (N matches researched)"`

If `RUN_RESEARCH = false`:

- `RESEARCH_RESULT = "skipped (no upcoming matches or fresh research exists)"`

**Note:** Phase 3 (Research) can conceptually run in parallel with Phase 2 (Settle) since they operate on different data sets. However, since we invoke skills sequentially via the Skill tool, they run one after another. The key ordering constraint is: both must complete BEFORE Phase 4 (Generate).

## Phase 4: Generate Tips

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

If `--skip-generate` → skip entirely, report "Phase 4: SKIPPED (--skip-generate)"

### Execute

If `RUN_GENERATE = true`:

- Report: "Phase 4: Avvio generazione tips..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-generate-tips --delete [--send]" and skip
- Otherwise → Invoke `/fr3-generate-tips --delete{SEND_FLAG}` using the Skill tool
- Wait for completion
- Record result: `GENERATE_RESULT = "done (N tips generated)"`

**Note:** `/fr3-generate-tips` already invokes `/fr3-generate-betting-slips` automatically at the end. So if generation runs, Phase 5 can often be skipped. However, Phase 5 still runs its own check to catch edge cases.

If `RUN_GENERATE = false`:

- `GENERATE_RESULT = "skipped (enough tips or no matches)"`

## Phase 5: Schedine (Betting Slips)

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

If `--skip-schedine` → skip entirely, report "Phase 5: SKIPPED (--skip-schedine)"

**Important:** If Phase 4 just ran (and it auto-invokes schedine generation), check again — schedine may already exist now. Query the count again before deciding.

### Execute

If `RUN_SCHEDINE = true`:

- Report: "Phase 5: Avvio generazione schedine..."
- If `--dry-run` → report "DRY RUN: Would invoke /fr3-generate-betting-slips [--send]" and skip
- Otherwise → Invoke `/fr3-generate-betting-slips{SEND_FLAG}` using the Skill tool
- Wait for completion
- Record result: `SCHEDINE_RESULT = "done (N schedine generated)"`

If `RUN_SCHEDINE = false`:

- `SCHEDINE_RESULT = "skipped (already exist or not enough tips)"`

## Phase 6: Summary

Always runs. Display the final report.

If nothing was done (all phases skipped):

```
=== PIPELINE CHECK COMPLETE ===
No work needed. All phases skipped.
- Analytics: <ANALYTICS_RESULT>
- Optimizer: <OPTIMIZE_RESULT>
- Settlement: <SETTLE_RESULT>
- Research: <RESEARCH_RESULT>
- Generation: <GENERATE_RESULT>
- Schedine: <SCHEDINE_RESULT>
```

If work was done:

```
=== PIPELINE COMPLETE ===
- Analytics: <ANALYTICS_RESULT>
  - Snapshot: hit rate XX%, ROI +/-XX, avg odds X.XX
- Optimizer: <OPTIMIZE_RESULT>
  - Active directives: N (HIGH: N, MEDIUM: N, LOW: N)
- Settlement: <SETTLE_RESULT>
  - Retrospectives: N generated (N new insights detected)
- Research: <RESEARCH_RESULT>
  - Matches researched: N, avg completeness: XX%
- Generation: <GENERATE_RESULT>
  - Agent Team: N analysts completed, M failed
  - Reviewer: N approved, M rejected, K adjusted
  - Portfolio avg EV: +X.XX, avg odds: X.XX
- Schedine: <SCHEDINE_RESULT>
- Telegram: <sent/not sent>
- Active insights: N feeding into next generation
- Active strategy directives: N
```

If `--dry-run`:

```
=== DRY RUN COMPLETE ===
- Analytics: would store performance snapshot (N settled tips available)
- Optimizer: would generate strategy directives (N settled tips available)
- Settlement: would settle N tips
- Retrospectives: would generate N retrospectives
- Research: would research N upcoming matches
- Generation: would generate tips via Agent Team (N future tips, matches found: yes/no)
- Schedine: would build schedine (N tips available this week)
No changes were made.
```

## Important Notes

- **Exit fast when nothing to do** — Pre-checks use only Supabase queries and one WebSearch. If no work is needed, stop immediately. Minimal token usage on quiet days.
- **Phase ordering**: Analytics → Optimize → Settle → Research → Generate → Schedine. Analytics and Optimize feed data into Generate. Settle must complete before Generate (updates track record).
- **Pre-flight settled count** — queried once, reused by Phase 0 (threshold: 10) and Phase 1 (threshold: 20)
- **Smart skip logic**:
  - Analytics: skip if snapshot exists from today, or SETTLED_COUNT < 10
  - Optimize: skip if active directives < 7 days old, or SETTLED_COUNT < 20
  - Research: skip if no matches in next 48h, or fresh research already exists
  - Generate: skip if 5+ future tips exist and no new matches
  - Schedine: skip if already built this week
- **Phase 4 auto-triggers schedine** — `/fr3-generate-tips` already calls `/fr3-generate-betting-slips` at the end. Phase 5 exists as a safety net.
- **Per-week schedine** — Schedine are grouped by ISO week (Mon-Sun). The `match_date` field on schedine stores the Monday of the week.
- **2-hour buffer for settlement** — Only attempt to settle matches that kicked off 2+ hours ago, avoiding in-progress matches.
- **Send by default** — Telegram sending is ON unless `--no-send` is passed.

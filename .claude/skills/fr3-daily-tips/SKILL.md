---
name: fr3-daily-tips
description: Smart daily orchestrator. Checks if settlement or tip generation is needed, then invokes /fr3-settle-tips and /fr3-generate-tips accordingly. Designed to run on a schedule (cron) or manually. Use when user asks for daily update, auto-tips, or scheduled run.
user-invocable: true
allowed-tools: WebSearch, mcp__plugin_supabase_supabase__execute_sql, Skill
---

# Daily Tips — Smart Orchestrator

Lightweight orchestrator that checks whether work is needed before invoking expensive skills.
Designed to minimize token usage: if nothing to do, exit fast.

## Procedure

### Step 1: Check pending tips that need settlement

Query Supabase for pending tips with match dates in the past:

```sql
SELECT id, home_team, away_team, prediction, match_date, league
FROM tips
WHERE status = 'pending'
  AND match_date < NOW()
ORDER BY match_date ASC;
```

- If **results > 0** → settlement is needed, set `NEEDS_SETTLE = true`
- If **results = 0** → no settlement needed, set `NEEDS_SETTLE = false`

Report: "Found N tips to settle" or "No tips to settle."

### Step 2: Check if tip generation is needed

Query Supabase for existing pending tips with future match dates:

```sql
SELECT COUNT(*) as future_tips
FROM tips
WHERE status = 'pending'
  AND match_date >= NOW();
```

Then check if there are matches coming up. Use **WebSearch**:

- Query: `"football matches today tomorrow schedule Serie A Premier League La Liga Champions League"`
- Look for matches in the next 24-48 hours

Decision logic:

- If **future_tips < 5** AND there are upcoming matches → set `NEEDS_GENERATE = true`
- If **future_tips >= 5** → already have enough tips, set `NEEDS_GENERATE = false`
- If **no upcoming matches** in the next 48h → set `NEEDS_GENERATE = false`

Report: "N future tips exist. Upcoming matches found: yes/no"

### Step 3: Execute settlement (if needed)

If `NEEDS_SETTLE = true`:

- Report: "Avvio settlement..."
- Invoke the `/fr3-settle-tips` skill using the Skill tool
- Wait for completion

### Step 4: Execute generation (if needed)

If `NEEDS_GENERATE = true`:

- Report: "Avvio generazione tips..."
- Invoke the `/fr3-generate-tips --delete --send` skill using the Skill tool (delete old pending + send to Telegram)
- Wait for completion

### Step 5: Summary

If neither settlement nor generation was needed:

```
=== DAILY CHECK COMPLETE ===
No work needed today. Tips pending: N, upcoming matches: none in 48h.
```

If work was done:

```
=== DAILY RUN COMPLETE ===
Settlement: [done/skipped] (N tips settled)
Generation: [done/skipped] (N tips generated)
```

## Important Notes

- **Exit fast when nothing to do** — The pre-checks (Step 1-2) use only Supabase queries and one WebSearch. If no work is needed, stop immediately. This keeps token usage minimal on quiet days.
- **Always settle before generating** — Settlement updates the track record, which the generation skill uses for calibration.
- **The --delete flag on fr3-generate-tips** ensures stale pending tips are cleaned up before fresh ones are created.
- **The --send flag** auto-sends generated tips to Telegram channels.

---
name: fr3-settle-tips
description: Settle pending tips by searching real match results online. Updates tip status (won/lost/void) and scores in Supabase. Use when user asks to settle, update results, verify tips, or check finished matches.
argument-hint: [--dry-run]
user-invocable: true
allowed-tools: WebSearch, mcp__plugin_supabase_supabase__execute_sql
---

# Settle Tips — Manual Settlement via Web Search

You ARE the settlement engine. Do NOT call paid football APIs — use WebSearch to find real scores (free).

**Goal: update all pending tips whose matches have already finished.**

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`

## Parse Arguments

From `$ARGUMENTS`:
- No args → settle all pending tips with past match dates
- `--dry-run` → show what would change but don't update the database

## Procedure

### 1. Fetch all pending tips

```sql
SELECT id, home_team, away_team, prediction, odds, match_date, league
FROM tips
WHERE status = 'pending'
  AND match_date < NOW()
ORDER BY match_date ASC;
```

If no pending tips with past match dates → report "Nessun tip da aggiornare" and stop.

### 2. Search for real scores

For each pending tip (or group of tips from the same day/league):

Use **WebSearch** to find the actual match result:
- Query: `"<home_team> vs <away_team> score result <date>"`
- Extract the final score (e.g., "2-1")

If a match was **postponed, cancelled, or abandoned** → mark as `void`.
If the score cannot be found reliably → skip that tip and report it.

### 3. Determine outcome

Apply settlement logic based on the prediction type and the real score:

| Prediction | Won if... |
|------------|-----------|
| `1` | home goals > away goals |
| `X` | home goals = away goals |
| `2` | away goals > home goals |
| `1X` | home goals >= away goals |
| `X2` | away goals >= home goals |
| `12` | home goals != away goals |
| `Over 2.5` | total goals > 2.5 |
| `Under 2.5` | total goals < 2.5 |
| `Over 1.5` | total goals > 1.5 |
| `Under 3.5` | total goals < 3.5 |
| `Goal` | both teams scored (home > 0 AND away > 0) |
| `No Goal` | at least one team scored 0 |
| `1 + Over 1.5` | home win AND total goals > 1.5 |
| `2 + Over 1.5` | away win AND total goals > 1.5 |

### 4. Update database

For each settled tip:

```sql
UPDATE tips
SET status = '<won|lost|void>', result = '<homeGoals>-<awayGoals>'
WHERE id = '<tip_id>';
```

If `--dry-run` was passed, do NOT execute the updates — only show the table.

### 5. Summary

Display a formatted table:

```
=== SETTLEMENT SUMMARY ===

| Match | Score | Prediction | Odds | Result |
|-------|-------|------------|------|--------|
| Home vs Away | 2-1 | 1 | 1.85 | WON |
| Home vs Away | 0-0 | Goal | 1.70 | LOST |

Settled: N tips | Won: N | Lost: N | Void: N
Win rate: XX%
Skipped: N (score not found)
```

## Important Notes

- **Never guess scores** — only use confirmed final scores from reliable sources (ESPN, Flashscore, Sky Sports, etc.)
- If a search returns conflicting scores, search again with a more specific query
- If a match is still in progress (not finished), skip it
- Always double-check combo predictions (e.g., "1 + Over 1.5") against BOTH conditions
- Report any tips that couldn't be settled so the user can handle them manually

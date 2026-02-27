---
name: fr3-settle-tips
description: Settle pending tips by searching real match results online. Updates tip status (won/lost/void) and scores in Supabase. Generates post-mortem retrospectives for each settled tip and detects aggregate patterns. Use when user asks to settle, update results, verify tips, or check finished matches.
argument-hint: [--dry-run] [--backfill]
user-invocable: true
allowed-tools: WebSearch, mcp__plugin_supabase_supabase__execute_sql
---

# Settle Tips — Settlement + Retrospective Learning Engine

You ARE the settlement engine. Do NOT call paid football APIs — use WebSearch to find real scores (free).

**Goal: update all pending tips whose matches have already finished, then generate retrospective analysis for each to feed the learning loop.**

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`

## Parse Arguments

From `$ARGUMENTS`:

- No args → settle all pending tips with past match dates
- `--dry-run` → show what would change but don't update the database
- `--backfill` → generate retrospectives for already-settled tips that have no `tip_retrospectives` row (skip steps 1-4, jump to 4b)

## Procedure

### 0. Backfill mode (only if --backfill flag)

If `--backfill` is passed, skip steps 1-4 entirely. Instead:

**Fetch already-settled tips WITHOUT retrospectives:**

```sql
SELECT t.id, t.home_team, t.away_team, t.prediction, t.odds, t.confidence,
       t.match_date, t.league, t.reasoning, t.predicted_probability,
       t.status, t.result
FROM tips t
LEFT JOIN tip_retrospectives tr ON tr.tip_id = t.id
WHERE t.status IN ('won', 'lost')
  AND t.result IS NOT NULL
  AND tr.id IS NULL
ORDER BY t.match_date ASC;
```

If 0 rows → report "All settled tips already have retrospectives — nothing to backfill." and stop.

For each tip, the score is already known from `t.result` (e.g., "2-1"). **Do NOT search the web for scores** — they're already in the database.

Parse the `result` field to extract `homeGoals` and `awayGoals` (split on "-"), then jump directly to **Step 4b** (per-tip post-mortem) for each tip, using the existing `status` (won/lost) and `result`.

After all retrospectives are generated, proceed to **Step 4c** (aggregate pattern detection) and **Step 5** (summary).

The summary should note: "BACKFILL MODE: Generated N retrospectives for previously-settled tips."

---

### 1. Fetch all pending tips

```sql
SELECT id, home_team, away_team, prediction, odds, confidence, match_date, league, reasoning, predicted_probability
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

**For corner/card tips** (prediction starts with "Corners" or "Cards"):

These tips cannot be settled from the goal score alone. You MUST search for the specific statistic:

- Corners: `"<home_team> vs <away_team> total corners statistics <date>"`
  - Also try: `"<home_team> vs <away_team> match stats corners"`
  - Sources: SofaScore, WhoScored, FlashScore match stats tab
  - Extract: total corner count for the full match (both teams combined)

- Cards: `"<home_team> vs <away_team> bookings cards yellow red <date>"`
  - Also try: `"<home_team> vs <away_team> disciplinary statistics <date>"`
  - Sources: SofaScore, BBC Sport, FlashScore match stats
  - Extract: total yellow + red cards (count each red card as 1, not 2 — it's one booking event)

If corner/card statistics cannot be found reliably after 2 searches → mark as `void` (not lost — data unavailable is not a loss). Report in summary as "VOID (statistics unavailable)".

### 3. Determine outcome

Apply settlement logic based on the prediction type and the real score:

| Prediction             | Won if...                                        |
| ---------------------- | ------------------------------------------------ |
| `1`                    | home goals > away goals                          |
| `X`                    | home goals = away goals                          |
| `2`                    | away goals > home goals                          |
| `1X`                   | home goals >= away goals                         |
| `X2`                   | away goals >= home goals                         |
| `12`                   | home goals != away goals                         |
| `Over 2.5`             | total goals > 2.5                                |
| `Under 2.5`            | total goals < 2.5                                |
| `Over 1.5`             | total goals > 1.5                                |
| `Under 3.5`            | total goals < 3.5                                |
| `Goal`                 | both teams scored (home > 0 AND away > 0)        |
| `No Goal`              | at least one team scored 0                       |
| `1 + Over 1.5`         | home win AND total goals > 1.5                   |
| `2 + Over 1.5`         | away win AND total goals > 1.5                   |
| `Corners Over X.5`     | total corners > X (e.g., Over 9.5 → corners ≥ 10) |
| `Corners Under X.5`    | total corners < X (e.g., Under 8.5 → corners ≤ 8) |
| `Cards Over X.5`       | total bookings > X (yellow=1, red=1 per event)  |
| `Cards Under X.5`      | total bookings < X                               |

**Corner/card counting rules:**
- Corners: count ALL corners in the full 90 minutes (plus injury time). If the match goes to extra time (cup/knockout), use 90-minute total only (bookmaker standard).
- Cards: count yellow cards + red cards as separate events. A yellow-then-red = 2 events. A straight red = 1 event. Do NOT use "yellow card equivalents" — count raw booking events.

### 4. Update database

For each settled tip:

For **goal-based tips** (standard markets):
```sql
UPDATE tips
SET status = '<won|lost|void>', result = '<homeGoals>-<awayGoals>'
WHERE id = '<tip_id>';
```

For **corner tips** (prediction contains "Corners"):
```sql
UPDATE tips
SET status = '<won|lost|void>', result = '<homeGoals>-<awayGoals>, C:<totalCorners>'
WHERE id = '<tip_id>';
```

For **card tips** (prediction contains "Cards"):
```sql
UPDATE tips
SET status = '<won|lost|void>', result = '<homeGoals>-<awayGoals>, K:<totalCards>'
WHERE id = '<tip_id>';
```

(If both goal score and corner/card stats are available, always include both in the result string.)

If `--dry-run` was passed, do NOT execute the updates — only show the table.

### 4b. Per-tip post-mortem (retrospective analysis)

For each settled tip (won OR lost — skip void), generate a retrospective and insert into `tip_retrospectives`.

**Parse the actual result:**

- `actual_score` = the score string (e.g., "2-1")
- `actual_result_category` = "1" if home won, "X" if draw, "2" if away won
- `actual_goals_total` = home goals + away goals
- `actual_btts` = true if both teams scored, false otherwise

**Calculate edge metrics:**

- `predicted_probability` = the tip's `predicted_probability` field (may be NULL for older tips)
- `bookmaker_implied_probability` = `(1 / odds) * 100` (from the tip's odds)
- `edge_at_prediction` = `predicted_probability - bookmaker_implied_probability` (NULL if predicted_probability is NULL)

**For WON tips:**

- `outcome_surprise` = 'expected' (unless the win was very narrow/lucky — e.g., last-minute goal → 'mild_surprise')
- `what_happened` = 2-3 sentences describing how the prediction was correct
- `what_we_missed` = NULL
- `lesson_learned` = NULL (or note if the win was narrower than expected)
- `error_category` = 'none'

**For LOST tips:**

1. Retrieve the tip's `reasoning` field (if available)
2. **WebSearch**: `"<home_team> vs <away_team> match report analysis <date>"` — find what actually happened
3. Compare pre-match reasoning against reality:
   - What factors did we get right?
   - What did we miss or underweight?
   - Was the information available pre-match or was it unforeseeable?
4. Classify `error_category` from the enum:
   - `draw_blindness` — Predicted a win (1 or 2), got a draw
   - `overconfidence` — High confidence (75%+), lost
   - `form_reversal` — Team broke their recent form trend unexpectedly
   - `injury_impact` — Key absence we missed or underweighted
   - `h2h_ignored` — H2H pattern we should have heeded
   - `motivation_miss` — Misjudged motivation/stakes (dead rubber, already relegated/qualified)
   - `tactical_shift` — Manager changed tactics/formation unexpectedly
   - `goal_pattern_miss` — Got O/U or BTTS wrong (goal patterns didn't hold)
   - `referee_factor` — Referee decision (penalty, red card) heavily influenced outcome
   - `underdog_upset` — Clear underdog won against the odds
   - `other` — None of the above fit
5. Determine `outcome_surprise`:
   - `expected` — Result was close to what we predicted (just wrong side of the line)
   - `mild_surprise` — Somewhat unexpected but not shocking
   - `major_surprise` — Completely against all pre-match indicators
6. Write a concrete `lesson_learned` — one actionable takeaway for future predictions
7. Write `what_we_missed` — the specific signal or factor we failed to account for

**Insert into `tip_retrospectives`:**

```sql
INSERT INTO tip_retrospectives (
  tip_id, actual_score, actual_result_category, actual_goals_total, actual_btts,
  predicted_probability, bookmaker_implied_probability, edge_at_prediction,
  outcome_surprise, what_happened, what_we_missed, lesson_learned, error_category
) VALUES (
  '<tip_id>', '<score>', '<1/X/2>', <total_goals>, <true/false>,
  <predicted_prob_or_NULL>, <bookmaker_implied>, <edge_or_NULL>,
  '<surprise>', '<what_happened>', '<what_we_missed_or_NULL>', '<lesson_or_NULL>', '<error_category>'
);
```

**Escape single quotes** in all text fields: `'` → `''`

If `--dry-run` was passed, do NOT execute the inserts — only show what would be inserted.

### 4c. Aggregate pattern detection

After all individual retrospectives are written, run diagnostic queries to detect patterns and generate insights.

**Query 1 — Error category distribution (last 60 days):**

```sql
SELECT error_category, COUNT(*) as cnt,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pct
FROM tip_retrospectives
WHERE error_category != 'none'
  AND created_at > NOW() - INTERVAL '60 days'
GROUP BY error_category
ORDER BY cnt DESC;
```

**Query 2 — Confidence calibration by band (last 90 days):**

```sql
SELECT
  CASE
    WHEN t.confidence BETWEEN 60 AND 69 THEN '60-69'
    WHEN t.confidence BETWEEN 70 AND 79 THEN '70-79'
    WHEN t.confidence BETWEEN 80 AND 95 THEN '80-95'
  END as band,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN t.status = 'won' THEN 1 ELSE 0 END) / COUNT(*)) as actual_pct,
  ROUND(AVG(t.confidence)) as claimed_pct
FROM tips t
WHERE t.status IN ('won', 'lost')
  AND t.match_date > NOW() - INTERVAL '90 days'
GROUP BY 1 HAVING COUNT(*) >= 5 ORDER BY 1;
```

**Query 3 — Prediction type performance trend (last 30 vs previous 30 days):**

```sql
SELECT prediction,
  SUM(CASE WHEN match_date > NOW() - INTERVAL '30 days' AND status = 'won' THEN 1 ELSE 0 END) as recent_won,
  SUM(CASE WHEN match_date > NOW() - INTERVAL '30 days' AND status IN ('won','lost') THEN 1 ELSE 0 END) as recent_total,
  SUM(CASE WHEN match_date BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND status = 'won' THEN 1 ELSE 0 END) as prev_won,
  SUM(CASE WHEN match_date BETWEEN NOW() - INTERVAL '60 days' AND NOW() - INTERVAL '30 days' AND status IN ('won','lost') THEN 1 ELSE 0 END) as prev_total
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '60 days'
GROUP BY prediction
HAVING SUM(CASE WHEN status IN ('won','lost') THEN 1 ELSE 0 END) >= 5;
```

**Query 4 — League-specific performance (last 90 days):**

```sql
SELECT league,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*)) as win_pct
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '90 days'
GROUP BY league
HAVING COUNT(*) >= 10
ORDER BY win_pct ASC;
```

**Pattern detection rules — generate insights if:**

- Error category > 25% of losses → insert `bias_detected` insight
- Confidence band gap > 10pp (claimed vs actual) → insert `calibration_drift` insight
- Prediction type win rate dropped > 15pp (recent vs previous 30 days) → insert `pattern_warning` insight
- League win rate < 50% with 10+ tips → insert `weak_spot` insight
- League win rate > 75% with 10+ tips → insert `strong_spot` insight

**For each detected pattern, UPSERT into `prediction_insights`:**

First check if a similar active insight already exists:

```sql
SELECT id FROM prediction_insights
WHERE scope = '<scope>' AND scope_value = '<value>' AND insight_type = '<type>'
  AND is_active = true;
```

If exists → update `last_validated_at`, `evidence`, `sample_size`, `expires_at`:

```sql
UPDATE prediction_insights
SET last_validated_at = NOW(),
    evidence = '<updated_evidence_json>',
    sample_size = <new_sample_size>,
    expires_at = NOW() + INTERVAL '60 days'
WHERE id = '<existing_id>';
```

If not exists → insert new insight:

```sql
INSERT INTO prediction_insights (scope, scope_value, insight_type, insight_text, evidence, sample_size, confidence_level, expires_at)
VALUES ('<scope>', '<value>', '<type>', '<insight_text>', '<evidence_json>', <sample_size>, <confidence_level>, NOW() + INTERVAL '60 days');
```

The `evidence` JSONB field should contain: `{"tip_ids": [...], "win_rate": X, "sample_size": N, "period": "last_60_days"}` (or similar structured data supporting the insight).

If `--dry-run` was passed, do NOT execute the inserts/updates — only report what insights would be generated.

### 5. Summary

Display a formatted table:

```
=== SETTLEMENT SUMMARY ===

| Match | Score | Prediction | Conf | Odds | Result | Error Category |
|-------|-------|------------|------|------|--------|----------------|
| Home vs Away | 2-1 | 1 | 78% | 2.10 | WON | none |
| Home vs Away | 1-1 | 1 | 75% | 1.85 | LOST | draw_blindness |

Settled: N tips | Won: N | Lost: N | Void: N
Win rate: XX%
Skipped: N (score not found)
Corner/Card tips: N settled manually (C: X won, Y lost, Z void — stats unavailable)

=== RETROSPECTIVE INSIGHTS ===
- [NEW] draw_blindness accounts for 30% of losses (N=X)
- [UPDATED] 70-79% confidence band still miscalibrated: claims 77%, delivers 62%
- [ACTIVE] N active insights feeding into next generation
```

## Important Notes

- **Never guess scores** — only use confirmed final scores from reliable sources (ESPN, Flashscore, Sky Sports, etc.)
- If a search returns conflicting scores, search again with a more specific query
- If a match is still in progress (not finished), skip it
- Always double-check combo predictions (e.g., "1 + Over 1.5") against BOTH conditions
- Report any tips that couldn't be settled so the user can handle them manually
- **Retrospectives are critical** — They feed the learning loop. Even for WON tips, note if the win was clean or lucky.
- **Be honest in post-mortems** — The value of retrospectives comes from accurately identifying what went wrong, not from excusing losses.
- **Insights auto-expire** after 60 days if not re-validated. Each settlement run re-validates existing insights or creates new ones.
- **Corner/card tips require manual search** — The cron job cannot auto-settle these. During each settlement run, explicitly search for corner/card stats for any pending tip with "Corners" or "Cards" in the prediction field. SofaScore and FlashScore are the most reliable sources for match statistics.
- **Corner/card void policy** — If statistics are genuinely unavailable after 2 searches, mark as `void`. Do NOT mark as lost just because you couldn't find the data. Void tips are not counted in the win rate.

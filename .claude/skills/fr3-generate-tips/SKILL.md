---
name: fr3-generate-tips
description: Generate football betting predictions for upcoming matches. Fetches live data from football APIs, researches injuries/news via web search, analyzes each match individually as a professional football analyst, and stores predictions in Supabase. Use when user asks to generate tips, predictions, or pronostici.
argument-hint: [league-slug] [--send] [--delete]
user-invocable: true
allowed-tools: Bash(*), WebSearch, Read, mcp__plugin_supabase_supabase__execute_sql
---

> Full architecture doc: [PREDICTION-ENGINE.md](../../../PREDICTION-ENGINE.md)

# Generate Tips — AI Football Prediction Engine

You ARE the prediction engine. You do NOT call the Claude API — you analyze the data yourself.
Analyze football data like a professional analyst with 15+ years of experience in statistical analysis, recent form, home/away trends, and goal patterns.

**Goal: accuracy as close to 100% as possible.** Every prediction must be backed by overwhelming data. Only bet where you have a genuine edge over the bookmaker.

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Leagues**: serie-a, champions-league, la-liga, premier-league, ligue-1, bundesliga, eredivisie
- **Valid predictions**: 1, X, 2, 1X, X2, 12, Over 2.5, Under 2.5, Over 1.5, Under 3.5, Goal, No Goal, 1 + Over 1.5, 2 + Over 1.5
- **Confidence range**: 60–85 (strict; max 85 until 100+ settled tips, then up to 95)
- **Odds range**: 1.20–5.00

## Parse Arguments

From `$ARGUMENTS`:

- No args → all 7 leagues
- A league slug (e.g., `serie-a`) or name (e.g., "Serie A", "Premier League") → that league only
- `--send` → send to Telegram after generating
- `--delete` → delete ALL existing pending tips first (not just for targeted leagues)

Map common names: "Serie A" → serie-a, "Champions League"/"UCL" → champions-league, "La Liga" → la-liga, "Premier League"/"PL" → premier-league, "Ligue 1" → ligue-1, "Bundesliga" → bundesliga, "Eredivisie" → eredivisie

## Procedure

Process each league sequentially.

### 1. Delete existing tips (only if --delete flag)

```sql
DELETE FROM tips WHERE status = 'pending';
```

Use Supabase MCP `execute_sql` with project_id `xqrxfnovlukbbuvhbavj`.

### 2. Fetch football data (per league)

Run the fetch script:

```bash
node .claude/skills/fr3-generate-tips/scripts/fetch-league-data.js <league-slug>
```

This outputs JSON with: `matches` (upcoming fixtures with odds + H2H data), `standings` (total/home/away tables), `recentResults` (last 30 matches).

If a league returns 0 matches, skip it and move to the next.

### 3. Historical calibration (per league — THREE queries)

Run all three queries to build a `HISTORICAL CONTEXT` block that MUST be consulted during every match analysis.

**Query 1 — Per-prediction-type accuracy:**

```sql
SELECT prediction,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*)) as win_pct
FROM tips
WHERE league = '<slug>' AND status IN ('won', 'lost')
GROUP BY prediction
HAVING COUNT(*) >= 3
ORDER BY COUNT(*) DESC;
```

**Query 2 — Confidence calibration curve:**

```sql
SELECT
  CASE
    WHEN confidence BETWEEN 60 AND 69 THEN '60-69'
    WHEN confidence BETWEEN 70 AND 79 THEN '70-79'
    WHEN confidence BETWEEN 80 AND 95 THEN '80-95'
  END as band,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*)) as actual_pct,
  ROUND(AVG(confidence)) as claimed_pct
FROM tips WHERE status IN ('won', 'lost')
GROUP BY 1 HAVING COUNT(*) >= 5 ORDER BY 1;
```

**Query 3 — Active retrospective insights:**

```sql
SELECT scope, scope_value, insight_type, insight_text, sample_size
FROM prediction_insights
WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY confidence_level DESC, sample_size DESC LIMIT 20;
```

Format all three into a `HISTORICAL CONTEXT` block:

```
=== HISTORICAL CONTEXT ===

PREDICTION ACCURACY (<league>):
  1: 55% (11 tips) — AVOID
  1X: 80% (10 tips) — PREFER
  Over 2.5: 70% (10 tips) — OK
  ...

CONFIDENCE CALIBRATION:
  60-69 band: claims 65%, actual 68% — CALIBRATED
  70-79 band: claims 77%, actual 60% — OVERCONFIDENT (-17pp), deflate by 0.78
  80-95 band: claims 83%, actual 75% — SLIGHTLY OVERCONFIDENT (-8pp), deflate by 0.90

ACTIVE INSIGHTS:
  [bias_detected] global: Home win ("1") predicted too often, only 55% win rate (N=11)
  [calibration_drift] 70-79 band: 17pp gap between claimed and actual
  [weak_spot] serie-a: "1" predictions at 50% win rate (N=8)
  ...
```

**CRITICAL: You MUST consult this context during every match analysis.** If an insight warns about a pattern, you must explicitly address it in your reasoning.

### 4. Per-match deep analysis (DECOUPLED — one match at a time)

For EACH match individually, perform ALL of the following steps before moving to the next match. Analyzing each match in isolation produces more accurate predictions.

#### 4a. Targeted web research (per match — 4 searches)

Use **WebSearch** to find specific information for THIS matchup:

**Search 1** (match preview):

- `"<home_team> vs <away_team> preview prediction <date>"`
- Extract: expert predictions, key narratives, tactical previews

**Search 2** (injuries/lineup):

- `"<home_team> <away_team> injuries suspensions confirmed lineup <date>"`
- Extract: confirmed absences, expected lineups, late fitness tests

**Search 3** (tactical/form):

- `"<home_team> OR <away_team> recent form analysis tactics last matches"`
- Extract: tactical setup, formation, playing style, form trajectory

**Search 4** (context):

- `"<home_team> vs <away_team> head to head referee history"`
- Extract: H2H psychological edge, referee tendencies, venue factors

Look for:

- **Injuries and suspensions** — which key players are OUT and their specific contribution (goals, assists, defensive impact)
- **Expected lineups** — any rotation, resting players for upcoming fixtures
- **Key player availability** — returns from injury, suspensions ending
- **Motivation context** — title race, relegation fight, must-win, nothing to play for, end-of-season apathy
- **Fixture congestion** — midweek European games, cup matches, travel fatigue
- **Tactical matchup** — how each team's style interacts (e.g., high press vs counter-attack)
- **Referee** — if known, cards per game, penalty tendencies, home/away bias

#### 4b. Compute derived statistics (per match)

From the league data already fetched, extract for THIS match:

**From standings (total + home/away):**

- Both teams' league position, points, form string (W/D/L)
- Home team's HOME record (W/D/L, GF/GA from home standings)
- Away team's AWAY record (W/D/L, GF/GA from away standings)
- Avg goals scored and conceded per match (total and context-specific)
- Zone: Champions (rank <= 4), Europa (<= 6), Conference (<= 7), Relegation (bottom 3)

**From recent results (filter last 5 per team):**

- Each team's last 5 results with scores
- BTTS%: % of those matches where BOTH teams scored
- Clean sheet%: % with 0 goals conceded
- Current streak (winning/drawing/losing run)

**Expected goals (improved xGoals model):**

```
// Context-specific ratings (home stats for home team, away stats for away team)
homeAttack  = home team's HOME goals scored per game (from home standings)
homeDefense = home team's HOME goals conceded per game (from home standings)
awayAttack  = away team's AWAY goals scored per game (from away standings)
awayDefense = away team's AWAY goals conceded per game (from away standings)

// League baseline
leagueAvg = total goals across all standings / total games played

// Recent form adjustment (last 5 matches per team)
homeRecentGF = home team's GF in last 5 / 5
homeRecentGA = home team's GA in last 5 / 5
awayRecentGF = away team's GF in last 5 / 5
awayRecentGA = away team's GA in last 5 / 5

// Blend: 60% context-specific, 40% recent form
homeExpGoals = 0.6 * (homeAttack * awayDefense / leagueAvg) + 0.4 * (homeRecentGF * awayRecentGA / leagueAvg)
awayExpGoals = 0.6 * (awayAttack * homeDefense / leagueAvg) + 0.4 * (awayRecentGF * homeRecentGA / leagueAvg)

// H2H adjustment (if 5+ matches available from match.h2h)
if h2h.total >= 5:
  h2hAvgGoals = sum of all H2H match goals / h2h.total
  xGoals = 0.90 * (homeExpGoals + awayExpGoals) + 0.10 * h2hAvgGoals
else:
  xGoals = homeExpGoals + awayExpGoals
```

**From H2H data (match.h2h — fetched automatically):**

- Home team wins, away team wins, draws in last 10 meetings
- Average goals per H2H match
- Pattern: does one team dominate this fixture?
- Any venue-specific trends (does home advantage hold in this matchup?)

**From bookmaker odds (if available):**

- Implied probabilities: `(1/odds) * 100` for home, draw, away, O/U 2.5, BTTS
- DO NOT look at these yet — save for the edge comparison in step 4c

#### 4c. Independent probability assessment + deep reasoning (per match)

**CRITICAL: Analyze ALL data WITHOUT looking at bookmaker odds first.** Form your own view, then compare.

**Step 1 — Form your own probability estimates:**

Based on standings, form, H2H, injuries, xGoals, motivation, tactical matchup, referee:

- P(home win) = ?%, P(draw) = ?%, P(away win) = ?% (must sum to ~100%)
- P(over 2.5) = ?%, P(under 2.5) = ?%
- P(BTTS yes) = ?%, P(BTTS no) = ?%

**Step 2 — Compare against bookmaker implied probabilities:**

- Bookmaker P(home) = (1/odds_home) * 100, etc. (normalize to sum to 100% by dividing each by overround)
- Edge = Your probability - Bookmaker implied probability
- Identify where your edge is strongest

**Step 3 — 10-point reasoning framework:**

Think through each match thoroughly using ALL 10 points:

1. **Who is stronger overall?** (position, points, form, points per game)
2. **Context-specific performance?** (home team AT HOME, away team AWAY — use context-specific standings, not overall)
3. **Goal patterns** — xGoals model output, O/U trends for both teams, BTTS trends in last 5
4. **Key absences impact** — specific player names and their contribution (goals, assists, defensive stats). How does their absence change the team?
5. **Motivation asymmetry** — what's at stake for each team? Title, CL qualification, relegation, mid-table comfort?
6. **H2H patterns** — use actual H2H data from fetch. Does one team dominate? Any venue pattern? Goal trends in H2H?
7. **Form trajectory** — is each team improving, declining, or stable? Weight last 3 matches more heavily than last 5
8. **Tactical matchup** — formation, playing style, how these styles interact (e.g., high-pressing team vs low-block counter-attacking team)
9. **External factors** — referee tendencies, weather, fixture congestion, travel, derby/rivalry intensity
10. **Probability assessment** — state explicit P(1), P(X), P(2), P(O2.5), P(BTTS), then compare to bookmaker odds. Where is the edge?

**Step 4 — Check HISTORICAL CONTEXT:**

- If an insight warns about a prediction type (e.g., "1" has 55% win rate), address it explicitly: "Despite the insight warning about home win predictions, this case is different because..."
- If calibration data shows a gap for the relevant confidence band, note it for the calibration step
- If a league-specific weak spot is flagged, apply extra scrutiny

Only THEN select your prediction. Choose the option with the highest edge AND highest probability of being correct.

#### 4d. Quality gate (per match)

After full analysis, before generating the tip:

**SKIP the match (no tip) if ANY of these conditions apply:**

- No prediction type has edge > 5 percentage points over the bookmaker
- Fewer than 10 matches played by either team this season (insufficient data)
- No prediction reaches 62% estimated probability
- Both teams on 3+ match losing streaks (chaotic, unpredictable)

When skipping: `"SKIPPED: <home> vs <away> — <reason>"`

This means we may generate 5-8 tips per league instead of 10. Quality over quantity.

#### 4e. Generate prediction with reasoning (per match)

| Field | Rules |
| ----- | ----- |
| `prediction` | One of the 14 valid types. Choose the pick with the highest genuine edge. Avoid exotic picks unless data is overwhelming. |
| `confidence` | 60-85 (max 85 until 100+ settled tips). Reflects statistical reality. Must be calibrated (see below). |
| `odds` | **MUST use real bookmaker odds** from the fetched data (match.odds). Map your prediction type to the correct market: 1/X/2 → match.odds.home/draw/away, Over/Under → match.odds.overUnder, Goal/No Goal → match.odds.goal/noGoal, 1X/X2 → match.odds.doubleChance. **NEVER invent or estimate odds.** If real odds are not available for a prediction type, DO NOT generate a tip for that match. |
| `analysis` | 2-3 sentences IN ITALIAN citing specific numbers (position, form, avg goals, BTTS%, injuries, edge). Must justify the pick. |
| `predicted_probability` | Your estimated probability for this prediction (e.g., 72.0). The raw number from your independent assessment. |
| `reasoning` | Full structured reasoning (see format below). |

**Confidence calibration:**

1. Start with your raw probability estimate for the chosen prediction
2. Check the calibration curve from Step 3 — if the relevant band (e.g., 70-79) shows a gap > 10pp between claimed and actual:
   - `calibration_factor = actual_win_rate_for_band / midpoint_of_band`
   - `adjusted = raw_probability * calibration_factor`
3. Clamp to range [60, 85] — until we have 100+ settled tips, max confidence is 85
4. This adjusted value is the `confidence` field

**Reasoning format** (stored in `tips.reasoning` column):

```
DATA_SUMMARY:
- Home: [team], [position], [points], [form], home record [W-D-L], home GF/GA per game [x/y]
- Away: [team], [position], [points], [form], away record [W-D-L], away GF/GA per game [x/y]
- H2H last [N]: [home wins]W, [away wins]W, [draws]D, avg goals [x]
- xGoals: [total] (home [x], away [y])
- Key absences: [list with impact assessment]
- Motivation: [home context] vs [away context]

PROBABILITY_ASSESSMENT:
- P(1)=[x]%, P(X)=[y]%, P(2)=[z]%
- P(O2.5)=[x]%, P(U2.5)=[y]%
- P(BTTS)=[x]%, P(NoBTTS)=[y]%
- Bookmaker implied: P(1)=[x]%, P(X)=[y]%, P(2)=[z]%

EDGE_ANALYSIS:
- Best edge: [prediction type] at +[x]pp over bookmaker
- Second edge: [prediction type] at +[x]pp
- Historical context check: [addressed any relevant insights/warnings]

KEY_FACTORS:
1. [STRONG/MODERATE/WEAK] [factor description]
2. [STRONG/MODERATE/WEAK] [factor description]
3. [STRONG/MODERATE/WEAK] [factor description]
...

DECISION: prediction=[type], raw_probability=[x]%, calibrated_confidence=[y]%
QUALITY_GATE: edge [x]pp > 5pp threshold → PASS
```

**Accuracy-first rules:**

1. **Edge-first thinking.** Only bet where your estimated probability exceeds the bookmaker's implied probability by 5+ percentage points.
2. **Safer picks win more.** Prefer 1X, X2, Over 1.5, Under 3.5 over exact outcomes unless edge is clearly strongest on exact outcomes.
3. **Analyze ALL data** — standings, form, home/away splits, goals, H2H, injuries, motivation, tactical matchup, odds.
4. **For Over/Under**: use the improved xGoals model. Only pick Over 2.5 if xGoals > 2.8. Only pick Under 2.5 if xGoals < 2.2.
5. **For Goal/No Goal**: BTTS% from last 5 must support. Only pick Goal if BTTS% > 65% for both teams. Only pick No Goal if one team has clean sheet% > 50%.
6. **Never exceed 85% confidence** (cap until 100+ settled tips exist). After that, never exceed 90% without at least: clear form advantage + home/away splits favoring + no key injuries + H2H pattern + odds alignment.
7. **When uncertain, reduce confidence** — 65% honest is better than 80% optimistic.
8. **Consider the draw** — In tight matches between similar teams, X or X2/1X may be the most probable outcome. Our biggest error category is draw_blindness.
9. **Be contrarian only when data clearly supports it.** Don't pick upsets for variety.
10. **Respect the insights.** If the retrospective system flagged a pattern, address it explicitly in your reasoning.

### 5. Assign tiers

After all matches in a league are analyzed:

**Target distribution: 25% free, 25% pro, 50% vip.**

Free tips are "teasers" — safe, obvious picks with low reward. The real value is in pro/vip.

```
IF confidence >= 80 AND odds <= 1.55 → "free"
ELSE IF confidence >= 75 AND odds <= 1.80 → "pro"
ELSE → "vip"
```

**Tier balancing** (always apply after initial assignment):

- Sort predictions by value (confidence * odds) ascending
- Bottom 25% → free, next 25% → pro, top 50% → vip
- Combo predictions (containing "+") are always "vip"

### 6. Replace existing tips and insert new ones

Since this skill always produces the freshest analysis, **always replace** existing pending tips for the same matches. Never skip a match because it already has a tip.

```sql
-- Delete any existing pending tips for these matches
DELETE FROM tips WHERE status = 'pending' AND league = '<slug>'
  AND match_id IN ('<id1>', '<id2>', ...);

-- Insert fresh predictions with reasoning and predicted_probability
INSERT INTO tips (match_id, home_team, away_team, match_date, prediction, odds, confidence, analysis, tier, league, reasoning, predicted_probability)
VALUES
  ('<match_id>', '<home>', '<away>', '<date>', '<pred>', <odds>, <conf>, '<analysis>', '<tier>', '<league>', '<reasoning>', <predicted_probability>),
  ...;
```

**Escape single quotes** in team names, analysis, and reasoning: `'` → `''`

### 7. Summary

Display a formatted summary after all leagues:

```
=== GENERATION SUMMARY ===

<flag> <LEAGUE NAME> (N tips, M skipped)
  Home vs Away — Prediction @ odds (tier, confidence%, edge +Xpp)
  Home vs Away — SKIPPED (reason)
  ...

Total: N tips | Skipped: M | Free: N | Pro: N | VIP: N
Avg edge: +X.Xpp | Avg confidence: XX%
```

Flags: serie-a = IT, champions-league = trophy, la-liga = ES, premier-league = EN, ligue-1 = FR, bundesliga = DE, eredivisie = NL

### 8. Send to Telegram (if --send flag or user requests)

Read Telegram credentials from `.env` file (use Read tool on the .env, extract TELEGRAM_BOT_TOKEN).

**Free tips** → public channel (read TELEGRAM_PUBLIC_CHANNEL_ID from .env)
**Pro+VIP tips** → private channel (read TELEGRAM_PRIVATE_CHANNEL_ID from .env)

Format per league block in MarkdownV2. Send ONE message per league (to avoid the 4096 char limit).

Each message structure:

```
<flag> *<LEAGUE NAME>*

<tipBlock per each tip>

<crown> *WinningBet* — Pronostici Calcio Premium
```

Each tip block:

```
<ball> *<home> vs <away>*
<tee> <target> <prediction>
<tee> <chart> Quota: <odds>
<tee> <fire> Fiducia: <confidence>%
<corner> <memo> _<analysis>_
```

**MarkdownV2 escaping**: Put `\` before these chars: ``_ * [ ] ( ) ~ ` > # + - = | { } . !``

Send via curl:

```bash
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"<channel_id>","text":"<msg>","parse_mode":"MarkdownV2","disable_web_page_preview":true}'
```

Split into separate messages per league if total exceeds 4000 chars.

### 9. Generate Betting Slips (automatic)

After ALL leagues have been processed and tips inserted, automatically invoke the `/fr3-generate-betting-slips` skill to build the day's smart betting slips from the freshly generated tips.

Pass the `--send` flag to `/fr3-generate-betting-slips` if this run also has `--send`.

This ensures schedine are always in sync with the latest tips.

## Important Notes

- You ARE the analyst. Do NOT call the Claude/Anthropic API. Your analysis IS the prediction.
- **Always replace** existing pending tips — never skip a match. Fresh analysis = better accuracy.
- **One match at a time** — Analyze each match individually for maximum depth and accuracy.
- Process leagues sequentially to respect API rate limits.
- **Quality over quantity** — It's better to generate 5-8 high-edge tips than 10 mediocre ones. The quality gate exists for this reason.
- All analysis text must be in Italian.
- **Accuracy is the #1 priority.** Only bet where you have a genuine edge. Skip matches where the edge is too thin.
- **The feedback loop matters.** Historical accuracy, calibration curve, and retrospective insights are not optional context — they are mandatory inputs that must be consulted and addressed in every prediction.

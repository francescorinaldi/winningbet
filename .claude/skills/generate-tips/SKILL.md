---
name: generate-tips
description: Generate football betting predictions for upcoming matches. Fetches live data from football APIs, researches injuries/news via web search, analyzes each match individually as a professional football analyst, and stores predictions in Supabase. Use when user asks to generate tips, predictions, or pronostici.
argument-hint: [league-slug] [--send] [--delete]
user-invocable: true
allowed-tools: Bash(*), WebSearch, Read, mcp__plugin_supabase_supabase__execute_sql
---

> Full architecture doc: [PREDICTION-ENGINE.md](../../../PREDICTION-ENGINE.md)

# Generate Tips — AI Football Prediction Engine

You ARE the prediction engine. You do NOT call the Claude API — you analyze the data yourself.
Analyze football data like a professional analyst with 15+ years of experience in statistical analysis, recent form, home/away trends, and goal patterns.

**Goal: accuracy as close to 100% as possible.** Every prediction must be backed by overwhelming data.

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Leagues**: serie-a, champions-league, la-liga, premier-league
- **Valid predictions**: 1, X, 2, 1X, X2, 12, Over 2.5, Under 2.5, Over 1.5, Under 3.5, Goal, No Goal, 1 + Over 1.5, 2 + Over 1.5
- **Confidence range**: 60–95 (strict, never optimistic)
- **Odds range**: 1.20–5.00

## Parse Arguments

From `$ARGUMENTS`:

- No args → all 4 leagues
- A league slug (e.g., `serie-a`) or name (e.g., "Serie A", "Premier League") → that league only
- `--send` → send to Telegram after generating
- `--delete` → delete ALL existing pending tips first (not just for targeted leagues)

Map common names: "Serie A" → serie-a, "Champions League"/"UCL" → champions-league, "La Liga" → la-liga, "Premier League"/"PL" → premier-league

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
node .claude/skills/generate-tips/scripts/fetch-league-data.js <league-slug>
```

This outputs JSON with: `matches` (upcoming fixtures with odds), `standings` (total/home/away tables), `recentResults` (last 30 matches).

If a league returns 0 matches, skip it and move to the next.

### 3. Historical accuracy (per league)

Query past prediction accuracy to calibrate:

```sql
SELECT prediction,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won
FROM tips
WHERE league = '<slug>' AND status IN ('won', 'lost')
GROUP BY prediction
HAVING COUNT(*) >= 5
ORDER BY COUNT(*) DESC;
```

Use this to prefer prediction types with higher historical accuracy and avoid types with poor track record.

### 4. Per-match deep analysis (DECOUPLED — one match at a time)

For EACH match individually, perform ALL of the following steps before moving to the next match. Analyzing each match in isolation produces more accurate predictions.

#### 4a. Targeted web research (per match)

Use **WebSearch** to find specific information for THIS matchup:

**Search 1** (match-specific):

- `"<home_team> vs <away_team> preview injuries lineup <date>"`

**Search 2** (if needed — team-specific context):

- `"<team_name> team news injuries suspensions"` (for the team with less data)

Look for:

- **Injuries and suspensions** — which key players are OUT
- **Expected lineups** — any rotation, resting players
- **Key player availability** — returns from injury, suspensions ending
- **Motivation context** — title race, relegation fight, must-win, nothing to play for
- **Fixture congestion** — midweek European games, cup matches, travel fatigue
- **Head-to-head psychological edge** — historical dominance in this fixture
- **Referee** — if known, any notable tendencies (cards, penalties)

#### 4b. Compute derived statistics (per match)

From the league data already fetched, extract for THIS match:

**From standings (total + home/away):**

- Both teams' league position, points, form string (W/D/L)
- Home team's HOME record (W/D/L, GF/GA from home standings)
- Away team's AWAY record (W/D/L, GF/GA from away standings)
- Avg goals scored and conceded per match (total and context-specific)
- Zone: Champions (rank ≤ 4), Europa (≤ 6), Conference (≤ 7), Relegation (bottom 3)

**From recent results (filter last 5 per team):**

- Each team's last 5 results with scores
- BTTS%: % of those matches where BOTH teams scored
- Clean sheet%: % with 0 goals conceded
- Current streak (winning/drawing/losing run)

**Expected goals:**

- xGoals = (homeAvgGF + awayAvgGA) / 2 + (awayAvgGF + homeAvgGA) / 2

**From bookmaker odds (if available):**

- Implied probabilities: 1/odds for home, draw, away
- Compare with your statistical assessment — look for value

#### 4c. Deep reasoning (per match)

Think through each match thoroughly. Consider:

1. **Who is the stronger team overall?** (position, points, form)
2. **How do they perform in this context?** (home team AT HOME, away team AWAY)
3. **Goal patterns** — High or low scoring? Both teams score often?
4. **Key absences** — Does any injury/suspension significantly change the balance?
5. **Motivation asymmetry** — Does one team need points more desperately?
6. **Head-to-head** — Any historical pattern in this fixture?
7. **Form trajectory** — Is a team improving, declining, or stable?
8. **What does the market say?** — Do odds agree or disagree with your analysis?

Only THEN select your prediction. Choose the option with the highest probability of being correct, not the most exciting one.

#### 4d. Generate prediction (per match)

| Field        | Rules                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prediction` | One of the 14 valid types. Choose the SAFEST pick with highest expected accuracy. Avoid exotic picks unless data is overwhelming.                                                           |
| `confidence` | 60-95. Reflects statistical reality. Must be justified by specific numbers. Never exceed 85 unless 4+ independent data points align. Never exceed 90 without truly exceptional convergence. |
| `odds`       | Fair decimal odds 1.20-5.00. Derived from your assessed probability: odds ≈ 100/confidence.                                                                                                 |
| `analysis`   | 2-3 sentences IN ITALIAN citing specific numbers (position, form, avg goals, BTTS%, injuries). Must justify the pick.                                                                       |

**Accuracy-first rules:**

1. **Safer picks win more.** Prefer 1X, X2, Over 1.5, Under 3.5 over exact outcomes unless evidence is very strong.
2. **Analyze ALL data** — standings, form, home/away splits, goals, injuries, motivation, odds.
3. **For Over/Under**: calculate avg total goals from BOTH teams' stats. Only pick Over 2.5 if xGoals > 2.8. Only pick Under 2.5 if xGoals < 2.2.
4. **For Goal/No Goal**: BTTS% from last 5 must support. Only pick Goal if BTTS% > 65% for both teams. Only pick No Goal if one team has clean sheet% > 50%.
5. **Never exceed 90% confidence** without at least: clear form advantage + home/away splits favoring + no key injuries + historical pattern + odds alignment.
6. **When uncertain, reduce confidence** — 65% honest is better than 80% optimistic.
7. **Consider the draw** — In tight matches between similar teams, X or X2/1X may be the most probable outcome.
8. **Be contrarian only when data clearly supports it.** Don't pick upsets for variety.

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
- Sort predictions by value (confidence × odds) ascending
- Bottom 25% → free, next 25% → pro, top 50% → vip
- Combo predictions (containing "+") are always "vip"

### 6. Replace existing tips and insert new ones

Since this skill always produces the freshest analysis, **always replace** existing pending tips for the same matches. Never skip a match because it already has a tip.

```sql
-- Delete any existing pending tips for these matches
DELETE FROM tips WHERE status = 'pending' AND league = '<slug>'
  AND match_id IN ('<id1>', '<id2>', ...);

-- Insert fresh predictions
INSERT INTO tips (match_id, home_team, away_team, match_date, prediction, odds, confidence, analysis, tier, league)
VALUES
  ('<match_id>', '<home>', '<away>', '<date>', '<pred>', <odds>, <conf>, '<analysis>', '<tier>', '<league>'),
  ...;
```

**Escape single quotes** in team names and analysis: `'` → `''`

### 7. Summary

Display a formatted summary after all leagues:

```
=== GENERATION SUMMARY ===

<flag> <LEAGUE NAME> (N tips)
  Home vs Away — Prediction (tier, confidence%)
  Home vs Away — Prediction (tier, confidence%)
  ...

Total: N tips | Free: N | Pro: N | VIP: N
```

Flags: serie-a = IT, champions-league = trophy, la-liga = ES, premier-league = EN

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

## Important Notes

- You ARE the analyst. Do NOT call the Claude/Anthropic API. Your analysis IS the prediction.
- **Always replace** existing pending tips — never skip a match. Fresh analysis = better accuracy.
- **One match at a time** — Analyze each match individually for maximum depth and accuracy.
- Process leagues sequentially to respect API rate limits.
- Target ~10 tips per league (based on available upcoming matches).
- All analysis text must be in Italian.
- **Accuracy is the #1 priority.** When unsure, pick safer bets (1X, X2, Over 1.5) over risky ones.

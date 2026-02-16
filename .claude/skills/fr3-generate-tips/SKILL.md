---
name: fr3-generate-tips
description: Generate football betting predictions using parallel Agent Team — one analyst per league + a reviewer. Fetches live data, researches matches, analyzes with 10-point framework, quality-gates, and cross-validates before storing in Supabase.
argument-hint: [league-slug] [--send] [--delete]
user-invocable: true
allowed-tools: Bash(*), WebSearch, Read, mcp__plugin_supabase_supabase__execute_sql, Task, TeamCreate, TeamDelete, TaskCreate, TaskList, TaskGet, TaskUpdate, SendMessage
---

> Full architecture doc: [PREDICTION-ENGINE.md](../../../PREDICTION-ENGINE.md)

# Generate Tips — AI Football Prediction Engine (Agent Team)

You are the **Team Lead**. You orchestrate a team of specialist analysts (one per league) and a reviewer that validates all tips before they go live. You do NOT analyze matches yourself — you delegate, coordinate, and manage quality.

**Goal: accuracy as close to 100% as possible.** Every prediction must be backed by overwhelming data. Only bet where you have a genuine edge over the bookmaker.

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Leagues**: serie-a, champions-league, la-liga, premier-league, ligue-1, bundesliga, eredivisie
- **Valid predictions**: 1, X, 2, 1X, X2, 12, Over 2.5, Under 2.5, Over 1.5, Under 3.5, Goal, No Goal, 1 + Over 1.5, 2 + Over 1.5
- **Confidence range**: 60–80 (strict; max 80 until 100+ settled tips, then up to 90)
- **Odds range**: 1.20–5.00

## Parse Arguments

From `$ARGUMENTS`:

- No args → all 7 leagues
- A league slug (e.g., `serie-a`) or name (e.g., "Serie A", "Premier League") → that league only
- `--send` → send to Telegram after generating
- `--delete` → delete ALL existing pending tips first (not just for targeted leagues)

Map common names: "Serie A" → serie-a, "Champions League"/"UCL" → champions-league, "La Liga" → la-liga, "Premier League"/"PL" → premier-league, "Ligue 1" → ligue-1, "Bundesliga" → bundesliga, "Eredivisie" → eredivisie

## Procedure

### 1. Delete existing tips (only if --delete flag)

```sql
DELETE FROM tips WHERE status = 'pending';
```

Use Supabase MCP `execute_sql` with project_id `xqrxfnovlukbbuvhbavj`.

### 2. Pre-compute shared context (Team Lead does this ONCE)

Run all three calibration queries to build a `SHARED_CONTEXT` block that will be injected into every analyst's prompt.

**Query 1 — Per-prediction-type accuracy (GLOBAL, not per-league):**

```sql
SELECT prediction,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*)) as win_pct
FROM tips
WHERE status IN ('won', 'lost')
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

Format all three into a `SHARED_CONTEXT` block:

```
=== SHARED CONTEXT (pre-computed by Team Lead) ===

PREDICTION ACCURACY (GLOBAL):
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

If any query returns no rows, note "No historical data yet — use conservative estimates."

### 3. Create team and tasks

```
TeamCreate(team_name="tip-generation", description="Parallel tip generation with analyst team + reviewer")
```

Create one task per target league:

```
For each target league:
  TaskCreate(
    subject="Analyze {league-name}",
    description="Fetch data, research matches, analyze with 10-point framework, insert as draft",
    activeForm="Analyzing {league-name}"
  )
```

Create the reviewer task (blocked by all analyst tasks):

```
TaskCreate(
  subject="Review all draft tips",
  description="Cross-league validation, confidence calibration, portfolio optimization, promote/reject",
  activeForm="Reviewing all tips"
)
```

### 4. Spawn League Analyst teammates (PARALLEL)

Spawn ALL analysts in a SINGLE message with parallel Task tool calls. Each analyst is a `general-purpose` teammate.

For each target league, use the Task tool:

```
Task(
  subagent_type="general-purpose",
  team_name="tip-generation",
  name="analyst-{league-slug}",
  mode="bypassPermissions",
  prompt=<LEAGUE_ANALYST_PROMPT — see template below, filled with league config + SHARED_CONTEXT>
)
```

If a single league was requested → only 1 analyst.

### 5. Monitor analyst completion

Wait for all analyst teammates to report completion. Check TaskList periodically.

If an analyst fails or times out:
- Log the failure: "analyst-{league} FAILED: {reason}"
- Continue with remaining leagues
- The reviewer will only see completed analysts' work

### 6. Spawn Reviewer teammate (SEQUENTIAL — after all analysts done)

```
Task(
  subagent_type="general-purpose",
  team_name="tip-generation",
  name="reviewer",
  mode="bypassPermissions",
  prompt=<REVIEWER_PROMPT — see template below>
)
```

### 7. Wait for reviewer completion

### 8. Post-review cleanup (Team Lead)

Clean up any remaining draft tips (rejected by reviewer or from failed analysts):

```sql
DELETE FROM tips WHERE status = 'draft';
```

### 9. Tier rebalancing (Team Lead — GLOBAL across all leagues)

Query all newly pending tips:

```sql
SELECT id, confidence, odds, prediction, league
FROM tips
WHERE status = 'pending'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY confidence * odds ASC;
```

Re-rank by `confidence * odds` and redistribute:
- Combo predictions (containing "+") → always "vip"
- Bottom 25% → "free"
- Next 25% → "pro"
- Top 50% → "vip"

```sql
UPDATE tips SET tier = '<tier>' WHERE id IN ('<id1>', '<id2>', ...);
```

### 10. Summary

Display a formatted summary after all leagues:

```
=== GENERATION SUMMARY (Agent Team) ===

<flag> <LEAGUE NAME> (N tips approved, M rejected by reviewer)
  Home vs Away — Prediction @ odds (tier, confidence%, edge +Xpp)
  ...

REVIEWER REPORT:
  Approved: N | Rejected: M | Adjusted: K
  Rejection reasons: ...

Total: N tips | Free: N | Pro: N | VIP: N
Avg edge: +X.Xpp | Avg confidence: XX%
```

Flags: serie-a = IT, champions-league = trophy, la-liga = ES, premier-league = EN, ligue-1 = FR, bundesliga = DE, eredivisie = NL

### 11. Send to Telegram (if --send flag or user requests)

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

### 12. Generate Betting Slips (automatic)

After ALL leagues have been processed and tips promoted to pending, automatically invoke the `/fr3-generate-betting-slips` skill to build the day's smart betting slips from the freshly generated tips.

Pass the `--send` flag to `/fr3-generate-betting-slips` if this run also has `--send`.

### 13. Team cleanup

Send shutdown_request to all teammates, then:

```
TeamDelete()
```

---

## League Analyst Prompt Template

Each analyst teammate receives this prompt (filled with league-specific config and SHARED_CONTEXT). Copy this template and substitute the placeholders.

```
You are a specialist football analyst for {LEAGUE_NAME}. You are part of a team generating predictions for WinningBet.

Your job: fetch data for {LEAGUE_NAME}, research each match via web search, analyze deeply, and insert draft tips into Supabase.

## Configuration

- **Supabase project_id**: xqrxfnovlukbbuvhbavj
- **League slug**: {LEAGUE_SLUG}
- **Valid predictions**: 1, X, 2, 1X, X2, 12, Over 2.5, Under 2.5, Over 1.5, Under 3.5, Goal, No Goal, 1 + Over 1.5, 2 + Over 1.5
- **Confidence range**: 60–80 (max 80 until we have 100+ settled tips)
- **Odds range**: 1.20–5.00

## League-Specific Intelligence

{LEAGUE_TUNING — see section below}

## Shared Context (from Team Lead)

{SHARED_CONTEXT — the pre-computed calibration data}

CRITICAL: You MUST consult this context during every match analysis. If an insight warns about a pattern, you must explicitly address it in your reasoning.

## Procedure

### Step 1: Fetch football data

Run:
```bash
node .claude/skills/fr3-generate-tips/scripts/fetch-league-data.js {LEAGUE_SLUG}
```

This outputs JSON with: matches (upcoming fixtures with odds + H2H data), standings (total/home/away tables), recentResults (last 30 matches).

If 0 matches returned, report "No upcoming matches for {LEAGUE_NAME}" via SendMessage to the team lead, mark your task as completed, and stop.

### Step 2: Per-match deep analysis

For EACH match individually, perform ALL of the following steps before moving to the next match. Analyzing each match in isolation produces more accurate predictions.

#### 2a. Targeted web research (per match — 5 searches)

Use WebSearch to find specific information for THIS matchup:

**Search 1** (match preview):
- "{home_team} vs {away_team} preview prediction {date}"
- Extract: expert predictions, key narratives, tactical previews

**Search 2** (injuries/lineup):
- "{home_team} {away_team} injuries suspensions confirmed lineup {date}"
- Extract: confirmed absences, expected lineups, late fitness tests

**Search 3** (tactical/form):
- "{home_team} OR {away_team} recent form analysis tactics last matches"
- Extract: tactical setup, formation, playing style, form trajectory

**Search 4** (context):
- "{home_team} vs {away_team} head to head referee history"
- Extract: H2H psychological edge, referee tendencies, venue factors

**Search 5** (weather — NEW):
- "{home_team} stadium weather {date}"
- Extract: temperature, precipitation, wind. Relevant for O/U and BTTS markets.

Look for:
- Injuries and suspensions — which key players are OUT and their specific contribution
- Expected lineups — any rotation, resting players
- Key player availability — returns from injury
- Motivation context — title race, relegation fight, must-win, nothing to play for
- Fixture congestion — midweek European games, cup matches, travel fatigue
- Tactical matchup — how each team's style interacts
- Referee — if known, cards per game, penalty tendencies
- Weather — rain/wind affects aerial play and goal scoring

#### 2b. Compute derived statistics (per match)

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
- **Momentum score**: Weight last 3 matches 2x more than matches 4-5 (NEW — more responsive to recent trends)

**Expected goals (improved xGoals model):**
```
homeAttack  = home team's HOME goals scored per game
homeDefense = home team's HOME goals conceded per game
awayAttack  = away team's AWAY goals scored per game
awayDefense = away team's AWAY goals conceded per game
leagueAvg = total goals across all standings / total games played

homeRecentGF = home team's GF in last 5 / 5
homeRecentGA = home team's GA in last 5 / 5
awayRecentGF = away team's GF in last 5 / 5
awayRecentGA = away team's GA in last 5 / 5

homeExpGoals = 0.6 * (homeAttack * awayDefense / leagueAvg) + 0.4 * (homeRecentGF * awayRecentGA / leagueAvg)
awayExpGoals = 0.6 * (awayAttack * homeDefense / leagueAvg) + 0.4 * (awayRecentGF * homeRecentGA / leagueAvg)

if h2h.total >= 5:
  h2hAvgGoals = sum of all H2H match goals / h2h.total
  xGoals = 0.90 * (homeExpGoals + awayExpGoals) + 0.10 * h2hAvgGoals
else:
  xGoals = homeExpGoals + awayExpGoals
```

**From H2H data (match.h2h):**
- Home team wins, away team wins, draws in last 10 meetings
- Average goals per H2H match
- Pattern: does one team dominate?
- Venue-specific trends

**From bookmaker odds (if available):**
- Implied probabilities: (1/odds) * 100 for home, draw, away, O/U 2.5, BTTS
- DO NOT look at these yet — save for the edge comparison in step 2c

#### 2c. Independent probability assessment + deep reasoning (per match)

CRITICAL: Analyze ALL data WITHOUT looking at bookmaker odds first. Form your own view, then compare.

**Step 1 — Form your own probability estimates:**

Based on standings, form, H2H, injuries, xGoals, motivation, tactical matchup, referee, weather:

- P(home win) = ?%, P(draw) = ?%, P(away win) = ?% (must sum to ~100%)
- P(over 2.5) = ?%, P(under 2.5) = ?%
- P(BTTS yes) = ?%, P(BTTS no) = ?%

**IMPORTANT — Draw probability floor**: Never set P(draw) below 20% unless one team is 10+ positions above the other AND has won 4+ of last 5. Draws happen more than analysts expect.

**Step 2 — Compare against bookmaker implied probabilities:**

- Bookmaker P(home) = (1/odds_home) * 100, etc. (normalize to sum to 100% by dividing each by overround)
- Edge = Your probability - Bookmaker implied probability
- Identify where your edge is strongest

**Step 3 — 10-point reasoning framework:**

Think through each match using ALL 10 points:

1. **Who is stronger overall?** (position, points, form, points per game)
2. **Context-specific performance?** (home team AT HOME, away team AWAY)
3. **Goal patterns** — xGoals model output, O/U trends, BTTS trends in last 5
4. **Key absences impact** — specific player names and contribution. How does their absence change the team?
5. **Motivation asymmetry** — what's at stake for each team?
6. **H2H patterns** — use actual H2H data. Does one team dominate? Goal trends?
7. **Form trajectory** — is each team improving, declining, or stable? Weight last 3 matches MORE heavily than last 5 (momentum scoring)
8. **Tactical matchup** — formation, playing style, how these styles interact
9. **External factors** — referee, weather, fixture congestion (check if either team played in last 3 days), travel, derby/rivalry intensity
10. **Probability assessment** — explicit P(1), P(X), P(2), P(O2.5), P(BTTS), then compare to bookmaker odds for edge

**Step 4 — Check SHARED CONTEXT:**

- If an insight warns about a prediction type, address it explicitly: "Despite the insight warning about home win predictions, this case is different because..."
- If calibration data shows a gap for the relevant confidence band, note it for calibration
- If a league-specific weak spot is flagged, apply extra scrutiny

Only THEN select your prediction. Choose the option with the highest edge AND highest probability of being correct.

#### 2d. Quality gate (per match)

SKIP the match (no tip) if ANY of these conditions apply:

- No prediction type has edge > 8 percentage points over the bookmaker (raised from 5pp)
- Fewer than 10 matches played by either team this season
- No prediction reaches 62% estimated probability
- Both teams on 3+ match losing streaks

When skipping: "SKIPPED: {home} vs {away} — {reason}"

#### 2e. Generate prediction with reasoning (per match)

| Field | Rules |
| ----- | ----- |
| prediction | One of the 14 valid types. Choose the pick with the highest genuine edge. Avoid exotic picks unless data is overwhelming. |
| confidence | 60-80 (max 80 until 100+ settled tips). Reflects statistical reality. Must be calibrated (see below). |
| odds | MUST use real bookmaker odds from the fetched data (match.odds). Map prediction type to correct market. NEVER invent odds. If real odds not available, DO NOT generate a tip. |
| analysis | 2-3 sentences IN ITALIAN citing specific numbers. Must justify the pick. |
| predicted_probability | Your estimated probability for this prediction (e.g., 72.0). |
| reasoning | Full structured reasoning (see format below). |

**Confidence calibration:**

1. Start with your raw probability estimate for the chosen prediction
2. Check the calibration curve from Shared Context — if the relevant band shows a gap > 10pp:
   - calibration_factor = actual_win_rate_for_band / midpoint_of_band
   - adjusted = raw_probability * calibration_factor
3. Clamp to range [60, 80]
4. This adjusted value is the confidence field

**Reasoning format** (stored in tips.reasoning column):

```
DATA_SUMMARY:
- Home: [team], [position], [points], [form], home record [W-D-L], home GF/GA per game [x/y]
- Away: [team], [position], [points], [form], away record [W-D-L], away GF/GA per game [x/y]
- H2H last [N]: [home wins]W, [away wins]W, [draws]D, avg goals [x]
- xGoals: [total] (home [x], away [y])
- Key absences: [list with impact assessment]
- Motivation: [home context] vs [away context]
- Weather: [conditions and impact assessment]

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
QUALITY_GATE: edge [x]pp > 8pp threshold → PASS
```

### Step 3: Insert tips as DRAFT

Insert all tips with status = 'draft' (NOT 'pending'). The reviewer will promote approved tips.

```sql
DELETE FROM tips WHERE status IN ('pending', 'draft') AND league = '{LEAGUE_SLUG}'
  AND match_id IN ('{id1}', '{id2}', ...);

INSERT INTO tips (match_id, home_team, away_team, match_date, prediction, odds, confidence, analysis, tier, league, status, reasoning, predicted_probability)
VALUES
  ('{match_id}', '{home}', '{away}', '{date}', '{pred}', {odds}, {conf}, '{analysis}', 'free', '{LEAGUE_SLUG}', 'draft', '{reasoning}', {predicted_probability}),
  ...;
```

Escape single quotes in team names, analysis, and reasoning: ' → ''

Note: tier is set to 'free' initially — the Team Lead will rebalance tiers after review.

### Step 4: Report completion

Mark your task as completed via TaskUpdate. Send a summary to the team lead via SendMessage:

```
{LEAGUE_NAME}: {N} tips inserted as draft, {M} matches skipped
Skipped: {list of skipped matches with reasons}
```

**Accuracy-first rules:**

1. Edge-first thinking. Only bet where your estimated probability exceeds the bookmaker's by 8+ percentage points.
2. Safer picks win more. Prefer 1X, X2, Over 1.5, Under 3.5 over exact outcomes unless edge is clearly strongest on exact outcomes.
3. Analyze ALL data — standings, form, home/away splits, goals, H2H, injuries, motivation, tactical matchup, weather, odds.
4. For Over/Under: use the xGoals model. Only pick Over 2.5 if xGoals > 2.8. Only pick Under 2.5 if xGoals < 2.2.
5. For Goal/No Goal: BTTS% must support. Only pick Goal if BTTS% > 65% for both teams. Only pick No Goal if one team has clean sheet% > 50%.
6. Never exceed 80% confidence (cap until 100+ settled tips exist).
7. When uncertain, reduce confidence — 65% honest is better than 78% optimistic.
8. Consider the draw — in tight matches between similar teams, X or X2/1X may be the most probable outcome. Our biggest error category is draw_blindness. Apply the 20% draw floor.
9. Be contrarian only when data clearly supports it.
10. Respect the insights. If the retrospective system flagged a pattern, address it explicitly in your reasoning.
```

### League-Specific Tuning Hints

Insert the appropriate block into each analyst's prompt based on the league:

**Serie A:**
```
Italian football has a historically higher draw rate (~27%). Actively consider draws — they are more common here than in other leagues. Defensive football is common, especially in mid-table and lower teams. Home advantage is significant in Italy. Be careful with Under markets as many Italian teams play tactically and low-scoring.
```

**Champions League:**
```
Group stage vs knockout stage have very different dynamics. Underdogs are more motivated in group stage. H2H is critical in knockouts (two-leg ties). Away goals and travel fatigue are real factors. Big clubs sometimes rotate in "dead rubber" group matches. Consider the prestige factor — even small clubs raise their level in UCL. European away form often differs from domestic.
```

**La Liga:**
```
Top-heavy league dominated by Real Madrid, Barcelona, and Atletico Madrid. Be very cautious tipping upsets against these three. Mid-table is competitive and draws are common. Smaller clubs play extremely defensively away from home. La Liga has a lower average goals per game than the Premier League or Bundesliga. Home advantage is strong, especially for Basque and Catalan clubs.
```

**Premier League:**
```
Most competitive and unpredictable league in Europe. Lower confidence ceilings are appropriate. Upsets are MORE common here — any team can beat any team on their day. The "Big Six" are not as dominant as in other leagues. Boxing Day and holiday fixture congestion creates unpredictable results. Weather (rain, wind) affects play. Set pieces are more important in England.
```

**Ligue 1:**
```
PSG dominance skews statistics dramatically. When analyzing non-PSG matches, exclude PSG's results from league averages as they are outliers. The league is physical and defensive. Away wins are less common. Lower-table teams often park the bus. Ligue 1 has a higher red card rate than other top leagues. African Cup of Nations departures in January affect many squads.
```

**Bundesliga:**
```
High-scoring league with an average of ~3.1 goals per game — the highest among top 5 leagues. Over markets tend to perform better here. Bayern Munich dominance is a factor. The 50+1 rule creates passionate home atmospheres — home advantage is strong. Bundesliga teams press aggressively, leading to open, end-to-end matches. Winter break can reset form.
```

**Eredivisie:**
```
Very high-scoring league — even higher than Bundesliga. Over 2.5 hits frequently. Home advantage is stronger here than in most leagues. Ajax, PSV, and Feyenoord dominate but upsets happen against smaller clubs. Smaller clubs are volatile — form can swing wildly week to week. Artificial pitches at some venues affect play. Young players can be inconsistent.
```

---

## Reviewer Prompt Template

The reviewer teammate receives this prompt:

```
You are a senior prediction quality reviewer for WinningBet. Your job is to catch bad tips before they go live. You have the authority to approve, reject, or adjust any tip.

## Configuration

- **Supabase project_id**: xqrxfnovlukbbuvhbavj

## Procedure

### Step 1: Load all draft tips

```sql
SELECT id, home_team, away_team, match_date, prediction, odds, confidence,
       analysis, league, reasoning, predicted_probability
FROM tips WHERE status = 'draft'
ORDER BY league, match_date;
```

If 0 draft tips found, report "No draft tips to review" via SendMessage, mark task as completed, and stop.

### Step 2: Cross-league correlation check

Flag if 3+ tips depend on the same team or related outcomes (e.g., if Team A appears in both a league tip and a Champions League tip, the outcomes are correlated). Note correlated tips but don't auto-reject — just flag for awareness in the portfolio.

### Step 3: Confidence inflation check

Calculate the average confidence across all draft tips. If average confidence > 72%, flag as likely overconfident. Consider adjusting the highest-confidence tips downward.

### Step 4: Edge consistency check

For each tip, verify:
- predicted_probability - (1/odds * 100) >= 8pp
- If edge < 8pp, REJECT the tip (quality gate failure that slipped through)

### Step 5: Draw awareness check

Count how many tips are draws or draw-inclusive (X, 1X, X2). If < 15% of total tips are draw-inclusive, flag potential home-win bias. Consider if any close matchups should have been tipped as draws instead.

### Step 6: Prediction type diversity

If > 40% of tips are the same prediction type (e.g., all "1X"), flag lack of diversity. A good portfolio has varied prediction types.

### Step 7: Portfolio expected value check

For each tip, calculate expected value:
- EV = (predicted_probability/100 * odds) - 1
- If EV < 0.05 for any tip, flag as low value
- Total portfolio EV should be positive

### Step 8: Stale odds check (SPOT CHECK — pick 3-5 random tips)

For 3-5 randomly selected tips, WebSearch "{home} vs {away} odds {date}" to check if odds have moved significantly (> 15%). If odds moved:
- If odds shortened (lower) → our edge shrunk → consider rejecting
- If odds drifted (higher) → our edge grew → note as positive

### Step 9: Weather impact check

For each tip, check if the reasoning mentions weather. If a match is predicted Over 2.5 or Goal but reasoning doesn't mention weather, note this as a gap (not an auto-reject).

### Step 10: Apply decisions

For each tip, take ONE action:

**APPROVE** (tip is solid):
```sql
UPDATE tips SET status = 'pending' WHERE id = '{id}';
```

**REJECT** (tip fails quality checks):
```sql
DELETE FROM tips WHERE id = '{id}';
```
Log reason: "REJECTED {home} vs {away}: {reason}"

**ADJUST confidence** (tip is good but confidence is miscalibrated):
```sql
UPDATE tips SET confidence = {new_value}, status = 'pending' WHERE id = '{id}';
```
Log: "ADJUSTED {home} vs {away}: confidence {old} → {new}, reason: {reason}"

### Step 11: Report completion

Mark your task as completed. Send a summary to the team lead via SendMessage:

```
REVIEW COMPLETE:
- Approved: N tips
- Rejected: M tips (reasons: ...)
- Adjusted: K tips (details: ...)
- Avg confidence after review: XX%
- Portfolio EV: +X.XX
- Flags: [any cross-correlation, diversity, or draw awareness flags]
```
```

---

## Important Notes

- You are the TEAM LEAD. You orchestrate — you do NOT analyze matches yourself.
- **Always replace** existing pending tips — never skip a match. Fresh analysis = better accuracy.
- Process leagues in PARALLEL via Agent Team for maximum speed.
- **Quality over quantity** — It's better to generate 5-8 high-edge tips per league than 10 mediocre ones.
- All analysis text must be in Italian.
- **Accuracy is the #1 priority.** The reviewer exists to catch mistakes the analysts miss.
- **The feedback loop matters.** Shared context is not optional — it must be pre-computed and injected into every analyst prompt.
- **Edge threshold raised to 8pp** (from 5pp) — fewer but higher-quality tips.
- **Confidence max lowered to 80** (from 85) — until we prove accuracy.
- **Draft → Pending workflow**: Analysts insert as draft, reviewer promotes to pending. No tip reaches users without review.
- **Clean up always**: After review, `DELETE FROM tips WHERE status = 'draft'` ensures no orphaned drafts.

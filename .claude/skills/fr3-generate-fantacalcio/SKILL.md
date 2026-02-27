---
name: fr3-generate-fantacalcio
description: Generate weekly Fantacalcio (Italian Fantasy Football) picks for Serie A. Produces captain suggestions, differential picks, and buy/sell market advice. Inserts into fantacalcio_picks table for the current ISO week. Uses the same quality standards as the main tip engine (data-first, no guessing).
argument-hint: [serie-a|premier-league] [--dry-run] [--force]
user-invocable: true
allowed-tools: Bash(*), WebSearch, mcp__plugin_supabase_supabase__execute_sql
---

# Generate Fantacalcio — Weekly Fantasy Football Picks

You are the **Fantacalcio Analyst**. You generate weekly player picks for fantasy football, specifically for Serie A (and optionally Premier League FPL). Your picks are DATA-DRIVEN — you do not guess or rely on intuition alone.

**Goal: provide the most accurate captain, differential, and transfer advice possible for the current gameweek.**

Same precision standards as the main tip engine: every pick must be backed by statistics. No vague reasoning.

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Default league**: `serie-a`
- **Supported leagues**: `serie-a`, `premier-league`
- **API Football league IDs**: serie-a = 135, premier-league = 39

## Parse Arguments

From `$ARGUMENTS`:

- No args → generate for `serie-a`
- `serie-a` or `premier-league` → that league only
- `--dry-run` → show what would be inserted without touching the database
- `--force` → regenerate even if picks for this week already exist (deletes and recreates)

## Procedure

### 1. Compute current week date

The `week_date` for all picks is the **Monday of the current ISO week**:

```javascript
const now = new Date();
const day = now.getDay(); // 0=Sun, 1=Mon, ...
const offset = day === 0 ? -6 : 1 - day;
const monday = new Date(now);
monday.setDate(now.getDate() + offset);
const weekDate = monday.toISOString().split('T')[0];
```

### 2. Check for existing picks (skip unless --force)

```sql
SELECT COUNT(*) as existing
FROM fantacalcio_picks
WHERE league = '{LEAGUE_SLUG}'
  AND week_date = '{WEEK_DATE}';
```

If existing > 0 AND NOT `--force` → report "Picks already generated for week {WEEK_DATE}. Use --force to regenerate." and stop.

### 3. Fetch data (4 API calls max — efficiency first)

Run the following via the Bash tool using the fetch-league-data infrastructure:

**Call 1 — Top scorers:**

```bash
node -e "
const path = require('path');
const ROOT = 'C:/Users/selen/winningbet';
const fs = require('fs');
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#\s=]+)\s*=\s*(.*)$/);
    if (m) { let v = m[2].trim(); if ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith(\"'\") && v.endsWith(\"'\"))) v = v.slice(1,-1); if (!process.env[m[1]]) process.env[m[1]] = v; }
  }
}
const api = require(path.join(ROOT, 'api/_lib/api-football'));
const { getLeague } = require(path.join(ROOT, 'api/_lib/leagues'));
const league = getLeague('{LEAGUE_SLUG}');
api.getTopScorers(league.apiFootballId, league.season, 20).then(r => process.stdout.write(JSON.stringify(r))).catch(e => process.stdout.write(JSON.stringify({error: e.message})));
"
```

**Call 2 — Standings (for fixture difficulty):**

Already available via `fetch-league-data.js` — reuse if standings already in memory from a prior `fr3-generate-tips` run. Otherwise:

```bash
node .claude/skills/fr3-generate-tips/scripts/fetch-league-data.js {LEAGUE_SLUG}
```

Parse only `standings.total` and `matches` from the output. This single call gives you standings + upcoming fixtures in one shot.

**Note on `getTopScorers`:** If this method does not exist in `api/_lib/api-football.js`, use the fetch-league-data output which already contains standings. Fall back to WebSearch for top scorer lists if the API call fails.

**Call 3 — Web research for form and ownership:**

```
WebSearch: "fantacalcio top picks gameweek {N} serie a {CURRENT_DATE}"
```

Extract from Italian fantasy football sites (Fantacalcio.it, Leghe Fantacalcio, La Gazzetta fantacalcio section):
- Current week's top captains by expert consensus
- Ownership percentage of key players (if available)
- Player availability / injury doubts
- Players on good/bad form streaks

**Call 4 — Fixture difficulty:**

From the standings fetched in Call 2, compute a simple **Fixture Difficulty Rating (FDR)** for each upcoming opponent:

```
FDR = opponent's league position (1=hardest, 20=easiest)
Adjusted FDR = 1 - (opponent_position - 1) / (total_teams - 1)
              → 1.0 for rank 1 (hardest fixture), 0.0 for last place (easiest)
```

### 4. Analysis framework

For each player under consideration, compute a **Fantasy Score**:

```
fantasy_score = goals_per_game × (1 - adjusted_FDR) × form_modifier × starter_certainty
```

Where:
- `goals_per_game` = season goals / appearances (or assists for non-forwards)
- `adjusted_FDR` = fixture difficulty (0.0 = easy fixture → score boost, 1.0 = hard → score penalty)
- `form_modifier` = 1.2 if last 3 returns > season average, 0.85 if below, 1.0 otherwise
- `starter_certainty` = 1.0 if confirmed starter, 0.7 if rotation risk, 0.4 if doubtful

**For each pick type:**

#### Captain picks (3 players, FREE tier)

Select the top 3 players by fantasy_score where:
- starter_certainty ≥ 0.9 (must be near-certain to start)
- Upcoming fixture is "easy" or "medium" (adjusted_FDR < 0.60)
- Has scored or assisted in at least 2 of last 5 games (form evidence)

Rank by fantasy_score. The #1 captain should be the clearest choice with the strongest combination of form + fixture.

**Confidence formula:** `min(85, round(fantasy_score / max_score × 100))`

**Expected points:** Based on typical fantasy point system (goal = 6 pts, assist = 3 pts, bonus = avg 1.2 pts):
- `expected_points = goals_per_game × 6 × form_modifier × (1 - adjusted_FDR) + 1.2`
- For captains, multiply by 2 (captain doubles points)

#### Differential picks (3 players, PRO tier)

Select players where:
- Ownership percentage < 30% (or inferred low if not available — use "less popular pick" heuristic: players not in expert consensus top-5)
- fantasy_score is in the top 15% of all players analyzed
- Often: player whose form has improved but ownership hasn't caught up yet

These are **contrarian picks** with HIGH upside. Reasoning must explain the value edge.

#### Transfer advice — Buy (3 players, VIP tier)

Players to bring in this week:
- Strong upcoming fixtures (adjusted_FDR < 0.40)
- Recent form improving (last 3 returns above average)
- Not yet at peak ownership (still being bought)

#### Transfer advice — Sell (3 players, VIP tier)

Players to move out:
- Poor upcoming fixtures (adjusted_FDR > 0.70) for 2+ consecutive weeks
- Form declining (last 3 below average)
- Injury doubt or rotation risk

### 5. Generate reasoning (IN ITALIAN — 2–3 sentences max per player)

Reasoning must cite:
- Specific stats (goals/assists/appearances)
- Opponent and fixture difficulty
- Form evidence (e.g., "3 gol nelle ultime 4 partite")
- For differentials: the ownership angle ("pochi allenatori lo hanno in squadra")

Keep it concise and actionable — the user needs to make a quick decision.

### 6. Delete existing picks and insert new ones

**Delete first (clean slate for this week):**

```sql
DELETE FROM fantacalcio_picks
WHERE league = '{LEAGUE_SLUG}'
  AND week_date = '{WEEK_DATE}';
```

**Insert picks:**

```sql
INSERT INTO fantacalcio_picks
  (league, pick_type, player_name, team_name, role, reasoning, tier, week_date, confidence, expected_points, ownership_pct, rank)
VALUES
  ('{LEAGUE_SLUG}', 'captain', '{name}', '{team}', '{P|D|C|A}', '{reasoning}', 'free',   '{WEEK_DATE}', {conf}, {pts}, {own_pct_or_null}, 1),
  ('{LEAGUE_SLUG}', 'captain', '{name}', '{team}', '{role}',     '{reasoning}', 'free',   '{WEEK_DATE}', {conf}, {pts}, {own_pct_or_null}, 2),
  ('{LEAGUE_SLUG}', 'captain', '{name}', '{team}', '{role}',     '{reasoning}', 'free',   '{WEEK_DATE}', {conf}, {pts}, {own_pct_or_null}, 3),
  ('{LEAGUE_SLUG}', 'differential', '{name}', '{team}', '{role}', '{reasoning}', 'pro',   '{WEEK_DATE}', {conf}, {pts}, {own_pct_or_null}, 1),
  ('{LEAGUE_SLUG}', 'differential', '{name}', '{team}', '{role}', '{reasoning}', 'pro',   '{WEEK_DATE}', {conf}, {pts}, {own_pct_or_null}, 2),
  ('{LEAGUE_SLUG}', 'differential', '{name}', '{team}', '{role}', '{reasoning}', 'pro',   '{WEEK_DATE}', {conf}, {pts}, {own_pct_or_null}, 3),
  ('{LEAGUE_SLUG}', 'buy',  '{name}', '{team}', '{role}', '{reasoning}', 'vip',  '{WEEK_DATE}', {conf}, null, {own_pct_or_null}, 1),
  ('{LEAGUE_SLUG}', 'buy',  '{name}', '{team}', '{role}', '{reasoning}', 'vip',  '{WEEK_DATE}', {conf}, null, {own_pct_or_null}, 2),
  ('{LEAGUE_SLUG}', 'buy',  '{name}', '{team}', '{role}', '{reasoning}', 'vip',  '{WEEK_DATE}', {conf}, null, {own_pct_or_null}, 3),
  ('{LEAGUE_SLUG}', 'sell', '{name}', '{team}', '{role}', '{reasoning}', 'vip',  '{WEEK_DATE}', {conf}, null, {own_pct_or_null}, 1),
  ('{LEAGUE_SLUG}', 'sell', '{name}', '{team}', '{role}', '{reasoning}', 'vip',  '{WEEK_DATE}', {conf}, null, {own_pct_or_null}, 2),
  ('{LEAGUE_SLUG}', 'sell', '{name}', '{team}', '{role}', '{reasoning}', 'vip',  '{WEEK_DATE}', {conf}, null, {own_pct_or_null}, 3);
```

Escape single quotes in text fields: `'` → `''`

If `--dry-run`: do NOT execute. Show the table of what would be inserted.

### 7. Summary

```
=== FANTACALCIO PICKS — {LEAGUE_NAME} — Week {WEEK_DATE} ===

CAPITANO:
  #1 [Player] ([Team]) — [role] — conf [X]% — [expected_pts] FM — "[reasoning]"
  #2 ...
  #3 ...

COLPI A SORPRESA (PRO):
  #1 [Player] ([Team]) — [role] — [ownership]% possesso — "[reasoning]"
  #2 ...
  #3 ...

MERCATO (VIP):
  DA COMPRARE:
    [Player] ([Team]) — "[reasoning]"
    ...
  DA CEDERE:
    [Player] ([Team]) — "[reasoning]"
    ...

Inserted: 12 picks | Week: {WEEK_DATE}
```

## Important Notes

- **Never guess player stats** — if the API returns no data, fall back to WebSearch from reliable sources (fantacalcio.it, gazzetta.it, transfermarkt.it). If stats still unavailable, skip that pick slot and note it.
- **Ownership percentages are estimates** if not available from API. If using estimates, note "(stima)" in the reasoning.
- **Role mapping** — Serie A fantacalcio roles: P (Portiere), D (Difensore), C (Centrocampista), A (Attaccante). FPL roles: GKP, DEF, MID, FWD → map to P/D/C/A.
- **No captain from the same team twice** — diversify across teams to serve all fantasy managers.
- **Captain must be a starter** — never suggest a player with rotation risk as captain.
- **Data freshness** — If today is early in the week (Mon/Tue), lineups may not be announced. Note this caveat in the summary.
- **Week date consistency** — Always use the ISO Monday date. A pick for "this week's games" always belongs to the week starting that Monday.

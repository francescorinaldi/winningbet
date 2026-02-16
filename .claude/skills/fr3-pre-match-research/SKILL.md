---
name: fr3-pre-match-research
description: Dedicated deep research engine that runs BEFORE tip generation. Gathers lineups, injuries, xG, referee stats, weather, motivation, and market intelligence per match. Caches results for reuse by analysts. Use when user asks to research matches or prepare data for tips.
argument-hint: [league-slug] [--force]
user-invocable: true
allowed-tools: Bash(*), WebSearch, mcp__plugin_supabase_supabase__execute_sql
---

# Pre-Match Research — Deep Data Gathering Engine

You ARE the research engine. Your job is to gather high-quality, structured data for every upcoming match. You do NOT make predictions — you provide the raw intelligence that analysts use.

**Goal: maximum data quality and completeness. Research FIRST, analyze LATER.**

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Leagues**: serie-a, champions-league, la-liga, premier-league, ligue-1, bundesliga, eredivisie

## Parse Arguments

From `$ARGUMENTS`:

- No args → research all leagues with upcoming matches in next 48h
- A league slug → research that league only
- `--force` → re-research even if fresh data exists

Map common names: "Serie A" → serie-a, "Champions League"/"UCL" → champions-league, "La Liga" → la-liga, "Premier League"/"PL" → premier-league, "Ligue 1" → ligue-1, "Bundesliga" → bundesliga, "Eredivisie" → eredivisie

## Procedure

### 1. Fetch upcoming matches

For each target league, run:

```bash
node .claude/skills/fr3-generate-tips/scripts/fetch-league-data.js {LEAGUE_SLUG}
```

Extract the list of upcoming matches (within next 48h). If 0 matches → report "No upcoming matches for {league}" and skip.

### 2. Check existing research

For each match, check if fresh research already exists:

```sql
SELECT id, research_completeness, created_at
FROM match_research
WHERE match_id = '{match_id}'
  AND status = 'fresh'
  AND created_at > NOW() - INTERVAL '6 hours';
```

- If fresh research exists with completeness >= 70% AND `--force` is NOT set → skip this match
- If no fresh research OR completeness < 70% OR `--force` → proceed with research

### 3. Per-match deep research (7-8 web searches)

For each match needing research, perform ALL searches below. Extract structured data.

**Search 1 — Lineups & Injuries (2 searches):**

- `"{home_team} vs {away_team} lineup injuries team news {date}"`
- `"{home_team} {away_team} transfermarkt injuries {date}"`

Extract:
```json
{
  "lineups": {
    "home_expected_xi": ["player1", "player2", ...],
    "away_expected_xi": ["player1", "player2", ...],
    "home_formation": "4-3-3",
    "away_formation": "3-5-2",
    "lineup_confidence": "confirmed|probable|speculative"
  },
  "injuries": {
    "home": [
      {"player": "Name", "role": "striker", "severity": "out", "return_date": "2026-03-01", "impact": "HIGH"}
    ],
    "away": [...]
  }
}
```

**Search 2 — Tactical Preview:**

- `"{home_team} vs {away_team} tactical preview formation analysis"`

Extract:
```json
{
  "home_style": "high press, possession-based",
  "away_style": "counter-attack, low block",
  "key_matchup": "Home's overlapping fullbacks vs Away's wing-backs",
  "recent_tactical_changes": "Home switched from 4-3-3 to 3-4-3 last 2 games",
  "pressing_intensity": {"home": "high", "away": "medium"}
}
```

**Search 3 — xG & Advanced Stats:**

- `"{home_team} {away_team} xG expected goals understat fbref stats"`

Extract:
```json
{
  "home_xg_per_game": 1.45,
  "away_xg_per_game": 1.12,
  "home_xga_per_game": 0.98,
  "away_xga_per_game": 1.35,
  "pre_match_xg_projection": {"home": 1.6, "away": 0.9},
  "source": "understat|fbref|fivethirtyeight",
  "ppda": {"home": 8.5, "away": 12.3},
  "shot_conversion": {"home": "12%", "away": "9%"}
}
```

**Search 4 — Referee Stats:**

- `"{referee_name} referee stats cards penalties average" OR "{home_team} vs {away_team} referee"`

Extract:
```json
{
  "referee_name": "Name",
  "avg_fouls_per_game": 24.5,
  "avg_cards_per_game": 4.2,
  "penalty_rate": "0.35 per game",
  "home_bias": "slight (56% home wins in reffed games)",
  "known_for": "lenient|strict|card-happy"
}
```

**Search 5 — Weather:**

- `"{city} weather {date} forecast"`

Extract:
```json
{
  "temperature_c": 12,
  "precipitation": "light rain expected",
  "wind_kmh": 15,
  "pitch_condition": "wet|dry|artificial",
  "impact_assessment": "Wet pitch may reduce passing accuracy, slight advantage to physical play"
}
```

**Search 6 — Motivation & Context:**

- `"{home_team} {away_team} season objectives manager pressure must win {date}"`

Extract:
```json
{
  "home_objective": "Title race, 2 points behind leader",
  "away_objective": "Comfortable mid-table, nothing to play for",
  "motivation_asymmetry": "HIGH — home must win, away relaxed",
  "derby_factor": false,
  "cup_fatigue": "Away played midweek Champions League, possible rotation",
  "manager_pressure": {"home": "low", "away": "medium — 3 losses in a row"}
}
```

**Search 7 — Market Intelligence:**

- `"{home_team} vs {away_team} odds movement betting market {date}"`

Extract:
```json
{
  "opening_odds": {"home": 1.85, "draw": 3.50, "away": 4.20},
  "current_odds": {"home": 1.75, "draw": 3.60, "away": 4.50},
  "movement": "Home odds shortening (1.85→1.75), money on home win",
  "sharp_money_indicator": "Significant movement suggests smart money on home",
  "over_under_movement": "Over 2.5 steady at 1.90"
}
```

### 4. Calculate research completeness

Score each research category:
- Lineups: 20 points (confirmed=20, probable=15, speculative=10, missing=0)
- Injuries: 15 points (detailed with impact=15, basic list=10, missing=0)
- Tactical preview: 15 points (formations+style=15, basic=8, missing=0)
- xG data: 15 points (from specialist site=15, estimated=8, missing=0)
- Referee: 10 points (full stats=10, name only=5, missing=0)
- Weather: 10 points (full forecast=10, basic=5, missing=0)
- Motivation: 10 points (detailed=10, basic=5, missing=0)
- Market intelligence: 5 points (line movement=5, static odds=2, missing=0)

Total: 100 points. `research_completeness` = sum of scored categories.

### 5. Store research

For each researched match, upsert into `match_research`:

```sql
INSERT INTO match_research (
  match_id, league, home_team, away_team, match_date,
  lineups, injuries, tactical_preview, xg_data, referee_data,
  weather, motivation, market_intelligence,
  research_completeness, data_sources, status, expires_at
) VALUES (
  '{match_id}', '{league}', '{home}', '{away}', '{match_date}',
  '{lineups_json}', '{injuries_json}', '{tactical_json}', '{xg_json}', '{referee_json}',
  '{weather_json}', '{motivation_json}', '{market_json}',
  {completeness}, ARRAY[{sources}], 'fresh', NOW() + INTERVAL '24 hours'
)
ON CONFLICT (match_id, league)
DO UPDATE SET
  lineups = EXCLUDED.lineups,
  injuries = EXCLUDED.injuries,
  tactical_preview = EXCLUDED.tactical_preview,
  xg_data = EXCLUDED.xg_data,
  referee_data = EXCLUDED.referee_data,
  weather = EXCLUDED.weather,
  motivation = EXCLUDED.motivation,
  market_intelligence = EXCLUDED.market_intelligence,
  research_completeness = EXCLUDED.research_completeness,
  data_sources = EXCLUDED.data_sources,
  status = 'fresh',
  expires_at = NOW() + INTERVAL '24 hours';
```

### 6. Expire stale research

```sql
UPDATE match_research
SET status = 'stale'
WHERE status = 'fresh' AND expires_at < NOW();
```

### 7. Summary

```
=== PRE-MATCH RESEARCH COMPLETE ===

{LEAGUE_NAME}:
  | Match | Completeness | Key Findings |
  |-------|-------------|--------------|
  | Home vs Away | 85% | 2 key injuries home, xG favors home 1.6-0.9 |
  ...

Total: N matches researched
Avg completeness: XX%
Skipped (fresh exists): N
Sources used: [list of unique sources]
```

## Important Notes

- **Research ≠ Analysis** — you gather data, you do NOT predict outcomes
- **Structure everything** — all data must be JSON-serializable for Supabase storage
- **Source attribution** — always note where data came from in `data_sources`
- **Completeness matters** — aim for >= 70% per match. Flag any match below 50%.
- **Fresh = 6 hours** — research older than 6h is considered stale for tip generation
- **Expire = 24 hours** — research auto-expires after 24h
- **Market intelligence is bonus** — if odds movement data isn't available, score 0 and move on
- **Don't fabricate** — if a search returns no useful data for a category, store null and score 0
- **Italian team names** — search in both English and Italian when relevant
- **Process in parallel** — if researching multiple leagues, process them concurrently if possible

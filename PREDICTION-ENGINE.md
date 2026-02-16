# Prediction Engine — Architecture & Algorithm

Unified reference for WinningBet's AI prediction engine. All operational, statistical, and architectural details live here.

**Related files:**

- [`CLAUDE.md`](CLAUDE.md) — Project guide (links here for AI details)
- [`.claude/skills/generate-tips/SKILL.md`](.claude/skills/generate-tips/SKILL.md) — Operational procedure for the Claude Code skill
- [`CHANGELOG.md`](CHANGELOG.md) — Version history (links here for algorithm details)

---

## Table of Contents

1. [Two Engines](#1-two-engines)
2. [Supported Leagues](#2-supported-leagues)
3. [Data Sources & Fallback Strategy](#3-data-sources--fallback-strategy)
4. [Pipeline — Claude Code Skill (Primary)](#4-pipeline--claude-code-skill-primary)
5. [Pipeline — Serverless API (Legacy)](#5-pipeline--serverless-api-legacy)
6. [Statistical Model](#6-statistical-model)
7. [AI Model Configuration](#7-ai-model-configuration)
8. [14 Prediction Types & Settle Logic](#8-14-prediction-types--settle-logic)
9. [Tier Assignment & Balancing](#9-tier-assignment--balancing)
10. [Database Schema](#10-database-schema)
11. [Distribution — Telegram & Email](#11-distribution--telegram--email)
12. [Tip Lifecycle](#12-tip-lifecycle)
13. [Retrospective Learning System](#13-retrospective-learning-system)
14. [Version History](#14-version-history)

---

## 1. Two Engines

WinningBet has two independent prediction engines. The Claude Code skill is the primary engine; the serverless API is the legacy fallback.

|                    | Claude Code Skill (Primary)                                                                | Serverless API (Legacy)                                   |
| ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| **Entry point**    | `/generate-tips` slash command                                                             | `POST /api/generate-tips`                                 |
| **AI model**       | Claude Code itself (zero API cost)                                                         | Opus 4.6 via Anthropic API                                |
| **Analysis style** | Decoupled per-match with web research                                                      | Batched per-league in one API call                        |
| **Data fetch**     | [`fetch-league-data.js`](.claude/skills/generate-tips/scripts/fetch-league-data.js) script | [`generate-tips.js:218-311`](api/generate-tips.js) inline |
| **Storage**        | Supabase MCP `execute_sql`                                                                 | Supabase JS client                                        |
| **Invocation**     | Manual via Claude Code CLI                                                                 | Manual (`POST /api/generate-tips`), cron removed          |
| **Web research**   | WebSearch tool per match (1-2 searches)                                                    | Haiku 4.5 + web_search tool per league (up to 3 searches) |

**Why two engines?** The skill is preferred because Claude Code IS the analyst — no API cost, deeper per-match analysis, and web research per match instead of per league. The serverless API remains available for manual triggering via `POST /api/generate-tips` but the automatic cron schedule has been removed (too expensive for the Hobby plan).

---

## 2. Supported Leagues

Configured in [`api/_lib/leagues.js`](api/_lib/leagues.js):

| Slug               | Name             | api-football ID | football-data Code | Season |
| ------------------ | ---------------- | --------------- | ------------------ | ------ |
| `serie-a`          | Serie A          | 135             | SA                 | 2025   |
| `champions-league` | Champions League | 2               | CL                 | 2025   |
| `la-liga`          | La Liga          | 140             | PD                 | 2025   |
| `premier-league`   | Premier League   | 39              | PL                 | 2025   |
| `ligue-1`          | Ligue 1          | 61              | FL1                | 2025   |
| `bundesliga`       | Bundesliga       | 78              | BL1                | 2025   |
| `eredivisie`       | Eredivisie       | 88              | DED                | 2025   |

Default league: `serie-a` (via `resolveLeagueSlug()` at [`leagues.js:64`](api/_lib/leagues.js)).

---

## 3. Data Sources & Fallback Strategy

All data fetching follows a primary → fallback pattern. If the primary API fails, the system silently falls back to the secondary.

| Data                        | Primary           | Fallback          | Cache TTL |
| --------------------------- | ----------------- | ----------------- | --------- |
| Upcoming matches            | api-football.com  | football-data.org | 2h        |
| Standings (total/home/away) | api-football.com  | football-data.org | 6h        |
| Recent results (last 30)    | football-data.org | api-football.com  | 1h        |
| Odds (1X2)                  | api-football.com  | — (none)          | 30min     |
| H2H data                    | api-football.com  | football-data.org | 24h       |
| Team form                   | football-data.org | api-football.com  | 6h        |

**Standings detail:** `getFullStandings()` returns three tables from a single API call — total, home, and away rankings. Implemented in both [`api-football.js`](api/_lib/api-football.js) and [`football-data.js`](api/_lib/football-data.js) using shared `fetchStandingsData()` + `normalizeStandingEntry()`.

**Odds prefetch (serverless):** All match odds fetched concurrently via `Promise.allSettled` before the Opus call ([`prediction-engine.js:401-407`](api/_lib/prediction-engine.js)).

**Odds prefetch (skill):** Fetched in parallel inside [`fetch-league-data.js:104-118`](.claude/skills/generate-tips/scripts/fetch-league-data.js).

---

## 4. Pipeline — Claude Code Skill (Primary)

Full procedure defined in [`SKILL.md`](.claude/skills/generate-tips/SKILL.md). The skill processes leagues sequentially, but each match within a league is analyzed individually.

### Phase 1: Parse Arguments

From `$ARGUMENTS`: no args = all 4 leagues; a slug or name = that league only; `--send` = send to Telegram; `--delete` = delete all pending tips first.

### Phase 2: Delete Existing Tips (if `--delete`)

```sql
DELETE FROM tips WHERE status = 'pending';
```

### Phase 3: Fetch Football Data

Runs [`fetch-league-data.js`](.claude/skills/generate-tips/scripts/fetch-league-data.js) per league. Outputs JSON with: `matches` (upcoming fixtures + odds + H2H data), `standings` (total/home/away), `recentResults` (last 30).

### Phase 4: Historical Calibration (THREE queries)

Three queries build a `HISTORICAL CONTEXT` block:

1. **Per-prediction-type accuracy** — win rate by prediction type (e.g., "1" at 55%)
2. **Confidence calibration curve** — claimed vs actual win rate per confidence band (60-69, 70-79, 80-95)
3. **Active retrospective insights** — patterns from `prediction_insights` table (biases, weak spots, calibration drift)

This context is mandatory — it must be consulted during every match analysis.

### Phase 5: Web Research (per match — 4 searches)

Four targeted WebSearch calls per match:

1. `"<home> vs <away> preview prediction <date>"` — expert previews
2. `"<home> <away> injuries suspensions confirmed lineup <date>"` — absences
3. `"<home> OR <away> recent form analysis tactics"` — tactical setup
4. `"<home> vs <away> head to head referee history"` — H2H and referee

Extracts: injuries, expected lineups, motivation, fixture congestion, tactical matchup, referee tendencies.

### Phase 6: Compute Derived Statistics (per match)

From already-fetched data, extracts per-team stats. See [Statistical Model](#6-statistical-model) below. Includes improved xGoals model with H2H adjustment.

### Phase 7: Independent Probability Assessment + Deep Reasoning (per match)

**Critical change**: Form probability estimates BEFORE looking at bookmaker odds, then compare for edge detection.

Ten-point analysis framework:

1. Stronger team overall? (position, points, form)
2. Context-specific performance? (home AT HOME, away AWAY)
3. Goal patterns (xGoals model, O/U trends, BTTS trends)
4. Key absences impact (specific players, their contribution)
5. Motivation asymmetry (title, CL, relegation, mid-table)
6. H2H patterns (actual data from fetch, not assumptions)
7. Form trajectory (last 3 weighted > last 5)
8. Tactical matchup (formation, style interaction)
9. External factors (referee, weather, congestion, derby intensity)
10. Probability assessment (explicit P(1), P(X), P(2), P(O2.5), P(BTTS) → compare to odds for edge)

### Phase 7b: Quality Gate (per match)

**SKIP the match** if:
- No prediction has edge > 5pp over bookmaker
- Either team has < 10 matches played
- No prediction reaches 62% estimated probability
- Both teams on 3+ match losing streaks

Quality over quantity — 5-8 high-edge tips better than 10 mediocre ones.

### Phase 8: Generate Prediction with Reasoning (per match)

Outputs: `prediction` (one of 14 types), `confidence` (60-85, calibrated), `odds` (1.20-5.00), `analysis` (2-3 sentences in Italian), `predicted_probability` (raw estimate), `reasoning` (structured chain-of-thought).

**Confidence calibration**: raw probability adjusted by empirical calibration curve, clamped to [60, 85] until 100+ settled tips.

### Phase 9: Tier Assignment & Database Insert

Assigns tiers (see [Tier Assignment](#9-tier-assignment--balancing)), then replaces existing pending tips for the same matches and inserts fresh ones (including `reasoning` and `predicted_probability` columns) via Supabase MCP.

### Phase 10: Summary & Distribution

Displays formatted summary with edge values and skip reasons. If `--send` flag, sends to Telegram (see [Distribution](#11-distribution--telegram--email)).

---

## 5. Pipeline — Serverless API (Legacy)

Entry point: `POST /api/generate-tips` ([`generate-tips.js`](api/generate-tips.js)). The `GET` handler still exists as the cron orchestrator (settle → generate all leagues → send) but the automatic Vercel Cron schedule has been removed.

### Phase 1: Fetch Matches

[`generate-tips.js:222-228`](api/generate-tips.js) — Primary: `apiFootball.getUpcomingMatches()`, fallback: `footballData.getUpcomingMatches()`. Limit: 10 per league.

### Phase 2: Fetch Full Standings

[`generate-tips.js:233-239`](api/generate-tips.js) — `getFullStandings()` returns `{ total, home, away }`.

### Phase 3: Fetch Recent Results

[`generate-tips.js:241-251`](api/generate-tips.js) — Last 30 results per league. Primary: football-data, fallback: api-football.

### Phase 4: Deduplicate

[`generate-tips.js:253-266`](api/generate-tips.js) — Skips matches that already have tips in Supabase (unlike the skill, which always replaces).

### Phase 5: Historical Accuracy

[`generate-tips.js:268-269`](api/generate-tips.js) — `getAccuracyContext()` queries Supabase, formats for prompt injection. Requires 20+ closed tips.

### Phase 6: Parallel Odds Prefetch

[`prediction-engine.js:401-407`](api/_lib/prediction-engine.js) — `Promise.allSettled` for all matches.

### Phase 7: Web Research (Haiku 4.5)

[`prediction-engine.js:118-157`](api/_lib/prediction-engine.js) — `researchLeagueContext()`: one Haiku 4.5 call per league with up to 3 web searches via `web_search_20250305` tool. Silent fallback on failure.

### Phase 8: Batch Prediction (Opus 4.6)

[`prediction-engine.js:375-482`](api/_lib/prediction-engine.js) — `generateBatchPredictions()`: builds match blocks with standings, derived stats, recent results, odds, web context, and accuracy history. Single Opus 4.6 call with structured output.

### Phase 9: Tier Assignment & Balancing

[`prediction-engine.js:315-356`](api/_lib/prediction-engine.js) — `assignTier()` + `balanceTiers()`. See [Tier Assignment](#9-tier-assignment--balancing).

### Phase 10: Database Insert

[`generate-tips.js:292-299`](api/generate-tips.js) — Inserts tips with league field into Supabase.

---

## 6. Statistical Model

Derived statistics are computed per team per match. The skill computes them inline; the serverless engine uses [`prediction-engine.js:221-255`](api/_lib/prediction-engine.js).

### From Standings (total + home/away)

- League position, points, games played
- Form string (W/D/L sequence)
- Home team's HOME record (W/D/L, GF/GA)
- Away team's AWAY record (W/D/L, GF/GA)
- Average goals scored per match: `goalsFor / played`
- Average goals conceded per match: `goalsAgainst / played`

### Zone Classification

| Rank     | Zone               |
| -------- | ------------------ |
| 1-4      | Zona Champions     |
| 5-6      | Zona Europa        |
| 7        | Zona Conference    |
| Bottom 3 | Zona retrocessione |
| Others   | Meta classifica    |

Computed at [`prediction-engine.js:245-252`](api/_lib/prediction-engine.js).

### From Recent Results (last 5 per team)

- Last 5 match scores (filtered from 30 league results)
- **BTTS%**: Percentage of matches where both teams scored
- **Clean Sheet%**: Percentage of matches with 0 goals conceded
- Current streak (winning/drawing/losing run)

### Expected Goals (Improved xGoals Model)

**Legacy formula** (serverless engine): `xGoals = (homeAvgGF + awayAvgGA) / 2 + (awayAvgGF + homeAvgGA) / 2`

**Improved formula** (skill engine — "Dixon-Coles lite"):

```
// Context-specific attack/defense ratings
homeAttack  = home team's HOME goals scored per game
homeDefense = home team's HOME goals conceded per game
awayAttack  = away team's AWAY goals scored per game
awayDefense = away team's AWAY goals conceded per game

// League baseline
leagueAvg = total goals across all standings / total games played

// Recent form adjustment (last 5 per team)
homeRecentGF/GA, awayRecentGF/GA

// Blend: 60% context-specific (home/away splits), 40% recent form
homeExpGoals = 0.6 × (homeAttack × awayDefense / leagueAvg) + 0.4 × (homeRecentGF × awayRecentGA / leagueAvg)
awayExpGoals = 0.6 × (awayAttack × homeDefense / leagueAvg) + 0.4 × (awayRecentGF × homeRecentGA / leagueAvg)

// H2H adjustment (if 5+ meetings available)
if h2h.total >= 5:
  h2hAvgGoals = total H2H goals / h2h.total
  xGoals = 0.90 × (homeExpGoals + awayExpGoals) + 0.10 × h2hAvgGoals
else:
  xGoals = homeExpGoals + awayExpGoals
```

Uses attack/defense ratings relative to league average, weighted by recency and context (home/away-specific stats). H2H data from automatic fetch provides venue-specific goal patterns.

### From Bookmaker Odds

- Implied probabilities: `(1 / odds) × 100` for home, draw, away (normalized by overround)
- **Edge detection**: analyst forms independent probability estimates first, then compares against bookmaker implied probabilities
- **Edge threshold**: minimum +5 percentage points over bookmaker required to generate a tip
- **Independent assessment**: probabilities formed WITHOUT looking at odds first, then compared

---

## 7. AI Model Configuration

### Serverless Engine (Legacy)

| Setting              | Value                                        | Code Reference                                                  |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| **Research model**   | `claude-haiku-4-5-20251001`                  | [`prediction-engine.js:125`](api/_lib/prediction-engine.js)     |
| **Prediction model** | `claude-opus-4-6`                            | [`prediction-engine.js:445`](api/_lib/prediction-engine.js)     |
| **Temperature**      | `0.3`                                        | [`prediction-engine.js:447`](api/_lib/prediction-engine.js)     |
| **Max tokens**       | `600 * matchCount` (dynamic)                 | [`prediction-engine.js:446`](api/_lib/prediction-engine.js)     |
| **Output format**    | JSON schema (structured output)              | [`prediction-engine.js:450-456`](api/_lib/prediction-engine.js) |
| **Web search**       | `web_search_20250305`, max 3 uses, IT locale | [`prediction-engine.js:128-133`](api/_lib/prediction-engine.js) |

### System Prompt

Defined at [`prediction-engine.js:47-58`](api/_lib/prediction-engine.js). Professional football analyst persona with 8 calibration rules:

1. Analyze ALL provided data before deciding
2. Confidence must reflect statistical reality — never optimistic
3. For Over/Under: analyze avg goals scored+conceded for both teams
4. For Goal/No Goal: consider % of matches with both teams scoring
5. Never exceed confidence 90 without overwhelming evidence
6. Analysis must cite specific data, in Italian, 2-3 sentences
7. Reasoning must contain the complete logical process
8. Consider match context: seasonal objectives, rivalries, home advantage

### Structured Output Schema

Defined at [`prediction-engine.js:65-106`](api/_lib/prediction-engine.js). Batch schema with `match_index` mapping:

```json
{
  "predictions": [
    {
      "match_index": 0,
      "prediction": "1X",
      "confidence": 78,
      "odds": 1.45,
      "analysis": "...",
      "reasoning": "..."
    }
  ]
}
```

Fields: `match_index` (int), `prediction` (enum of 14 types), `confidence` (int 60-95), `odds` (number 1.20-5.00), `analysis` (string), `reasoning` (string).

### Claude Code Skill Engine (Primary)

No API model — Claude Code itself is the analyst. Configuration in [`SKILL.md`](.claude/skills/generate-tips/SKILL.md):

- **Confidence range**: 60-85 (strict; max 85 until 100+ settled tips, then up to 95)
- **Odds range**: 1.20-5.00
- **Analysis language**: Italian
- **Accuracy-first rules**: 10 calibration rules (edge-first thinking, draw awareness, respect insights)
- **Quality gate**: skip matches with < 5pp edge, < 62% probability, < 10 matches played, or dual losing streaks
- **Reasoning persistence**: full structured reasoning stored in `tips.reasoning` column
- **Predicted probability**: raw analyst estimate stored in `tips.predicted_probability` for retrospective comparison
- **Confidence calibration**: empirical curve from historical data adjusts raw probability

---

## 8. 14 Prediction Types & Settle Logic

All prediction types and their evaluation logic are in [`cron-tasks.js:283-321`](api/cron-tasks.js) (`evaluatePrediction()`).

| #   | Type           | Wins When                       | Category      |
| --- | -------------- | ------------------------------- | ------------- |
| 1   | `1`            | Home team wins                  | Match result  |
| 2   | `X`            | Draw                            | Match result  |
| 3   | `2`            | Away team wins                  | Match result  |
| 4   | `1X`           | Home win OR draw                | Double chance |
| 5   | `X2`           | Draw OR away win                | Double chance |
| 6   | `12`           | Home win OR away win (no draw)  | Double chance |
| 7   | `Over 2.5`     | Total goals > 2                 | Goals         |
| 8   | `Under 2.5`    | Total goals < 3                 | Goals         |
| 9   | `Over 1.5`     | Total goals > 1                 | Goals         |
| 10  | `Under 3.5`    | Total goals < 4                 | Goals         |
| 11  | `Goal`         | Both teams score (BTTS)         | BTTS          |
| 12  | `No Goal`      | At least one team doesn't score | BTTS          |
| 13  | `1 + Over 1.5` | Home win AND total goals > 1    | Combined      |
| 14  | `2 + Over 1.5` | Away win AND total goals > 1    | Combined      |

**Unrecognized predictions** → `void` (default case in switch).

### Accuracy-First Decision Rules

These rules apply to both engines:

1. **Safer picks win more.** Prefer 1X, X2, Over 1.5, Under 3.5 over exact outcomes unless evidence is very strong.
2. **Over 2.5**: only if xGoals > 2.8. **Under 2.5**: only if xGoals < 2.2.
3. **Goal (BTTS)**: only if BTTS% > 65% for both teams. **No Goal**: only if one team has clean sheet% > 50%.
4. **Never exceed 90% confidence** without: clear form advantage + home/away splits + no key injuries + historical pattern + odds alignment.
5. **When uncertain, reduce confidence** — 65% honest is better than 80% optimistic.
6. **Consider the draw** — In tight matches, X or double chance may be most probable.
7. **Be contrarian only when data clearly supports it.** No upsets for variety.

---

## 9. Tier Assignment & Balancing

Post-generation tier assignment (not in the AI prompt). Implemented at [`prediction-engine.js:315-356`](api/_lib/prediction-engine.js) and mirrored in [`SKILL.md`](.claude/skills/generate-tips/SKILL.md).

### `assignTier()` Logic

```
IF confidence >= 80 AND odds <= 1.8 → "free"
ELSE IF confidence >= 75 AND odds <= 2.5 → "pro"
ELSE IF odds >= 2.5 OR prediction contains "+" → "vip"
ELSE IF confidence >= 70 → "pro"
ELSE → "free"
```

### `balanceTiers()` Logic

Triggered when a league has 3+ tips but any tier has 0 members:

1. Sort predictions by value score (`confidence * odds`) ascending
2. Bottom third → `free`
3. Middle third → `pro`
4. Top third → `vip`

---

## 10. Database Schema

### `tips` Table

Defined in [`001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) + [`002_add_league_column.sql`](supabase/migrations/002_add_league_column.sql) + [`010_retrospective_system.sql`](supabase/migrations/010_retrospective_system.sql):

| Column                  | Type         | Constraints                                                      |
| ----------------------- | ------------ | ---------------------------------------------------------------- |
| `id`                    | UUID         | PK, auto-generated                                               |
| `match_id`              | TEXT         | NOT NULL                                                         |
| `home_team`             | TEXT         | NOT NULL                                                         |
| `away_team`             | TEXT         | NOT NULL                                                         |
| `match_date`            | TIMESTAMPTZ  | NOT NULL                                                         |
| `prediction`            | TEXT         | NOT NULL                                                         |
| `odds`                  | NUMERIC(5,2) | —                                                                |
| `confidence`            | INTEGER      | CHECK 0-100                                                      |
| `analysis`              | TEXT         | —                                                                |
| `tier`                  | TEXT         | NOT NULL, DEFAULT 'free', CHECK IN (free, pro, vip)              |
| `status`                | TEXT         | NOT NULL, DEFAULT 'pending', CHECK IN (pending, won, lost, void) |
| `league`                | TEXT         | NOT NULL, DEFAULT 'serie-a'                                      |
| `reasoning`             | TEXT         | Structured chain-of-thought analysis (added in 010)              |
| `predicted_probability` | NUMERIC(5,2) | Raw analyst probability estimate (added in 010)                  |
| `created_at`            | TIMESTAMPTZ  | NOT NULL, DEFAULT now()                                          |

**Indexes:**

- `idx_tips_match_date` — DESC on `match_date`
- `idx_tips_status` — on `status`
- `idx_tips_tier` — on `tier`
- `idx_tips_match_id` — on `match_id`
- `idx_tips_league` — on `league`
- `idx_tips_league_status_date` — composite on `(league, status, match_date DESC)`

### `tip_outcomes` Table

| Column          | Type        | Constraints                                 |
| --------------- | ----------- | ------------------------------------------- |
| `id`            | UUID        | PK, auto-generated                          |
| `tip_id`        | UUID        | NOT NULL, FK → tips(id) CASCADE, UNIQUE     |
| `actual_result` | TEXT        | NOT NULL (e.g., "2-1, 1, O2.5, O1.5, Goal") |
| `settled_at`    | TIMESTAMPTZ | NOT NULL, DEFAULT now()                     |

### `tip_retrospectives` Table

Defined in [`010_retrospective_system.sql`](supabase/migrations/010_retrospective_system.sql). One row per settled tip — contains post-mortem analysis.

| Column                          | Type         | Constraints                                                      |
| ------------------------------- | ------------ | ---------------------------------------------------------------- |
| `id`                            | UUID         | PK, auto-generated                                               |
| `tip_id`                        | UUID         | NOT NULL, FK → tips(id) CASCADE, UNIQUE                          |
| `actual_score`                  | TEXT         | NOT NULL (e.g., "2-1")                                           |
| `actual_result_category`        | TEXT         | NOT NULL ("1", "X", or "2")                                      |
| `actual_goals_total`            | INTEGER      | NOT NULL                                                         |
| `actual_btts`                   | BOOLEAN      | NOT NULL                                                         |
| `predicted_probability`         | NUMERIC(5,2) | Our probability at generation time                               |
| `bookmaker_implied_probability` | NUMERIC(5,2) | 1/odds × 100                                                     |
| `edge_at_prediction`            | NUMERIC(5,2) | predicted - bookmaker implied                                    |
| `outcome_surprise`              | TEXT         | NOT NULL, CHECK IN (expected, mild_surprise, major_surprise)     |
| `what_happened`                 | TEXT         | NOT NULL, 2-3 sentence match narrative                           |
| `what_we_missed`                | TEXT         | Signal we failed to catch (NULL for won tips)                    |
| `lesson_learned`                | TEXT         | Actionable insight for future                                    |
| `error_category`                | TEXT         | CHECK IN (none, overconfidence, form_reversal, injury_impact, h2h_ignored, motivation_miss, tactical_shift, goal_pattern_miss, referee_factor, underdog_upset, draw_blindness, other) |
| `created_at`                    | TIMESTAMPTZ  | NOT NULL, DEFAULT now()                                          |

**Indexes:** `tip_id`, `error_category`, `outcome_surprise`, `created_at DESC`

### `prediction_insights` Table

Defined in [`010_retrospective_system.sql`](supabase/migrations/010_retrospective_system.sql). Aggregate patterns detected from analyzing multiple retrospectives.

| Column               | Type         | Constraints                                                      |
| -------------------- | ------------ | ---------------------------------------------------------------- |
| `id`                 | UUID         | PK, auto-generated                                               |
| `scope`              | TEXT         | NOT NULL, CHECK IN (global, league, prediction_type, context)    |
| `scope_value`        | TEXT         | e.g., "serie-a", "1", "relegation_battle"                       |
| `insight_type`       | TEXT         | NOT NULL, CHECK IN (bias_detected, weak_spot, strong_spot, calibration_drift, pattern_warning) |
| `insight_text`       | TEXT         | NOT NULL, human-readable insight                                 |
| `evidence`           | JSONB        | NOT NULL, supporting data (tip_ids, win rates, sample size)      |
| `sample_size`        | INTEGER      | NOT NULL                                                         |
| `confidence_level`   | NUMERIC(5,2) | Statistical confidence in the insight                            |
| `is_active`          | BOOLEAN      | NOT NULL, DEFAULT true                                           |
| `first_detected_at`  | TIMESTAMPTZ  | NOT NULL, DEFAULT now()                                          |
| `last_validated_at`  | TIMESTAMPTZ  | NOT NULL, DEFAULT now()                                          |
| `expires_at`         | TIMESTAMPTZ  | Auto-expire after 60 days if not re-validated                    |
| `created_at`         | TIMESTAMPTZ  | NOT NULL, DEFAULT now()                                          |

**Indexes:** `is_active` (partial, WHERE true), `(scope, scope_value)`, `insight_type`

### RLS Policies

**tips:**
- **Free tips**: visible to all (`tier = 'free'`)
- **Pro tips**: visible to users with `profiles.tier IN ('pro', 'vip')`
- **VIP tips**: visible to users with `profiles.tier = 'vip'`
- **Service role**: full access (backend operations)

**tip_retrospectives:**
- **Public**: SELECT (read-only for all)
- **Service role**: full access (ALL)

**prediction_insights:**
- **Public**: SELECT (read-only for all)
- **Service role**: full access (ALL)

---

## 11. Distribution — Telegram & Email

### Telegram

Implemented in [`api/_lib/telegram.js`](api/_lib/telegram.js). Triggered by cron (`task=send`) or skill (`--send` flag).

- **Free tips** → Public channel (`TELEGRAM_PUBLIC_CHANNEL_ID`)
- **Pro + VIP tips** → Private channel (`TELEGRAM_PRIVATE_CHANNEL_ID`)
- **Format**: MarkdownV2, one message per league
- **Auto-invite**: On Stripe subscription activation ([`stripe-webhook.js`](api/stripe-webhook.js))
- **Auto-remove**: On subscription cancellation

### Email

Implemented in [`api/_lib/email.js`](api/_lib/email.js) via SendGrid. The `handleSend()` function at [`cron-tasks.js:151-195`](api/cron-tasks.js) fetches active subscribers, filters tips by tier access, builds a daily digest, and sends per-user emails.

---

## 12. Tip Lifecycle

```
pending → won    (prediction correct)
pending → lost   (prediction incorrect)
pending → void   (unrecognized prediction type / match cancelled)
```

### Settlement Process

**Serverless** ([`cron-tasks.js:46-147`](api/cron-tasks.js)):

1. Fetch all pending tips where `match_date < now()`
2. Group by league
3. For each league, fetch recent results (primary → fallback)
4. Map results by `match_id`
5. For each tip: build actual result string, evaluate prediction, update status
6. Upsert outcome into `tip_outcomes`

**Skill** ([`fr3-settle-tips SKILL.md`](.claude/skills/fr3-settle-tips/SKILL.md)):

1-4. Same as serverless (using WebSearch for scores)
4b. **Per-tip post-mortem** → INSERT into `tip_retrospectives` (error classification, lessons learned)
4c. **Aggregate pattern detection** → UPSERT into `prediction_insights` (biases, calibration drift, weak spots)
5. Summary with retrospective insights section

**Actual result format**: `"2-1, 1, O2.5, O1.5, Goal"` — score, match result, Over/Under 2.5, Over/Under 1.5, BTTS.

### Opportunistic Settlement

[`fixtures.js:106-168`](api/fixtures.js) (`settlePendingTips()`):

When `GET /api/fixtures?type=results` fetches fresh (non-cached) results, it fire-and-forgets a settlement pass for pending tips in that league. This means tips are settled as soon as any user views results — no need to wait for a manual cron trigger.

- Idempotent: `WHERE status = 'pending'` prevents double-updates
- Silent: errors never affect the main response
- Uses shared `evaluatePrediction()` and `buildActualResult()` from `cron-tasks.js`

---

## 13. Retrospective Learning System

A closed-loop feedback system that learns from past predictions and feeds insights back into future generation.

### Architecture — The Feedback Loop

```
GENERATION (fr3-generate-tips)
  ├── Step 3: Load historical accuracy + calibration curve + active insights
  ├── Step 4a: Web research (4 searches per match)
  ├── Step 4b: Derived stats (improved xGoals + H2H data)
  ├── Step 4c: 10-point reasoning (independent probability → then compare odds)
  ├── Step 4d: Quality gate (skip if no genuine edge)
  ├── Step 4e: Generate prediction + persist reasoning + predicted_probability
  └── Step 6: INSERT with reasoning + predicted_probability columns
       │
       ▼
SETTLEMENT (fr3-settle-tips)
  ├── Steps 1-4: Determine won/lost, update tips (existing)
  ├── Step 4b: Per-tip post-mortem → INSERT into tip_retrospectives
  │    └── For LOST: WebSearch match report, identify what we missed, classify error
  ├── Step 4c: Aggregate pattern detection → UPSERT into prediction_insights
  │    └── Detect biases, calibration drift, weak/strong spots
  └── Step 5: Summary with retrospective insights
       │
       ▼
NEXT GENERATION (fr3-generate-tips)
  ├── Step 3: Reads prediction_insights ← THE LOOP CLOSES
  ├── Step 3: Reads calibration curve ← SELF-CORRECTING CONFIDENCE
  └── Step 4c: Explicitly checks insights during per-match reasoning
```

### Error Category Taxonomy

| Category | Description | Example |
| --- | --- | --- |
| `none` | Prediction was correct | — |
| `draw_blindness` | Predicted win (1/2), got draw | Predicted "1" for Napoli, match ended 1-1 |
| `overconfidence` | High confidence (75%+), lost | Claimed 82% for "1X", team lost 0-2 |
| `form_reversal` | Team broke form trend | 5-match winning streak team suddenly lost |
| `injury_impact` | Key absence missed/underweighted | Star striker out, attack collapsed |
| `h2h_ignored` | H2H pattern we should have heeded | Away team always wins at this venue |
| `motivation_miss` | Misjudged motivation/stakes | Dead rubber for one team, played reserves |
| `tactical_shift` | Manager changed tactics unexpectedly | Switched from 4-3-3 to 5-4-1 defensively |
| `goal_pattern_miss` | Got O/U or BTTS wrong | Predicted Over 2.5, match was 0-0 |
| `referee_factor` | Referee heavily influenced outcome | Two penalties awarded, red card at 30' |
| `underdog_upset` | Clear underdog won against odds | Bottom team beat title contender |
| `other` | None of the above fit | Unusual circumstances |

### Confidence Calibration Methodology

1. **Collect empirical data**: confidence bands (60-69, 70-79, 80-95) → actual win rates
2. **Detect miscalibration**: if claimed average > actual win rate by 10+ percentage points
3. **Calculate calibration factor**: `actual_win_rate / band_midpoint`
4. **Apply during generation**: `adjusted_confidence = raw_probability × calibration_factor`
5. **Clamp**: [60, 85] until 100+ settled tips exist, then [60, 95]

### Quality Gate Criteria

Skip a match (no tip generated) if ANY condition applies:

| Condition | Rationale |
| --- | --- |
| No prediction has edge > 5pp over bookmaker | No value — bookmaker is equally or more accurate |
| Either team has < 10 matches played this season | Insufficient data for reliable analysis |
| No prediction reaches 62% estimated probability | Too uncertain — all outcomes roughly equally likely |
| Both teams on 3+ match losing streaks | Chaotic, unpredictable conditions |

### Tip Reasoning Format

Stored in `tips.reasoning` column. Structured text consumed by the retrospective system for post-mortem comparison.

```
DATA_SUMMARY:
- Home: [team], [position], [points], [form], home record [W-D-L], home GF/GA per game
- Away: [team], [position], [points], [form], away record [W-D-L], away GF/GA per game
- H2H last [N]: [home wins]W, [away wins]W, [draws]D, avg goals [x]
- xGoals: [total] (home [x], away [y])
- Key absences: [list with impact]
- Motivation: [home context] vs [away context]

PROBABILITY_ASSESSMENT:
- P(1)=[x]%, P(X)=[y]%, P(2)=[z]%
- P(O2.5)=[x]%, P(U2.5)=[y]%
- P(BTTS)=[x]%, P(NoBTTS)=[y]%
- Bookmaker implied: P(1)=[x]%, P(X)=[y]%, P(2)=[z]%

EDGE_ANALYSIS:
- Best edge: [prediction type] at +[x]pp over bookmaker
- Second edge: [prediction type] at +[x]pp
- Historical context check: [addressed any relevant insights]

KEY_FACTORS:
1. [STRONG/MODERATE/WEAK] [factor]
2. [STRONG/MODERATE/WEAK] [factor]
...

DECISION: prediction=[type], raw_probability=[x]%, calibrated_confidence=[y]%
QUALITY_GATE: edge [x]pp > 5pp threshold → PASS
```

### Pattern Detection Rules

Run after each settlement batch. Generates `prediction_insights` entries:

| Condition | Insight Type | Scope |
| --- | --- | --- |
| Error category > 25% of losses (60 days) | `bias_detected` | global |
| Confidence band gap > 10pp (90 days) | `calibration_drift` | global |
| Prediction type win rate dropped > 15pp (30d vs prev 30d) | `pattern_warning` | prediction_type |
| League win rate < 50% with 10+ tips (90 days) | `weak_spot` | league |
| League win rate > 75% with 10+ tips (90 days) | `strong_spot` | league |

Insights auto-expire after 60 days if not re-validated by a subsequent settlement run.

### Historical Accuracy (Legacy — still active)

Both engines still inject basic per-prediction-type accuracy. The skill engine additionally loads the calibration curve and active insights.

```sql
SELECT prediction, COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won
FROM tips WHERE league = '<slug>' AND status IN ('won', 'lost')
GROUP BY prediction HAVING COUNT(*) >= 3;
```

---

## 14. Version History

### V2.1 — Batched (Current Serverless)

Batched Opus calls: all matches per league in a single API call (10x fewer calls, ~80% faster). Parallel odds prefetch. Dynamic `max_tokens = 600 * matchCount`.

### V2.0

Two-phase pipeline: Haiku 4.5 research + Opus 4.6 prediction. Structured output with JSON schema. Home/away standings. Derived stats (xGoals, BTTS%, clean sheet%). Post-generation tier assignment. Historical accuracy feedback loop.

### V1.0

Single Haiku call per match. Regex-based JSON parsing. Fixed tier rotation. No web research. No accuracy feedback.

### Skill Engine V2 — Retrospective Learning (Current Primary)

Retrospective learning system: reasoning persistence, post-mortem analysis, aggregate pattern detection, confidence calibration, quality gate. Improved xGoals model (Dixon-Coles lite with H2H adjustment). Independent probability assessment before comparing to bookmaker odds. 10-point reasoning framework. Edge-first betting (5pp minimum). H2H data fetched automatically per match.

### Skill Engine V1

Claude Code as the analyst (zero API cost). Decoupled per-match analysis with dedicated web research. Always replaces existing pending tips. Supabase MCP for database operations.

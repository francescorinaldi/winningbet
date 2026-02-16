---
name: fr3-performance-analytics
description: Deep track record analysis — hit rate, ROI, calibration, league/type breakdowns, trend detection. Generates actionable recommendations. Use when user asks about performance, track record analysis, or "how are we doing?"
argument-hint: [--store] [--period 30|60|90]
user-invocable: true
allowed-tools: mcp__plugin_supabase_supabase__execute_sql
---

# Performance Analytics — Deep Track Record Analysis

You ARE the analytics engine. Analyze the full prediction track record and generate insights.

**Goal: answer "Where are we profitable? Where are we losing? Is it getting better or worse?" — with data, not opinions.**

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`

## Parse Arguments

From `$ARGUMENTS`:

- No args → analyze last 90 days, display report only
- `--store` → persist snapshot to `performance_snapshots` table
- `--period N` → analyze last N days (default: 90)

## Procedure

### 1. Pre-flight check

```sql
SELECT COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '{PERIOD} days';
```

If total < 10 → report "Insufficient data for analysis (N tips, need 10+)" and stop.

### 2. Core metrics

```sql
SELECT
  COUNT(*) as total_tips,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 2) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi_flat,
  ROUND(AVG(odds), 2) as avg_odds,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END) / COUNT(*), 2) as yield_pct,
  ROUND(AVG(confidence), 1) as avg_confidence
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '{PERIOD} days';
```

### 3. League breakdown

```sql
SELECT league,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi,
  ROUND(AVG(odds), 2) as avg_odds
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '{PERIOD} days'
GROUP BY league
ORDER BY roi DESC;
```

### 4. Prediction type breakdown

```sql
SELECT prediction,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi,
  ROUND(AVG(odds), 2) as avg_odds
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '{PERIOD} days'
GROUP BY prediction
ORDER BY roi DESC;
```

### 5. Confidence calibration curve

```sql
SELECT
  CASE
    WHEN confidence BETWEEN 60 AND 64 THEN '60-64'
    WHEN confidence BETWEEN 65 AND 69 THEN '65-69'
    WHEN confidence BETWEEN 70 AND 74 THEN '70-74'
    WHEN confidence BETWEEN 75 AND 80 THEN '75-80'
  END as band,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as actual_pct,
  ROUND(AVG(confidence), 1) as claimed_pct,
  ROUND(AVG(odds), 2) as avg_odds_in_band
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '{PERIOD} days'
GROUP BY 1
HAVING COUNT(*) >= 3
ORDER BY 1;
```

### 6. Odds band breakdown

```sql
SELECT
  CASE
    WHEN odds < 1.50 THEN '1.20-1.49'
    WHEN odds BETWEEN 1.50 AND 1.99 THEN '1.50-1.99'
    WHEN odds BETWEEN 2.00 AND 2.99 THEN '2.00-2.99'
    WHEN odds >= 3.00 THEN '3.00+'
  END as odds_band,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END) / COUNT(*), 1) as yield_pct
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '{PERIOD} days'
GROUP BY 1
ORDER BY 1;
```

### 7. Rolling trends (20-tip window)

```sql
WITH numbered AS (
  SELECT *,
    ROW_NUMBER() OVER (ORDER BY match_date DESC) as rn
  FROM tips
  WHERE status IN ('won', 'lost')
    AND match_date > NOW() - INTERVAL '{PERIOD} days'
)
SELECT
  CASE
    WHEN rn BETWEEN 1 AND 20 THEN 'Last 20'
    WHEN rn BETWEEN 21 AND 40 THEN 'Tips 21-40'
    WHEN rn BETWEEN 41 AND 60 THEN 'Tips 41-60'
  END as window,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi
FROM numbered
WHERE rn <= 60
GROUP BY 1
ORDER BY MIN(rn);
```

### 8. Home/Away/Draw bias detection

```sql
SELECT prediction,
  COUNT(*) as times_predicted,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as pct_of_total,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as units
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '{PERIOD} days'
  AND prediction IN ('1', 'X', '2', '1X', 'X2', '12')
GROUP BY prediction
ORDER BY times_predicted DESC;
```

### 9. Generate recommendations

Based on the data, generate actionable recommendations. For each, categorize as:
- `INCREASE` — do more of this (profitable pattern)
- `DECREASE` — do less of this (unprofitable pattern)
- `ADJUST` — change parameters (miscalibrated)
- `MONITOR` — watch closely (borderline)

Format recommendations as a JSONB array:

```json
[
  {
    "action": "DECREASE",
    "target": "prediction_type_1",
    "reason": "Home win predictions: 55% hit rate at avg odds 1.40 = -5% ROI",
    "suggested_change": "Use 1X instead of 1 for marginal cases"
  },
  {
    "action": "INCREASE",
    "target": "odds_range_2.00_plus",
    "reason": "Odds 2.00+ band: 45% hit rate but +12% ROI due to higher payoffs",
    "suggested_change": "Target minimum odds 1.50, hunt value at 2.00+"
  }
]
```

### 10. Display report

```
=== PERFORMANCE ANALYTICS ({PERIOD} days) ===

CORE METRICS:
  Total: N tips | Won: N | Lost: N
  Hit Rate: XX.X%
  ROI (flat stake): +/-XX.XX units (XX.X% yield)
  Avg Odds: X.XX | Avg Confidence: XX.X%
  Breakeven hit rate at avg odds: XX.X%

LEAGUE BREAKDOWN:
  | League | Tips | Win% | ROI | Avg Odds | Status |
  |--------|------|------|-----|----------|--------|
  | serie-a | 15 | 60% | -1.2 | 1.45 | LOSING |

PREDICTION TYPE BREAKDOWN:
  | Type | Tips | Win% | ROI | Avg Odds | Status |
  |------|------|------|-----|----------|--------|
  | 1X | 10 | 80% | +3.5 | 1.35 | PROFITABLE |

CONFIDENCE CALIBRATION:
  | Band | Tips | Claimed | Actual | Gap | Status |
  |------|------|---------|--------|-----|--------|
  | 70-74 | 12 | 72% | 58% | -14pp | OVERCONFIDENT |

ODDS BAND ROI:
  | Odds Band | Tips | Hit% | ROI | Yield | Status |
  |-----------|------|------|-----|-------|--------|
  | 1.50-1.99 | 8 | 62% | +1.2 | +15% | BEST |

TREND (rolling 20-tip windows):
  Last 20: XX% hit rate, +/-XX ROI [IMPROVING/DECLINING/STABLE]
  Tips 21-40: XX% hit rate, +/-XX ROI

BIAS DETECTION:
  Home win (1): XX% of predictions, XX% hit rate → [OK/OVER-USED/UNDER-USED]
  Draw (X/1X/X2): XX% of predictions → [OK/DRAW-BLIND/BALANCED]

RECOMMENDATIONS:
  1. [ACTION] target: reason
  2. [ACTION] target: reason
  ...
```

### 11. Store snapshot (if --store flag)

```sql
INSERT INTO performance_snapshots (
  snapshot_date, period_days, total_tips, won, lost, hit_rate, roi_flat, avg_odds,
  league_breakdown, prediction_type_breakdown, confidence_calibration,
  odds_band_breakdown, recommendations
) VALUES (
  CURRENT_DATE, {PERIOD}, {total}, {won}, {lost}, {hit_rate}, {roi_flat}, {avg_odds},
  '{league_json}', '{type_json}', '{calibration_json}',
  '{odds_json}', '{recommendations_json}'
)
ON CONFLICT (snapshot_date, period_days)
DO UPDATE SET
  total_tips = EXCLUDED.total_tips,
  won = EXCLUDED.won,
  lost = EXCLUDED.lost,
  hit_rate = EXCLUDED.hit_rate,
  roi_flat = EXCLUDED.roi_flat,
  avg_odds = EXCLUDED.avg_odds,
  league_breakdown = EXCLUDED.league_breakdown,
  prediction_type_breakdown = EXCLUDED.prediction_type_breakdown,
  confidence_calibration = EXCLUDED.confidence_calibration,
  odds_band_breakdown = EXCLUDED.odds_band_breakdown,
  recommendations = EXCLUDED.recommendations;
```

## Important Notes

- **Data-driven only** — every recommendation must cite specific numbers
- **Breakeven formula**: at average odds X, breakeven hit rate = 1/X × 100
- **ROI calculation**: flat 1-unit stakes. Won = odds - 1, Lost = -1
- **Yield**: ROI / total_tips × 100
- **Status thresholds**: ROI > 0 = PROFITABLE, ROI < -2 = LOSING, else MARGINAL
- **Calibration gap**: if claimed - actual > 10pp = OVERCONFIDENT
- **Minimum sample sizes**: 3 per group for display, 10 for recommendations

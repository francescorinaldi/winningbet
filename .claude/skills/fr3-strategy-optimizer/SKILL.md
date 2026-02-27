---
name: fr3-strategy-optimizer
description: Prescriptive strategy engine — analyzes winning vs losing patterns, finds optimal parameters, generates concrete directives that feed into tip generation. Use when user asks to optimize strategy, improve predictions, or "what should we change?"
argument-hint: [--dry-run]
user-invocable: true
allowed-tools: mcp__plugin_supabase_supabase__execute_sql
---

# Strategy Optimizer — Prescriptive Strategy Engine

You ARE the strategy optimizer. Go beyond analytics ("what happened") to prescribe "what to change."

**Goal: find the parameter mix that maximizes ROI and generate concrete, actionable directives.**

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`

## Parse Arguments

From `$ARGUMENTS`:

- No args → full optimization, store directives
- `--dry-run` → show what directives would be generated without storing

## Procedure

### 1. Pre-flight check

```sql
SELECT COUNT(*) as total
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '90 days';
```

If total < 20 → report "Insufficient data for optimization (N tips, need 20+). Run /fr3-performance-analytics first." and stop.

### 2. Expire old directives

```sql
UPDATE strategy_directives
SET is_active = false
WHERE is_active = true AND expires_at < NOW();
```

### 3. Winning pattern detection

**Query 3a — What do winning tips have in common?**

```sql
SELECT prediction, league,
  CASE
    WHEN odds < 1.50 THEN 'low'
    WHEN odds BETWEEN 1.50 AND 2.00 THEN 'medium'
    WHEN odds BETWEEN 2.01 AND 3.00 THEN 'high'
    ELSE 'very_high'
  END as odds_band,
  CASE
    WHEN confidence BETWEEN 60 AND 67 THEN 'low'
    WHEN confidence BETWEEN 68 AND 74 THEN 'medium'
    ELSE 'high'
  END as conf_band,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '90 days'
GROUP BY prediction, league, 3, 4
HAVING COUNT(*) >= 3
ORDER BY roi DESC;
```

**Query 3b — Breakeven analysis per odds band:**

```sql
SELECT
  CASE
    WHEN odds < 1.50 THEN '1.20-1.49'
    WHEN odds BETWEEN 1.50 AND 1.99 THEN '1.50-1.99'
    WHEN odds BETWEEN 2.00 AND 2.99 THEN '2.00-2.99'
    WHEN odds >= 3.00 THEN '3.00+'
  END as odds_band,
  ROUND(100.0 / AVG(odds), 1) as breakeven_hit_rate,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as actual_hit_rate,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*) - 100.0 / AVG(odds), 1) as margin_over_breakeven,
  COUNT(*) as sample_size
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '90 days'
GROUP BY 1
HAVING COUNT(*) >= 5
ORDER BY 1;
```

### 4. Prediction type portfolio optimization

**Current mix vs optimal mix:**

```sql
SELECT prediction,
  COUNT(*) as current_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as current_pct,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END) / COUNT(*), 4) as roi_per_tip
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '90 days'
GROUP BY prediction
HAVING COUNT(*) >= 3
ORDER BY roi_per_tip DESC;
```

Compute recommended mix:

- Types with ROI per tip > 0 → INCREASE allocation
- Types with ROI per tip < -0.15 → DECREASE or AVOID
- Types with < 3 samples → INSUFFICIENT DATA

### 5. Confidence threshold optimization

```sql
SELECT confidence,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '90 days'
GROUP BY confidence
ORDER BY confidence;
```

Find the minimum confidence at which cumulative ROI turns positive:

- Start from highest confidence, cumulate downward
- The breakpoint where cumulative ROI crosses zero = minimum profitable confidence

### 6. League performance optimization

```sql
SELECT league,
  COUNT(*) as total,
  ROUND(100.0 * SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) / COUNT(*), 1) as hit_rate,
  ROUND(SUM(CASE WHEN status = 'won' THEN odds - 1 ELSE -1 END), 2) as roi,
  ROUND(AVG(odds), 2) as avg_odds,
  ROUND(100.0 / AVG(odds), 1) as breakeven_pct
FROM tips
WHERE status IN ('won', 'lost')
  AND match_date > NOW() - INTERVAL '90 days'
GROUP BY league
HAVING COUNT(*) >= 5
ORDER BY roi DESC;
```

### 7. Generate strategy directives

Based on the analysis, generate directives. Each directive has:

- `directive_type`: one of `avoid_prediction_type`, `prefer_prediction_type`, `avoid_league`, `prefer_league`, `adjust_confidence_band`, `adjust_odds_range`, `adjust_edge_threshold`, `general_strategy`
- `directive_text`: human-readable instruction
- `parameters`: JSONB with specifics
- `evidence`: JSONB with supporting data
- `impact_estimate`: HIGH (addresses pattern causing > 2 units loss), MEDIUM (1-2 units), LOW (< 1 unit)

**Directive generation rules:**

1. If a prediction type has ROI < -2.0 units with 5+ samples → `avoid_prediction_type` (HIGH)
2. If a prediction type has ROI > +2.0 units with 5+ samples → `prefer_prediction_type` (MEDIUM)
3. If a league has ROI < -3.0 units with 10+ samples → `avoid_league` (HIGH)
4. If a league has ROI > +3.0 units with 10+ samples → `prefer_league` (MEDIUM)
5. If confidence calibration gap > 15pp → `adjust_confidence_band` (HIGH)
6. If an odds band has margin over breakeven > +10pp → `adjust_odds_range` to prefer it (MEDIUM)
7. If an odds band has margin under breakeven < -10pp → `adjust_odds_range` to avoid it (MEDIUM)
8. If minimum profitable confidence is > 68 → `adjust_edge_threshold` (HIGH)
9. If home win (1) is > 30% of portfolio and has negative ROI → `general_strategy` about draw awareness (HIGH)

### 8. Display optimization report

```
=== STRATEGY OPTIMIZATION REPORT ===

WINNING PATTERNS:
  Best combo: [prediction] in [league] at [odds_band] odds = +X.XX ROI
  Best odds band: [band] — XX% margin over breakeven
  Best prediction type: [type] — +X.XX ROI per tip

LOSING PATTERNS:
  Worst combo: [prediction] in [league] at [odds_band] odds = -X.XX ROI
  Worst odds band: [band] — XX% under breakeven
  Worst prediction type: [type] — -X.XX ROI per tip

PORTFOLIO OPTIMIZATION:
  Current mix → Recommended mix:
  | Type | Current % | Hit% | ROI/tip | Action |
  |------|-----------|------|---------|--------|
  | 1    | 35%       | 55%  | -0.08   | DECREASE to <20% |
  | 1X   | 25%       | 80%  | +0.12   | INCREASE to 35% |

OPTIMAL PARAMETERS:
  Min profitable confidence: XX%
  Best odds band: X.XX - X.XX
  Recommended min odds: X.XX

NEW DIRECTIVES GENERATED:
  [HIGH] avoid_prediction_type: ...
  [MEDIUM] prefer_odds_range: ...
  ...
```

### 9. Store directives (unless --dry-run)

For each generated directive, first check for similar active directive:

```sql
SELECT id FROM strategy_directives
WHERE directive_type = '{type}' AND is_active = true
  AND parameters->>'target' = '{target}';
```

If exists → update:

```sql
UPDATE strategy_directives
SET directive_text = '{text}',
    parameters = '{params_json}',
    evidence = '{evidence_json}',
    impact_estimate = '{impact}',
    expires_at = NOW() + INTERVAL '30 days'
WHERE id = '{existing_id}';
```

If not exists → insert:

```sql
INSERT INTO strategy_directives (directive_type, directive_text, parameters, evidence, impact_estimate, expires_at)
VALUES ('{type}', '{text}', '{params_json}', '{evidence_json}', '{impact}', NOW() + INTERVAL '30 days');
```

### 10. Summary

```
=== STRATEGY OPTIMIZER COMPLETE ===
- Analyzed: N tips over {PERIOD} days
- Directives generated: N (HIGH: N, MEDIUM: N, LOW: N)
- Directives updated: N
- Key insight: [most impactful finding]
- Active directives total: N
```

## Important Notes

- **Minimum 20 settled tips** required for any optimization
- **Minimum 5 samples per group** for directive generation
- **Directives auto-expire** after 30 days if not refreshed
- **HIGH impact** = addresses pattern causing > 2 units loss — analysts MUST NOT contradict without overwhelming evidence
- **MEDIUM impact** = analysts SHOULD follow unless they have specific match-level reasons not to
- **LOW impact** = informational guidance, analysts MAY deviate
- **Never generate contradictory directives** — if analysis suggests both "avoid" and "prefer" for the same target, use the one with stronger evidence
- **Evidence must be specific** — include sample sizes, ROI numbers, hit rates

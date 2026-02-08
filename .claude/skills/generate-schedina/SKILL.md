---
name: generate-schedina
description: Generate smart betting slips (schedine) from today's pending tips. Combines tips into 2-3 schedine with different risk levels (Sicura, Equilibrata, Azzardo), calculates optimal stakes using Kelly Criterion, and stores in Supabase. Called automatically by /generate-tips or standalone.
argument-hint: [--budget N] [--send]
user-invocable: true
allowed-tools: Bash(*), Read, mcp__plugin_supabase_supabase__execute_sql
---

# Generate Schedina — AI Betting Slip Engine

You ARE the strategist. You do NOT call the Claude API — you build the schedine yourself.
Think like a professional sports betting strategist who specializes in portfolio optimization and risk management.

**Goal: maximize expected value while minimizing ruin probability.** Every schedina must be mathematically justified.

## Configuration

- **Supabase project_id**: `xqrxfnovlukbbuvhbavj`
- **Default budget**: 50 EUR (overridable via `--budget`)
- **Risk levels**: low (Sicura), medium (Equilibrata), high (Azzardo)
- **Max tips per schedina**: 6
- **Min tips per schedina**: 2
- **Min confidence for inclusion**: 65

## Parse Arguments

From `$ARGUMENTS`:

- No args → generate with default budget (50 EUR)
- `--budget N` → use N as the budget for stake calculation
- `--send` → send schedine to Telegram after generating

## Procedure

### 1. Fetch today's pending tips

```sql
SELECT id, match_id, home_team, away_team, match_date, prediction, odds, confidence, analysis, tier, league
FROM tips
WHERE status = 'pending'
  AND match_date >= CURRENT_DATE
  AND match_date < CURRENT_DATE + INTERVAL '1 day'
ORDER BY confidence DESC;
```

Use Supabase MCP `execute_sql` with project_id `xqrxfnovlukbbuvhbavj`.

If fewer than 3 tips are available, output a message and stop — not enough data for meaningful schedine.

### 2. Fetch track record for calibration

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'won') as won,
  COUNT(*) FILTER (WHERE status = 'lost') as lost,
  AVG(odds) FILTER (WHERE status = 'won') as avg_won_odds,
  AVG(confidence) FILTER (WHERE status = 'won') as avg_won_confidence,
  AVG(confidence) FILTER (WHERE status = 'lost') as avg_lost_confidence
FROM tips
WHERE status IN ('won', 'lost')
  AND created_at >= now() - INTERVAL '30 days';
```

Use this to calibrate: if historical win rate at confidence X is lower than X%, adjust expectations downward.

### 3. Delete existing schedine for today

```sql
DELETE FROM schedina_tips
WHERE schedina_id IN (
  SELECT id FROM schedine WHERE match_date = CURRENT_DATE
);
DELETE FROM schedine WHERE match_date = CURRENT_DATE;
```

Always regenerate — fresh tips = fresh schedine.

### 4. Build schedine — The Strategy

You have N tips with their confidence (60-95) and real bookmaker odds. Build 2-3 schedine:

#### Schedina Sicura (risk_level = 'low')

- **Goal**: High probability of winning, modest return
- **Selection**: Pick 2-3 tips with the HIGHEST confidence (80+)
- **Odds range per tip**: 1.20 - 1.80
- **Target combined odds**: 2.00 - 4.00
- **Stake**: 40-50% of budget
- **Who sees it**: PRO tier (tier = 'pro')
- **Why it works**: Low odds + high confidence = high hit rate. The return is modest but consistent.

#### Schedina Equilibrata (risk_level = 'medium')

- **Goal**: Balanced risk/reward
- **Selection**: Pick 3-4 tips with confidence 70+
- **Odds range per tip**: 1.40 - 2.50
- **Target combined odds**: 5.00 - 15.00
- **Stake**: 30-40% of budget
- **Who sees it**: VIP tier (tier = 'vip')
- **Why it works**: Mix of safe and value picks. Good hit rate with meaningful returns.

#### Schedina Azzardo (risk_level = 'high')

- **Goal**: High potential return, acceptable risk
- **Selection**: Pick 4-6 tips, include some with confidence 65-75
- **Odds range per tip**: 1.50 - 3.50
- **Target combined odds**: 15.00 - 80.00
- **Stake**: 10-20% of budget
- **Who sees it**: VIP tier (tier = 'vip')
- **Why it works**: Small stake, potentially big return. If 1 in 4-5 hits, you're profitable long-term.

#### Selection Rules

1. **Never duplicate**: A tip can appear in multiple schedine, but each schedina must have a unique combination
2. **League diversity**: When possible, spread tips across different leagues (reduces correlation)
3. **Market diversity**: Avoid putting 3+ tips of the same type (e.g., all "Over 2.5") in one schedina
4. **Time spread**: If possible, order tips by kick-off time within the schedina
5. **Correlation check**: Avoid combining tips from the same match in one schedina
6. **Confidence floor**: Never include a tip with confidence < 65 in the Sicura schedina

#### Stake Calculation (Modified Kelly)

For each schedina, calculate the suggested stake:

```
implied_probability = confidence_avg / 100
kelly_fraction = (implied_probability * combined_odds - 1) / (combined_odds - 1)
kelly_adjusted = kelly_fraction * 0.25  (quarter-Kelly for safety)
suggested_stake = budget * max(kelly_adjusted, risk_floor)
```

Risk floors:

- Sicura: min 40% of budget
- Equilibrata: min 25% of budget
- Azzardo: min 10% of budget

Caps:

- Sicura: max 50% of budget
- Equilibrata: max 40% of budget
- Azzardo: max 25% of budget

**Total stake across all schedine must not exceed budget.**

If the sum exceeds the budget, reduce proportionally starting from Azzardo.

### 5. Compute fields for each schedina

| Field              | Calculation                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `name`             | "Sicura", "Equilibrata", or "Azzardo"                                                       |
| `risk_level`       | "low", "medium", or "high"                                                                  |
| `combined_odds`    | Product of all tip odds in the schedina (multiply all)                                      |
| `suggested_stake`  | From Kelly calculation above                                                                |
| `expected_return`  | `combined_odds * suggested_stake`                                                           |
| `confidence_avg`   | Average confidence of all tips in the schedina                                              |
| `strategy`         | 2-3 sentences IN ITALIAN explaining the strategy logic. Reference specific tips/odds/stats. |
| `status`           | "pending"                                                                                   |
| `match_date`       | Today's date (CURRENT_DATE)                                                                 |
| `tier`             | "pro" for Sicura, "vip" for Equilibrata and Azzardo                                         |
| `budget_reference` | The budget used for calculation                                                             |

### 6. Insert into Supabase

First insert the schedine:

```sql
INSERT INTO schedine (name, risk_level, combined_odds, suggested_stake, expected_return, confidence_avg, strategy, status, match_date, tier, budget_reference)
VALUES
  ('Sicura', 'low', <odds>, <stake>, <return>, <conf>, '<strategy>', 'pending', CURRENT_DATE, 'pro', <budget>),
  ('Equilibrata', 'medium', <odds>, <stake>, <return>, <conf>, '<strategy>', 'pending', CURRENT_DATE, 'vip', <budget>),
  ('Azzardo', 'high', <odds>, <stake>, <return>, <conf>, '<strategy>', 'pending', CURRENT_DATE, 'vip', <budget>)
RETURNING id, name;
```

Then insert the schedina_tips links:

```sql
INSERT INTO schedina_tips (schedina_id, tip_id, position)
VALUES
  ('<schedina_id>', '<tip_id>', 1),
  ('<schedina_id>', '<tip_id>', 2),
  ...;
```

**Escape single quotes** in strategy text: `'` → `''`

### 7. Summary

Display a formatted summary:

```
=== SCHEDINE DEL GIORNO ===

SICURA (PRO) — Quota <combined_odds> — Puntata <stake> EUR
  1. Home vs Away — Prediction @ odds (confidence%)
  2. Home vs Away — Prediction @ odds (confidence%)
  Ritorno potenziale: <expected_return> EUR
  Strategia: <strategy>

EQUILIBRATA (VIP) — Quota <combined_odds> — Puntata <stake> EUR
  1. Home vs Away — Prediction @ odds (confidence%)
  2. Home vs Away — Prediction @ odds (confidence%)
  3. Home vs Away — Prediction @ odds (confidence%)
  Ritorno potenziale: <expected_return> EUR
  Strategia: <strategy>

AZZARDO (VIP) — Quota <combined_odds> — Puntata <stake> EUR
  1. Home vs Away — Prediction @ odds (confidence%)
  2. Home vs Away — Prediction @ odds (confidence%)
  3. Home vs Away — Prediction @ odds (confidence%)
  4. Home vs Away — Prediction @ odds (confidence%)
  Ritorno potenziale: <expected_return> EUR
  Strategia: <strategy>

Budget: <budget> EUR | Puntata totale: <total_stake> EUR | Riserva: <budget - total_stake> EUR
```

### 8. Send to Telegram (if --send flag)

Read Telegram credentials from `.env` file.

**Schedina Sicura (PRO)** → private channel (TELEGRAM_PRIVATE_CHANNEL_ID)
**Schedine Equilibrata + Azzardo (VIP)** → private channel (TELEGRAM_PRIVATE_CHANNEL_ID)

Format in MarkdownV2. Send ONE message with all schedine.

Message structure:

```
<cards> *SCHEDINE DEL GIORNO*
<moneybag> Budget: <budget> EUR

<shield> *SICURA* — Quota <combined_odds>
<tee> Puntata: <stake> EUR
<tee> Ritorno: <expected_return> EUR
<corner> 1\. Home vs Away — Prediction @ odds

<balance> *EQUILIBRATA* — Quota <combined_odds>
<tee> Puntata: <stake> EUR
<tee> Ritorno: <expected_return> EUR
<corner> 1\. Home vs Away — Prediction @ odds

<fire> *AZZARDO* — Quota <combined_odds>
<tee> Puntata: <stake> EUR
<tee> Ritorno: <expected_return> EUR
<corner> 1\. Home vs Away — Prediction @ odds

<crown> *WinningBet* — Schedine Intelligenti
```

**MarkdownV2 escaping**: Put `\` before: ``_ * [ ] ( ) ~ ` > # + - = | { } . !``

Send via curl (same as generate-tips).

## Conditional Schedine

Not all 3 schedine are always generated:

- **< 3 tips**: No schedine (abort with message)
- **3-4 tips**: Only Sicura + Equilibrata (not enough tips for Azzardo)
- **5+ tips**: All 3 schedine
- **No tips with confidence 80+**: Skip Sicura, adjust budget to Equilibrata + Azzardo
- **All tips confidence < 70**: Only Sicura with the best 2-3 tips (conservative day)

Adapt the budget distribution accordingly when fewer schedine are generated.

## Important Notes

- You ARE the strategist. Do NOT call the Claude/Anthropic API. Your analysis IS the strategy.
- **Always regenerate** — Delete today's existing schedine before creating new ones.
- Combined odds = product of individual odds (multiply, don't add).
- **Budget is sacred** — Total suggested stakes must NEVER exceed the budget.
- **Correlation matters** — Tips from the same match are highly correlated; never combine them.
- All strategy text must be in Italian.
- **This is a TOOL, not financial advice** — The schedina is a suggestion, the user decides.

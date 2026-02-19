---
applyTo: '**/*.sql'
---

# SQL / Supabase Conventions

## Migrations

- Location: `supabase/migrations/`
- Naming: `NNN_descriptive_name.sql` (incremental numbering)
- Incremental only — never modify existing migrations
- Always include `IF NOT EXISTS` for creates, `IF EXISTS` for drops
- Add comments explaining business logic

## Schema

- Column names: `snake_case` (`match_date`, `stripe_customer_id`)
- Table names: `snake_case` plural (`tips`, `profiles`, `subscriptions`)
- Enum values: lowercase strings (`free`, `pro`, `vip`, `pending`, `won`, `lost`, `void`)
- Use `CHECK` constraints for enum-like columns
- Use `TIMESTAMPTZ` for all timestamps (never `TIMESTAMP`)
- Primary keys: `UUID DEFAULT gen_random_uuid()`
- Foreign keys: always name the constraint explicitly

## Row-Level Security (RLS)

- Enable RLS on every user-facing table
- Tier-based access: `free` < `pro` < `vip`
- Service role key bypasses RLS (backend only)
- Name policies descriptively: `users_can_read_own_profile`

## Core Tables

| Table                        | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `profiles`                   | User profiles (tier, Telegram, streaks)    |
| `tips`                       | Match predictions (14 types, 3 tiers)      |
| `tip_outcomes`               | Settlement results                         |
| `subscriptions`              | Stripe subscription state                  |
| `user_preferences`           | League, teams, notification, risk settings |
| `user_bets`                  | Followed/unfollowed tips                   |
| `notifications`              | User notifications                         |
| `schedine` + `schedina_tips` | Smart betting slips                        |

## Performance

- Add composite indexes for common query patterns
- Use partial indexes where appropriate (`WHERE is_read = false`)
- Batch operations with `.in('id', ids)` — avoid N+1 queries

-- ============================================
-- WinningBet — Schema Iniziale
-- ============================================
-- Tabelle per il MVP:
--   profiles      — Profilo utente con tier e Stripe customer ID
--   tips          — Pronostici generati dall'AI
--   tip_outcomes  — Risultati effettivi dei pronostici
--   subscriptions — Abbonamenti Stripe
--
-- Le Row-Level Security policies proteggono l'accesso ai dati:
--   - I tips free sono visibili a tutti
--   - I tips pro/vip richiedono il tier corrispondente
--   - Ogni utente vede solo il proprio profilo e abbonamento
-- ============================================

-- ===================
-- PROFILES
-- ===================
-- Estende la tabella auth.users di Supabase con dati applicativi.
-- Creato automaticamente via trigger on_auth_user_created.
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'vip')),
    stripe_customer_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT profiles_user_id_unique UNIQUE (user_id)
);

-- Indice per lookup rapido per user_id
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- ===================
-- TIPS
-- ===================
-- Pronostici generati dall'AI prediction engine.
-- Il campo tier determina chi puo' vedere il tip.
CREATE TABLE IF NOT EXISTS tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    match_date TIMESTAMPTZ NOT NULL,
    prediction TEXT NOT NULL,
    odds NUMERIC(5,2),
    confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
    analysis TEXT,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'vip')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'void')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indici per query frequenti
CREATE INDEX IF NOT EXISTS idx_tips_match_date ON tips(match_date DESC);
CREATE INDEX IF NOT EXISTS idx_tips_status ON tips(status);
CREATE INDEX IF NOT EXISTS idx_tips_tier ON tips(tier);
CREATE INDEX IF NOT EXISTS idx_tips_match_id ON tips(match_id);

-- ===================
-- TIP OUTCOMES
-- ===================
-- Risultato effettivo dopo la chiusura del match.
-- Collegato 1:1 con tips via tip_id.
CREATE TABLE IF NOT EXISTS tip_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_id UUID NOT NULL REFERENCES tips(id) ON DELETE CASCADE,
    actual_result TEXT NOT NULL,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tip_outcomes_tip_id_unique UNIQUE (tip_id)
);

CREATE INDEX IF NOT EXISTS idx_tip_outcomes_tip_id ON tip_outcomes(tip_id);

-- ===================
-- SUBSCRIPTIONS
-- ===================
-- Traccia gli abbonamenti Stripe degli utenti.
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('pro', 'vip')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'incomplete')),
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT subscriptions_stripe_id_unique UNIQUE (stripe_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- ===================
-- ROW-LEVEL SECURITY
-- ===================

-- Abilita RLS su tutte le tabelle
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE tip_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- --- PROFILES ---
-- Gli utenti possono leggere e aggiornare solo il proprio profilo
CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Service role (backend) puo' fare tutto
CREATE POLICY profiles_service_all ON profiles
    FOR ALL USING (auth.role() = 'service_role');

-- --- TIPS ---
-- Tips FREE: visibili a tutti gli utenti autenticati
CREATE POLICY tips_select_free ON tips
    FOR SELECT USING (tier = 'free');

-- Tips PRO: visibili a utenti con tier pro o vip
CREATE POLICY tips_select_pro ON tips
    FOR SELECT USING (
        tier = 'pro'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.tier IN ('pro', 'vip')
        )
    );

-- Tips VIP: visibili solo a utenti con tier vip
CREATE POLICY tips_select_vip ON tips
    FOR SELECT USING (
        tier = 'vip'
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.tier = 'vip'
        )
    );

-- Service role (backend) puo' inserire e gestire tutti i tips
CREATE POLICY tips_service_all ON tips
    FOR ALL USING (auth.role() = 'service_role');

-- --- TIP OUTCOMES ---
-- Tutti gli utenti autenticati possono leggere i risultati
CREATE POLICY tip_outcomes_select_all ON tip_outcomes
    FOR SELECT USING (true);

-- Solo service role puo' inserire/aggiornare
CREATE POLICY tip_outcomes_service_all ON tip_outcomes
    FOR ALL USING (auth.role() = 'service_role');

-- --- SUBSCRIPTIONS ---
-- Gli utenti possono leggere solo i propri abbonamenti
CREATE POLICY subscriptions_select_own ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Service role (backend) gestisce gli abbonamenti via webhook
CREATE POLICY subscriptions_service_all ON subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- ===================
-- TRIGGER: Auto-create profile on signup
-- ===================
-- Quando un utente si registra via Supabase Auth,
-- crea automaticamente un record nella tabella profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name, tier)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        'free'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger che chiama handle_new_user alla creazione di un utente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===================
-- TRIGGER: Auto-update updated_at
-- ===================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

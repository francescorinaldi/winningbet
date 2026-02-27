-- 017: Partner Applications (B2B self-service)
-- Candidature autonome dei centri scommesse con validazione VIES.
-- role è ortogonale al tier. Il flow è: pending → approved/rejected → revoked.

CREATE TABLE IF NOT EXISTS partner_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,            -- Ragione Sociale
    vat_number TEXT NOT NULL,               -- P.IVA (formato: IT + 11 cifre)
    vies_valid BOOLEAN,                     -- Risultato validazione VIES (null = servizio non disponibile)
    vies_company_name TEXT,                 -- Ragione sociale ufficiale da VIES
    vies_address TEXT,                      -- Indirizzo ufficiale da VIES
    city TEXT,
    province TEXT,
    website TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
    rejection_reason TEXT,                  -- Motivo del rifiuto (opzionale)
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    notes TEXT,                             -- Note interne admin
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT partner_applications_user_unique UNIQUE (user_id)
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_partner_app_status
    ON partner_applications(status);
CREATE INDEX IF NOT EXISTS idx_partner_app_user_id
    ON partner_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_partner_app_vat
    ON partner_applications(vat_number);

-- RLS
ALTER TABLE partner_applications ENABLE ROW LEVEL SECURITY;

-- Utenti possono leggere solo la propria candidatura
CREATE POLICY partner_app_select_own ON partner_applications
    FOR SELECT USING (auth.uid() = user_id);

-- Admin possono leggere tutto (check tramite profiles.role)
CREATE POLICY partner_app_select_admin ON partner_applications
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Service role (backend) puo' fare tutto
CREATE POLICY partner_app_service_all ON partner_applications
    FOR ALL USING (auth.role() = 'service_role');

-- Auto-update updated_at trigger (riusa la funzione da migration 001)
CREATE TRIGGER partner_applications_updated_at
    BEFORE UPDATE ON partner_applications
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE partner_applications IS
    'Candidature B2B dei centri scommesse. Flusso: pending -> approved/rejected. Revoke possibile post-approval.';

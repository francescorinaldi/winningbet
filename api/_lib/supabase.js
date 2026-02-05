/**
 * Supabase server-side client.
 *
 * Usa la service role key per operazioni backend (bypass RLS).
 * NON usare questo client lato browser — espone la service key.
 *
 * Variabili d'ambiente richieste:
 *   - SUPABASE_URL — URL del progetto Supabase
 *   - SUPABASE_SERVICE_KEY — Service role key (bypassa RLS)
 *
 * Per operazioni che rispettano RLS, usare createUserClient()
 * passando il JWT dell'utente autenticato.
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Client Supabase con service role key.
 * Bypassa tutte le RLS policies — usare solo lato server.
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

/**
 * Crea un client Supabase che rispetta le RLS policies dell'utente.
 * Usa l'anon key + l'access token JWT per impersonare l'utente.
 *
 * @param {string} accessToken — JWT dell'utente autenticato (da Authorization header)
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createUserClient(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

module.exports = { supabase, createUserClient };

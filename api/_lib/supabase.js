/**
 * Supabase server-side client.
 *
 * Usa la secret key per operazioni backend (bypass RLS).
 * NON usare questo client lato browser — espone la secret key.
 *
 * Variabili d'ambiente richieste:
 *   - SUPABASE_URL — URL del progetto Supabase
 *   - SUPABASE_SECRET_KEY — Secret key (bypassa RLS)
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Client Supabase con secret key.
 * Bypassa tutte le RLS policies — usare solo lato server.
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

module.exports = { supabase };

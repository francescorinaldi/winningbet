/**
 * Supabase browser-side client (auth only).
 *
 * Usa la anon key (sicura da esporre lato client).
 * Le RLS policies in Supabase proteggono i dati.
 *
 * Richiede il tag script del Supabase CDN in index.html:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *
 */

// eslint-disable-next-line no-unused-vars
const SupabaseConfig = (function () {
  'use strict';

  // Supabase project config — single source of truth.
  // The anon key is safe to expose client-side (protected by RLS policies).
  const url = 'https://xqrxfnovlukbbuvhbavj.supabase.co';
  const anonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhxcnhmbm92bHVrYmJ1dmhiYXZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMjczNTYsImV4cCI6MjA4NTkwMzM1Nn0.M9IJED7_yoNdRDf3yjwULxWqIlgO1FTEwhHFNBpULSg';

  const client = supabase.createClient(url, anonKey);

  return {
    client: client,

    /**
     * Restituisce la sessione corrente dell'utente.
     * @returns {Promise<{data: {session: Object|null}}>}
     */
    getSession: function () {
      return client.auth.getSession();
    },

    /**
     * Listener per cambiamenti dello stato di autenticazione.
     * @param {Function} callback - Riceve (event, session)
     * @returns {Object} Subscription con metodo unsubscribe
     */
    onAuthStateChange: function (callback) {
      return client.auth.onAuthStateChange(callback);
    },

    /**
     * Login con email e password.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{data: Object, error: Object|null}>}
     */
    signIn: function (email, password) {
      return client.auth.signInWithPassword({ email: email, password: password });
    },

    /**
     * Registrazione con email e password.
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{data: Object, error: Object|null}>}
     */
    signUp: function (email, password, options) {
      return client.auth.signUp({ email: email, password: password, options: options });
    },

    /**
     * Login con provider OAuth (es. Google).
     * @param {string} provider - Nome provider ('google', 'github', ecc.)
     * @returns {Promise<{data: Object, error: Object|null}>}
     */
    signInWithOAuth: function (provider) {
      return client.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: window.location.origin + '/dashboard.html',
        },
      });
    },

    /**
     * Logout dell'utente corrente.
     * @returns {Promise<{error: Object|null}>}
     */
    signOut: function () {
      return client.auth.signOut();
    },
  };
})();

/**
 * Supabase browser-side client (auth only).
 *
 * Usa la anon key (sicura da esporre lato client).
 * Le RLS policies in Supabase proteggono i dati.
 *
 * Richiede il tag script del Supabase CDN in index.html:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
 *
 * Le variabili SUPABASE_URL e SUPABASE_ANON_KEY sono iniettate
 * come meta tag dalla pagina HTML per evitare hardcoding.
 */

// eslint-disable-next-line no-unused-vars
const SupabaseConfig = (function () {
  'use strict';

  /**
   * Legge un meta tag dal DOM.
   * @param {string} name - Nome del meta tag
   * @returns {string} Contenuto del meta tag
   */
  function getMeta(name) {
    const el = document.querySelector('meta[name="' + name + '"]');
    return el ? el.getAttribute('content') : '';
  }

  const url = getMeta('supabase-url');
  const anonKey = getMeta('supabase-anon-key');

  if (!url || !anonKey) {
    console.error(
      'Supabase config missing: add meta tags supabase-url and supabase-anon-key to HTML',
    );
  }

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
    signUp: function (email, password) {
      return client.auth.signUp({ email: email, password: password });
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

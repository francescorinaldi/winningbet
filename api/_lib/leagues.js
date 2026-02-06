/**
 * Configurazione centralizzata delle leghe supportate.
 *
 * Unica fonte di verita' per tutti gli ID, codici e stagioni.
 * Usata da api-football.js, football-data.js e dagli endpoint.
 *
 * Slug -> { apiFootballId, footballDataCode, season, name, nameShort }
 */

const LEAGUES = {
  'serie-a': {
    apiFootballId: 135,
    footballDataCode: 'SA',
    season: 2025,
    name: 'Serie A',
    nameShort: 'Serie A',
  },
  'serie-b': {
    apiFootballId: 136,
    footballDataCode: 'SB',
    season: 2025,
    name: 'Serie B',
    nameShort: 'Serie B',
  },
  'champions-league': {
    apiFootballId: 2,
    footballDataCode: 'CL',
    season: 2025,
    name: 'Champions League',
    nameShort: 'UCL',
  },
  'la-liga': {
    apiFootballId: 140,
    footballDataCode: 'PD',
    season: 2025,
    name: 'La Liga',
    nameShort: 'La Liga',
  },
  'premier-league': {
    apiFootballId: 39,
    footballDataCode: 'PL',
    season: 2025,
    name: 'Premier League',
    nameShort: 'PL',
  },
};

const VALID_SLUGS = Object.keys(LEAGUES);
const DEFAULT_SLUG = 'serie-a';

/**
 * Restituisce la configurazione di una lega dato il suo slug.
 * @param {string} slug - Slug della lega (es. "serie-a", "premier-league")
 * @returns {Object} Configurazione della lega
 * @throws {Error} Se lo slug non e' valido
 */
function getLeague(slug) {
  const league = LEAGUES[slug];
  if (!league) {
    throw new Error(`Lega non valida: ${slug}. Valide: ${VALID_SLUGS.join(', ')}`);
  }
  return league;
}

/**
 * Risolve uno slug di lega, con fallback al default se non valido o mancante.
 * Usato negli endpoint per gestire il parametro ?league=.
 * @param {string|undefined} slug - Slug dalla query string
 * @returns {string} Slug risolto (sempre valido)
 */
function resolveLeagueSlug(slug) {
  if (!slug || !LEAGUES[slug]) {
    return DEFAULT_SLUG;
  }
  return slug;
}

module.exports = { getLeague, resolveLeagueSlug };

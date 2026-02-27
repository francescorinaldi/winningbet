/**
 * GET /api/odds-compare?league={slug}
 *
 * Comparatore quote multi-bookmaker per il Centro Scommesse B2B.
 * Riservato agli utenti con role = 'partner'.
 *
 * Per ogni partita in arrivo (prossimi 7 giorni) restituisce:
 *  - Quote di tutti i bookmaker disponibili (max 8)
 *  - Best odds per ogni mercato
 *  - Tip WinningBet associato (se presente)
 *
 * Auth: JWT Bearer + profile.role === 'partner'
 * Cache: 30 minuti in-memory
 */

const cache = require('./_lib/cache');
const { authenticate } = require('./_lib/auth-middleware');
const { resolveLeagueSlug } = require('./_lib/leagues');
const apiFootball = require('./_lib/api-football');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const CACHE_TTL = 1800; // 30 minuti
const DAYS_AHEAD = 7;
const ODDS_KEYS = ['home', 'draw', 'away', 'over25', 'under25', 'btts_yes', 'btts_no'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user, profile, error: authError } = await authenticate(req);
  if (authError || !user) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  if (!profile || profile.role !== 'partner') {
    return res.status(403).json({ error: 'Accesso riservato — solo partner Centro Scommesse' });
  }

  const leagueSlug = resolveLeagueSlug(req.query.league);

  const cached = cache.get('odds_compare_' + leagueSlug);
  if (cached) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(cached);
  }

  try {
    const upcoming = await apiFootball.getUpcomingMatches(leagueSlug, 15);
    const cutoff = new Date(Date.now() + DAYS_AHEAD * 86400_000);
    const fixtures = (upcoming || []).filter((f) => new Date(f.date) <= cutoff);

    // Recupera tips Supabase per i fixture in arrivo
    const matchIds = fixtures.map((f) => String(f.id));
    const tipsMap = {};
    if (matchIds.length > 0) {
      const { data: tips } = await supabase
        .from('tips')
        .select('match_id, prediction, odds, confidence')
        .in('match_id', matchIds)
        .eq('status', 'pending')
        .eq('league', leagueSlug);

      (tips || []).forEach((t) => {
        if (!tipsMap[t.match_id] || t.confidence > tipsMap[t.match_id].confidence) {
          tipsMap[t.match_id] = t;
        }
      });
    }

    // Recupera odds multi-bookmaker in parallelo
    const oddsResults = await Promise.allSettled(
      fixtures.map((f) => apiFootball.getMultipleBookmakerOdds(f.id)),
    );

    const result = {
      league: leagueSlug,
      fixtures: fixtures.map((f, i) => {
        const multi = oddsResults[i].status === 'fulfilled' ? oddsResults[i].value : null;
        const bookmakers = (multi && multi.bookmakers) || [];

        // Calcola best odds per ogni mercato
        const bestOdds = {};
        ODDS_KEYS.forEach((k) => {
          let best = null;
          bookmakers.forEach((bk) => {
            const v = bk.odds[k];
            if (v !== null && (best === null || parseFloat(v) > parseFloat(best))) {
              best = v;
            }
          });
          bestOdds[k] = best;
        });

        return {
          fixtureId: f.id,
          date: f.date,
          home: f.home,
          away: f.away,
          tip: tipsMap[String(f.id)] || null,
          bookmakers,
          bestOdds,
        };
      }),
    };

    cache.set('odds_compare_' + leagueSlug, result, CACHE_TTL);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[odds-compare]', err.message);
    return res.status(502).json({ error: 'Impossibile recuperare le quote' });
  }
};

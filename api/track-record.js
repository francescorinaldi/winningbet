/**
 * GET /api/track-record
 *
 * Restituisce le statistiche aggregate dei pronostici:
 * win rate, ROI, quota media, totali e breakdown mensile.
 *
 * Nessuna autenticazione richiesta (dati pubblici).
 *
 * Cache: 1 ora in-memory + CDN s-maxage=3600
 *
 * Risposta 200:
 *   {
 *     total_tips: number,
 *     won: number,
 *     lost: number,
 *     void: number,
 *     pending: number,
 *     win_rate: number (percentuale),
 *     avg_odds: number,
 *     roi: number (percentuale),
 *     recent: Array<Object>,
 *     monthly: Array<Object>
 *   }
 *
 * Errori:
 *   405 — Metodo non consentito
 *   500 — Errore database
 */

const cache = require('./_lib/cache');
const { supabase } = require('./_lib/supabase');

const CACHE_KEY = 'track_record';
const CACHE_TTL = 3600; // 1 ora

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cached = cache.get(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(cached);
  }

  try {
    // Recupera tutti i tips chiusi (non pending)
    const { data: tips, error } = await supabase
      .from('tips')
      .select('id, prediction, odds, confidence, status, tier, match_date, home_team, away_team, created_at')
      .in('status', ['won', 'lost', 'void'])
      .order('match_date', { ascending: false });

    if (error) {
      console.error('Track record query error:', error.message);
      return res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
    }

    // Recupera il conteggio dei tip pendenti
    const { count: pendingCount } = await supabase
      .from('tips')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const allTips = tips || [];
    const won = allTips.filter(function (t) { return t.status === 'won'; }).length;
    const lost = allTips.filter(function (t) { return t.status === 'lost'; }).length;
    const voidCount = allTips.filter(function (t) { return t.status === 'void'; }).length;
    const settled = won + lost; // void non conta per win rate

    // Win rate (basato solo su won/lost, esclude void)
    const winRate = settled > 0 ? parseFloat(((won / settled) * 100).toFixed(1)) : 0;

    // Quota media dei tips vincenti
    const wonTips = allTips.filter(function (t) { return t.status === 'won' && t.odds; });
    const avgOdds =
      wonTips.length > 0
        ? parseFloat(
            (wonTips.reduce(function (sum, t) { return sum + parseFloat(t.odds); }, 0) / wonTips.length).toFixed(2),
          )
        : 0;

    // ROI: ((profitto totale) / (puntata totale)) * 100
    // Assumendo puntata unitaria (1u) per ogni tip
    const profit = wonTips.reduce(function (sum, t) { return sum + (parseFloat(t.odds) - 1); }, 0) - lost;
    const roi = settled > 0 ? parseFloat(((profit / settled) * 100).toFixed(1)) : 0;

    // Ultimi 10 risultati
    const recent = allTips.slice(0, 10).map(function (t) {
      return {
        home_team: t.home_team,
        away_team: t.away_team,
        prediction: t.prediction,
        odds: t.odds,
        status: t.status,
        match_date: t.match_date,
      };
    });

    // Breakdown mensile (ultimi 6 mesi)
    const monthly = buildMonthlyBreakdown(allTips);

    const result = {
      total_tips: allTips.length + (pendingCount || 0),
      won: won,
      lost: lost,
      void: voidCount,
      pending: pendingCount || 0,
      win_rate: winRate,
      avg_odds: avgOdds,
      roi: roi,
      recent: recent,
      monthly: monthly,
    };

    cache.set(CACHE_KEY, result, CACHE_TTL);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Track record error:', err);
    return res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
  }
};

/**
 * Costruisce il breakdown mensile dei risultati (ultimi 6 mesi).
 * @param {Array<Object>} tips - Array di tips chiusi
 * @returns {Array<Object>} Array di oggetti mensili
 */
function buildMonthlyBreakdown(tips) {
  const months = {};
  const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

  tips.forEach(function (tip) {
    const d = new Date(tip.match_date);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

    if (!months[key]) {
      months[key] = {
        month: monthNames[d.getMonth()],
        year: d.getFullYear(),
        won: 0,
        lost: 0,
        profit: 0,
      };
    }

    if (tip.status === 'won') {
      months[key].won++;
      months[key].profit += tip.odds ? parseFloat(tip.odds) - 1 : 0;
    } else if (tip.status === 'lost') {
      months[key].lost++;
      months[key].profit -= 1;
    }
  });

  // Ordina per data e prendi gli ultimi 6 mesi
  return Object.keys(months)
    .sort()
    .slice(-6)
    .map(function (key) {
      const m = months[key];
      const settled = m.won + m.lost;
      return {
        label: m.month,
        won: m.won,
        lost: m.lost,
        win_rate: settled > 0 ? parseFloat(((m.won / settled) * 100).toFixed(1)) : 0,
        profit: parseFloat(m.profit.toFixed(1)),
      };
    });
}

/**
 * GET /api/cron/daily
 *
 * Orchestratore cron giornaliero. Esegue in sequenza:
 *   1. Settle — Chiude i pronostici con partite gia' giocate
 *   2. Generate — Genera nuovi pronostici per ogni lega con partite in programma
 *   3. Send — Invia i tips del giorno via Telegram + email
 *
 * Vercel Cron invia una GET con CRON_SECRET nell'header Authorization.
 *
 * Sicurezza: richiede CRON_SECRET nell'header Authorization.
 */

const { verifyCronSecret } = require('../_lib/auth-middleware');
const settleHandler = require('../settle-tips');
const sendHandler = require('../send-tips');
const { generateForLeague } = require('../generate-tips');

const LEAGUE_SLUGS = ['serie-a', 'serie-b', 'champions-league', 'la-liga', 'premier-league'];

/**
 * Chiama un handler Vercel simulando req/res.
 *
 * @param {Function} handler - Handler serverless (req, res) => void
 * @param {string} method - Metodo HTTP (es. "POST")
 * @returns {Promise<Object>} Corpo JSON della risposta
 */
function callHandler(handler, method) {
  return new Promise(function (resolve, reject) {
    const fakeReq = {
      method: method,
      headers: {
        authorization: 'Bearer ' + process.env.CRON_SECRET,
      },
      body: {},
    };

    let statusCode = 200;
    const fakeRes = {
      status: function (code) {
        statusCode = code;
        return fakeRes;
      },
      json: function (data) {
        if (statusCode >= 200 && statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(JSON.stringify(data)));
        }
      },
    };

    Promise.resolve(handler(fakeReq, fakeRes)).catch(reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { authorized, error: cronError } = verifyCronSecret(req);
  if (!authorized) {
    return res.status(401).json({ error: cronError });
  }

  const results = {
    settle: null,
    generate: [],
    send: null,
  };

  try {
    // Step 1 — Settle: chiudi pronostici con partite gia' giocate
    try {
      results.settle = await callHandler(settleHandler, 'POST');
    } catch (err) {
      console.error('Cron daily — settle error:', err.message);
      results.settle = { error: err.message };
    }

    // Step 2 — Generate: genera nuovi pronostici per ogni lega
    for (const slug of LEAGUE_SLUGS) {
      try {
        const result = await generateForLeague(slug);
        results.generate.push(result);
      } catch (err) {
        console.error('Cron daily — generate error for ' + slug + ':', err.message);
        results.generate.push({ league: slug, error: err.message });
      }
    }

    // Step 3 — Send: invia tips del giorno via Telegram + email
    try {
      results.send = await callHandler(sendHandler, 'POST');
    } catch (err) {
      console.error('Cron daily — send error:', err.message);
      results.send = { error: err.message };
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error('Cron daily — fatal error:', err);
    return res.status(500).json({ error: 'Errore fatale nel cron giornaliero', partial: results });
  }
};

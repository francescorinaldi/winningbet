process.loadEnvFile('.env.local');
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const https = require('https');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_ID = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
const PRIVATE_ID = process.env.TELEGRAM_PRIVATE_CHANNEL_ID;

function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+=|{}.!\-]/g, '\\$&');
}

function sendMsg(chatId, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2', disable_web_page_preview: true });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: '/bot' + TOKEN + '/sendMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const LEAGUE_FLAG = {
  'serie-a': 'IT', 'la-liga': 'ES', 'premier-league': 'EN',
  'ligue-1': 'FR', 'bundesliga': 'DE', 'eredivisie': 'NL', 'champions-league': 'UCL'
};
const LEAGUE_NAME = {
  'serie-a': 'Serie A', 'la-liga': 'La Liga', 'premier-league': 'Premier League',
  'ligue-1': 'Ligue 1', 'bundesliga': 'Bundesliga', 'eredivisie': 'Eredivisie', 'champions-league': 'Champions League'
};

function formatTip(t) {
  const date = new Date(t.match_date);
  const dateStr = date.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    '\u26bd *' + esc(t.home_team) + ' vs ' + esc(t.away_team) + '*\n' +
    '\u2514 \ud83c\udfaf ' + esc(t.prediction) + '\n' +
    '\u2514 \ud83d\udcca Quota: ' + esc(String(t.odds)) + '\n' +
    '\u2514 \ud83d\udd25 Fiducia: ' + esc(String(t.confidence)) + '%\n' +
    '\u2514 \ud83d\udcdd _' + esc(t.analysis || '') + '_'
  );
}

(async () => {
  const { data: tips, error } = await sb.from('tips')
    .select('*')
    .eq('status', 'pending')
    .order('match_date', { ascending: true });

  if (error) { console.log('ERR fetch:', error.message); return; }
  console.log('Tips trovati:', tips.length);

  const free = tips.filter(t => t.tier === 'free');
  const proVip = tips.filter(t => t.tier === 'pro' || t.tier === 'vip');

  function groupByLeague(arr) {
    const m = {};
    arr.forEach(t => { if (!m[t.league]) m[t.league] = []; m[t.league].push(t); });
    return m;
  }

  // Canale pubblico — free tips
  const pubGroups = groupByLeague(free);
  for (const [league, lTips] of Object.entries(pubGroups)) {
    const name = LEAGUE_NAME[league] || league;
    let msg = '*' + esc(name) + '*\n\n';
    msg += lTips.map(formatTip).join('\n\n');
    msg += '\n\n\ud83d\udc51 *WinningBet* \\- Pronostici Calcio Premium';
    const r = await sendMsg(PUBLIC_ID, msg);
    console.log('PUBLIC ' + league + ':', r.ok ? 'OK' : 'ERR ' + JSON.stringify(r.description));
  }

  // Canale privato — pro + vip tips
  const privGroups = groupByLeague(proVip);
  for (const [league, lTips] of Object.entries(privGroups)) {
    const name = LEAGUE_NAME[league] || league;
    let msg = '*' + esc(name) + '*\n\n';
    msg += lTips.map(formatTip).join('\n\n');
    msg += '\n\n\ud83d\udc51 *WinningBet* \\- Pronostici Calcio Premium';
    const r = await sendMsg(PRIVATE_ID, msg);
    console.log('PRIVATE ' + league + ':', r.ok ? 'OK' : 'ERR ' + JSON.stringify(r.description));
  }

  console.log('\nInviati — Pubblico (free):', free.length, '| Privato (pro/vip):', proVip.length);
})();

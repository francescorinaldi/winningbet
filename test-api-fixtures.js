const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/selen/winningbet';

// Load env.local
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      const k = line.substring(0, eq).trim();
      if (k.startsWith('#') || !k) continue;
      let val = line.substring(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[k] = val;
    }
  }
}

const apiKey = process.env.API_FOOTBALL_KEY;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY;

// Try football-data.org instead (free tier, works with date range)
// Serie A = competition code "SA"
const today = new Date();
const dateFrom = today.toISOString().split('T')[0];
const dateTo = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

console.log('Date range:', dateFrom, '->', dateTo);
console.log('football-data key:', FOOTBALL_DATA_KEY ? FOOTBALL_DATA_KEY.substring(0, 8) + '...' : 'MISSING');

const url = `https://api.football-data.org/v4/competitions/SA/matches?status=SCHEDULED&dateFrom=${dateFrom}&dateTo=${dateTo}`;
fetch(url, {
  headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY }
})
  .then(res => {
    console.log('Status:', res.status);
    return res.json();
  })
  .then(data => {
    if (data.error || data.message) {
      console.log('Error:', data.message || data.error);
      return;
    }
    console.log('Matches found:', data.matches ? data.matches.length : 0);
    if (data.matches) {
      for (const m of data.matches.slice(0, 15)) {
        console.log(`  ${m.utcDate.substring(0, 10)} | ${m.homeTeam.name} vs ${m.awayTeam.name} | status: ${m.status}`);
      }
    }
  })
  .catch(err => console.error('Fetch error:', err.message));

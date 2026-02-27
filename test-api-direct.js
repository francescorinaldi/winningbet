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
console.log('API key:', apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING');

// Direct API test
const url = 'https://v3.football.api-sports.io/fixtures?league=135&season=2024&next=5';
fetch(url, {
  headers: { 'x-apisports-key': apiKey }
})
  .then(res => {
    console.log('Status:', res.status);
    return res.json();
  })
  .then(data => {
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.log('API errors:', JSON.stringify(data.errors));
    } else {
      console.log('Matches found:', data.results);
      if (data.response && data.response.length > 0) {
        const m = data.response[0];
        console.log('First match:', m.teams.home.name, 'vs', m.teams.away.name, m.fixture.date);
      }
    }
  })
  .catch(err => console.error('Fetch error:', err.message));

const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/selen/winningbet';

// Try .env.local first, then .env
const envFiles = ['.env.local', '.env'];
for (const ef of envFiles) {
  const envPath = path.join(ROOT, ef);
  if (fs.existsSync(envPath)) {
    console.log('Loading:', envPath);
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^([^#\s=]+)\s*=\s*(.*)/);
      if (m) {
        const k = m[1];
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = val;
      }
    }
    break;
  }
}
console.log('API_FOOTBALL_KEY set:', !!(process.env.API_FOOTBALL_KEY || ''));
console.log('API_FOOTBALL_KEY length:', (process.env.API_FOOTBALL_KEY || '').length);
console.log('FOOTBALL_DATA_KEY set:', !!(process.env.FOOTBALL_DATA_KEY || ''));
console.log('SUPABASE_URL set:', !!(process.env.SUPABASE_URL || ''));

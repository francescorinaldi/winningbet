/**
 * Wrapper that loads .env.local (which the fetch script doesn't load by default)
 * then runs fetch-league-data for serie-a
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = 'C:/Users/selen/winningbet';
const envFiles = ['.env.local', '.env'];
for (const ef of envFiles) {
  const envPath = path.join(ROOT, ef);
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^([^#\s=][^=]*)=(.*)$/);
      if (m) {
        const k = m[1].trim();
        let val = m[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (k && !process.env[k]) process.env[k] = val;
      }
    }
    break;
  }
}

// Now require and run the fetch script
const scriptPath = path.join(ROOT, '.claude/skills/fr3-generate-tips/scripts/fetch-league-data.js');
process.argv[2] = 'serie-a';
require(scriptPath);

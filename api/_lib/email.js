/**
 * Email client via SMTP (Nodemailer).
 *
 * Invia email transazionali tramite server SMTP proprio.
 * Usato per il riepilogo giornaliero dei tips agli abbonati.
 *
 * Variabili d'ambiente richieste:
 *   SMTP_HOST — Hostname del server SMTP
 *   SMTP_PORT — Porta SMTP (465 per SSL, 587 per STARTTLS)
 *   SMTP_USER — Username SMTP
 *   SMTP_PASS — Password SMTP
 *   SMTP_FROM — Indirizzo mittente (es. support@winningbet.it)
 */

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;
const EMAIL_LOCALE = 'it-IT';

/**
 * Crea il transporter Nodemailer (lazy, singleton).
 * @returns {import('nodemailer').Transporter|null}
 */
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) return null;

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Invia una email tramite SMTP.
 *
 * @param {Object} params
 * @param {string} params.to - Destinatario
 * @param {string} params.subject - Oggetto
 * @param {string} params.html - Corpo HTML
 * @param {string} [params.text] - Corpo plain text (fallback)
 * @returns {Promise<boolean>} true se inviata con successo
 */
async function sendEmail(params) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('SMTP not configured, skipping email');
    return false;
  }

  try {
    await transporter.sendMail({
      from: { name: 'WinningBet', address: SMTP_FROM },
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text || undefined,
    });
    return true;
  } catch (err) {
    console.error('SMTP error:', err.message);
    _transporter = null;
    return false;
  }
}

/**
 * Genera il template HTML per il riepilogo giornaliero dei tips.
 *
 * @param {Array<Object>} tips - Array di tips da includere
 * @returns {Object} { subject: string, html: string, text: string }
 */
function buildDailyDigest(tips) {
  const today = new Date().toLocaleDateString(EMAIL_LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const subject = '\u26BD Tips del ' + today + ' — WinningBet';

  const tipsHtml = tips
    .map(function (tip) {
      const odds = tip.odds ? parseFloat(tip.odds).toFixed(2) : '—';
      return [
        '<tr style="border-bottom: 1px solid #2a2a3a;">',
        '  <td style="padding: 12px; font-weight: 600;">',
        '    ' + escapeHtml(tip.home_team) + ' vs ' + escapeHtml(tip.away_team),
        '  </td>',
        '  <td style="padding: 12px; text-align: center; color: #d4a853; font-weight: 700;">',
        '    ' + escapeHtml(tip.prediction),
        '  </td>',
        '  <td style="padding: 12px; text-align: center; color: #d4a853;">',
        '    ' + escapeHtml(odds),
        '  </td>',
        '  <td style="padding: 12px; text-align: center;">',
        '    ' +
          escapeHtml(
            tip.confidence !== null && tip.confidence !== undefined
              ? tip.confidence + '%'
              : '—',
          ),
        '  </td>',
        '</tr>',
      ].join('\n');
    })
    .join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;background:#0a0a0f;color:#f0f0f5;font-family:Arial,sans-serif;">',
    '<div style="max-width:600px;margin:0 auto;padding:32px 24px;">',
    '  <div style="text-align:center;margin-bottom:32px;">',
    '    <h1 style="color:#d4a853;font-size:24px;margin:0;">\u26BD WinningBet</h1>',
    '    <p style="color:#8a8a9a;margin-top:8px;">Tips del ' + escapeHtml(today) + '</p>',
    '  </div>',
    '  <table style="width:100%;border-collapse:collapse;background:#16161f;border-radius:12px;">',
    '    <thead>',
    '      <tr style="border-bottom: 2px solid #d4a853;">',
    '        <th style="padding:12px;text-align:left;color:#8a8a9a;font-size:12px;">PARTITA</th>',
    '        <th style="padding:12px;text-align:center;color:#8a8a9a;font-size:12px;">TIP</th>',
    '        <th style="padding:12px;text-align:center;color:#8a8a9a;font-size:12px;">QUOTA</th>',
    '        <th style="padding:12px;text-align:center;color:#8a8a9a;font-size:12px;">FIDUCIA</th>',
    '      </tr>',
    '    </thead>',
    '    <tbody>',
    tipsHtml,
    '    </tbody>',
    '  </table>',
    '  <div style="text-align:center;margin-top:32px;">',
    '    <a href="https://winningbet.it/dashboard.html" ',
    '       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f0d078,#d4a853);',
    '              color:#0a0a0f;text-decoration:none;border-radius:8px;font-weight:700;">',
    '      Vedi Dashboard',
    '    </a>',
    '  </div>',
    '  <div style="text-align:center;margin-top:32px;color:#55556a;font-size:12px;">',
    '    <p>WinningBet — Pronostici Calcio Premium</p>',
    "    <p>Il gioco d'azzardo puo' causare dipendenza. Gioca responsabilmente. 18+</p>",
    '  </div>',
    '</div>',
    '</body></html>',
  ].join('\n');

  const text =
    'Tips del ' +
    today +
    ' — WinningBet\n\n' +
    tips
      .map(function (tip) {
        return (
          tip.home_team +
          ' vs ' +
          tip.away_team +
          ' | ' +
          tip.prediction +
          ' @ ' +
          (tip.odds ? parseFloat(tip.odds).toFixed(2) : '—') +
          ' (' +
          (tip.confidence !== null && tip.confidence !== undefined
            ? tip.confidence + '%'
            : '—') +
          ')'
        );
      })
      .join('\n') +
    '\n\nVedi tutti i tips: https://winningbet.it/dashboard.html';

  return { subject: subject, html: html, text: text };
}

/**
 * Escape caratteri speciali per HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { sendEmail, buildDailyDigest };

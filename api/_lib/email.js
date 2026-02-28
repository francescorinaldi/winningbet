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

const SITE_URL = process.env.SITE_URL || 'https://winningbet.it';
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
    console.error('SMTP not configured, skipping email');
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
    console.error('SMTP error:', err.message, err.responseCode || '', err.command || '');
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
            tip.confidence !== null && tip.confidence !== undefined ? tip.confidence + '%' : '—',
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
    '    <a href="' + SITE_URL + '/dashboard.html" ',
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
          (tip.confidence !== null && tip.confidence !== undefined ? tip.confidence + '%' : '—') +
          ')'
        );
      })
      .join('\n') +
    '\n\nVedi tutti i tips: ' + SITE_URL + '/dashboard.html';

  return { subject: subject, html: html, text: text };
}

/**
 * Genera il template HTML per notifica admin di nuova candidatura partner.
 *
 * @param {Object} application - Oggetto candidatura partner
 * @param {string} userEmail - Email dell'utente che ha inviato la candidatura
 * @returns {Object} { subject: string, html: string, text: string }
 */
function buildPartnerApplicationNotification(application, userEmail) {
  const businessName = escapeHtml(application.business_name || '\u2014');
  const vatNumber = escapeHtml(application.vat_number || '\u2014');
  const city = escapeHtml(application.city || '\u2014');
  const province = escapeHtml(application.province || '\u2014');
  const website = escapeHtml(application.website || '\u2014');
  const email = escapeHtml(userEmail || '\u2014');
  const createdAt = application.created_at
    ? new Date(application.created_at).toLocaleDateString(EMAIL_LOCALE, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '\u2014';

  let viesLabel = '\u2014';
  if (application.vies_valid === true) {
    viesLabel = '\u2705 Validata';
    if (application.vies_company_name) {
      viesLabel += ' (' + escapeHtml(application.vies_company_name) + ')';
    }
  } else if (application.vies_valid === false) {
    viesLabel = '\u274C Non valida';
  }

  const subject = sanitizeSubject(
    '\uD83C\uDFE2 Nuova Candidatura Partner \u2014 ' +
    (application.business_name || 'N/D'),
  );

  const html = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;background:#0a0a0f;color:#f0f0f5;font-family:Arial,sans-serif;">',
    '<div style="max-width:600px;margin:0 auto;padding:32px 24px;">',
    '  <div style="text-align:center;margin-bottom:32px;">',
    '    <h1 style="color:#d4a853;font-size:24px;margin:0;">\u26BD WinningBet</h1>',
    '    <p style="color:#8a8a9a;margin-top:8px;">Nuova Candidatura Partner</p>',
    '  </div>',
    '  <table style="width:100%;border-collapse:collapse;background:#16161f;border-radius:12px;">',
    '    <tbody>',
    '      <tr style="border-bottom: 1px solid #2a2a3a;">',
    '        <td style="padding:12px;color:#8a8a9a;font-size:12px;font-weight:600;width:40%;">RAGIONE SOCIALE</td>',
    '        <td style="padding:12px;font-weight:600;">' + businessName + '</td>',
    '      </tr>',
    '      <tr style="border-bottom: 1px solid #2a2a3a;">',
    '        <td style="padding:12px;color:#8a8a9a;font-size:12px;font-weight:600;">PARTITA IVA</td>',
    '        <td style="padding:12px;">' + vatNumber + '</td>',
    '      </tr>',
    '      <tr style="border-bottom: 1px solid #2a2a3a;">',
    '        <td style="padding:12px;color:#8a8a9a;font-size:12px;font-weight:600;">VERIFICA VIES</td>',
    '        <td style="padding:12px;">' + viesLabel + '</td>',
    '      </tr>',
    '      <tr style="border-bottom: 1px solid #2a2a3a;">',
    "        <td style=\"padding:12px;color:#8a8a9a;font-size:12px;font-weight:600;\">CITTA'</td>",
    '        <td style="padding:12px;">' +
      city +
      (province !== '\u2014' ? ' (' + province + ')' : '') +
      '</td>',
    '      </tr>',
    '      <tr style="border-bottom: 1px solid #2a2a3a;">',
    '        <td style="padding:12px;color:#8a8a9a;font-size:12px;font-weight:600;">SITO WEB</td>',
    '        <td style="padding:12px;">' + website + '</td>',
    '      </tr>',
    '      <tr>',
    '        <td style="padding:12px;color:#8a8a9a;font-size:12px;font-weight:600;">EMAIL</td>',
    '        <td style="padding:12px;">' + email + '</td>',
    '      </tr>',
    '    </tbody>',
    '  </table>',
    '  <p style="color:#8a8a9a;font-size:13px;text-align:center;margin-top:16px;">',
    '    Inviata il ' + escapeHtml(createdAt),
    '  </p>',
    '  <div style="text-align:center;margin-top:32px;">',
    '    <a href="' + SITE_URL + '/admin.html" ',
    '       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f0d078,#d4a853);',
    '              color:#0a0a0f;text-decoration:none;border-radius:8px;font-weight:700;">',
    '      Vai al Pannello Admin',
    '    </a>',
    '  </div>',
    '  <div style="text-align:center;margin-top:32px;color:#55556a;font-size:12px;">',
    '    <p>WinningBet \u2014 Pronostici Calcio Premium</p>',
    "    <p>Il gioco d'azzardo puo' causare dipendenza. Gioca responsabilmente. 18+</p>",
    '  </div>',
    '</div>',
    '</body></html>',
  ].join('\n');

  const text =
    'Nuova Candidatura Partner \u2014 WinningBet\n\n' +
    'Ragione Sociale: ' +
    (application.business_name || '\u2014') +
    '\n' +
    'Partita IVA: ' +
    (application.vat_number || '\u2014') +
    '\n' +
    'Verifica VIES: ' +
    (application.vies_valid === true
      ? 'Validata'
      : application.vies_valid === false
        ? 'Non valida'
        : '\u2014') +
    '\n' +
    "Citta': " +
    (application.city || '\u2014') +
    (application.province ? ' (' + application.province + ')' : '') +
    '\n' +
    'Sito Web: ' +
    (application.website || '\u2014') +
    '\n' +
    'Email: ' +
    (userEmail || '\u2014') +
    '\n\n' +
    'Vai al Pannello Admin: ' +
    SITE_URL +
    '/admin.html';

  return { subject: subject, html: html, text: text };
}

/**
 * Genera il template HTML per email di approvazione partner.
 *
 * @param {Object} application - Oggetto candidatura partner
 * @returns {Object} { subject: string, html: string, text: string }
 */
function buildPartnerApprovalEmail(application) {
  const businessName = escapeHtml(application.business_name || '');

  const subject = 'Candidatura Approvata \u2014 Benvenuto Partner WinningBet';

  const html = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;background:#0a0a0f;color:#f0f0f5;font-family:Arial,sans-serif;">',
    '<div style="max-width:600px;margin:0 auto;padding:32px 24px;">',
    '  <div style="text-align:center;margin-bottom:32px;">',
    '    <h1 style="color:#d4a853;font-size:24px;margin:0;">\u26BD WinningBet</h1>',
    '    <p style="color:#8a8a9a;margin-top:8px;">Programma Partner</p>',
    '  </div>',
    '  <div style="background:#16161f;border-radius:12px;padding:24px;">',
    '    <h2 style="color:#d4a853;font-size:20px;margin:0 0 16px 0;">Benvenuto, ' +
      businessName +
      '!</h2>',
    '    <p style="color:#f0f0f5;line-height:1.6;margin:0 0 16px 0;">',
    '      La tua candidatura al Programma Partner WinningBet \u00e8 stata <strong style="color:#d4a853;">approvata</strong>.',
    '    </p>',
    '    <p style="color:#f0f0f5;line-height:1.6;margin:0 0 24px 0;">',
    '      Da oggi hai accesso esclusivo a:',
    '    </p>',
    '    <table style="width:100%;border-collapse:collapse;">',
    '      <tr>',
    '        <td style="padding:12px;border-bottom:1px solid #2a2a3a;">',
    '          <span style="color:#d4a853;font-weight:700;font-size:18px;">\uD83D\uDCCA</span>',
    '          <strong style="margin-left:8px;">Comparatore Quote</strong>',
    '          <p style="color:#8a8a9a;font-size:13px;margin:4px 0 0 0;">Confronta le quote dei principali bookmaker in tempo reale</p>',
    '        </td>',
    '      </tr>',
    '      <tr>',
    '        <td style="padding:12px;border-bottom:1px solid #2a2a3a;">',
    '          <span style="color:#d4a853;font-weight:700;font-size:18px;">\uD83E\uDD16</span>',
    '          <strong style="margin-left:8px;">Pronostici AI Premium</strong>',
    '          <p style="color:#8a8a9a;font-size:13px;margin:4px 0 0 0;">Accesso completo ai pronostici generati dalla nostra intelligenza artificiale</p>',
    '        </td>',
    '      </tr>',
    '      <tr>',
    '        <td style="padding:12px;">',
    '          <span style="color:#d4a853;font-weight:700;font-size:18px;">\uD83D\uDCC8</span>',
    '          <strong style="margin-left:8px;">Pannello Statistiche Dedicato</strong>',
    '          <p style="color:#8a8a9a;font-size:13px;margin:4px 0 0 0;">Statistiche avanzate e track record esclusivi per la tua attivit\u00e0</p>',
    '        </td>',
    '      </tr>',
    '    </table>',
    '  </div>',
    '  <div style="text-align:center;margin-top:32px;">',
    '    <a href="' + SITE_URL + '/dashboard.html" ',
    '       style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f0d078,#d4a853);',
    '              color:#0a0a0f;text-decoration:none;border-radius:8px;font-weight:700;">',
    '      Accedi alla Dashboard',
    '    </a>',
    '  </div>',
    '  <div style="text-align:center;margin-top:32px;color:#55556a;font-size:12px;">',
    '    <p>WinningBet \u2014 Pronostici Calcio Premium</p>',
    "    <p>Il gioco d'azzardo puo' causare dipendenza. Gioca responsabilmente. 18+</p>",
    '  </div>',
    '</div>',
    '</body></html>',
  ].join('\n');

  const text =
    'Candidatura Approvata \u2014 Benvenuto Partner WinningBet\n\n' +
    'Ciao ' +
    (application.business_name || '') +
    ',\n\n' +
    "La tua candidatura al Programma Partner WinningBet e' stata approvata.\n\n" +
    'Da oggi hai accesso esclusivo a:\n' +
    '- Comparatore Quote: confronta le quote dei principali bookmaker in tempo reale\n' +
    '- Pronostici AI Premium: accesso completo ai pronostici generati dalla nostra AI\n' +
    '- Pannello Statistiche Dedicato: statistiche avanzate e track record esclusivi\n\n' +
    'Accedi alla Dashboard: ' +
    SITE_URL +
    '/dashboard.html';

  return { subject: subject, html: html, text: text };
}

/**
 * Genera il template HTML per email di rifiuto candidatura partner.
 *
 * @param {Object} application - Oggetto candidatura partner
 * @param {string} reason - Motivo del rifiuto
 * @returns {Object} { subject: string, html: string, text: string }
 */
function buildPartnerRejectionEmail(application, reason) {
  const businessName = escapeHtml(application.business_name || '');
  const safeReason = escapeHtml(reason || 'Requisiti non soddisfatti');

  const subject = 'Aggiornamento Candidatura \u2014 WinningBet';

  const html = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:0;background:#0a0a0f;color:#f0f0f5;font-family:Arial,sans-serif;">',
    '<div style="max-width:600px;margin:0 auto;padding:32px 24px;">',
    '  <div style="text-align:center;margin-bottom:32px;">',
    '    <h1 style="color:#d4a853;font-size:24px;margin:0;">\u26BD WinningBet</h1>',
    '    <p style="color:#8a8a9a;margin-top:8px;">Programma Partner</p>',
    '  </div>',
    '  <div style="background:#16161f;border-radius:12px;padding:24px;">',
    '    <p style="color:#f0f0f5;line-height:1.6;margin:0 0 16px 0;">',
    '      Gentile ' + businessName + ',',
    '    </p>',
    '    <p style="color:#f0f0f5;line-height:1.6;margin:0 0 16px 0;">',
    "      Dopo un'attenta valutazione, non ci \u00e8 possibile approvare la tua candidatura al Programma Partner WinningBet in questo momento.",
    '    </p>',
    '    <div style="background:#1e1e2a;border-left:3px solid #d4a853;padding:12px 16px;border-radius:4px;margin:0 0 16px 0;">',
    '      <p style="color:#8a8a9a;font-size:12px;margin:0 0 4px 0;">MOTIVAZIONE</p>',
    '      <p style="color:#f0f0f5;margin:0;">' + safeReason + '</p>',
    '    </div>',
    '    <p style="color:#f0f0f5;line-height:1.6;margin:0 0 16px 0;">',
    '      Se ritieni ci sia stato un errore o desideri maggiori informazioni, non esitare a contattarci rispondendo a questa email.',
    '    </p>',
    '    <p style="color:#8a8a9a;line-height:1.6;margin:0;">',
    "      Ti ringraziamo per l'interesse e ti auguriamo il meglio.",
    '    </p>',
    '  </div>',
    '  <div style="text-align:center;margin-top:32px;color:#55556a;font-size:12px;">',
    '    <p>WinningBet \u2014 Pronostici Calcio Premium</p>',
    "    <p>Il gioco d'azzardo puo' causare dipendenza. Gioca responsabilmente. 18+</p>",
    '  </div>',
    '</div>',
    '</body></html>',
  ].join('\n');

  const text =
    'Aggiornamento Candidatura \u2014 WinningBet\n\n' +
    'Gentile ' +
    (application.business_name || '') +
    ',\n\n' +
    "Dopo un'attenta valutazione, non ci e' possibile approvare la tua candidatura al " +
    'Programma Partner WinningBet in questo momento.\n\n' +
    'Motivazione: ' +
    (reason || 'Requisiti non soddisfatti') +
    '\n\n' +
    'Se ritieni ci sia stato un errore o desideri maggiori informazioni, ' +
    'non esitare a contattarci rispondendo a questa email.\n\n' +
    "Ti ringraziamo per l'interesse e ti auguriamo il meglio.";

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

/**
 * Strip CR/LF and control characters from email subject to prevent header injection.
 * @param {string} str
 * @returns {string}
 */
function sanitizeSubject(str) {
  return String(str).replace(/[\r\n\x00-\x1f]/g, ' ').trim();
}

module.exports = {
  sendEmail,
  buildDailyDigest,
  buildPartnerApplicationNotification,
  buildPartnerApprovalEmail,
  buildPartnerRejectionEmail,
};

/* ============================================
   WinningBet — i18n Translation System
   ============================================
   Lightweight client-side i18n. Two dictionaries (IT, EN).
   Static elements: tagged with data-i18n="key" or data-i18n-html="key".
   Dynamic content: use window.t("key") helper.

   The active language is stored in localStorage("lang")
   and applied to document.documentElement.lang.
   ============================================ */

(function () {
  'use strict';

  // ─── Translation Dictionaries ──────────────────────────────────────────────

  const TRANSLATIONS = {
    it: {
      // Navbar
      'nav.tips': 'Tips',
      'nav.track': 'Track Record',
      'nav.plans': 'Piani',
      'nav.faq': 'FAQ',
      'nav.signin': 'Accedi',
      'nav.subscribe': 'Abbonati Ora',
      'nav.mytips': 'I Miei Tips',

      // Hero
      'hero.title1': 'Non scommettere.',
      'hero.title2': 'Investi.',
      'hero.subtitle':
        'Pronostici di calcio basati su dati, algoritmi e analisi tecnico-tattiche.<br>Track record verificato e trasparente.',
      'hero.winrate': 'Win Rate',
      'hero.winloss': 'Vinti - Persi',
      'hero.tips_sent': 'Tips Inviati',
      'hero.cta': 'INIZIA A VINCERE',
      'hero.cta2': 'Vedi i Tips Gratis',

      // League selector
      'league.all': 'Tutte',

      // Live bar
      'live.label': 'PROSSIME PARTITE',
      'live.loading': 'Caricamento partite...',

      // Tips section
      'tips.tag': 'TIPS DEL GIORNO',
      'tips.title': 'I Nostri <span class="text-gradient">Pronostici</span>',
      'tips.desc':
        'Analisi dettagliate basate su statistiche avanzate, forma delle squadre e valore delle quote.',
      'tips.filter.all': 'Tutti',
      'tips.loading': 'Caricamento pronostici...',
      'tips.empty': 'Nessun pronostico disponibile al momento',
      'tips.error': 'Impossibile caricare i pronostici',

      // Tier comparison
      'tier.free.value': '1-2 tips/settimana',
      'tier.free.detail': 'Statistiche base',
      'tier.pro.value': '10+ tips/giorno',
      'tier.pro.detail': 'Analisi AI + Storico completo',
      'tier.vip.value': 'Tutto PRO + VALUE bets',
      'tier.vip.detail': 'Telegram VIP + Supporto 1:1',

      // Tip card labels
      'tip.prediction': 'Pronostico',
      'tip.odds': 'Quota',
      'tip.confidence': 'Confidence',

      // Locked overlay
      'lock.pro.title': 'Sblocca i Pronostici PRO',
      'lock.vip.title': 'Pronostici VIP Esclusivi',
      'lock.pro.benefits': [
        'Tutti i tips giornalieri',
        'Analisi pre-partita dettagliate',
        'Storico completo risultati',
      ],
      'lock.vip.benefits': [
        'Tips VALUE ad alta quota',
        'Canale Telegram VIP privato',
        'Bankroll management personalizzato',
      ],
      'lock.login': 'Accedi con Google',
      'lock.upgrade.pro': 'Passa a PRO \u2014 \u20AC9.99/mese',
      'lock.upgrade.vip': 'Diventa VIP \u2014 \u20AC29.99/mese',

      // Track Record
      'stats.tag': 'TRACK RECORD',
      'stats.title': 'Risultati <span class="text-gradient">Verificati</span>',
      'stats.desc': 'Trasparenza totale. Ogni tip viene tracciato e i risultati sono pubblici.',
      'stats.winrate': 'Win Rate',
      'stats.winloss': 'Vinti - Persi',
      'stats.avgodds': 'Quota Media',
      'stats.avgodds.explain': 'Media delle quote reali (Bet365) dei pronostici vinti',
      'stats.matches': 'Partite Analizzate',
      'stats.datapoints': 'Dati Elaborati',
      'stats.roi': 'ROI',
      'stats.roi.explain': "Ritorno sull'investimento calcolato su tutti i tips settati",
      'stats.results.title': 'I Nostri Risultati',
      'stats.results.loading': 'Caricamento risultati...',
      'stats.results.empty': 'Nessun risultato disponibile',
      'stats.results.error': 'Impossibile caricare i risultati',

      // Matches
      'matches.empty': 'Nessuna partita in programma',
      'matches.error': 'Impossibile caricare le partite',

      // Pricing
      'pricing.tag': 'PIANI',
      'pricing.title': 'Scegli il Tuo <span class="text-gradient">Piano</span>',
      'pricing.desc':
        'Investi nel tuo vantaggio. Ogni piano include accesso immediato ai nostri pronostici.',
      'pricing.popular': "PIU' POPOLARE",
      'pricing.free.desc': 'Per iniziare a scoprire il nostro metodo',
      'pricing.free.f1': '1-2 tips base a settimana',
      'pricing.free.f2': 'Statistiche generali per lega',
      'pricing.free.f3': 'Classifica e calendario',
      'pricing.free.f4': 'Tips giornalieri completi',
      'pricing.free.f5': 'Analisi pre-partita',
      'pricing.free.f6': 'Canale Telegram VIP',
      'pricing.free.btn': 'Inizia Gratis',
      'pricing.pro.desc': 'Per chi vuole fare sul serio',
      'pricing.pro.f1': '10+ tips al giorno',
      'pricing.pro.f2': 'Analisi Intelligenza Artificiale',
      'pricing.pro.f3': 'Storico completo risultati',
      'pricing.pro.f4': 'Statistiche avanzate',
      'pricing.pro.f5': 'Multipla del giorno',
      'pricing.pro.f6': 'Tips VALUE ad alta quota',
      'pricing.pro.btn': 'Scegli PRO',
      'pricing.vip.desc': 'Per chi vuole il massimo vantaggio',
      'pricing.vip.f1': 'Tutto del piano PRO',
      'pricing.vip.f2': 'Tips VALUE esclusivi',
      'pricing.vip.f3': 'Canale Telegram VIP privato',
      'pricing.vip.f4': 'Alert in tempo reale',
      'pricing.vip.f5': 'Bankroll management personalizzato',
      'pricing.vip.f6': 'Supporto diretto 1-to-1',
      'pricing.vip.btn': 'Diventa VIP',

      // Telegram
      'tg.title': 'Unisciti al Canale Telegram',
      'tg.desc':
        'Ricevi i tips direttamente sul telefono. Notifiche istantanee prima di ogni partita.',
      'tg.btn': 'Entra nel Canale',
      'tg.members': 'Entra nella community',

      // FAQ
      'faq.tag': 'FAQ',
      'faq.title': 'Domande <span class="text-gradient">Frequenti</span>',
      'faq.q1': 'Come funzionano i vostri pronostici?',
      'faq.a1':
        'I nostri pronostici sono basati su un mix di analisi statistica avanzata, studio della forma delle squadre, analisi tattiche e monitoraggio delle quote di mercato. Ogni tip viene validato da un modello proprietario che valuta il valore atteso della scommessa rispetto alla quota offerta dai bookmaker.',
      'faq.q2': 'Posso davvero guadagnare con le scommesse?',
      'faq.a2':
        "Le scommesse sportive comportano sempre un rischio. Noi forniamo analisi e pronostici basati su dati, ma nessun risultato e' garantito. Il nostro track record mostra un ROI positivo nel lungo periodo, ma e' fondamentale scommettere responsabilmente e solo con denaro che ci si puo' permettere di perdere.",
      'faq.q3': "Come funziona l'abbonamento?",
      'faq.a3':
        "L'abbonamento e' mensile e si rinnova automaticamente. Puoi cancellare in qualsiasi momento dalla tua area personale. Con il piano PRO hai accesso a tutti i tips giornalieri e le analisi. Con il piano VIP, oltre a tutto cio', ricevi tips esclusivi ad alta quota e accesso al canale Telegram privato.",
      'faq.q4': 'Che bookmaker consigliate?',
      'faq.a4':
        "Consigliamo esclusivamente bookmaker con licenza ADM (ex AAMS) per operare in totale legalita' in Italia. Tra i principali: bet365, Snai, Sisal, Goldbet e Betflag. Registrandoti tramite i nostri link potrai ottenere bonus di benvenuto esclusivi.",
      'faq.q5': 'Quanto dovrei puntare su ogni tip?',
      'faq.a5':
        'Raccomandiamo di non superare mai il 2-5% del proprio bankroll per singola scommessa. I membri VIP ricevono consigli personalizzati sul bankroll management basati sul proprio budget e profilo di rischio.',

      // Footer
      'footer.desc':
        'Pronostici calcio premium powered by AI. Algoritmi proprietari, analisi tecnico-tattiche e dati in tempo reale per darti il vantaggio che fa la differenza.',
      'footer.nav': 'Navigazione',
      'footer.nav.tips': 'Tips del Giorno',
      'footer.nav.track': 'Track Record',
      'footer.nav.plans': 'Piani',
      'footer.nav.faq': 'FAQ',
      'footer.legal': 'Legale',
      'footer.legal.privacy': 'Privacy Policy',
      'footer.legal.terms': 'Termini di Servizio',
      'footer.legal.cookies': 'Cookie Policy',
      'footer.social': 'Seguici',
      'footer.disclaimer':
        "<strong>Disclaimer:</strong> Il gioco d'azzardo puo' causare dipendenza. Gioca responsabilmente. Questo sito fornisce solo pronostici e analisi a scopo informativo. Non raccogliamo ne' gestiamo scommesse. Vietato ai minori di 18 anni. Se hai problemi di gioco, chiama il numero verde 800-558822.",
      'footer.disclaimer2':
        'I link ai bookmaker presenti su questo sito sono link di affiliazione verso operatori con regolare licenza ADM.',
      'footer.copy': '\u00A9 2026 WinningBet. Tutti i diritti riservati.',

      // Cookie banner
      'cookie.text':
        'Utilizziamo cookie tecnici per il funzionamento del sito. Per maggiori informazioni consulta la nostra',
      'cookie.link': 'Cookie Policy',
      'cookie.reject': 'Rifiuta',
      'cookie.accept': 'Accetta',

      // Day abbreviations (used in formatMatchDate)
      days: ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'],
    },

    en: {
      // Navbar
      'nav.tips': 'Tips',
      'nav.track': 'Track Record',
      'nav.plans': 'Plans',
      'nav.faq': 'FAQ',
      'nav.signin': 'Sign In',
      'nav.subscribe': 'Subscribe Now',
      'nav.mytips': 'My Tips',

      // Hero
      'hero.title1': "Don't bet.",
      'hero.title2': 'Invest.',
      'hero.subtitle':
        'Football predictions powered by data, algorithms and tactical analysis.<br>Verified and transparent track record.',
      'hero.winrate': 'Win Rate',
      'hero.winloss': 'Won - Lost',
      'hero.tips_sent': 'Tips Sent',
      'hero.cta': 'START WINNING',
      'hero.cta2': 'See Free Tips',

      // League selector
      'league.all': 'All',

      // Live bar
      'live.label': 'UPCOMING MATCHES',
      'live.loading': 'Loading matches...',

      // Tips section
      'tips.tag': "TODAY'S TIPS",
      'tips.title': 'Our <span class="text-gradient">Predictions</span>',
      'tips.desc': 'Detailed analysis based on advanced statistics, team form and odds value.',
      'tips.filter.all': 'All',
      'tips.loading': 'Loading predictions...',
      'tips.empty': 'No predictions available at this time',
      'tips.error': 'Unable to load predictions',

      // Tier comparison
      'tier.free.value': '1-2 tips/week',
      'tier.free.detail': 'Basic statistics',
      'tier.pro.value': '10+ tips/day',
      'tier.pro.detail': 'AI Analysis + Full History',
      'tier.vip.value': 'All PRO + VALUE bets',
      'tier.vip.detail': 'VIP Telegram + 1:1 Support',

      // Tip card labels
      'tip.prediction': 'Prediction',
      'tip.odds': 'Odds',
      'tip.confidence': 'Confidence',

      // Locked overlay
      'lock.pro.title': 'Unlock PRO Predictions',
      'lock.vip.title': 'Exclusive VIP Predictions',
      'lock.pro.benefits': [
        'All daily tips',
        'Detailed pre-match analysis',
        'Full results history',
      ],
      'lock.vip.benefits': [
        'High-odds VALUE tips',
        'Private VIP Telegram channel',
        'Personalized bankroll management',
      ],
      'lock.login': 'Sign in with Google',
      'lock.upgrade.pro': 'Go PRO \u2014 \u20AC9.99/mo',
      'lock.upgrade.vip': 'Go VIP \u2014 \u20AC29.99/mo',

      // Track Record
      'stats.tag': 'TRACK RECORD',
      'stats.title': 'Verified <span class="text-gradient">Results</span>',
      'stats.desc': 'Full transparency. Every tip is tracked and results are public.',
      'stats.winrate': 'Win Rate',
      'stats.winloss': 'Won - Lost',
      'stats.avgodds': 'Avg Odds',
      'stats.avgodds.explain': 'Average of real odds (Bet365) from winning predictions',
      'stats.matches': 'Matches Analyzed',
      'stats.datapoints': 'Data Points',
      'stats.roi': 'ROI',
      'stats.roi.explain': 'Return on investment calculated across all settled tips',
      'stats.results.title': 'Our Results',
      'stats.results.loading': 'Loading results...',
      'stats.results.empty': 'No results available',
      'stats.results.error': 'Unable to load results',

      // Matches
      'matches.empty': 'No upcoming matches',
      'matches.error': 'Unable to load matches',

      // Pricing
      'pricing.tag': 'PLANS',
      'pricing.title': 'Choose Your <span class="text-gradient">Plan</span>',
      'pricing.desc':
        'Invest in your edge. Every plan includes immediate access to our predictions.',
      'pricing.popular': 'MOST POPULAR',
      'pricing.free.desc': 'Start discovering our method',
      'pricing.free.f1': '1-2 basic tips per week',
      'pricing.free.f2': 'General league statistics',
      'pricing.free.f3': 'Standings and schedule',
      'pricing.free.f4': 'Full daily tips',
      'pricing.free.f5': 'Pre-match analysis',
      'pricing.free.f6': 'VIP Telegram Channel',
      'pricing.free.btn': 'Start Free',
      'pricing.pro.desc': 'For those who mean business',
      'pricing.pro.f1': '10+ tips per day',
      'pricing.pro.f2': 'AI-Powered Analysis',
      'pricing.pro.f3': 'Full results history',
      'pricing.pro.f4': 'Advanced statistics',
      'pricing.pro.f5': 'Daily accumulator',
      'pricing.pro.f6': 'High-odds VALUE tips',
      'pricing.pro.btn': 'Choose PRO',
      'pricing.vip.desc': 'For the ultimate edge',
      'pricing.vip.f1': 'Everything in PRO',
      'pricing.vip.f2': 'Exclusive VALUE tips',
      'pricing.vip.f3': 'Private VIP Telegram channel',
      'pricing.vip.f4': 'Real-time alerts',
      'pricing.vip.f5': 'Personalized bankroll management',
      'pricing.vip.f6': 'Direct 1-to-1 support',
      'pricing.vip.btn': 'Go VIP',

      // Telegram
      'tg.title': 'Join Our Telegram Channel',
      'tg.desc': 'Get tips straight to your phone. Instant alerts before every match.',
      'tg.btn': 'Join Channel',
      'tg.members': 'Join our community',

      // FAQ
      'faq.tag': 'FAQ',
      'faq.title': 'Frequently Asked <span class="text-gradient">Questions</span>',
      'faq.q1': 'How do your predictions work?',
      'faq.a1':
        'Our predictions are based on a mix of advanced statistical analysis, team form study, tactical analysis and market odds monitoring. Each tip is validated by a proprietary model that evaluates the expected value of the bet against the odds offered by bookmakers.',
      'faq.q2': 'Can I really make money from betting?',
      'faq.a2':
        'Sports betting always involves risk. We provide data-driven analysis and predictions, but no result is guaranteed. Our track record shows positive ROI over the long term, but it is essential to bet responsibly and only with money you can afford to lose.',
      'faq.q3': 'How does the subscription work?',
      'faq.a3':
        'The subscription is monthly and renews automatically. You can cancel at any time from your account. The PRO plan gives you access to all daily tips and analysis. With the VIP plan, you also receive exclusive high-odds tips and access to the private Telegram channel.',
      'faq.q4': 'Which bookmakers do you recommend?',
      'faq.a4':
        'We exclusively recommend bookmakers licensed by ADM (formerly AAMS) for legal operation in Italy. Among the main ones: bet365, Snai, Sisal, Goldbet and Betflag. By signing up through our links you can get exclusive welcome bonuses.',
      'faq.q5': 'How much should I stake on each tip?',
      'faq.a5':
        'We recommend never exceeding 2-5% of your bankroll per single bet. VIP members receive personalized bankroll management advice based on their budget and risk profile.',

      // Footer
      'footer.desc':
        'Premium football predictions powered by AI. Proprietary algorithms, tactical analysis and real-time data to give you the edge that makes the difference.',
      'footer.nav': 'Navigation',
      'footer.nav.tips': "Today's Tips",
      'footer.nav.track': 'Track Record',
      'footer.nav.plans': 'Plans',
      'footer.nav.faq': 'FAQ',
      'footer.legal': 'Legal',
      'footer.legal.privacy': 'Privacy Policy',
      'footer.legal.terms': 'Terms of Service',
      'footer.legal.cookies': 'Cookie Policy',
      'footer.social': 'Follow Us',
      'footer.disclaimer':
        '<strong>Disclaimer:</strong> Gambling can be addictive. Please gamble responsibly. This site provides predictions and analysis for informational purposes only. We do not collect or manage bets. Restricted to users over 18. If you have a gambling problem, call 800-558822.',
      'footer.disclaimer2':
        'Bookmaker links on this site are affiliate links to operators with a valid ADM license.',
      'footer.copy': '\u00A9 2026 WinningBet. All rights reserved.',

      // Cookie banner
      'cookie.text':
        'We use technical cookies for the operation of the site. For more information see our',
      'cookie.link': 'Cookie Policy',
      'cookie.reject': 'Reject',
      'cookie.accept': 'Accept',

      // Day abbreviations
      days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
  };

  // ─── Core Functions ────────────────────────────────────────────────────────

  /**
   * Returns the current language code ('it' or 'en').
   * @returns {string}
   */
  function getLang() {
    const stored = localStorage.getItem('lang');
    return stored === 'EN' ? 'en' : 'it';
  }

  /**
   * Retrieves a translation by key for the current language.
   * Falls back to Italian if key is missing in the target language.
   * @param {string} key - Dot-notation key (e.g. "hero.cta")
   * @returns {string|Array} Translated string or the key itself if not found
   */
  function t(key) {
    const lang = getLang();
    return TRANSLATIONS[lang][key] || TRANSLATIONS['it'][key] || key;
  }

  /**
   * Applies translations to all elements with data-i18n or data-i18n-html attributes.
   * - data-i18n="key" → sets textContent
   * - data-i18n-html="key" → sets innerHTML (for keys containing HTML tags)
   */
  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (typeof val === 'string') el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      const key = el.getAttribute('data-i18n-html');
      const val = t(key);
      if (typeof val === 'string') el.innerHTML = val;
    });
  }

  // Expose globally for use by script.js
  window.t = t;
  window.applyTranslations = applyTranslations;
  window.getLang = getLang;
})();

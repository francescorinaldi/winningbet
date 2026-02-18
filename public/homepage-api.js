/* ============================================
   WinningBet — Homepage API Layer
   ============================================
   Data fetching, date formatters, DOM utilities.
   ============================================ */

/* exported fetchAPI, formatMatchDate, formatResultDate, createEl, setEmptyState */

(function () {
  'use strict';

  // ==========================================
  // API FETCHING
  // ==========================================

  /**
   * Wrapper generico per le chiamate alle API interne.
   * @param {string} endpoint - Nome dell'endpoint (es. "matches", "results")
   * @param {Object} params - Query parameters opzionali
   * @returns {Promise<*>} Dati JSON dalla risposta
   * @throws {Error} Se la risposta non e' ok (status != 2xx)
   */
  async function fetchAPI(endpoint, params) {
    let url = '/api/' + endpoint;
    if (params) {
      const qs = Object.entries(params)
        .map(function (pair) {
          return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1]);
        })
        .join('&');
      if (qs) url += '?' + qs;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API ${endpoint}: ${res.status}`);
    return res.json();
  }

  // ==========================================
  // DATE FORMATTERS
  // ==========================================

  /**
   * Formatta una data ISO in formato breve italiano per le partite.
   * Esempio: "2025-09-15T18:45:00Z" -> "Lun 18:45"
   * @param {string} isoDate - Data in formato ISO 8601
   * @returns {string} Data formattata (giorno abbreviato + ora)
   */
  function formatMatchDate(isoDate) {
    const d = new Date(isoDate);
    const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const day = days[d.getDay()];
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return day + ' ' + hours + ':' + mins;
  }

  /**
   * Formatta una data ISO in formato DD/MM per i risultati.
   * Esempio: "2025-09-15T18:45:00Z" -> "15/09"
   * @param {string} isoDate - Data in formato ISO 8601
   * @returns {string} Data formattata (giorno/mese)
   */
  function formatResultDate(isoDate) {
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return day + '/' + month;
  }

  // ==========================================
  // DOM UTILITIES
  // ==========================================

  /**
   * Utility per creare un elemento DOM con classe e contenuto opzionali.
   * @param {string} tag - Tag HTML (es. "div", "span")
   * @param {string|null} className - Classe CSS (null per nessuna)
   * @param {string|null} textContent - Contenuto testuale (null per vuoto)
   * @returns {HTMLElement} Elemento creato
   */
  function createEl(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== null && textContent !== undefined) el.textContent = textContent;
    return el;
  }

  /**
   * Mostra uno stato vuoto/errore in un container, sostituendo il contenuto.
   * @param {HTMLElement} container - Elemento contenitore
   * @param {string} className - Classe CSS per il messaggio
   * @param {string} message - Testo del messaggio
   */
  function setEmptyState(container, className, message) {
    container.textContent = '';
    container.appendChild(createEl('div', className, message));
  }

  // Expose to global scope
  window.fetchAPI = fetchAPI;
  window.formatMatchDate = formatMatchDate;
  window.formatResultDate = formatResultDate;
  window.createEl = createEl;
  window.setEmptyState = setEmptyState;
})();

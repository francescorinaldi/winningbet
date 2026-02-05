# WinningBet — Pronostici Serie A

Piattaforma premium di pronostici per la Serie A italiana. Offre tips giornalieri, statistiche avanzate e un track record verificato. Il frontend è costruito in vanilla JavaScript senza framework, con un backend serverless su Vercel che integra dati live da due provider calcistici.

## Indice

- [Tech Stack](#tech-stack)
- [Architettura del Progetto](#architettura-del-progetto)
- [Prerequisiti](#prerequisiti)
- [Setup Locale](#setup-locale)
- [Variabili d'Ambiente](#variabili-dambiente)
- [Comandi Disponibili](#comandi-disponibili)
- [API Endpoints](#api-endpoints)
- [Struttura del Frontend](#struttura-del-frontend)
- [Sistema di Cache](#sistema-di-cache)
- [Design System](#design-system)
- [Deploy su Vercel](#deploy-su-vercel)
- [Compliance e Disclaimer](#compliance-e-disclaimer)

---

## Tech Stack

| Layer            | Tecnologia                                                 |
| ---------------- | ---------------------------------------------------------- |
| **Frontend**     | HTML5, CSS3 (custom properties), Vanilla JavaScript (ES6+) |
| **Backend**      | Node.js, Vercel Serverless Functions                       |
| **API primaria** | [api-football.com](https://www.api-football.com/) v3       |
| **API fallback** | [football-data.org](https://www.football-data.org/) v4     |
| **Font**         | Space Grotesk (display), Inter (body) — via Google Fonts   |
| **Deploy**       | Vercel                                                     |
| **Linting**      | ESLint 9 (flat config)                                     |
| **Formatting**   | Prettier                                                   |

Nessuna dipendenza npm in produzione. Il progetto utilizza esclusivamente API del browser (Fetch, Canvas, Intersection Observer, DOM) e serverless functions Node.js native. Gli strumenti di sviluppo (ESLint, Prettier) sono installati come `devDependencies`.

---

## Architettura del Progetto

```
winningbet/
├── api/                          # Vercel Serverless Functions (Node.js)
│   ├── _lib/                     # Librerie condivise tra gli endpoint
│   │   ├── api-football.js       # Client API-Football (provider primario)
│   │   ├── football-data.js      # Client football-data.org (fallback)
│   │   └── cache.js              # Cache in-memory con TTL
│   ├── matches.js                # GET /api/matches — prossime partite
│   ├── odds.js                   # GET /api/odds — quote pre-match
│   ├── results.js                # GET /api/results — risultati recenti
│   └── standings.js              # GET /api/standings — classifica
├── public/                       # Frontend (file statici serviti da Vercel)
│   ├── index.html                # Pagina principale (single-page)
│   ├── script.js                 # Logica frontend (particelle, animazioni, fetch dati)
│   └── styles.css                # Tutti gli stili (CSS custom properties, responsive)
├── .env.example                  # Template variabili d'ambiente
├── .gitignore                    # File esclusi dal version control
├── .prettierrc                   # Configurazione Prettier
├── .prettierignore               # File esclusi da Prettier
├── eslint.config.mjs             # Configurazione ESLint (flat config)
├── CLAUDE.md                     # Guida progetto per Claude Code
├── package.json                  # Manifest del progetto
├── vercel.json                   # Configurazione deploy Vercel
└── README.md                     # Questo file
```

### Flusso dei dati

```
Browser (index.html + script.js)
    │
    ├── GET /api/matches  ──→ api-football.js ──→ api-sports.io
    │                         (fallback)       ──→ football-data.org
    │
    ├── GET /api/results  ──→ api-football.js ──→ api-sports.io
    │                         (fallback)       ──→ football-data.org
    │
    ├── GET /api/odds     ──→ api-football.js ──→ api-sports.io
    │                         (no fallback — solo api-football ha le quote)
    │
    └── GET /api/standings──→ api-football.js ──→ api-sports.io
                              (fallback)       ──→ football-data.org
```

Ogni endpoint utilizza **api-football.com come provider primario**. Se la chiamata fallisce, gli endpoint `matches`, `results` e `standings` ricadono automaticamente su **football-data.org** come fallback. L'endpoint `odds` non ha fallback perché football-data.org non fornisce quote.

---

## Prerequisiti

- **Node.js** >= 18.x
- **Vercel CLI** — installabile con `npm i -g vercel`
- **API Key** per [api-football.com](https://www.api-football.com/) (piano a pagamento)
- **API Token** per [football-data.org](https://www.football-data.org/) (piano free)

---

## Setup Locale

1. **Clona il repository**

   ```bash
   git clone <repo-url>
   cd winningbet
   ```

2. **Configura le variabili d'ambiente**

   ```bash
   cp .env.example .env
   ```

   Compila `.env` con le tue API key (vedi sezione [Variabili d'Ambiente](#variabili-dambiente)).

3. **Installa le dipendenze di sviluppo**

   ```bash
   npm install
   ```

4. **Avvia il server di sviluppo**

   ```bash
   npm run dev
   ```

   Vercel CLI avvierà il progetto su `http://localhost:3000` con le serverless functions attive.

---

## Variabili d'Ambiente

| Variabile           | Descrizione                                                                           | Obbligatoria |
| ------------------- | ------------------------------------------------------------------------------------- | :----------: |
| `API_FOOTBALL_KEY`  | API key per api-sports.io (api-football.com v3). Usata come header `x-apisports-key`. |      Si      |
| `FOOTBALL_DATA_KEY` | API token per football-data.org v4. Usata come header `X-Auth-Token`.                 |      Si      |

Per la configurazione, copia `.env.example` in `.env` e inserisci i valori.

Su Vercel, configura le variabili nella dashboard del progetto sotto **Settings > Environment Variables**.

---

## Comandi Disponibili

| Comando                | Descrizione                                       |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Avvia il server di sviluppo Vercel (`vercel dev`) |
| `npm run start`        | Alias di `npm run dev`                            |
| `npm run build`        | Nessun build step (sito statico)                  |
| `npm run lint`         | Esegue ESLint su tutto il progetto                |
| `npm run lint:fix`     | Esegue ESLint con auto-fix                        |
| `npm run format`       | Formatta tutti i file con Prettier                |
| `npm run format:check` | Verifica la formattazione senza modificare        |

---

## API Endpoints

Tutti gli endpoint sono serverless functions Vercel sotto `/api/`. Accettano solo richieste `GET`.

### `GET /api/matches`

Restituisce le prossime 10 partite di Serie A.

**Cache:** 2 ore (TTL in-memory) + header `s-maxage=7200, stale-while-revalidate=3600`

**Risposta (200):**

```json
[
  {
    "id": 1035456,
    "date": "2025-09-15T18:45:00+00:00",
    "status": "NS",
    "home": "Juventus",
    "homeLogo": "https://media.api-sports.io/football/teams/496.png",
    "away": "AC Milan",
    "awayLogo": "https://media.api-sports.io/football/teams/489.png",
    "goalsHome": null,
    "goalsAway": null
  }
]
```

| Campo       | Tipo           | Descrizione                                              |
| ----------- | -------------- | -------------------------------------------------------- |
| `id`        | `number`       | ID univoco della partita                                 |
| `date`      | `string`       | Data/ora in formato ISO 8601                             |
| `status`    | `string`       | Stato breve (`NS` = not started, `FT` = full time, ecc.) |
| `home`      | `string`       | Nome squadra di casa                                     |
| `homeLogo`  | `string`       | URL logo squadra di casa                                 |
| `away`      | `string`       | Nome squadra ospite                                      |
| `awayLogo`  | `string`       | URL logo squadra ospite                                  |
| `goalsHome` | `number\|null` | Gol squadra di casa (`null` se non iniziata)             |
| `goalsAway` | `number\|null` | Gol squadra ospite (`null` se non iniziata)              |

**Fallback:** Se api-football.com non risponde, usa football-data.org.

---

### `GET /api/results`

Restituisce gli ultimi 10 risultati di Serie A.

**Cache:** 1 ora (TTL in-memory) + header `s-maxage=3600, stale-while-revalidate=1800`

**Risposta (200):** Stesso formato di `/api/matches`, con `goalsHome` e `goalsAway` valorizzati e `status: "FT"`.

**Fallback:** Se api-football.com non risponde, usa football-data.org.

---

### `GET /api/odds?fixture={id}`

Restituisce le quote Match Winner (1X2) per una partita specifica.

**Parametri query:**

| Parametro | Tipo     | Descrizione                          | Obbligatorio |
| --------- | -------- | ------------------------------------ | :----------: |
| `fixture` | `number` | ID della partita (da `/api/matches`) |      Si      |

**Cache:** 30 minuti (TTL in-memory) + header `s-maxage=1800, stale-while-revalidate=900`

**Risposta (200):**

```json
{
  "fixtureId": "1035456",
  "bookmaker": "Bet365",
  "values": [
    { "outcome": "Home", "odd": "2.10" },
    { "outcome": "Draw", "odd": "3.40" },
    { "outcome": "Away", "odd": "3.50" }
  ]
}
```

| Campo              | Tipo     | Descrizione                         |
| ------------------ | -------- | ----------------------------------- |
| `fixtureId`        | `string` | ID della partita                    |
| `bookmaker`        | `string` | Nome del bookmaker (Bet365)         |
| `values`           | `array`  | Array di outcome con relative quote |
| `values[].outcome` | `string` | Esito: `"Home"`, `"Draw"`, `"Away"` |
| `values[].odd`     | `string` | Quota decimale                      |

Restituisce `null` se non ci sono quote disponibili per la partita.

**Nessun fallback** — solo api-football.com fornisce quote.

---

### `GET /api/standings`

Restituisce la classifica completa della Serie A.

**Cache:** 6 ore (TTL in-memory) + header `s-maxage=21600, stale-while-revalidate=3600`

**Risposta (200):**

```json
[
  {
    "rank": 1,
    "name": "Inter",
    "logo": "https://media.api-sports.io/football/teams/505.png",
    "points": 84,
    "played": 34,
    "win": 26,
    "draw": 6,
    "lose": 2,
    "goalsFor": 78,
    "goalsAgainst": 25,
    "goalDiff": 53,
    "form": "WWDWW"
  }
]
```

| Campo          | Tipo     | Descrizione                                           |
| -------------- | -------- | ----------------------------------------------------- |
| `rank`         | `number` | Posizione in classifica                               |
| `name`         | `string` | Nome squadra                                          |
| `logo`         | `string` | URL logo squadra                                      |
| `points`       | `number` | Punti totali                                          |
| `played`       | `number` | Partite giocate                                       |
| `win`          | `number` | Vittorie                                              |
| `draw`         | `number` | Pareggi                                               |
| `lose`         | `number` | Sconfitte                                             |
| `goalsFor`     | `number` | Gol fatti                                             |
| `goalsAgainst` | `number` | Gol subiti                                            |
| `goalDiff`     | `number` | Differenza reti                                       |
| `form`         | `string` | Forma recente (ultimi 5: `W`=win, `D`=draw, `L`=loss) |

**Fallback:** Se api-football.com non risponde, usa football-data.org.

---

### Risposte di errore

Tutti gli endpoint restituiscono errori in formato JSON:

| Codice | Descrizione                                       |
| ------ | ------------------------------------------------- |
| `400`  | Parametri mancanti o non validi                   |
| `405`  | Metodo HTTP non consentito (solo `GET` accettato) |
| `502`  | Impossibile raggiungere i provider dati           |

```json
{ "error": "Descrizione dell'errore" }
```

---

## Struttura del Frontend

Il frontend è una single-page application vanilla (nessun framework) contenuta in tre file:

### `index.html`

Markup semantico HTML5 con le seguenti sezioni, in ordine:

1. **Particle Canvas** — sfondo animato con particelle e connessioni
2. **Navbar** — navigazione sticky con hamburger menu su mobile
3. **Hero** — headline, statistiche animate, CTA
4. **Live Matches Bar** — scroll orizzontale delle prossime partite (dati da API)
5. **Tips Section** — pronostici del giorno con filtri per tier (Free/Pro/VIP)
6. **Track Record** — stat card, grafico performance mensile, ultimi risultati
7. **Pricing** — 3 piani di abbonamento (Free, Pro, VIP)
8. **Telegram CTA** — invito al canale Telegram
9. **FAQ** — accordion con domande frequenti
10. **Footer** — link, disclaimer legali, badge 18+/ADM

### `script.js`

IIFE (Immediately Invoked Function Expression) con `'use strict'`. Moduli logici:

| Modulo                | Responsabilita                                                                          |
| --------------------- | --------------------------------------------------------------------------------------- |
| **Particle System**   | Canvas 2D con particelle animate e linee di connessione tra particelle vicine           |
| **Navbar Scroll**     | Aggiunge classe `.scrolled` alla navbar dopo 60px di scroll                             |
| **Mobile Menu**       | Toggle hamburger menu con blocco scroll del body                                        |
| **Counter Animation** | Animazione numerica (0 → target) con easing cubico, triggerata da Intersection Observer |
| **Scroll Reveal**     | Animazioni fade-in/slide-up al primo scroll nelle viewport (Intersection Observer)      |
| **Tips Filter**       | Filtraggio carte pronostici per tier (All/Free/Pro/VIP)                                 |
| **FAQ Accordion**     | Expand/collapse con mutua esclusione                                                    |
| **Smooth Scroll**     | Navigazione fluida per link ancora con offset navbar                                    |
| **Stagger Reveal**    | Delay incrementale per animazioni grid                                                  |
| **API Fetching**      | Fetch dati da `/api/matches`, `/api/results`, rendering dinamico nel DOM                |

### `styles.css`

Fogli di stile con CSS custom properties (variabili). Approccio mobile-first con 3 breakpoint:

| Breakpoint  | Target                                           |
| ----------- | ------------------------------------------------ |
| `<= 1024px` | Tablet — pricing e stats in colonna              |
| `<= 768px`  | Mobile — menu hamburger, layout single-column    |
| `<= 480px`  | Small mobile — stats verticali, footer compresso |

---

## Sistema di Cache

Il progetto implementa caching a due livelli:

### Backend (in-memory)

File: `api/_lib/cache.js` — cache basata su `Map` con TTL per ogni chiave.

| Endpoint         | TTL               |
| ---------------- | ----------------- |
| `/api/matches`   | 2 ore (7200s)     |
| `/api/results`   | 1 ora (3600s)     |
| `/api/odds`      | 30 minuti (1800s) |
| `/api/standings` | 6 ore (21600s)    |

La cache sopravvive tra invocazioni "warm" della stessa istanza Vercel. Viene persa al cold start.

### CDN (Vercel Edge)

Header `Cache-Control` con `s-maxage` e `stale-while-revalidate` configurati sia negli handler che in `vercel.json` (default 30 minuti per tutti gli endpoint API).

---

## Design System

### Palette Colori

| Variabile CSS      | Valore    | Uso                                  |
| ------------------ | --------- | ------------------------------------ |
| `--bg-primary`     | `#0a0a0f` | Sfondo principale                    |
| `--bg-secondary`   | `#12121a` | Sfondo sezioni alternate             |
| `--bg-card`        | `#16161f` | Sfondo card                          |
| `--gold`           | `#d4a853` | Accento primario, CTA, quote         |
| `--gold-light`     | `#f0d078` | Gradienti gold                       |
| `--gold-dark`      | `#a67c2e` | Gradienti gold                       |
| `--red`            | `#e74c3c` | Alert, sconfitte, live dot           |
| `--green`          | `#2ecc71` | Vittorie, confidence bar, badge live |
| `--text-primary`   | `#f0f0f5` | Testo principale                     |
| `--text-secondary` | `#8a8a9a` | Testo secondario                     |
| `--text-muted`     | `#55556a` | Testo terziario, label               |
| `--telegram`       | `#229ED9` | Colore brand Telegram                |

### Tipografia

| Font          | Variabile        | Uso                        |
| ------------- | ---------------- | -------------------------- |
| Space Grotesk | `--font-display` | Titoli, badge, numeri, nav |
| Inter         | `--font-body`    | Corpo testo, paragrafi     |

### Spacing & Radius

| Variabile     | Valore | Uso                         |
| ------------- | ------ | --------------------------- |
| `--radius-sm` | `8px`  | Button, input, badge        |
| `--radius-md` | `12px` | Card piccole, FAQ item      |
| `--radius-lg` | `20px` | Tip card, stat card         |
| `--radius-xl` | `28px` | Pricing card, telegram card |

---

## Deploy su Vercel

1. Collega il repository a Vercel dalla dashboard
2. Configura le variabili d'ambiente (`API_FOOTBALL_KEY`, `FOOTBALL_DATA_KEY`)
3. Vercel rileva automaticamente la configurazione da `vercel.json`:
   - `outputDirectory: "public"` — serve i file statici
   - Le functions in `api/` vengono deployate come serverless functions
4. Ogni push su `main` triggera un deploy automatico

### Header di Sicurezza (via `vercel.json`)

| Header                   | Valore    | Scopo                            |
| ------------------------ | --------- | -------------------------------- |
| `X-Content-Type-Options` | `nosniff` | Previene MIME type sniffing      |
| `X-Frame-Options`        | `DENY`    | Previene clickjacking via iframe |

---

## Compliance e Disclaimer

Il sito include i seguenti elementi di compliance per il mercato italiano del gioco d'azzardo:

- **Badge 18+** nel footer — vietato ai minori
- **Riferimento ADM** (Agenzia delle Dogane e dei Monopoli)
- **Disclaimer gambling responsabile** con numero verde antiludopatia `800-558822`
- **Dichiarazione link affiliazione** — trasparenza sui link ai bookmaker con licenza ADM
- **FAQ** con risposta esplicita sui rischi delle scommesse

> **Importante:** Questo sito fornisce solo pronostici e analisi a scopo informativo. Non raccoglie ne gestisce scommesse.

# WinningBet — Business Plan & Market Analysis

> Documento interno — Febbraio 2026

---

## 1. Executive Summary

**WinningBet** è una piattaforma SaaS di pronostici calcistici premium, basata su un motore predittivo AI che analizza dati statistici reali (API Football, Football-Data.org) per generare tips ad alto valore atteso (EV ≥ +8%) sui principali campionati europei.

Il modello è **B2C subscription** con tre tier (Free / PRO / VIP), progettato per monetizzare l'enorme bacino di scommettitori sportivi italiani che cercano un vantaggio informativo rispetto ai bookmaker.

**Differenziatori chiave:**
- Motore predittivo AI con track record pubblico e verificabile (nessun concorrente lo mostra)
- Algoritmo con quality gate rigorosi: EV minimo +8%, edge minimo +8pp sul bookmaker
- Copertura 7 campionati: Serie A, Champions League, La Liga, Premier League, Ligue 1, Bundesliga, Eredivisie
- Market Waterfall: l'engine esplora 14 mercati per partita per trovare il tip a valore più alto
- Injury Intelligence: impatto automatico degli infortuni sui xGoals
- Nessuna affiliazione bookmaker — indipendenza totale

---

## 2. Problema e Soluzione

### Il problema

Il mercato dei pronostici calcistici italiano è dominato da:
- **Tipster anonimi** sui social senza track record verificabile
- **Siti di pronostici** che usano dati non aggiornati o analisi superficiali
- **Telegram gratuiti** con qualità inconsistente e zero accountability
- **Nessuno** che mostri pubblicamente l'EV dei propri tips o il tasso di errore per tipo di scommessa

Gli scommettitori seri non hanno uno strumento premium e trasparente.

### La soluzione

WinningBet risolve 3 problemi contemporaneamente:

| Problema | Soluzione WinningBet |
|----------|---------------------|
| Nessun track record trasparente | Track record pubblico con accuracy per tipo di pronostico, per campionato, per fascia di confidenza |
| Analisi qualitativa senza dati | Motore quantitativo: Poisson, xGoals, ELO-lite, infortuni, H2H, meteo, arbitro |
| Tips generici uguali per tutti | Tiers differenziati (Free / PRO / VIP) con livello di esclusività crescente |

---

## 3. Mercato di Riferimento

### 3.1 Mercato italiano delle scommesse sportive

| Indicatore | Valore | Fonte |
|-----------|--------|-------|
| Raccolta totale scommesse sportive online IT (2024) | ~€20 miliardi | ADM |
| Utenti attivi scommettitori online IT (2024) | ~3,5 milioni | ADM/AGIPRO |
| Crescita CAGR mercato online IT (2020-2024) | +12% | Datamonitor |
| % scommettitori che usa pronostici terzi | ~35% (stima) | Survey AGIPRO |
| Scommettitori "regular" (≥1 volta/settimana) | ~800.000 | Stima |

### 3.2 Target Addressable Market (TAM/SAM/SOM)

```
TAM — Tutti gli scommettitori sportivi online IT:         3.500.000 persone
SAM — Scommettitori che cercano pronostici premium:         700.000 persone
SOM — Raggiungibili con GTM attuale (anno 1-2):              35.000 persone
```

**Ragionamento SAM → SOM:**
- Marketing organico Telegram + SEO + community anno 1
- Conversione da free a paid stimata al 5% (industry standard: 2-8%)
- Target: 35.000 utenti → 1.750 paganti (5% conversion)

### 3.3 Revenue potential (anno 1-2)

Scenario **conservativo** (1% conversion su 35k utenti free):

| Tier | Utenti paganti | Prezzo | MRR |
|------|---------------|--------|-----|
| PRO | 250 | €9.99/mo | €2.497 |
| VIP | 100 | €29.99/mo | €2.999 |
| **Totale** | **350** | — | **€5.496/mo** |

**ARR conservativo: ~€65.000**

Scenario **base** (5% conversion su 35k):

| Tier | Utenti paganti | Prezzo | MRR |
|------|---------------|--------|-----|
| PRO | 1.000 | €9.99/mo | €9.990 |
| VIP | 350 | €29.99/mo | €10.497 |
| **Totale** | **1.350** | — | **€20.487/mo** |

**ARR base: ~€245.000**

Scenario **ottimistico** (10% conversion su 50k):

| Tier | Utenti paganti | MRR |
|------|---------------|-----|
| PRO | 3.000 | €29.970 |
| VIP | 1.000 | €29.990 |
| **Totale** | **4.000** | **€59.960/mo** |

**ARR ottimistico: ~€720.000**

---

## 4. Modello di Business

### 4.1 Tier e Pricing

| Tier | Prezzo | Contenuto |
|------|--------|-----------|
| **Free** | €0 | Tips base (campionati principali), track record pubblico |
| **PRO** | €9.99/mo | Tutti i tips giornalieri, analisi dettagliate, schedine settimanali, notifiche email |
| **VIP** | €29.99/mo | Tutto PRO + tips esclusivi ad alto EV, canale Telegram privato, supporto prioritario |

### 4.2 Canali di acquisizione

1. **Telegram organico** — canale pubblico gratuito con free tips come lead magnet
2. **SEO** — contenuti sul track record, analisi post-partita, statistiche campionati
3. **Partner centro scommesse** — distribuzione fisica/digitale a clienti del betting center (canale esistente)
4. **Social** — X (Twitter), Instagram Stories con tip del giorno
5. **Referral** — programma invita-un-amico (sconto 1 mese)

### 4.3 Unit Economics (scenario base)

| Metrica | Valore |
|---------|--------|
| CAC (costo acquisizione cliente) | ~€8-15 (organico/referral) |
| LTV PRO (churn 15%/mo) | ~€67 |
| LTV VIP (churn 10%/mo) | ~€300 |
| LTV/CAC ratio PRO | ~5-8x |
| LTV/CAC ratio VIP | ~20-37x |
| Payback period | < 2 mesi |

### 4.4 Struttura costi (mensile, a regime)

| Voce | Costo/mese |
|------|-----------|
| Hosting Vercel (Pro plan) | €20 |
| Supabase (Pro plan) | €25 |
| API Football (quota mensile) | €30 |
| Stripe fees (2.9% + €0.25/tx) | variabile (~3% su revenue) |
| SMTP / Email | €0 (own domain) |
| Dominio + SSL | €5/mo ammortizzato |
| **Totale fisso** | **~€80/mese** |

**Margine lordo a 350 utenti paganti: >98%** (SaaS puro, costi fissi quasi nulli)

---

## 5. Panorama Competitivo

### 5.1 Competitor diretti

| Competitor | Tipo | Punti deboli |
|-----------|------|-------------|
| Betegy | Internazionale, algoritmo | Nessun focus Italia, UI complicata |
| Forebet | Statistico puro | Nessun EV, no analisi qualitativa |
| Betfair Trading Community | Community | Non strutturato, qualità inconsistente |
| Tipster Telegram (vari) | Manuale | Nessun track record, nessuna accountability |
| Serie A Pro Tips (vari) | Generalista | Copertura solo 1 campionato |

### 5.2 Vantaggi competitivi WinningBet

1. **Track record pubblico e verificabile** — nessun concorrente nel mercato italiano lo fa
2. **Engine quantitativo** — Poisson + ELO + xGoals + Injury Intelligence + Market Waterfall
3. **Multi-campionato** (7) — vs concorrenti single-league
4. **Quality gate automatici** — EV minimo +8%, edge minimo +8pp — no tip "safe" a basso valore
5. **Nessuna affiliazione bookmaker** — no bias, indipendenza totale garantita
6. **Trasparenza sugli errori** — sistema di retrospettive automatiche su ogni tip errato
7. **Integrazione partner fisici** — differenziazione unica via centri scommesse

---

## 6. Go-to-Market Strategy

### Fase 1: Lancio MVP (Marzo 2026)
- Target: 500 utenti free, 25 paganti in 30 giorni
- Tattiche: canale Telegram pubblico, 1 post/giorno su X con tip del giorno, SEO long-tail
- KPI: tasso di apertura Telegram >40%, conversion free→paid >3%

### Fase 2: Traction (Aprile–Giugno 2026)
- Target: 5.000 utenti free, 250 paganti
- Tattiche: partnership con 2-3 centri scommesse (distribuzione fisica), contenuti SEO sui campionati, referral program
- KPI: MRR €2.500+, churn <15%/mese

### Fase 3: Crescita (H2 2026)
- Target: 20.000 utenti free, 1.000 paganti
- Tattiche: ads social a bassa spesa (€200-500/mo test), espansione contenuti multi-lingua (EN)
- KPI: MRR €10.000+, LTV/CAC >10x

---

## 7. Stack Tecnologico

| Layer | Tecnologia | Costo |
|-------|-----------|-------|
| Frontend | HTML/CSS/Vanilla JS | €0 |
| Backend | Vercel Serverless (Node.js) | €20/mo |
| Database | Supabase (PostgreSQL + Auth + RLS) | €25/mo |
| AI Engine | Claude Code (Anthropic) — locale | variabile |
| Pagamenti | Stripe | 2.9%+€0.25/tx |
| Notifiche | Telegram Bot API | €0 |
| Email | SMTP custom (Nodemailer) | €0-5/mo |
| Dati calcio | API Football + Football-Data.org | €30/mo |

**Total tech cost: ~€80/mese fissi** — margini altissimi rispetto a qualsiasi competitor che usa infrastrutture più pesanti.

---

## 8. Roadmap Prodotto

### Q1 2026 (completato/in corso)
- ✅ Engine predittivo AI con track record
- ✅ Stripe subscriptions (Free/PRO/VIP)
- ✅ Telegram bot (canale pubblico + privato)
- ✅ Market Waterfall (14 mercati per partita)
- ✅ Injury Intelligence (impatto infortuni su xGoals)
- 🔄 UX Wave 3 (in corso — Francesco)
- 🔄 DNS + SMTP custom (bloccato su acquisto dominio)

### Q2 2026
- [ ] Free trial 7 giorni per nuovi utenti (#154)
- [ ] Email marketing automatico (onboarding, weekly recap)
- [ ] Dashboard analytics per utenti (ROI personale tracciato)
- [ ] App mobile (PWA ottimizzata)

### Q3 2026
- [ ] Expansion: Serie B + coppe nazionali
- [ ] API pubblica per partner (white-label B2B)
- [ ] Community features (discussione pronostici)

---

## 9. Team

| Ruolo | Persona | Responsabilità |
|-------|---------|----------------|
| Product + Engine + Data | Selen | Architettura sistema, engine predittivo, deployment |
| Frontend + UX + Dev | Francesco Rinaldi | UI/UX, accessibility, Wave feature delivery |

---

## 10. Opportunità Partnership — Centro Scommesse

Il proprietario di un centro scommesse affiliato ha espresso interesse nella piattaforma. Modelli di partnership possibili:

### Opzione A: White-Label B2B
- WinningBet fornisce tips al centro scommesse con branding personalizzato
- Pricing: €299/mese per licenza B2B (illimitati utenti nel centro)
- Vantaggio: ricavo B2B aggiuntivo, distribuzione fisica gratuita

### Opzione B: Revenue Share
- Il centro promuove WinningBet ai propri clienti
- WinningBet condivide 20% della revenue dagli utenti acquisiti via il centro
- Vantaggio: CAC quasi zero per nuovi utenti

### Opzione C: Investimento
- Il titolare del centro investe nella piattaforma come socio
- Vantaggio: runway finanziario per accelerare marketing e sviluppo

**Raccomandazione**: iniziare con Opzione B (zero rischio, zero investimento), poi valutare A o C in base ai risultati.

---

## 11. Rischi e Mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Accuracy engine <60% | Media | Alto | Quality gate rigorosi, retrospettive automatiche, max confidence 80% |
| Churn alto per scarsi risultati | Media | Alto | Track record trasparente crea aspettative realistiche |
| Regolatorio (ADM) | Bassa | Alto | Non siamo un bookmaker, ma un servizio informativo — esente da licenza ADM |
| Concorrenza grossa player | Bassa | Media | Focus su nichia Italian market + trasparenza track record come moat |
| API Football outage | Media | Bassa | Fallback a Football-Data.org già implementato |
| Stripe ban (gambling) | Bassa | Alto | Siamo un servizio "informativo" non di gioco — categorizzazione corretta necessaria |

---

## Appendice — Dati di Settore

- **Mercato italiano scommesse sportive online 2024**: ~€20 miliardi di raccolta (ADM)
- **Giocatori attivi online IT**: 3,5 milioni (+8% YoY)
- **Media spesa per scommettitore attivo**: ~€5.700/anno
- **Penetrazione mobile**: 78% delle scommesse da mobile
- **Fascia d'età principale**: 25-44 anni (62% degli scommettitori attivi)
- **Calcio come sport scommesso**: 54% del totale scommesse sportive

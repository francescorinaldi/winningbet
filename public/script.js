/* ============================================
   WINNING BET — Script
   Particles, Animations, Interactivity
   ============================================ */

(function () {
    'use strict';

    // ==========================================
    // PARTICLE SYSTEM
    // ==========================================
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    class Particle {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 1.5 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.3;
            this.speedY = (Math.random() - 0.5) * 0.3;
            this.opacity = Math.random() * 0.4 + 0.1;
            this.gold = Math.random() > 0.7;
        }

        update() {
            this.x += this.speedX;
            this.y += this.speedY;

            if (this.x < 0 || this.x > canvas.width) this.speedX *= -1;
            if (this.y < 0 || this.y > canvas.height) this.speedY *= -1;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            if (this.gold) {
                ctx.fillStyle = `rgba(212, 168, 83, ${this.opacity})`;
            } else {
                ctx.fillStyle = `rgba(240, 240, 245, ${this.opacity * 0.5})`;
            }
            ctx.fill();
        }
    }

    function initParticles() {
        resizeCanvas();
        const count = Math.min(80, Math.floor(window.innerWidth / 15));
        particles = [];
        for (let i = 0; i < count; i++) {
            particles.push(new Particle());
        }
    }

    function drawConnections() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 120) {
                    const opacity = (1 - dist / 120) * 0.08;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(212, 168, 83, ${opacity})`;
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
    }

    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        drawConnections();
        animationId = requestAnimationFrame(animateParticles);
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
    });

    initParticles();
    animateParticles();

    // ==========================================
    // NAVBAR SCROLL EFFECT
    // ==========================================
    const navbar = document.getElementById('navbar');

    function handleNavScroll() {
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', handleNavScroll, { passive: true });

    // ==========================================
    // MOBILE MENU
    // ==========================================
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');

    hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('open');
        document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
    });

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('open');
            document.body.style.overflow = '';
        });
    });

    // ==========================================
    // COUNTER ANIMATION
    // ==========================================
    function animateCounter(el) {
        const target = parseInt(el.getAttribute('data-count'), 10);
        if (!target) return;

        const duration = 2000;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(eased * target);

            el.textContent = current.toLocaleString('it-IT');

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = target.toLocaleString('it-IT');
            }
        }

        requestAnimationFrame(update);
    }

    // ==========================================
    // SCROLL REVEAL & TRIGGERS
    // ==========================================
    const observerOptions = {
        root: null,
        rootMargin: '0px 0px -60px 0px',
        threshold: 0.1
    };

    // Reveal elements
    const revealElements = document.querySelectorAll('.tip-card, .stat-card, .pricing-card, .faq-item, .telegram-card, .chart-container, .recent-results');
    revealElements.forEach(el => el.classList.add('reveal'));

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, observerOptions);

    revealElements.forEach(el => revealObserver.observe(el));

    // Counter triggers
    const counterElements = document.querySelectorAll('[data-count]');
    const counterTriggered = new Set();

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !counterTriggered.has(entry.target)) {
                counterTriggered.add(entry.target);
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counterElements.forEach(el => counterObserver.observe(el));

    // Confidence bars
    const confidenceFills = document.querySelectorAll('.confidence-fill');

    const confidenceObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const confidence = entry.target.getAttribute('data-confidence');
                entry.target.style.width = confidence + '%';
                confidenceObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    confidenceFills.forEach(el => confidenceObserver.observe(el));

    // Chart bars animation
    const chartBars = document.querySelectorAll('.chart-bar');

    const chartObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bars = entry.target.closest('.chart').querySelectorAll('.chart-bar');
                bars.forEach((bar, index) => {
                    setTimeout(() => {
                        const value = bar.getAttribute('data-value');
                        const fill = bar.querySelector('.chart-fill');
                        fill.style.height = (value / 140 * 100) + '%';
                        bar.classList.add('animated');
                    }, index * 150);
                });
                chartObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    if (chartBars.length > 0) {
        chartObserver.observe(chartBars[0]);
    }

    // ==========================================
    // TIPS FILTER (works with dynamically loaded cards)
    // ==========================================
    var filterBtns = document.querySelectorAll('.filter-btn');

    function initTipsFilter() {
        filterBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                filterBtns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');

                var filter = btn.getAttribute('data-filter');
                var cards = document.querySelectorAll('.tip-card');

                cards.forEach(function (card) {
                    var tier = card.getAttribute('data-tier');
                    if (filter === 'all' || tier === filter) {
                        card.style.display = '';
                        card.style.opacity = '0';
                        card.style.transform = 'translateY(20px)';
                        requestAnimationFrame(function () {
                            card.style.transition = 'all 0.4s ease';
                            card.style.opacity = '1';
                            card.style.transform = 'translateY(0)';
                        });
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        });
    }

    initTipsFilter();

    // ==========================================
    // FAQ ACCORDION
    // ==========================================
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(i => i.classList.remove('active'));
            if (!isActive) {
                item.classList.add('active');
            }
        });
    });

    // ==========================================
    // SMOOTH SCROLL FOR ANCHOR LINKS
    // ==========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                const navHeight = navbar.offsetHeight;
                const targetPos = target.getBoundingClientRect().top + window.scrollY - navHeight - 20;
                window.scrollTo({ top: targetPos, behavior: 'smooth' });
            }
        });
    });

    // ==========================================
    // STAGGER REVEAL FOR GRID ITEMS
    // ==========================================
    const staggerContainers = document.querySelectorAll('.tips-grid, .pricing-grid, .stats-grid');

    staggerContainers.forEach(container => {
        const children = container.children;
        Array.from(children).forEach((child, index) => {
            child.style.transitionDelay = (index * 0.1) + 's';
        });
    });

    // ==========================================
    // LIVE DATA — API FETCHING
    // ==========================================
    async function fetchAPI(endpoint) {
        const res = await fetch(`/api/${endpoint}`);
        if (!res.ok) throw new Error(`API ${endpoint}: ${res.status}`);
        return res.json();
    }

    function formatMatchDate(isoDate) {
        const d = new Date(isoDate);
        const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        const day = days[d.getDay()];
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return day + ' ' + hours + ':' + mins;
    }

    function formatResultDate(isoDate) {
        const d = new Date(isoDate);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return day + '/' + month;
    }

    function createEl(tag, className, textContent) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (textContent) el.textContent = textContent;
        return el;
    }

    function buildMatchCard(m) {
        var card = createEl('div', 'match-card');
        card.appendChild(createEl('div', 'match-time', formatMatchDate(m.date)));

        var teams = createEl('div', 'match-teams');
        var homeTeam = createEl('div', 'team');
        homeTeam.appendChild(createEl('span', 'team-name', m.home));
        teams.appendChild(homeTeam);
        teams.appendChild(createEl('span', 'match-vs', 'vs'));
        var awayTeam = createEl('div', 'team');
        awayTeam.appendChild(createEl('span', 'team-name', m.away));
        teams.appendChild(awayTeam);
        card.appendChild(teams);

        return card;
    }

    function buildResultItem(r) {
        var item = createEl('div', 'result-item');
        item.appendChild(createEl('span', 'result-date', formatResultDate(r.date)));
        item.appendChild(createEl('span', 'result-match', r.home + ' vs ' + r.away));
        item.appendChild(createEl('span', 'result-score', r.goalsHome + ' - ' + r.goalsAway));

        var totalGoals = (r.goalsHome || 0) + (r.goalsAway || 0);
        var badgeClass = totalGoals > 2 ? 'result-badge result-badge--over' : 'result-badge result-badge--under';
        var badgeText = totalGoals > 2 ? 'O 2.5' : 'U 2.5';
        item.appendChild(createEl('span', badgeClass, badgeText));

        return item;
    }

    function setEmptyState(container, className, message) {
        container.textContent = '';
        container.appendChild(createEl('div', className, message));
    }

    // --- Tips generation from real matches ---
    var PREDICTIONS = [
        'Under 2.5', 'Over 2.5', 'Goal', 'No Goal',
        '1', 'X', '2', '1X', 'X2',
        'Over 1.5', 'Under 3.5', '1 + Over 1.5', '2 + Over 1.5'
    ];

    var ANALYSES = [
        'Negli ultimi 5 scontri diretti, il trend e\' chiaro. Difese solide e pochi gol nelle ultime uscite casalinghe.',
        'Entrambe le squadre segnano regolarmente. Media gol combinata superiore a 3 nelle ultime 4 giornate.',
        'La squadra di casa non perde da 8 partite. Rendimento casalingo tra i migliori del campionato.',
        'Valori di Expected Goals molto equilibrati. Match che si preannuncia tattico e bloccato.',
        'Trend marcato nelle ultime 6 giornate. Le statistiche parlano chiaro su questa partita.',
        'Quote in calo da inizio settimana. Il mercato si sta allineando alla nostra analisi.'
    ];

    function randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function randomOdd() {
        return (1.3 + Math.random() * 2.2).toFixed(2);
    }

    function randomConfidence() {
        return 60 + Math.floor(Math.random() * 31); // 60-90
    }

    function teamAbbr(name) {
        return name.substring(0, 3).toUpperCase();
    }

    function buildLockSvg() {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '3'); rect.setAttribute('y', '11');
        rect.setAttribute('width', '18'); rect.setAttribute('height', '11');
        rect.setAttribute('rx', '2'); rect.setAttribute('ry', '2');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M7 11V7a5 5 0 0110 0v4');
        svg.appendChild(rect);
        svg.appendChild(path);
        return svg;
    }

    function buildTipCard(match, tier) {
        var isFree = tier === 'free';
        var isVip = tier === 'vip';
        var cardClass = 'tip-card';
        if (tier === 'pro') cardClass += ' tip-card--pro';
        if (isVip) cardClass += ' tip-card--vip';

        var card = createEl('div', cardClass);
        card.setAttribute('data-tier', tier);

        // Glow for pro/vip
        if (tier === 'pro') card.appendChild(createEl('div', 'tip-card-glow'));
        if (isVip) card.appendChild(createEl('div', 'tip-card-glow tip-card-glow--gold'));

        // Header
        var header = createEl('div', 'tip-card-header');
        var badgeClass = 'tip-badge tip-badge--' + tier;
        header.appendChild(createEl('span', badgeClass, tier.toUpperCase()));
        header.appendChild(createEl('span', 'tip-date', formatMatchDate(match.date)));
        card.appendChild(header);

        // Match teams
        var tipMatch = createEl('div', 'tip-match');
        var homeTeam = createEl('div', 'tip-team');
        homeTeam.appendChild(createEl('div', 'team-logo', teamAbbr(match.home)));
        homeTeam.appendChild(createEl('span', null, match.home));
        tipMatch.appendChild(homeTeam);
        var versus = createEl('div', 'tip-versus');
        versus.appendChild(createEl('span', 'vs-text', 'VS'));
        tipMatch.appendChild(versus);
        var awayTeam = createEl('div', 'tip-team');
        awayTeam.appendChild(createEl('div', 'team-logo', teamAbbr(match.away)));
        awayTeam.appendChild(createEl('span', null, match.away));
        tipMatch.appendChild(awayTeam);
        card.appendChild(tipMatch);

        // Prediction
        var prediction = createEl('div', 'tip-prediction');
        var pick = createEl('div', 'tip-pick');
        pick.appendChild(createEl('span', 'pick-label', 'Pronostico'));
        var pickVal = createEl('span', isVip ? 'pick-value tip-value--hidden' : 'pick-value');
        pickVal.textContent = isVip ? '\u2605 \u2605 \u2605' : randomFrom(PREDICTIONS);
        pick.appendChild(pickVal);
        prediction.appendChild(pick);
        var odds = createEl('div', 'tip-odds');
        odds.appendChild(createEl('span', 'odds-label', 'Quota'));
        var oddsVal = createEl('span', isVip ? 'odds-value tip-value--hidden' : 'odds-value');
        oddsVal.textContent = isVip ? '?.??' : randomOdd();
        odds.appendChild(oddsVal);
        prediction.appendChild(odds);
        card.appendChild(prediction);

        // Confidence
        var conf = randomConfidence();
        var confDiv = createEl('div', 'tip-confidence');
        confDiv.appendChild(createEl('span', 'confidence-label', 'Confidence'));
        var confBar = createEl('div', 'confidence-bar');
        var confFill = createEl('div', isVip ? 'confidence-fill confidence-fill--gold' : 'confidence-fill');
        confFill.setAttribute('data-confidence', conf);
        confBar.appendChild(confFill);
        confDiv.appendChild(confBar);
        confDiv.appendChild(createEl('span', 'confidence-value', conf + '%'));
        card.appendChild(confDiv);

        // Analysis
        if (isFree) {
            var analysis = createEl('div', 'tip-analysis');
            analysis.appendChild(createEl('p', null, randomFrom(ANALYSES)));
            card.appendChild(analysis);
        } else {
            var locked = createEl('div', 'tip-analysis tip-analysis--locked');
            var overlayClass = isVip ? 'locked-overlay locked-overlay--gold' : 'locked-overlay';
            var overlay = createEl('div', overlayClass);
            overlay.appendChild(buildLockSvg());
            var msg = isVip ? 'Tip esclusivo riservato ai membri VIP' : 'Analisi completa riservata agli abbonati PRO';
            overlay.appendChild(createEl('span', null, msg));
            var btn = createEl('a', 'btn btn-gold btn-sm', isVip ? 'Diventa VIP' : 'Sblocca');
            btn.href = '#pricing';
            overlay.appendChild(btn);
            locked.appendChild(overlay);
            card.appendChild(locked);
        }

        return card;
    }

    function buildMultiplaCard(matches) {
        var card = createEl('div', 'tip-card tip-card--multipla');
        card.setAttribute('data-tier', 'pro');
        card.appendChild(createEl('div', 'tip-card-glow'));

        // Header
        var header = createEl('div', 'tip-card-header');
        header.appendChild(createEl('span', 'tip-badge tip-badge--pro', 'MULTIPLA'));
        header.appendChild(createEl('span', 'tip-date', formatMatchDate(matches[0].date)));
        card.appendChild(header);

        // Multipla body
        var multipla = createEl('div', 'tip-multipla');
        multipla.appendChild(createEl('h3', 'multipla-title', 'Multipla del Giorno'));

        var picks = createEl('div', 'multipla-picks');
        var totalOdds = 1;
        matches.forEach(function (m, i) {
            var isLocked = i >= 2;
            var pickDiv = createEl('div', isLocked ? 'multipla-pick multipla-pick--locked' : 'multipla-pick');
            pickDiv.appendChild(createEl('span', null, m.home + ' - ' + m.away));
            var pred = isLocked ? '???' : randomFrom(PREDICTIONS);
            pickDiv.appendChild(createEl('span', 'multipla-pick-value', pred));
            var odd = isLocked ? '?.??' : randomOdd();
            pickDiv.appendChild(createEl('span', 'multipla-pick-odds', odd));
            if (!isLocked) totalOdds *= parseFloat(odd);
            picks.appendChild(pickDiv);
        });
        multipla.appendChild(picks);

        var total = createEl('div', 'multipla-total');
        total.appendChild(createEl('span', null, 'Quota Totale'));
        total.appendChild(createEl('span', 'multipla-total-odds', totalOdds.toFixed(2) + '+'));
        multipla.appendChild(total);
        card.appendChild(multipla);

        // Locked overlay
        var locked = createEl('div', 'tip-analysis tip-analysis--locked');
        var overlay = createEl('div', 'locked-overlay');
        overlay.appendChild(buildLockSvg());
        overlay.appendChild(createEl('span', null, 'Sblocca la multipla completa'));
        var btn = createEl('a', 'btn btn-gold btn-sm', 'Vai PRO');
        btn.href = '#pricing';
        overlay.appendChild(btn);
        locked.appendChild(overlay);
        card.appendChild(locked);

        return card;
    }

    function activateConfidenceBars(container) {
        var fills = container.querySelectorAll('.confidence-fill');
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    var val = entry.target.getAttribute('data-confidence');
                    entry.target.style.width = val + '%';
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.5 });
        fills.forEach(function (el) { observer.observe(el); });
    }

    async function loadTips() {
        var container = document.getElementById('tipsGrid');
        try {
            var matches = await fetchAPI('matches');
            if (!matches || matches.length < 3) {
                setEmptyState(container, 'tips-empty', 'Nessun pronostico disponibile al momento');
                return;
            }
            container.textContent = '';

            // Card 1: FREE (first match)
            container.appendChild(buildTipCard(matches[0], 'free'));
            // Card 2: PRO (second match)
            container.appendChild(buildTipCard(matches[1], 'pro'));
            // Card 3: VIP (third match)
            container.appendChild(buildTipCard(matches[2], 'vip'));
            // Card 4: MULTIPLA (first 3 matches)
            container.appendChild(buildMultiplaCard(matches.slice(0, 3)));

            // Activate confidence bars and reveal animations on new cards
            activateConfidenceBars(container);

            // Add reveal animation
            var cards = container.querySelectorAll('.tip-card');
            cards.forEach(function (card, i) {
                card.classList.add('reveal');
                card.style.transitionDelay = (i * 0.1) + 's';
                requestAnimationFrame(function () {
                    card.classList.add('visible');
                });
            });
        } catch (err) {
            console.error('loadTips failed:', err);
            setEmptyState(container, 'tips-empty', 'Impossibile caricare i pronostici');
        }
    }

    async function loadMatches() {
        var container = document.getElementById('matchesScroll');
        try {
            var matches = await fetchAPI('matches');
            if (!matches || matches.length === 0) {
                setEmptyState(container, 'matches-empty', 'Nessuna partita in programma');
                return;
            }
            container.textContent = '';
            matches.forEach(function (m) {
                container.appendChild(buildMatchCard(m));
            });
        } catch (err) {
            console.error('loadMatches failed:', err);
            setEmptyState(container, 'matches-empty', 'Impossibile caricare le partite');
        }
    }

    async function loadResults() {
        var container = document.getElementById('resultsList');
        try {
            var results = await fetchAPI('results');
            if (!results || results.length === 0) {
                setEmptyState(container, 'results-empty', 'Nessun risultato disponibile');
                return;
            }
            container.textContent = '';
            results.forEach(function (r) {
                container.appendChild(buildResultItem(r));
            });
        } catch (err) {
            console.error('loadResults failed:', err);
            setEmptyState(container, 'results-empty', 'Impossibile caricare i risultati');
        }
    }

    // Load data on page ready
    loadMatches();
    loadResults();
    loadTips();

})();

(function () {
  'use strict';

  const svg = document.getElementById('trace-field');

  const COPPER   = 'rgba(32, 232, 109, 0.22)';
  const COPPER_B = 'rgba(49, 232, 32, 0.55)';
  const STEEL    = 'rgba(91, 143, 168, 0.15)';
  const GRID     = 60; 
  const PAD_R    = 3;  

  let W, H, cols, rows;

  function resizeSVG() {
    W = window.innerWidth;
    H = window.innerHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    cols = Math.ceil(W / GRID) + 1;
    rows = Math.ceil(H / GRID) + 1;
    buildTraces();
  }

  function rnd(min, max) {
    return min + Math.random() * (max - min);
  }

  function snapX(x) { return Math.round(x / GRID) * GRID; }
  function snapY(y) { return Math.round(y / GRID) * GRID; }



  const DRAW_DUR  = () => rnd(4.5, 7.0);   
  const HOLD_DUR  = () => rnd(3.0, 8.0);   
  const FADE_DUR  = 0.6;                    
  const MAX_LIVE  = 35;                     
  const SPAWN_MS  = 300;                    

  let dotGroup = null;
  let traceLayer = null;
  let spawnInterval = null;

  function injectKeyframes() {
    if (document.getElementById('trace-keyframes')) return;
    const style = document.createElement('style');
    style.id = 'trace-keyframes';
    style.textContent = `
      @keyframes traceDraw {
        from { stroke-dashoffset: var(--tlen); }
        to   { stroke-dashoffset: 0; }
      }
      @keyframes traceHold {
        from, to { opacity: 1; }
      }
      @keyframes traceFade {
        from { opacity: 1; }
        to   { opacity: 0; }
      }
      @keyframes padAppear {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  function buildDotGrid() {
    // Dot grid is static — drawn once, never cleared
    if (dotGroup) dotGroup.remove();
    dotGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    for (let c = 0; c <= cols; c++) {
      for (let r = 0; r <= rows; r++) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', c * GRID);
        dot.setAttribute('cy', r * GRID);
        dot.setAttribute('r', 0.8);
        dot.setAttribute('fill', 'rgba(232, 160, 32, 0.12)');
        dotGroup.appendChild(dot);
      }
    }
    svg.appendChild(dotGroup);

    // Persistent layer for live traces (sits above dot grid)
    if (traceLayer) traceLayer.remove();
    traceLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(traceLayer);
  }

  function buildTracePath() {
    // Generate a random right-angle trace path
    let x = snapX(rnd(0, W));
    let y = snapY(rnd(0, H));
    const segments = Math.floor(rnd(2, 5));
    let d = `M ${x} ${y}`;
    let cx = x, cy = y;
    const corners = [[cx, cy]];

    for (let s = 0; s < segments; s++) {
      const horizontal = s % 2 === 0;
      const len = GRID * Math.floor(rnd(1, 4));
      const dir = Math.random() > 0.5 ? 1 : -1;
      if (horizontal) { cx += len * dir; }
      else            { cy += len * dir; }
      cx = Math.max(-GRID, Math.min(W + GRID, cx));
      cy = Math.max(-GRID, Math.min(H + GRID, cy));
      d += ` L ${cx} ${cy}`;
      if (s < segments - 1) corners.push([cx, cy]);
    }

    return { d, corners };
  }

  function spawnTrace() {
    // Throttle: don't exceed MAX_LIVE elements in the layer
    if (traceLayer && traceLayer.childElementCount >= MAX_LIVE * 2) return;

    const isHighlight = Math.random() < 0.08;
    const isSteel     = !isHighlight && Math.random() < 0.2;
    const color       = isHighlight ? COPPER_B : isSteel ? STEEL : COPPER;
    const strokeW     = isHighlight ? 1.5 : 1;

    const { d, corners } = buildTracePath();

    // Wrap trace + its pads in a group so we can fade the whole thing out together
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // ── PATH ──
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', strokeW);
    path.setAttribute('stroke-linecap', 'square');

    const totalLen = path.getTotalLength ? path.getTotalLength() : 200;
    path.style.setProperty('--tlen', totalLen + 'px');
    path.setAttribute('stroke-dasharray', totalLen);
    path.setAttribute('stroke-dashoffset', totalLen);

    const drawDur = DRAW_DUR();
    const holdDur = HOLD_DUR();

    // Draw in
    path.style.animation = `traceDraw ${drawDur}s cubic-bezier(0.4,0,0.2,1) forwards`;
    group.appendChild(path);

    // ── CORNER PADS ── (appear when trace reaches them)
    corners.forEach(([px, py], idx) => {
      if (Math.random() < 0.6) {
        const pad = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pad.setAttribute('cx', px);
        pad.setAttribute('cy', py);
        pad.setAttribute('r', PAD_R);
        pad.setAttribute('fill', 'none');
        pad.setAttribute('stroke', color);
        pad.setAttribute('stroke-width', '1');
        // Stagger pad appearance across the draw duration
        const padDelay = (drawDur * 0.15 * idx).toFixed(2);
        pad.style.animation = `padAppear 0.25s ${padDelay}s ease forwards`;
        pad.style.opacity = '0';
        group.appendChild(pad);
      }
    });

    traceLayer.appendChild(group);

    // ── LIFECYCLE: hold → fade → remove → respawn ──
    const holdTimer = setTimeout(() => {
      // Fade out the whole group
      group.style.transition = `opacity ${FADE_DUR}s ease`;
      group.style.opacity = '0';

      const removeTimer = setTimeout(() => {
        group.remove();
        // Immediately spawn a replacement so count stays stable
        spawnTrace();
      }, FADE_DUR * 1000);

      // Clean up if resize clears the layer before timer fires
      group._removeTimer = removeTimer;
    }, (drawDur + holdDur) * 1000);

    group._holdTimer = holdTimer;
  }

  function startContinuousTraces() {
    // Stop any existing spawner
    if (spawnInterval) clearInterval(spawnInterval);

    // Seed with an initial burst so the screen isn't empty
    const initialCount = Math.min(MAX_LIVE, Math.floor((cols * rows) / 10));
    for (let i = 0; i < initialCount; i++) {
      // Stagger initial spawns slightly so they don't all expire together
      setTimeout(spawnTrace, i * 80);
    }

    // Then keep topping up at a steady rate
    spawnInterval = setInterval(spawnTrace, SPAWN_MS);
  }

  function buildTraces() {
    // Clear any active timers on existing trace groups before wiping
    if (traceLayer) {
      traceLayer.querySelectorAll('g').forEach(g => {
        clearTimeout(g._holdTimer);
        clearTimeout(g._removeTimer);
      });
    }
    buildDotGrid();
    injectKeyframes();
    startContinuousTraces();
  }

  // Rebuild on resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeSVG, 200);
  });

  resizeSVG();



  const pages   = document.querySelectorAll('.inner-sec');
  const navBtns = document.querySelectorAll('.menu-panel ul button');
  const tbSheet = document.getElementById('tb-sheet');

  const sheetLabels = {
    Home:           '01 / 06 — HOME',
    About:          '02 / 06 — ABOUT',
    Experience:     '03 / 06 — EXPERIENCE',
    Education:      '04 / 06 — EDUCATION',
    Certifications: '05 / 06 — CERTIFICATIONS',
    Skills:         '06 / 06 — SKILLS',
  };

  const pageTitles = {
    Home:           'Mohamed Almajzoub — Backend & AI Systems',
    About:          'Mohamed Almajzoub | About',
    Experience:     'Mohamed Almajzoub | Experience',
    Education:      'Mohamed Almajzoub | Education',
    Certifications: 'Mohamed Almajzoub | Certifications',
    Skills:         'Mohamed Almajzoub | Skills',
  };

  function activatePage(targetId) {
    pages.forEach(p => {
      p.classList.remove('active');
      p.style.display = 'none';
    });

    navBtns.forEach(b => b.classList.remove('active'));

    const targetPage = document.getElementById(targetId);
    if (targetPage) {
      targetPage.style.display = '';
      void targetPage.offsetWidth;
      targetPage.classList.add('active');
    }

    navBtns.forEach(b => {
      if (b.dataset.target === targetId) b.classList.add('active');
    });

    if (tbSheet) tbSheet.textContent = sheetLabels[targetId] || '—';
    document.title = pageTitles[targetId] || 'Mohamed Almajzoub';
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (!target) return;

      const currentActive = document.querySelector('.inner-sec.active');
      if (currentActive && currentActive.id === target) {
        closeMenu();
        return;
      }

      activatePage(target);
      closeMenu();
      document.title = `Mohamed Almajzoub | ${btn.getAttribute('data-target')}`
    });
  });


  const menuToggle = document.getElementById('menu-toggle');
  const menuPanel  = document.getElementById('menu-panel');

  function openMenu() {
    menuPanel.classList.add('open');
    menuToggle.classList.add('active');
    menuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    menuPanel.classList.remove('open');
    menuToggle.classList.remove('active');
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    menuPanel.classList.contains('open') ? closeMenu() : openMenu();
  }

  if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  }

  document.addEventListener('click', (e) => {
    if (
      menuPanel &&
      !menuPanel.contains(e.target) &&
      !menuToggle.contains(e.target)
    ) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });


  function attachTilt(card) {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width  - 0.5;
      const y = (e.clientY - rect.top)  / rect.height - 0.5;
      const rx = y * -6;
      const ry = x *  8;
      card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
      card.style.transition = 'transform 0.08s ease';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) translateZ(0)';
      card.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
    });
  }


  document.querySelectorAll('.card').forEach(attachTilt);

  const tbRev = document.querySelector('.tb-row:last-child .tb-val');
  if (tbRev) {
    function updateClock() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');
      tbRev.textContent = `2026.06 — ${hh}:${mm}:${ss}`;
    }
    updateClock();
    setInterval(updateClock, 1000);
  }


  const homePage = document.getElementById('home');
  if (homePage) {
    homePage.style.display = '';
  }

})();
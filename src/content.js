// content.js — Prospector Universal Detector v3
// Injecte des boutons "Ajouter au scan" sur chaque tableau/liste détecté
;(function() {
  'use strict';
  if (window.__prospectorInjected) return;
  window.__prospectorInjected = true;

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  // ── Patterns de colonnes ───────────────────────────────────────────────────
  const COL = {
    firstname: /prénom|prenom|firstname|forename|first.?name/i,
    lastname:  /^nom$|^lastname$|last.?name|surname|^name$/i,
    fullname:  /nom.?complet|full.?name/i,
    company:   /entreprise|company|société|societe|raison.?sociale|organization/i,
    email:     /^email$|^e-mail$|^mail$|^courriel$/i,
    phone:     /téléphone|telephone|^phone$|^tel$|mobile|portable/i,
    jobtitle:  /^titre$|^title$|^poste$|fonction|^rôle$|^role$/i,
    status:    /^statut$|^status$|intérêt|interet|interest|niveau|^level$/i,
    date:      /date|rdv|rendez.?vous|appointment/i,
    skip:      /bilan|action|modifier|edit|delete|supprimer|select|checkbox/i,
  };

  // ── Scoring ────────────────────────────────────────────────────────────────
  function scoreHeaders(headers) {
    let score = 0;
    for (const h of headers) {
      if (!h) continue;
      if (COL.skip.test(h)) continue;
      if (COL.firstname.test(h) || COL.lastname.test(h) || COL.fullname.test(h)) score += 3;
      if (COL.company.test(h)) score += 2;
      if (COL.email.test(h) || COL.phone.test(h)) score += 2;
      if (COL.status.test(h) || COL.date.test(h)) score += 1;
    }
    return score;
  }

  function cleanText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function buildMap(headers) {
    const map = { firstname:-1, lastname:-1, fullname:-1, company:-1, email:-1, phone:-1, jobtitle:-1, status:-1, date:-1, extra:[] };
    headers.forEach((h, i) => {
      if (!h || COL.skip.test(h)) return;
      if (map.firstname === -1 && COL.firstname.test(h)) map.firstname = i;
      else if (map.lastname === -1 && COL.lastname.test(h)) map.lastname = i;
      else if (map.fullname === -1 && COL.fullname.test(h)) map.fullname = i;
      else if (map.company === -1 && COL.company.test(h)) map.company = i;
      else if (map.email === -1 && COL.email.test(h)) map.email = i;
      else if (map.phone === -1 && COL.phone.test(h)) map.phone = i;
      else if (map.jobtitle === -1 && COL.jobtitle.test(h)) map.jobtitle = i;
      else if (map.status === -1 && COL.status.test(h)) map.status = i;
      else if (map.date === -1 && COL.date.test(h)) map.date = i;
      else if (h && !COL.skip.test(h)) map.extra.push({ label: h, index: i });
    });
    return map;
  }

  function buildProspect(map, get) {
    const fn   = map.firstname >= 0 ? get(map.firstname) : '';
    const ln   = map.lastname  >= 0 ? get(map.lastname)  : '';
    const full = map.fullname  >= 0 ? get(map.fullname)  : [fn, ln].filter(Boolean).join(' ');
    const p = {
      firstname: fn   || full.split(' ')[0] || '',
      lastname:  ln   || full.split(' ').slice(1).join(' ') || '',
      fullname:  full || [fn, ln].filter(Boolean).join(' '),
      company:   map.company  >= 0 ? get(map.company)  : '',
      email:     map.email    >= 0 ? get(map.email)    : '',
      phone:     map.phone    >= 0 ? get(map.phone)    : '',
      jobtitle:  map.jobtitle >= 0 ? get(map.jobtitle) : '',
      status:    map.status   >= 0 ? get(map.status)   : '',
      date:      map.date     >= 0 ? get(map.date)     : '',
      source:    window.location.hostname,
      extra:     {},
    };
    (map.extra || []).forEach(({ label, index }) => {
      const v = get(index);
      if (v) p.extra[label] = v;
    });
    return p;
  }

  function validProspect(p) {
    return !!(p.firstname || p.lastname || p.fullname || p.email || p.company);
  }

  function dedup(arr) {
    const seen = new Set();
    return arr.filter(p => {
      const key = (p.email || (p.firstname + p.lastname) || p.fullname).toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  // ── Extraction table HTML ──────────────────────────────────────────────────
  function extractTable(table) {
    let headers = [...(table.querySelectorAll('thead th, thead td'))].map(h => cleanText(h));
    if (!headers.length) {
      const first = table.querySelector('tr');
      if (first) headers = [...first.querySelectorAll('th, td')].map(h => cleanText(h));
    }
    if (scoreHeaders(headers) < 2) return null;

    const map = buildMap(headers);
    const bodyRows = table.querySelectorAll('tbody tr');
    const rows = bodyRows.length ? [...bodyRows] : [...table.querySelectorAll('tr')].slice(1);

    const prospects = rows.map(row => {
      const cells = [...row.querySelectorAll('td, th')];
      return buildProspect(map, i => cleanText(cells[i]));
    }).filter(validProspect);

    return prospects.length ? { prospects, headers, el: table } : null;
  }

  // ── Détection de toutes les sources ───────────────────────────────────────
  function detectAllSources() {
    const sources = [];

    // 1. Toutes les tables HTML
    document.querySelectorAll('table').forEach(table => {
      if (table.dataset.prospectorScanned) return;
      const result = extractTable(table);
      if (result) sources.push(result);
    });

    return sources;
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  function findNextBtn() {
    const sels = [
      'button[aria-label*="next" i]', 'button[aria-label*="suivant" i]',
      'a[aria-label*="next" i]', '[class*="next"]:not([disabled])',
      '.pagination .next:not(.disabled)', 'li.next:not(.disabled) a',
    ];
    for (const s of sels) {
      try {
        const el = document.querySelector(s);
        if (el && !el.disabled && !el.classList.contains('disabled')) return el;
      } catch(e) {}
    }
    for (const btn of document.querySelectorAll('button, a[href]')) {
      const t = (btn.innerText || '').trim();
      if (/^(next|suivant|›|»|>|→)$/i.test(t)) return btn;
    }
    return null;
  }

  // ── Inject boutons flottants ───────────────────────────────────────────────
  let injectedButtons = [];

  function injectButtons() {
    // Nettoyer les anciens boutons
    injectedButtons.forEach(b => b.remove());
    injectedButtons = [];

    const sources = detectAllSources();
    if (!sources.length) return;

    sources.forEach((source, idx) => {
      const { el, prospects } = source;

      // Wrapper relatif pour le bouton
      const wrapper = el.closest('[style*="overflow"]') || el.parentElement;
      if (!wrapper) return;

      const originalPosition = wrapper.style.position;
      if (!originalPosition || originalPosition === 'static') {
        wrapper.style.position = 'relative';
      }

      const btn = document.createElement('button');
      btn.id = `prospector-btn-${idx}`;
      btn.dataset.prospectorBtn = 'true';
      btn.innerHTML = `📋 ${prospects.length} prospect${prospects.length > 1 ? 's' : ''} — Ajouter au scan`;
      btn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 999999;
        background: #1a1a1a;
        color: white;
        border: none;
        border-radius: 8px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        white-space: nowrap;
        transition: background 0.15s;
      `;

      btn.addEventListener('mouseenter', () => { btn.style.background = '#333'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#1a1a1a'; });

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();

        btn.innerHTML = '⏳ Collecte...';
        btn.style.background = '#2563eb';
        btn.disabled = true;

        // Collecter page courante
        let allCollected = [...prospects];
        let page = 1;

        // Paginer sans limite jusqu'à la dernière page
        while (true) {
          const next = findNextBtn();
          if (!next) break; // Plus de page suivante → fin

          btn.innerHTML = `⏳ Page ${page + 1}… (${allCollected.length})`;
          next.click();

          // Attendre que le DOM se mette à jour (JS ou HTML)
          await sleep(1500);

          // Extraire la nouvelle page — chercher le même tableau ou n'importe quelle table
          const newResult = extractTable(el) || (detectAllSources()[0] || null);
          if (newResult) {
            const newOnes = newResult.prospects.filter(p =>
              !allCollected.some(e =>
                (e.email && e.email === p.email) ||
                (e.firstname === p.firstname && e.lastname === p.lastname && p.firstname)
              )
            );
            allCollected.push(...newOnes);
          }
          page++;
        }

        // Envoyer tout au popup
        api.runtime.sendMessage({
          action: 'prospects_from_page',
          prospects: allCollected,
          source: `Tableau — ${page} page${page > 1 ? 's' : ''} (${allCollected.length} contacts)`,
        }).catch(() => {});

        // Confirmation 1 seconde puis disparition
        btn.innerHTML = `✓ ${allCollected.length} ajouté${allCollected.length > 1 ? 's' : ''} !`;
        btn.style.background = '#16a34a';

        setTimeout(() => {
          btn.style.opacity = '0';
          btn.style.transition = 'opacity 0.3s';
          setTimeout(() => btn.remove(), 300);
        }, 1000);
      });

      wrapper.appendChild(btn);
      injectedButtons.push(btn);
      el.dataset.prospectorScanned = 'true';
    });

    return sources;
  }

  // ── Observer pour détecter les nouvelles tables ───────────────────────────
  const observer = new MutationObserver(() => {
    clearTimeout(window.__prospectorObserverTimer);
    window.__prospectorObserverTimer = setTimeout(injectButtons, 500);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Injection initiale
  setTimeout(injectButtons, 800);

  // ── Collect all pages ──────────────────────────────────────────────────────
  let isCollecting = false;
  let allProspects = [];

  async function collectAll(onUpdate) {
    if (isCollecting) return;
    isCollecting = true;
    allProspects = [];
    let page = 1;

    while (page <= 50 && isCollecting) {
      await sleep(600);
      const sources = detectAllSources();
      const pageProspects = sources.flatMap(s => s.prospects);

      const newOnes = pageProspects.filter(p =>
        !allProspects.some(e =>
          (e.email && e.email === p.email) ||
          (e.firstname === p.firstname && e.lastname === p.lastname && p.firstname)
        )
      );
      allProspects.push(...newOnes);

      if (onUpdate) onUpdate({ page, total: allProspects.length, prospects: allProspects });

      const next = findNextBtn();
      if (!next || next.disabled || next.classList.contains('disabled')) break;
      next.click();
      page++;
      await sleep(1500);
    }

    isCollecting = false;
    return allProspects;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Listener messages popup ───────────────────────────────────────────────
  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') {
      sendResponse({ ok: true, url: window.location.href });
      return false;
    }

    if (msg.action === 'detect') {
      const sources = detectAllSources();
      const prospects = dedup(sources.flatMap(s => s.prospects));
      sendResponse({ prospects, total: prospects.length, hasNextPage: !!findNextBtn() });
      return false;
    }

    if (msg.action === 'collect_all') {
      collectAll(upd => {
        api.runtime.sendMessage({ action: 'collect_update', ...upd }).catch(() => {});
      }).then(all => {
        sendResponse({ done: true, total: all.length, prospects: all });
      });
      return true;
    }

    if (msg.action === 'stop_collect') {
      isCollecting = false;
      sendResponse({ stopped: true });
      return false;
    }

    if (msg.action === 'inject_buttons') {
      injectButtons();
      sendResponse({ ok: true });
      return false;
    }
  });

  console.log('[Prospector v3] Prêt sur', window.location.hostname);
})();

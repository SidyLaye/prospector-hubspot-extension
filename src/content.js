// src/content.js — Prospector Universal Detector
// Détecte les listes de prospects sur n'importe quelle page web

(function() {
  'use strict';

  // Éviter double injection
  if (window.__prospectorInjected) return;
  window.__prospectorInjected = true;

  // ── Constantes ──────────────────────────────────────────────────────────────

  const NAME_PATTERNS = [
    /^(prénom|prenom|firstname|first.?name|given.?name|forename)$/i,
    /^(nom|lastname|last.?name|surname|family.?name)$/i,
    /^(nom.?complet|full.?name|contact.?name|name|nom.?contact)$/i,
  ];

  const COMPANY_PATTERNS = [
    /^(entreprise|company|société|societe|organization|organisation|raison.?sociale|firm|business)$/i,
  ];

  const EMAIL_PATTERNS = [
    /^(email|e-mail|mail|courriel|adresse.?mail|contact.?email)$/i,
  ];

  const PHONE_PATTERNS = [
    /^(téléphone|telephone|phone|tel|mobile|portable|gsm|numero|numéro)$/i,
  ];

  const TITLE_PATTERNS = [
    /^(titre|title|civilité|civilite|salutation|mr|mme|gender)$/i,
  ];

  const STATUS_PATTERNS = [
    /^(statut|status|état|etat|stage|phase|qualification|level|niveau)$/i,
  ];

  const DATE_PATTERNS = [
    /^(date|rdv|rendez.?vous|appointment|meeting|created|créé|updated|modifié)$/i,
  ];

  const SKIP_COLUMNS = [
    /^(action|actions|modifier|edit|delete|supprimer|bilan|option|select|#|id|ref)$/i,
  ];

  // ── Pagination helper ────────────────────────────────────────────────────────

  function findPaginationElements() {
    // Boutons next/suivant courants
    const nextSelectors = [
      'button[aria-label*="next" i]',
      'button[aria-label*="suivant" i]',
      'a[aria-label*="next" i]',
      'a[aria-label*="suivant" i]',
      '[class*="next"]:not([disabled])',
      '[class*="suivant"]:not([disabled])',
      '[data-page="next"]',
      '.pagination .next:not(.disabled)',
      '.pagination-next:not(.disabled)',
      'li.next:not(.disabled) a',
      'button[data-testid*="next" i]',
    ];

    for (const sel of nextSelectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el) && !el.disabled) return el;
    }

    // Chercher un bouton avec texte "next", "suivant", ">"
    const allBtns = [...document.querySelectorAll('button, a[href]')];
    for (const btn of allBtns) {
      const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      if (/^(next|suivant|›|»|>|→)$/.test(txt) && isVisible(btn)) return btn;
    }

    return null;
  }

  function hasMorePages() {
    const next = findPaginationElements();
    if (!next) return false;
    // Vérifier que le bouton n'est pas désactivé
    if (next.disabled) return false;
    if (next.classList.contains('disabled')) return false;
    if (next.getAttribute('aria-disabled') === 'true') return false;
    return true;
  }

  function clickNextPage() {
    const next = findPaginationElements();
    if (next) { next.click(); return true; }
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  // ── Détection de table HTML ──────────────────────────────────────────────────

  function detectTable() {
    const tables = [...document.querySelectorAll('table')].filter(t => isVisible(t));
    if (!tables.length) return null;

    let bestTable = null;
    let bestScore = 0;

    for (const table of tables) {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length < 2) continue;

      const headers = [...(table.querySelectorAll('thead th, thead td'))].map(h =>
        (h.innerText || h.textContent || '').trim()
      );

      const score = scoreHeaders(headers) + rows.length * 0.5;
      if (score > bestScore) { bestScore = score; bestTable = { table, headers }; }
    }

    if (!bestTable || bestScore < 2) return null;
    return extractFromTable(bestTable.table, bestTable.headers);
  }

  function scoreHeaders(headers) {
    let score = 0;
    for (const h of headers) {
      if (NAME_PATTERNS.some(p => p.test(h))) score += 3;
      if (COMPANY_PATTERNS.some(p => p.test(h))) score += 2;
      if (EMAIL_PATTERNS.some(p => p.test(h))) score += 2;
      if (PHONE_PATTERNS.some(p => p.test(h))) score += 2;
      if (STATUS_PATTERNS.some(p => p.test(h))) score += 1;
      if (DATE_PATTERNS.some(p => p.test(h))) score += 1;
    }
    return score;
  }

  function extractFromTable(table, headerLabels) {
    // Récupérer les headers depuis thead ou première ligne
    let headers = headerLabels;
    if (!headers.length) {
      const firstRow = table.querySelector('tr');
      if (firstRow) {
        headers = [...firstRow.querySelectorAll('th, td')].map(c =>
          (c.innerText || c.textContent || '').trim()
        );
      }
    }

    const mapping = buildMapping(headers);
    const rows = [...table.querySelectorAll('tbody tr')];

    return rows.map(row => {
      const cells = [...row.querySelectorAll('td')];
      return buildProspect(mapping, (i) => (cells[i]?.innerText || cells[i]?.textContent || '').trim());
    }).filter(p => p.firstname || p.lastname || p.fullname || p.email);
  }

  // ── Détection de cartes/grilles ─────────────────────────────────────────────

  function detectCards() {
    // Chercher des conteneurs répétitifs (cards, list items)
    const candidates = [
      '[class*="card"]:not([class*="card-body"]):not([class*="card-header"])',
      '[class*="prospect"]',
      '[class*="contact"]',
      '[class*="lead"]',
      '[class*="row"]:not(tr)',
      '[class*="item"]:not(li)',
      'li[class]',
    ];

    for (const sel of candidates) {
      const items = [...document.querySelectorAll(sel)].filter(el => {
        if (!isVisible(el)) return false;
        const text = (el.innerText || '').trim();
        return text.length > 10 && text.length < 500;
      });

      if (items.length >= 3) {
        const prospects = extractFromCards(items);
        if (prospects.length >= 2) return prospects;
      }
    }

    return null;
  }

  function extractFromCards(items) {
    return items.map(item => {
      const text = (item.innerText || item.textContent || '').trim();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      // Chercher des éléments avec des labels explicites
      const labeled = {};
      item.querySelectorAll('[class*="label"], [class*="key"], dt, th, strong, b').forEach(el => {
        const label = (el.innerText || '').trim();
        const value = (el.nextElementSibling?.innerText || el.parentElement?.lastChild?.textContent || '').trim();
        if (label && value && label !== value) labeled[label] = value;
      });

      if (Object.keys(labeled).length > 0) {
        const headers = Object.keys(labeled);
        const mapping = buildMapping(headers);
        return buildProspect(mapping, (i) => labeled[headers[i]] || '');
      }

      // Fallback : heuristique sur les lignes de texte
      return guessFromLines(lines);
    }).filter(p => p.firstname || p.lastname || p.fullname || p.email);
  }

  // ── Détection JS dynamique (React, Vue, etc.) ────────────────────────────────

  function detectDynamicList() {
    // Chercher des listes avec des éléments répétitifs par structure similaire
    const allElements = document.querySelectorAll('*');
    const parentCounts = {};

    for (const el of allElements) {
      const parent = el.parentElement;
      if (!parent) continue;
      const key = parent.tagName + '.' + [...parent.classList].join('.');
      parentCounts[key] = (parentCounts[key] || { el: parent, count: 0 });
      parentCounts[key].count++;
    }

    // Trouver des parents avec 5+ enfants similaires
    const candidates = Object.values(parentCounts)
      .filter(x => x.count >= 5 && isVisible(x.el))
      .sort((a, b) => b.count - a.count);

    for (const { el: parent } of candidates.slice(0, 5)) {
      const children = [...parent.children].filter(c => isVisible(c));
      if (children.length < 3) continue;

      const prospects = extractFromCards(children);
      if (prospects.length >= 2) return prospects;
    }

    return null;
  }

  // ── Mapping de colonnes ──────────────────────────────────────────────────────

  function buildMapping(headers) {
    const map = { firstname: -1, lastname: -1, fullname: -1, company: -1,
                  email: -1, phone: -1, title: -1, status: -1, date: -1, extra: [] };

    headers.forEach((h, i) => {
      if (SKIP_COLUMNS.some(p => p.test(h))) return;

      if (map.firstname === -1 && NAME_PATTERNS[0].test(h)) map.firstname = i;
      else if (map.lastname === -1 && NAME_PATTERNS[1].test(h)) map.lastname = i;
      else if (map.fullname === -1 && NAME_PATTERNS[2].test(h)) map.fullname = i;
      else if (map.company === -1 && COMPANY_PATTERNS[0].test(h)) map.company = i;
      else if (map.email === -1 && EMAIL_PATTERNS[0].test(h)) map.email = i;
      else if (map.phone === -1 && PHONE_PATTERNS[0].test(h)) map.phone = i;
      else if (map.title === -1 && TITLE_PATTERNS[0].test(h)) map.title = i;
      else if (map.status === -1 && STATUS_PATTERNS[0].test(h)) map.status = i;
      else if (map.date === -1 && DATE_PATTERNS[0].test(h)) map.date = i;
      else if (h) map.extra.push({ label: h, index: i });
    });

    return map;
  }

  function buildProspect(map, getValue) {
    const fullname = map.fullname >= 0 ? getValue(map.fullname) : '';
    const firstname = map.firstname >= 0 ? getValue(map.firstname) : (fullname.split(' ')[0] || '');
    const lastname  = map.lastname >= 0  ? getValue(map.lastname)  : (fullname.split(' ').slice(1).join(' ') || '');

    const p = {
      firstname: firstname.trim(),
      lastname:  lastname.trim(),
      fullname:  fullname || [firstname, lastname].filter(Boolean).join(' '),
      company:   map.company >= 0 ? getValue(map.company) : '',
      email:     map.email   >= 0 ? getValue(map.email)   : '',
      phone:     map.phone   >= 0 ? getValue(map.phone)   : '',
      jobtitle:  map.title   >= 0 ? getValue(map.title)   : '',
      status:    map.status  >= 0 ? getValue(map.status)  : '',
      date:      map.date    >= 0 ? getValue(map.date)    : '',
      source:    window.location.hostname,
      extra:     {},
    };

    for (const { label, index } of (map.extra || [])) {
      const val = getValue(index);
      if (val) p.extra[label] = val;
    }

    return p;
  }

  // ── Heuristique sur texte brut ───────────────────────────────────────────────

  function guessFromLines(lines) {
    const p = { firstname: '', lastname: '', fullname: '', company: '', email: '', phone: '', status: '', extra: {}, source: window.location.hostname };

    for (const line of lines) {
      // Email
      if (!p.email && /\S+@\S+\.\S+/.test(line)) {
        p.email = line.match(/\S+@\S+\.\S+/)[0];
        continue;
      }
      // Téléphone
      if (!p.phone && /(\+\d[\d\s.-]{7,}|\d{2}[\s.-]\d{2}[\s.-]\d{2}[\s.-]\d{2}[\s.-]\d{2})/.test(line)) {
        p.phone = line.trim();
        continue;
      }
      // Nom (heuristique : 2 mots, majuscule)
      if (!p.fullname && /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][a-zàâäéèêëîïôùûü]+ [A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ]/.test(line) && line.split(' ').length <= 4) {
        p.fullname = line;
        const parts = line.split(' ');
        p.firstname = parts[0];
        p.lastname = parts.slice(1).join(' ');
        continue;
      }
    }

    return p;
  }

  // ── Interface principale ─────────────────────────────────────────────────────

  let allProspects = [];
  let isCollecting = false;

  async function collectAllPages(sendUpdate) {
    if (isCollecting) return;
    isCollecting = true;
    allProspects = [];

    let page = 1;
    const maxPages = 50;

    while (page <= maxPages) {
      await sleep(800); // Laisser le DOM se stabiliser

      const pageProspects = detectOnCurrentPage();
      if (pageProspects.length === 0 && page === 1) break;

      // Dédupliquer avec les pages précédentes
      const newOnes = pageProspects.filter(p =>
        !allProspects.some(existing =>
          existing.email === p.email ||
          (existing.firstname === p.firstname && existing.lastname === p.lastname && p.firstname)
        )
      );

      allProspects.push(...newOnes);

      if (sendUpdate) sendUpdate({ page, total: allProspects.length, prospects: allProspects });

      if (!hasMorePages()) break;

      clickNextPage();
      page++;
      await sleep(1500); // Attendre chargement page suivante
    }

    isCollecting = false;
    return allProspects;
  }

  function detectOnCurrentPage() {
    return detectTable() || detectCards() || detectDynamicList() || [];
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Listener messages ────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') {
      sendResponse({ ok: true, url: window.location.href });
      return false;
    }

    if (msg.action === 'detect') {
      const prospects = detectOnCurrentPage();
      sendResponse({
        prospects,
        total: prospects.length,
        hasNextPage: hasMorePages(),
        url: window.location.href,
        title: document.title,
      });
      return false;
    }

    if (msg.action === 'collect_all') {
      // Lance la collecte multi-pages et répond à chaque update
      collectAllPages((update) => {
        chrome.runtime.sendMessage({ action: 'collect_update', ...update }).catch(() => {});
      }).then(all => {
        sendResponse({ done: true, total: all.length, prospects: all });
      });
      return true; // async
    }

    if (msg.action === 'stop_collect') {
      isCollecting = false;
      sendResponse({ stopped: true });
      return false;
    }
  });

  console.log('[Prospector] Prêt sur', window.location.hostname);
})();

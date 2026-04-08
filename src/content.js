// content.js — Prospector Universal Detector v2
;(function() {
  'use strict';
  if (window.__prospectorInjected) return;
  window.__prospectorInjected = true;

  const api = (typeof browser !== 'undefined') ? browser : chrome;

  // ── Patterns de colonnes ───────────────────────────────────────────────────

  const COL = {
    firstname: /^(prénom|prenom|firstname|first.?name|forename|given)$/i,
    lastname:  /^(nom|lastname|last.?name|surname|family|nom.?complet|full.?name|contact|name)$/i,
    company:   /^(entreprise|company|société|societe|organization|raison.?sociale|firm|business|account)$/i,
    email:     /^(email|e-mail|mail|courriel)$/i,
    phone:     /^(téléphone|telephone|phone|tel|mobile|portable|gsm)$/i,
    jobtitle:  /^(titre|title|poste|fonction|rôle|role|job|position|civilité|civilite)$/i,
    status:    /^(statut|status|état|etat|stage|phase|niveau|level|intérêt|interet|interest)$/i,
    date:      /^(date|rdv|rendez.?vous|appointment|meeting|created|updated)$/i,
    skip:      /^(action|actions|modifier|edit|delete|supprimer|bilan|option|select|#|checkbox|check)$/i,
  };

  // ── Pagination ─────────────────────────────────────────────────────────────

  function findNextBtn() {
    const sels = [
      'button[aria-label*="next" i]', 'button[aria-label*="suivant" i]',
      'a[aria-label*="next" i]', 'a[aria-label*="suivant" i]',
      '[class*="next"]:not([disabled])', '[class*="suivant"]:not([disabled])',
      '.pagination .next:not(.disabled)', 'li.next:not(.disabled) a',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && isVisible(el) && !el.disabled) return el;
    }
    for (const btn of document.querySelectorAll('button, a[href]')) {
      const t = (btn.innerText || '').trim();
      if (/^(next|suivant|›|»|>|→)$/i.test(t) && isVisible(btn)) return btn;
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  }

  // ── Détection table HTML ───────────────────────────────────────────────────

  function detectTable() {
    // Ne pas filtrer sur isVisible — la table peut être hors viewport (scroll)
    const tables = [...document.querySelectorAll('table')];
    if (!tables.length) return null;

    let best = null, bestScore = -1;

    for (const table of tables) {
      const rows = table.querySelectorAll('tbody tr, tr');
      if (rows.length < 2) continue;

      // Chercher les headers dans thead, tr:first-child, ou th
      let headers = [...table.querySelectorAll('thead th, thead td')].map(h => cleanText(h));
      if (!headers.length) {
        const firstRow = table.querySelector('tr');
        if (firstRow) headers = [...firstRow.querySelectorAll('th, td')].map(h => cleanText(h));
      }

      const score = scoreHeaders(headers) + rows.length * 0.3;
      if (score > bestScore) { bestScore = score; best = { table, headers }; }
    }

    if (!best || bestScore < 1) return null;
    return extractTable(best.table, best.headers);
  }

  function extractTable(table, headers) {
    if (!headers.length) {
      const first = table.querySelector('tr');
      if (first) headers = [...first.querySelectorAll('th, td')].map(h => cleanText(h));
    }
    const map = buildMap(headers);
    const bodyRows = table.querySelectorAll('tbody tr');
    const rows = bodyRows.length ? [...bodyRows] : [...table.querySelectorAll('tr')].slice(1);

    return rows.map(row => {
      const cells = [...row.querySelectorAll('td, th')];
      return buildProspect(map, i => cleanText(cells[i]));
    }).filter(validProspect);
  }

  // ── Détection liste générique (divs, cards, li) ────────────────────────────

  function detectList() {
    // Chercher des conteneurs avec des enfants répétitifs qui contiennent du texte
    const candidates = [
      // Sélecteurs très larges pour attraper n'importe quelle liste
      'ul > li', 'ol > li',
      '[role="list"] > [role="listitem"]',
      '[role="row"]',
      // Classes communes
      '[class*="row"]', '[class*="item"]', '[class*="card"]',
      '[class*="contact"]', '[class*="prospect"]', '[class*="lead"]',
      '[class*="entry"]', '[class*="result"]', '[class*="record"]',
    ];

    for (const sel of candidates) {
      try {
        const items = [...document.querySelectorAll(sel)]
          .filter(el => isVisible(el) && hasEnoughText(el));

        if (items.length >= 3) {
          const prospects = extractFromItems(items);
          if (prospects.length >= 2) return prospects;
        }
      } catch(e) {}
    }
    return null;
  }

  function hasEnoughText(el) {
    const t = (el.innerText || '').trim();
    return t.length > 5 && t.length < 2000;
  }

  // ── Détection par analyse DOM répétitif ────────────────────────────────────

  function detectRepeating() {
    // Grouper les éléments par parent + className
    const groups = new Map();

    document.querySelectorAll('*').forEach(el => {
      const parent = el.parentElement;
      if (!parent) return;
      const key = parent.tagName + '|' + parent.className;
      if (!groups.has(key)) groups.set(key, { parent, children: [] });
      groups.get(key).children.push(el);
    });

    // Trouver des groupes avec 4+ enfants similaires visibles
    const candidates = [...groups.values()]
      .filter(g => g.children.length >= 4 && isVisible(g.parent))
      .sort((a, b) => b.children.length - a.children.length);

    for (const { children } of candidates.slice(0, 10)) {
      const visible = children.filter(c => isVisible(c) && hasEnoughText(c));
      if (visible.length < 3) continue;
      const prospects = extractFromItems(visible);
      if (prospects.length >= 2) return prospects;
    }
    return null;
  }

  // ── Extraction depuis items (cards, divs, li...) ───────────────────────────

  function extractFromItems(items) {
    return items.map(item => {
      // 1. Chercher des paires label:valeur explicites
      const labeled = {};
      item.querySelectorAll('dt, th, [class*="label"], [class*="key"], strong, b').forEach(lEl => {
        const label = cleanText(lEl);
        if (!label || label.length > 40) return;
        const val = cleanText(lEl.nextElementSibling) || cleanText(lEl.parentElement?.querySelector('dd, td, [class*="value"]'));
        if (val && val !== label) labeled[label] = val;
      });

      if (Object.keys(labeled).length >= 2) {
        const map = buildMap(Object.keys(labeled));
        return buildProspect(map, i => labeled[Object.keys(labeled)[i]]);
      }

      // 2. Analyse des spans/divs avec classes descriptives
      const byClass = {};
      item.querySelectorAll('[class]').forEach(el => {
        const cls = el.className.toLowerCase();
        const val = cleanText(el);
        if (!val || val.length > 100) return;
        if (/name|nom|prenom|firstname|lastname/.test(cls)) byClass.name = val;
        if (/company|entreprise|societe|firm/.test(cls)) byClass.company = val;
        if (/email|mail/.test(cls)) byClass.email = val;
        if (/phone|tel|mobile/.test(cls)) byClass.phone = val;
        if (/status|statut|etat|state/.test(cls)) byClass.status = val;
        if (/date|rdv|appointment/.test(cls)) byClass.date = val;
        if (/title|poste|job|role|fonction/.test(cls)) byClass.jobtitle = val;
      });

      if (Object.keys(byClass).length >= 1) {
        const name = byClass.name || '';
        const parts = name.split(/\s+/);
        return {
          firstname: parts[0] || '',
          lastname:  parts.slice(1).join(' ') || '',
          fullname:  name,
          company:   byClass.company || '',
          email:     byClass.email || '',
          phone:     byClass.phone || '',
          jobtitle:  byClass.jobtitle || '',
          status:    byClass.status || '',
          date:      byClass.date || '',
          source:    window.location.hostname,
          extra:     {},
        };
      }

      // 3. Heuristique sur le texte brut
      return guessFromText(item);
    }).filter(validProspect);
  }

  // ── Heuristique texte brut ─────────────────────────────────────────────────

  function guessFromText(el) {
    const lines = (el.innerText || '').split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const p = { firstname:'', lastname:'', fullname:'', company:'', email:'', phone:'', jobtitle:'', status:'', date:'', source: window.location.hostname, extra:{} };

    for (const line of lines) {
      if (!p.email && /\S+@\S+\.\S+/.test(line)) {
        p.email = line.match(/\S+@\S+\.\S+/)[0]; continue;
      }
      if (!p.phone && /(\+?\d[\d\s.\-()]{7,})/.test(line)) {
        const m = line.match(/(\+?\d[\d\s.\-()]{7,})/);
        if (m && m[1].replace(/\D/g,'').length >= 8) { p.phone = m[1].trim(); continue; }
      }
      // Nom : 2-4 mots avec majuscule
      if (!p.fullname && /^[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][a-zàâäéèêëîïôùûüæœ]+(\s+[A-ZÀÂÄÉÈÊËÎÏÔÙÛÜ][\wàâäéèêëîïôùûü-]+){1,3}$/.test(line)) {
        p.fullname = line;
        const parts = line.split(/\s+/);
        p.firstname = parts[0];
        p.lastname  = parts.slice(1).join(' ');
        continue;
      }
    }
    return p;
  }

  // ── Utils ──────────────────────────────────────────────────────────────────

  function cleanText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function scoreHeaders(headers) {
    let score = 0;
    for (const h of headers) {
      if (!h) continue;
      if (COL.skip.test(h)) continue;
      // Utiliser search() pour matcher les headers composés (ex: "Date RDV")
      if (COL.firstname.test(h) || COL.lastname.test(h)) score += 3;
      else if (/prénom|prenom|firstname|forename/i.test(h)) score += 3;
      else if (/^nom$|lastname|surname/i.test(h)) score += 3;
      if (COL.company.test(h) || /entreprise|company|société|societe/i.test(h)) score += 2;
      if (COL.email.test(h) || /email|e-mail|mail/i.test(h)) score += 2;
      if (COL.phone.test(h) || /téléphone|telephone|mobile/i.test(h)) score += 2;
      if (/date|rdv|rendez.?vous|statut|status|intérêt|interet/i.test(h)) score += 1;
    }
    return score;
  }

  function buildMap(headers) {
    const map = { firstname:-1, lastname:-1, fullname:-1, company:-1, email:-1, phone:-1, jobtitle:-1, status:-1, date:-1, extra:[] };
    headers.forEach((h, i) => {
      if (!h || COL.skip.test(h)) return;
      // Utiliser search() pour les headers multi-mots comme "Date RDV"
      if (map.firstname === -1 && /prénom|prenom|firstname|forename|first.?name/i.test(h)) map.firstname = i;
      else if (map.lastname === -1 && /^nom$|^lastname$|last.?name|surname|^name$/i.test(h)) map.lastname = i;
      else if (map.fullname === -1 && /nom.?complet|full.?name/i.test(h)) map.fullname = i;
      else if (map.company === -1 && /entreprise|company|société|societe|raison.?sociale|organization/i.test(h)) map.company = i;
      else if (map.email === -1 && /^email$|^e-mail$|^mail$|^courriel$/i.test(h)) map.email = i;
      else if (map.phone === -1 && /téléphone|telephone|^phone$|^tel$|mobile|portable/i.test(h)) map.phone = i;
      else if (map.jobtitle === -1 && /^titre$|^title$|^poste$|fonction|^rôle$|^role$/i.test(h)) map.jobtitle = i;
      else if (map.status === -1 && /^statut$|^status$|intérêt|interet|interest|niveau|^level$/i.test(h)) map.status = i;
      else if (map.date === -1 && /date|rdv|rendez.?vous|appointment/i.test(h)) map.date = i;
      else if (h && !/bilan|action|modifier|edit/i.test(h)) map.extra.push({ label: h, index: i });
    });
    return map;
  }

  function buildProspect(map, get) {
    const fn  = map.firstname >= 0 ? get(map.firstname) : '';
    const ln  = map.lastname  >= 0 ? get(map.lastname)  : '';
    const full = map.fullname >= 0 ? get(map.fullname)  : [fn, ln].filter(Boolean).join(' ');
    const p = {
      firstname: fn  || full.split(' ')[0] || '',
      lastname:  ln  || full.split(' ').slice(1).join(' ') || '',
      fullname:  full,
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
      const key = (p.email || p.fullname || p.firstname + p.lastname).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  // ── Détection principale ───────────────────────────────────────────────────

  function detectOnPage() {
    // Scroller vers le bas pour déclencher le lazy loading si besoin
    window.scrollTo(0, document.body.scrollHeight / 2);
    const results = detectTable() || detectList() || detectRepeating() || [];
    return dedup(results);
  }

  // ── Pagination auto ────────────────────────────────────────────────────────

  let isCollecting = false;
  let allProspects = [];

  async function collectAll(onUpdate) {
    if (isCollecting) return;
    isCollecting = true;
    allProspects = [];
    let page = 1;

    while (page <= 50 && isCollecting) {
      await sleep(600);
      const pageItems = detectOnPage();

      const newOnes = pageItems.filter(p =>
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
      await sleep(1200);
    }

    isCollecting = false;
    return allProspects;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Messages ───────────────────────────────────────────────────────────────

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') {
      sendResponse({ ok: true, url: window.location.href });
      return false;
    }

    if (msg.action === 'detect') {
      const prospects = detectOnPage();
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
  });

  console.log('[Prospector v2] Prêt sur', window.location.hostname);
})();

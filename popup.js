// Polyfill browser/chrome API
const api = (typeof browser !== 'undefined') ? browser : chrome;

// popup.js — Prospector Extension

const HS_API      = 'https://api.hubapi.com';
const CONTACTS    = `${HS_API}/crm/v3/objects/contacts`;
const SEARCH      = `${HS_API}/crm/v3/objects/contacts/search`;

let prospects     = [];
let statuses      = {}; // id → 'pending'|'syncing'|'created'|'updated'|'exists'|'error'
let settings      = {};
let isImporting   = false;
let isScanning    = false;
let stopRequested = false;

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  settings = await loadSettings();

  if (!settings.hs_token) {
    document.getElementById('config-banner').style.display = 'flex';
  }

  await checkPage();
  await loadCached();
  listenMessages();
});

async function loadSettings() {
  return api.storage.local.get([
    'hs_token', 'hs_region', 'import_mode', 'import_delay',
    'auto_paginate', 'default_source', 'cached_prospects', 'cached_statuses'
  ]);
}

// ── Listen collect updates from content script ─────────────────────────────

function listenMessages() {
  api.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'collect_update') {
      prospects = msg.prospects || [];
      initStatuses();
      renderList();
      updateStats();
      log(`Page ${msg.page} — ${msg.total} prospect(s) collecté(s)`, 'info');
    }
  });
}

// ── Check page ────────────────────────────────────────────────────────────────

async function checkPage() {
  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://') || tab.url.startsWith('moz-extension://')) {
      dot.className = 'dot red';
      text.textContent = 'Navigue sur une page web pour scanner';
      document.getElementById('btn-scan').disabled = true;
      return;
    }

    // Ping content script
    const resp = await api.tabs.sendMessage(tab.id, { action: 'ping' }).catch(() => null);
    if (resp?.ok) {
      dot.className = 'dot green';
      text.textContent = tab.url.replace(/^https?:\/\//, '').substring(0, 48);
    } else {
      // Injecter le content script manuellement si pas encore là
      // content.js est injecté automatiquement via content_scripts dans manifest
      dot.className = 'dot amber';
      text.textContent = tab.url.replace(/^https?:\/\//, '').substring(0, 48);
    }
  } catch {
    dot.className = 'dot red';
    text.textContent = 'Erreur de communication avec la page';
  }
}

// ── Load cached ───────────────────────────────────────────────────────────────

async function loadCached() {
  if (settings.cached_prospects?.length) {
    prospects = settings.cached_prospects;
    statuses  = settings.cached_statuses || {};
    initStatuses();
    renderList();
    updateStats();
    showFooter();
  }
}

async function saveCache() {
  await api.storage.local.set({ cached_prospects: prospects, cached_statuses: statuses });
}

// ── Scan ──────────────────────────────────────────────────────────────────────

async function scan() {
  if (isScanning) {
    stopRequested = true;
    document.getElementById('btn-scan').textContent = 'Scanner';
    document.getElementById('collecting-bar').classList.remove('active');
    isScanning = false;
    return;
  }

  const btn = document.getElementById('btn-scan');
  btn.textContent = '';
  const sp = document.createElement('span');
  sp.className = 'spinner spinner-dark';
  btn.appendChild(sp);
  btn.appendChild(document.createTextNode(' Arrêter'));
  isScanning = true;
  stopRequested = false;

  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    const paginate = settings.auto_paginate !== false;

    if (paginate) {
      document.getElementById('collecting-bar').classList.add('active');
      log('Scan multi-pages démarré...', 'info');

      const resp = await api.tabs.sendMessage(tab.id, { action: 'collect_all' });
      if (resp?.done) {
        prospects = resp.prospects || [];
        log(`Terminé — ${prospects.length} prospect(s) collecté(s)`, 'ok');
      }
    } else {
      const resp = await api.tabs.sendMessage(tab.id, { action: 'detect' });
      prospects = resp?.prospects || [];
      log(`Page courante — ${prospects.length} prospect(s) détecté(s)`, 'info');
    }

    if (prospects.length === 0) {
      showEmpty('Aucun prospect détecté', 'Assure-toi que la liste est visible.\nEssaie de scroller pour charger les données.');
    } else {
      initStatuses();
      renderList();
      updateStats();
      showFooter();
      document.getElementById('btn-import').disabled = !settings.hs_token;
      await saveCache();
    }

  } catch (e) {
    log('Erreur de scan : ' + e.message, 'err');
    showEmpty('Erreur de scan', 'Actualise la page et réessaie.');
  } finally {
    btn.textContent = '🔍 Scanner';
    isScanning = false;
    document.getElementById('collecting-bar').classList.remove('active');
  }
}

// ── Import ────────────────────────────────────────────────────────────────────

async function importAll() {
  if (isImporting) return;
  if (!settings.hs_token) { openSetup(); return; }

  isImporting = true;
  stopRequested = false;

  const btn = document.getElementById('btn-import');
  btn.disabled = true;
  btn.textContent = 'Import en cours...';

  const progressWrap = document.getElementById('progress-wrap');
  const progressBar  = document.getElementById('progress-bar');
  progressWrap.style.display = 'block';

  const mode  = settings.import_mode || 'upsert';
  const delay = settings.import_delay || 300;
  const pending = prospects.filter(p => {
    const id = pid(p);
    return statuses[id] === 'pending' || statuses[id] === 'error';
  });

  log(`Démarrage import — ${pending.length} contacts (mode: ${mode})`, 'info');

  for (let i = 0; i < pending.length; i++) {
    if (stopRequested) { log('Import interrompu.', 'warn'); break; }

    const p  = pending[i];
    const id = pid(p);

    statuses[id] = 'syncing';
    renderItem(p);
    updateStats();

    progressBar.style.width = `${Math.round((i / pending.length) * 100)}%`;

    const result = await syncProspect(p, settings.hs_token, mode);

    statuses[id] = result.result;
    renderItem(p);
    updateStats();

    if (result.result === 'created') log(`✓ Créé : ${displayName(p)} (id:${result.id})`, 'ok');
    else if (result.result === 'updated') log(`↑ Mis à jour : ${displayName(p)}`, 'ok');
    else if (result.result === 'exists')  log(`~ Déjà présent : ${displayName(p)}`, 'info');
    else if (result.result === 'error')   log(`✗ Erreur : ${displayName(p)} — ${result.error}`, 'err');

    await sleep(delay);
  }

  progressBar.style.width = '100%';
  setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0'; }, 1000);

  await saveCache();

  btn.textContent = 'Importer dans HubSpot';
  btn.disabled = false;
  isImporting = false;
  log('Import terminé.', 'info');
}

// ── HubSpot API ───────────────────────────────────────────────────────────────

async function hsReq(method, path, body) {
  const resp = await fetch(`${HS_API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.hs_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

async function findInHubSpot(p) {
  const filterGroups = [];

  if (p.email) {
    filterGroups.push({ filters: [{ propertyName: 'email', operator: 'EQ', value: p.email }] });
  }
  if (p.firstname && p.lastname) {
    filterGroups.push({ filters: [
      { propertyName: 'firstname', operator: 'EQ', value: p.firstname },
      { propertyName: 'lastname',  operator: 'EQ', value: p.lastname  },
    ]});
  }
  if (p.phone) {
    const clean = String(p.phone).replace(/\s/g, '');
    filterGroups.push({ filters: [{ propertyName: 'phone', operator: 'EQ', value: clean }] });
  }

  if (!filterGroups.length) return { found: false };

  // Chercher avec chaque filtre séparément (OR logic)
  for (const fg of filterGroups) {
    const { ok, data } = await hsReq('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [fg], limit: 1,
      properties: ['firstname', 'lastname', 'email'],
    });
    if (ok && data.total > 0) return { found: true, id: data.results[0].id };
  }

  return { found: false };
}

function buildProps(p) {
  const props = {};
  if (p.firstname)  props.firstname = p.firstname;
  if (p.lastname)   props.lastname  = p.lastname;
  if (!p.firstname && !p.lastname && p.fullname) {
    const parts = p.fullname.trim().split(/\s+/);
    props.firstname = parts[0] || '';
    props.lastname  = parts.slice(1).join(' ') || '';
  }
  if (p.email)    props.email   = p.email.toLowerCase().trim();
  if (p.phone)    props.phone   = String(p.phone).trim();
  if (p.company)  props.company = p.company;
  if (p.jobtitle) props.jobtitle = p.jobtitle;
  if (p.source || settings.default_source) {
    props.hs_analytics_source_data_1 = p.source || settings.default_source || 'Prospector';
  }
  if (p.status) {
    const s = p.status.toLowerCase();
    props.hs_lead_status =
      /effectu|complet|done|réalisé|closed/i.test(s) ? 'CONNECTED' :
      /obtenu|scheduled|rdv|booked|confirmed/i.test(s) ? 'IN_PROGRESS' :
      /qualif/i.test(s) ? 'QUALIFIED' :
      /perdu|lost|unqualif|cancel/i.test(s) ? 'UNQUALIFIED' : 'NEW';
  }
  if (p.date) props.notes_last_contacted = p.date;

  const extra = Object.entries(p.extra || {});
  if (extra.length) {
    props.notes_last_updated = extra.map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  return props;
}

async function syncProspect(p, apiKey, mode) {
  try {
    const found = mode !== 'always' ? await findInHubSpot(p) : { found: false };

    if (found.found) {
      if (mode === 'skip') return { result: 'exists', id: found.id };

      // Update
      const { ok, data, status } = await hsReq('PATCH', `/crm/v3/objects/contacts/${found.id}`, { properties: buildProps(p) });
      if (ok) return { result: 'updated', id: found.id };
      return { result: 'error', error: data?.message || `HTTP ${status}` };
    }

    // Create
    const { ok, data, status } = await hsReq('POST', '/crm/v3/objects/contacts', { properties: buildProps(p) });
    if (ok) return { result: 'created', id: data.id };
    if (status === 409 || data?.category === 'CONFLICT') return { result: 'exists' };
    return { result: 'error', error: data?.message || `HTTP ${status}` };

  } catch (e) {
    return { result: 'error', error: e.message };
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderList() {
  if (!prospects.length) { showEmpty(); return; }

  const listWrap = document.getElementById('list-wrap');
  listWrap.innerHTML = '';
  const frag = document.createDocumentFragment();
  prospects.forEach(p => {
    frag.appendChild(buildProspectEl(p));
  });
  listWrap.appendChild(frag);

  document.getElementById('stats-row').style.display = 'grid';
  document.getElementById('btn-import').disabled = !settings.hs_token;
}

function renderItem(p) {
  const el = document.getElementById('item-' + CSS.escape(pid(p)));
  if (el) {
    el.parentNode.replaceChild(buildProspectEl(p), el);
  }
}


// Build prospect DOM element safely (no innerHTML with user data)
function buildProspectEl(p) {
  const id  = pid(p);
  const st  = statuses[id] || 'pending';
  const ini = initials(p);
  const sub = [p.company, p.email, p.phone].filter(Boolean)[0] || p.source || '';

  const row = document.createElement('div');
  row.className = 'prospect-item';
  row.id = 'item-' + id;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = ini;

  const info = document.createElement('div');
  info.className = 'info';
  const name = document.createElement('div');
  name.className = 'info-name';
  name.textContent = displayName(p);
  const subEl = document.createElement('div');
  subEl.className = 'info-sub';
  subEl.textContent = sub;
  info.appendChild(name);
  info.appendChild(subEl);

  const badge = document.createElement('span');
  const badgeMap = {
    pending: ['status-badge badge-pending', 'En attente'],
    syncing: ['status-badge badge-syncing', '...'],
    created: ['status-badge badge-created', 'Créé ✓'],
    updated: ['status-badge badge-updated', 'Mis à jour'],
    exists:  ['status-badge badge-exists',  'Déjà présent'],
    error:   ['status-badge badge-error',   'Erreur'],
  };
  const [cls, txt] = badgeMap[st] || badgeMap.pending;
  badge.className = cls;
  badge.textContent = txt;

  row.appendChild(avatar);
  row.appendChild(info);
  row.appendChild(badge);
  return row;
}

function itemHTML(p) {
  const id  = pid(p);
  const st  = statuses[id] || 'pending';
  const ini = initials(p);
  const sub = [p.company, p.email, p.phone].filter(Boolean)[0] || p.source || '';

  const badges = {
    pending: '<span class="status-badge badge-pending">En attente</span>',
    syncing: '<span class="status-badge badge-syncing"><span class="spinner spinner-dark" style="width:10px;height:10px"></span></span>',
    created: '<span class="status-badge badge-created">Créé ✓</span>',
    updated: '<span class="status-badge badge-updated">Mis à jour</span>',
    exists:  '<span class="status-badge badge-exists">Déjà présent</span>',
    error:   '<span class="status-badge badge-error">Erreur</span>',
  };

  return `<div class="prospect-item" id="item-${id}">
    <div class="avatar">${ini}</div>
    <div class="info">
      <div class="info-name">${displayName(p)}</div>
      <div class="info-sub">${sub}</div>
    </div>
    ${badges[st] || badges.pending}
  </div>`;
}

function showEmpty(title = 'Aucun prospect détecté', desc = 'Navigue sur une page avec une liste de contacts et clique sur Scanner') {
  const w = document.getElementById('list-wrap');
  w.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'empty';
  const icon = document.createElement('div'); icon.className = 'empty-icon'; icon.textContent = '📋';
  const t = document.createElement('div'); t.className = 'empty-title'; t.textContent = title;
  const s = document.createElement('div'); s.className = 'empty-desc'; s.textContent = desc;
  d.appendChild(icon); d.appendChild(t); d.appendChild(s);
  w.appendChild(d);
  document.getElementById('stats-row').style.display = 'none';
  document.getElementById('footer').style.display = 'none';
}

function updateStats() {
  const vals = Object.values(statuses);
  el('s-detected').textContent = prospects.length;
  el('s-created').textContent  = vals.filter(s => s === 'created').length;
  el('s-updated').textContent  = vals.filter(s => s === 'updated').length;
  el('s-errors').textContent   = vals.filter(s => s === 'error').length;
}

function showFooter() {
  const footer = document.getElementById('footer');
  footer.style.display = 'flex';
  document.getElementById('footer-text').textContent =
    `${prospects.length} contact(s) détecté(s)`;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function initStatuses() {
  prospects.forEach(p => {
    const id = pid(p);
    if (!statuses[id]) statuses[id] = 'pending';
  });
}

function pid(p) {
  return ((p.email || '') + (p.firstname || '') + (p.lastname || '') + (p.fullname || ''))
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_@.]/g, '').substring(0, 60) || Math.random().toString(36).slice(2);
}

function displayName(p) {
  if (p.firstname || p.lastname) return [p.firstname, p.lastname].filter(Boolean).join(' ');
  return p.fullname || p.email || '(sans nom)';
}

function initials(p) {
  const name = displayName(p);
  return name.split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function el(id) { return document.getElementById(id); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Log ───────────────────────────────────────────────────────────────────────

function log(msg, type = 'info') {
  const panel = document.getElementById('log-panel');
  const line  = document.createElement('div');
  line.className = `log-line log-${type}`;
  line.textContent = `[${new Date().toLocaleTimeString('fr-FR')}] ${msg}`;
  panel.appendChild(line);
  panel.scrollTop = panel.scrollHeight;
}

function toggleLog() {
  document.getElementById('log-panel').classList.toggle('open');
}

// ── Actions ───────────────────────────────────────────────────────────────────

function openSetup() {
  api.runtime.openOptionsPage();
}

function clearAll() {
  prospects = [];
  statuses  = {};
  api.storage.local.remove(['cached_prospects', 'cached_statuses']);
  showEmpty();
  updateStats();
  document.getElementById('btn-import').disabled = true;
  document.getElementById('stats-row').style.display = 'none';
}

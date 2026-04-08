// setup.js — Prospector Setup Page
// Compatible Chrome MV3 + Firefox MV2

// Polyfill : utilise "browser" si dispo (Firefox), sinon "chrome"
const api = (typeof browser !== 'undefined') ? browser : chrome;

let currentStep = 1;
let connectionOk = false;

// ── Navigation ────────────────────────────────────────────────────────────────

function goStep(n) {
  if (n > 1 && !connectionOk) return;

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + n).classList.add('active');

  document.querySelectorAll('.step').forEach(function(s, i) {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    if (i + 1 === n) s.classList.add('active');
  });

  currentStep = n;
}

// ── Mode cards ────────────────────────────────────────────────────────────────

document.querySelectorAll('.mode-card').forEach(function(card) {
  card.addEventListener('click', function() {
    document.querySelectorAll('.mode-card').forEach(function(c) {
      c.classList.remove('selected');
    });
    card.classList.add('selected');
    card.querySelector('input').checked = true;
  });
});

// ── Test connexion HubSpot ────────────────────────────────────────────────────

async function testConnection() {
  const token = document.getElementById('hs-token').value.trim();
  const btn   = document.getElementById('btn-test');
  const next  = document.getElementById('btn-next-1');
  const input = document.getElementById('hs-token');

  if (!token) {
    showAlert(1, 'error', '⚠️', 'Entre ton token HubSpot d\'abord.');
    return;
  }

  btn.textContent = '...';
  btn.disabled = true;
  showAlert(1, 'info', '⏳', 'Test de connexion en cours...');

  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      input.classList.remove('error');
      input.classList.add('success');
      connectionOk = true;
      next.disabled = false;

      // Sauvegarder via l'API extension
      const region = document.getElementById('hs-region').value;
      await api.storage.local.set({ hs_token: token, hs_region: region });

      showAlert(1, 'success', '✓',
        'Connexion réussie — ' + (data.total || '?') + ' contact(s) dans ton HubSpot.'
      );

    } else {
      const err = await res.json().catch(function() { return {}; });
      input.classList.add('error');
      input.classList.remove('success');
      connectionOk = false;
      next.disabled = true;

      let msg = err.message || ('Erreur HTTP ' + res.status);
      if (res.status === 401) msg = 'Token invalide — vérifie que tu as bien copié le token complet.';
      if (res.status === 403) msg = 'Permissions insuffisantes — ajoute les scopes crm.objects.contacts.read et .write.';
      showAlert(1, 'error', '✗', msg);
    }

  } catch (e) {
    // CORS ou réseau
    showAlert(1, 'error', '✗', 'Erreur réseau : ' + e.message + '. Vérifie que tu es connecté à internet.');
  }

  btn.textContent = 'Tester';
  btn.disabled = false;
}

// ── Save & Finish ─────────────────────────────────────────────────────────────

async function saveAndFinish() {
  const modeEl = document.querySelector('input[name="import-mode"]:checked');
  const mode   = modeEl ? modeEl.value : 'upsert';
  const delay  = parseInt(document.getElementById('import-delay').value) || 300;
  const paginate = document.getElementById('auto-paginate').value === 'yes';
  const source = document.getElementById('default-source').value.trim() || 'Prospector Extension';

  await api.storage.local.set({
    import_mode: mode,
    import_delay: delay,
    auto_paginate: paginate,
    default_source: source
  });

  goStep(3);
}

// ── Load saved settings ───────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const data = await api.storage.local.get([
      'hs_token', 'hs_region', 'import_mode',
      'import_delay', 'auto_paginate', 'default_source'
    ]);

    if (data.hs_token) {
      document.getElementById('hs-token').value = data.hs_token;
      document.getElementById('hs-token').classList.add('success');
      connectionOk = true;
      document.getElementById('btn-next-1').disabled = false;
    }

    if (data.hs_region) document.getElementById('hs-region').value = data.hs_region;
    if (data.import_delay) document.getElementById('import-delay').value = data.import_delay;
    if (data.auto_paginate === false) document.getElementById('auto-paginate').value = 'no';
    if (data.default_source) document.getElementById('default-source').value = data.default_source;

    if (data.import_mode) {
      document.querySelectorAll('.mode-card').forEach(function(c) {
        const inp = c.querySelector('input');
        const match = inp.value === data.import_mode;
        c.classList.toggle('selected', match);
        inp.checked = match;
      });
    }
  } catch(e) {
    console.warn('Storage non disponible:', e.message);
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function showAlert(step, type, icon, msg) {
  const el = document.getElementById('alert-' + step);
  if (!el) return;
  el.className = 'alert alert-' + type + ' show';
  el.textContent = '';
  const iconEl = document.createElement('span');
  iconEl.className = 'alert-icon';
  iconEl.textContent = icon;
  const msgEl = document.createElement('span');
  msgEl.textContent = msg;
  el.appendChild(iconEl);
  el.appendChild(msgEl);
}

function openExtension() {
  window.close();
}

function openHubspot() {
  window.open('https://app.hubspot.com/private-apps', '_blank');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  loadSettings();

  document.getElementById('hs-token').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') testConnection();
  });
});


let currentStep = 1;
let connectionOk = false;

// ── Navigation ───────────────────────────────────────────────────────────────

function goStep(n) {
  if (n > currentStep && !connectionOk && n > 1) return;

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${n}`).classList.add('active');

  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    if (i + 1 === n) s.classList.add('active');
  });

  currentStep = n;
}

// ── Mode cards ───────────────────────────────────────────────────────────────

document.querySelectorAll('.mode-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    card.querySelector('input').checked = true;
  });
});

// ── Test connexion HubSpot ───────────────────────────────────────────────────

async function testConnection() {
  const token = document.getElementById('hs-token').value.trim();
  const btn   = document.getElementById('btn-test');
  const next  = document.getElementById('btn-next-1');
  const input = document.getElementById('hs-token');

  if (!token) {
    showAlert(1, 'error', '⚠️', 'Entre ton token HubSpot d\'abord.');
    return;
  }

  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled = true;
  showAlert(1, 'info', '⏳', 'Test de connexion en cours...');

  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });

    if (res.ok) {
      const data = await res.json();
      input.classList.remove('error');
      input.classList.add('success');
      connectionOk = true;
      next.disabled = false;

      // Sauvegarder le token
      await chrome.storage.local.set({ hs_token: token, hs_region: document.getElementById('hs-region').value });

      showAlert(1, 'success', '✓',
        `Connexion réussie — ${data.total ?? '?'} contact(s) dans ton HubSpot.`
      );
    } else {
      const err = await res.json().catch(() => ({}));
      input.classList.add('error');
      input.classList.remove('success');
      connectionOk = false;
      next.disabled = true;

      let msg = err.message || `Erreur HTTP ${res.status}`;
      if (res.status === 401) msg = 'Token invalide ou expiré. Vérifie tes paramètres d\'application privée.';
      if (res.status === 403) msg = 'Permissions insuffisantes. Ajoute les scopes contacts.read et contacts.write.';
      showAlert(1, 'error', '✗', msg);
    }
  } catch (e) {
    showAlert(1, 'error', '✗', `Impossible de joindre HubSpot : ${e.message}`);
  }

  btn.textContent = 'Tester';
  btn.disabled = false;
}

// ── Save & Finish ────────────────────────────────────────────────────────────

async function saveAndFinish() {
  const mode    = document.querySelector('input[name="import-mode"]:checked')?.value || 'upsert';
  const delay   = parseInt(document.getElementById('import-delay').value);
  const paginate = document.getElementById('auto-paginate').value === 'yes';
  const source  = document.getElementById('default-source').value.trim() || 'Extension Prospector';

  await chrome.storage.local.set({ import_mode: mode, import_delay: delay, auto_paginate: paginate, default_source: source });

  goStep(3);
}

// ── Load saved settings ──────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get(['hs_token', 'hs_region', 'import_mode', 'import_delay', 'auto_paginate', 'default_source']);

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
    document.querySelectorAll('.mode-card').forEach(c => {
      const inp = c.querySelector('input');
      const isMatch = inp.value === data.import_mode;
      c.classList.toggle('selected', isMatch);
      inp.checked = isMatch;
    });
  }
}

// ── Utils ────────────────────────────────────────────────────────────────────

function showAlert(step, type, icon, msg) {
  const el = document.getElementById(`alert-${step}`);
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.innerHTML = `<span class="alert-icon">${icon}</span><span>${msg}</span>`;
}

function openExtension() {
  window.close();
}

// ── Init ─────────────────────────────────────────────────────────────────────
loadSettings();

// Enter to test
document.getElementById('hs-token').addEventListener('keydown', e => {
  if (e.key === 'Enter') testConnection();
});

// ── Variables globales ──────────────────────────────────────────────────────
var _api = (typeof browser !== 'undefined') ? browser : chrome;
var _step = 1;
var _ok = false;
var _mode = 'upsert';

// ── Fonctions globales (appelables depuis n'importe où) ────────────────────

function goStep(n) {
  if (n > 1 && !_ok) return;
  _step = n;
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  var panel = document.getElementById('panel-' + n);
  if (panel) panel.classList.add('active');
  for (var i = 1; i <= 3; i++) {
    var s = document.getElementById('step-' + i);
    if (!s) continue;
    s.classList.remove('active', 'done');
    if (i < n) s.classList.add('done');
    if (i === n) s.classList.add('active');
  }
}

function selectMode(m) {
  _mode = m;
  ['upsert','skip','always'].forEach(function(x) {
    var el = document.getElementById('mode-' + x);
    if (el) el.classList.toggle('sel', x === m);
  });
}

function showAlert(type, msg) {
  var el = document.getElementById('alert-1');
  if (!el) return;
  el.className = 'alert alert-' + type + ' show';
  el.textContent = msg;
}

function testConnection() {
  var tokenEl = document.getElementById('hs-token');
  var btn = document.getElementById('btn-test');
  var next = document.getElementById('btn-next-1');
  if (!tokenEl || !btn) { alert('Erreur : éléments non trouvés'); return; }
  
  var token = tokenEl.value.trim();
  if (!token) { showAlert('err', 'Entre ta clé HubSpot d\'abord.'); return; }

  btn.textContent = '...';
  btn.disabled = true;
  showAlert('info', 'Vérification en cours...');

  fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
    headers: { 'Authorization': 'Bearer ' + token }
  })
  .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, status: res.status, data: data }; }); })
  .then(function(r) {
    if (r.ok) {
      tokenEl.style.borderColor = '#16a34a';
      _ok = true;
      if (next) next.disabled = false;
      _api.storage.local.set({ hs_token: token });
      showAlert('ok', 'Connexion réussie — ' + (r.data.total || 0) + ' contact(s) dans HubSpot.');
    } else {
      tokenEl.style.borderColor = '#dc2626';
      _ok = false;
      var msg = r.data.message || ('Erreur ' + r.status);
      if (r.status === 401) msg = 'Clé invalide. Vérifie que tu as bien copié la clé complète.';
      if (r.status === 403) msg = 'Permissions insuffisantes. Ajoute les scopes contacts.read et contacts.write.';
      showAlert('err', msg);
    }
    btn.textContent = 'Tester';
    btn.disabled = false;
  })
  .catch(function(e) {
    showAlert('err', 'Erreur réseau : ' + e.message);
    btn.textContent = 'Tester';
    btn.disabled = false;
  });
}

function saveAndFinish() {
  var delay = parseInt(document.getElementById('import-delay').value) || 300;
  var paginate = document.getElementById('auto-paginate').value === 'yes';
  _api.storage.local.set({ import_mode: _mode, import_delay: delay, auto_paginate: paginate });
  goStep(3);
}

function loadSettings() {
  _api.storage.local.get(['hs_token','import_mode','import_delay','auto_paginate']).then(function(d) {
    if (d.hs_token) {
      var el = document.getElementById('hs-token');
      if (el) { el.value = d.hs_token; el.style.borderColor = '#16a34a'; }
      _ok = true;
      var next = document.getElementById('btn-next-1');
      if (next) next.disabled = false;
    }
    if (d.import_delay) { var el = document.getElementById('import-delay'); if (el) el.value = d.import_delay; }
    if (d.auto_paginate === false) { var el = document.getElementById('auto-paginate'); if (el) el.value = 'no'; }
    if (d.import_mode) selectMode(d.import_mode);
  }).catch(function(e) { console.warn('storage:', e); });
}

// ── Attacher les événements ────────────────────────────────────────────────
document.getElementById('btn-test').addEventListener('click', testConnection);
document.getElementById('btn-next-1').addEventListener('click', function() { goStep(2); });
document.getElementById('btn-back').addEventListener('click', function() { goStep(1); });
document.getElementById('btn-save').addEventListener('click', saveAndFinish);
document.getElementById('btn-close').addEventListener('click', function() { window.close(); });
document.getElementById('mode-upsert').addEventListener('click', function() { selectMode('upsert'); });
document.getElementById('mode-skip').addEventListener('click', function() { selectMode('skip'); });
document.getElementById('mode-always').addEventListener('click', function() { selectMode('always'); });
document.getElementById('hs-token').addEventListener('keydown', function(e) { if (e.key === 'Enter') testConnection(); });

// ── Init ──────────────────────────────────────────────────────────────────
loadSettings();
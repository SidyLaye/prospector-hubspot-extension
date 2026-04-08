// setup.js — Prospector Configuration
const api = (typeof browser !== 'undefined') ? browser : chrome;

let currentStep = 1;
let connectionOk = false;

function goStep(n) {
  if (n > 1 && !connectionOk) return;
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + n).classList.add('active');
  document.querySelectorAll('.step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < n) s.classList.add('done');
    if (i + 1 === n) s.classList.add('active');
  });
  currentStep = n;
}

function selectMode(card) {
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('sel'));
  card.classList.add('sel');
  card.querySelector('input').checked = true;
}

async function testConnection() {
  const token = document.getElementById('hs-token').value.trim();
  const btn   = document.getElementById('btn-test');
  const next  = document.getElementById('btn-next-1');
  const input = document.getElementById('hs-token');

  if (!token) {
    showAlert('err', '⚠ Entre ton token HubSpot d\'abord.');
    return;
  }

  btn.textContent = '';
  const sp = document.createElement('span');
  sp.className = 'spin';
  btn.appendChild(sp);
  btn.disabled = true;
  showAlert('info', '⏳ Vérification en cours...');

  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await res.json();

    if (res.ok) {
      input.className = 'ok';
      connectionOk = true;
      next.disabled = false;
      await api.storage.local.set({ hs_token: token });
      showAlert('ok', '✓ Connexion réussie — ' + (data.total || 0) + ' contact(s) dans ton HubSpot.');
    } else {
      input.className = 'err';
      connectionOk = false;
      let msg = data.message || ('Erreur ' + res.status);
      if (res.status === 401) msg = 'Token invalide — copie le token complet depuis HubSpot.';
      if (res.status === 403) msg = 'Permissions manquantes — ajoute crm.objects.contacts.read et .write.';
      showAlert('err', '✗ ' + msg);
    }
  } catch(e) {
    showAlert('err', '✗ Erreur réseau : ' + e.message);
  }

  btn.textContent = 'Tester';
  btn.disabled = false;
}

async function saveAndFinish() {
  const modeEl = document.querySelector('input[name="mode"]:checked');
  const mode   = modeEl ? modeEl.value : 'upsert';
  const delay  = parseInt(document.getElementById('import-delay').value) || 300;
  const paginate = document.getElementById('auto-paginate').value === 'yes';

  await api.storage.local.set({ import_mode: mode, import_delay: delay, auto_paginate: paginate });
  goStep(3);
}

function showAlert(type, msg) {
  const el = document.getElementById('alert-1');
  el.className = 'alert ' + type + ' show';
  el.textContent = msg;
}

async function loadSettings() {
  try {
    const d = await api.storage.local.get(['hs_token', 'import_mode', 'import_delay', 'auto_paginate']);
    if (d.hs_token) {
      document.getElementById('hs-token').value = d.hs_token;
      document.getElementById('hs-token').className = 'ok';
      connectionOk = true;
      document.getElementById('btn-next-1').disabled = false;
    }
    if (d.import_delay) document.getElementById('import-delay').value = d.import_delay;
    if (d.auto_paginate === false) document.getElementById('auto-paginate').value = 'no';
    if (d.import_mode) {
      document.querySelectorAll('.mode-card').forEach(c => {
        const inp = c.querySelector('input');
        const match = inp.value === d.import_mode;
        c.classList.toggle('sel', match);
        inp.checked = match;
      });
    }
  } catch(e) { console.warn('Storage:', e.message); }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  document.getElementById('hs-token').addEventListener('keydown', e => {
    if (e.key === 'Enter') testConnection();
  });
});

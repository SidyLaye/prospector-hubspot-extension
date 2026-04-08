# Prospector → HubSpot

> Extension navigateur universelle qui détecte automatiquement les listes de prospects sur n'importe quelle page web et les importe dans HubSpot CRM.

[![Firefox](https://img.shields.io/badge/Firefox-Add--on-orange?logo=firefox)](https://addons.mozilla.org)
[![Edge](https://img.shields.io/badge/Edge-Add--on-blue?logo=microsoftedge)](https://microsoftedge.microsoft.com/addons)
[![Opera](https://img.shields.io/badge/Opera-Add--on-red?logo=opera)](https://addons.opera.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Fonctionnalités

- **Détection universelle** — Tables HTML, cards, grilles React/Vue/Angular, listes dynamiques JS
- **Pagination automatique** — Parcourt toutes les pages automatiquement (HTML ou JS)
- **Import HubSpot intelligent** — Déduplication par email → nom → téléphone, 3 modes (upsert / skip / always)
- **Mapping complet** — Prénom, nom, email, téléphone, entreprise, titre, statut, date RDV, champs custom
- **Multi-navigateurs** — Chrome, Edge, Opera GX, Brave, Firefox
- **Onboarding guidé** — Page de setup avec test de connexion HubSpot intégré

---

## Installation

### Mode développeur (test local)

```bash
git clone https://github.com/SidyLaye/prospector-hubspot-extension.git
cd prospector-hubspot-extension
```

**Chrome / Edge / Opera GX / Brave :**
1. Ouvre `chrome://extensions/` (ou `edge://extensions/`)
2. Active le **Mode développeur**
3. Clique **Charger l'extension non empaquetée**
4. Sélectionne le dossier cloné

**Firefox :**
1. Copie `manifest.firefox.json` → `manifest.json`
2. Ouvre `about:debugging` → Ce Firefox → Charger un module complémentaire temporaire
3. Sélectionne `manifest.json`

---

## Configuration

1. Crée une application privée HubSpot *(Settings → Integrations → Private Apps)*
2. Scopes requis : `crm.objects.contacts.read` + `crm.objects.contacts.write`
3. Copie le token dans la page de setup de l'extension
4. Teste la connexion — prêt !

---

## Utilisation

1. Va sur n'importe quelle page avec une liste de prospects
2. Clique sur l'icône Prospector dans ta barre d'extensions
3. Clique **Scanner** — contacts détectés automatiquement, pagination incluse
4. Clique **Importer dans HubSpot**

---

## Architecture

```
prospector-hubspot-extension/
├── manifest.json              Chrome / Edge / Opera (MV3)
├── manifest.firefox.json      Firefox (MV2)
├── setup.html                 Onboarding et configuration
├── popup.html / popup.js      Interface popup
├── src/
│   ├── content.js             Détection universelle + pagination
│   ├── background.js          Service worker (MV3)
│   ├── background.firefox.js  Background script (MV2)
│   └── hubspot.js             Module API HubSpot
├── icons/                     PNG 16/32/48/128px
├── build.sh                   Build multi-navigateurs
└── package.json               Config web-ext
```

---

## Build

```bash
npm install
npm run build
# Génère dist/prospector-chrome.zip et dist/prospector-firefox.zip
```

---

## Licence

MIT © [AMBS Agency](https://ambs-agency.com)

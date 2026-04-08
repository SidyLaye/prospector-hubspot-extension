// src/background.js — Service Worker Prospector

// Ouvrir la page de setup au premier lancement
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const setupUrl = chrome.runtime.getURL('setup.html');
    chrome.tabs.create({ url: setupUrl });
  }
});

// Relayer les messages collect_update du content script vers le popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'collect_update') {
    // Broadcast à tous les ports connectés (popup)
    chrome.runtime.sendMessage(msg).catch(() => {});
  }
  return false;
});

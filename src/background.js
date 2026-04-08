// background.js — Compatible Firefox MV2 et Chrome MV3 service worker

var isFirefox = typeof browser !== 'undefined';
var api = isFirefox ? browser : chrome;

api.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    var setupUrl = api.runtime.getURL('setup.html');
    api.tabs.create({ url: setupUrl });
  }
});

api.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === 'collect_update') {
    // Relay update vers le popup (best effort)
    api.runtime.sendMessage(msg).catch ? 
      api.runtime.sendMessage(msg).catch(function() {}) : 
      api.runtime.sendMessage(msg);
  }
  return false;
});

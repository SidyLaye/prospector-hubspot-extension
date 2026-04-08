// background.firefox.js — Compatible Firefox MV2 (pas de ES modules)

browser.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'install') {
    var setupUrl = browser.runtime.getURL('setup.html');
    browser.tabs.create({ url: setupUrl });
  }
});

browser.runtime.onMessage.addListener(function(msg, sender) {
  if (msg.action === 'collect_update') {
    browser.runtime.sendMessage(msg).catch(function() {});
  }
});

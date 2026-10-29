chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'hard-reload' || sender.tab?.id === undefined) return;
  // Igual que Ctrl+F5: recarga la pestaña sin usar la caché.
  chrome.tabs.reload(sender.tab.id, {bypassCache: true});
  sendResponse(true);
});

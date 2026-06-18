chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "OPEN_DASHBOARD") return false;

  chrome.windows.create(
    {
      url: chrome.runtime.getURL("dashboard.html"),
      type: "popup",
      width: 1180,
      height: 760,
      focused: true
    },
    (createdWindow) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, windowId: createdWindow?.id });
    }
  );

  return true;
});

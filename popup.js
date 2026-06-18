const statusEl = document.getElementById("status");
const openDashboardBtn = document.getElementById("openDashboardBtn");

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.dataset.type = type;
}

openDashboardBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      setStatus(chrome.runtime.lastError?.message || response?.error || "Could not open dashboard.", "error");
      return;
    }
    setStatus("Dashboard opened.", "success");
    window.close();
  });
});

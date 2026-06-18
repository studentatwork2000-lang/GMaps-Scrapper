const STORAGE_KEY = "mapsLeadCheckerLeads";
const CSV_COLUMNS = ["sl no", "name", "brief location", "email", "ph", "ratings", "no of ratings", "website status", "website url", "gmaps link", "notes"];
const els = {
  savedCount: document.getElementById("savedCount"), errorCount: document.getElementById("errorCount"), status: document.getElementById("status"),
  maxResults: document.getElementById("maxResults"), delayMs: document.getElementById("delayMs"), resultsBody: document.getElementById("resultsBody"),
  start: document.getElementById("startBtn"), pause: document.getElementById("pauseBtn"), resume: document.getElementById("resumeBtn"), stop: document.getElementById("stopBtn"), export: document.getElementById("exportBtn"), clear: document.getElementById("clearBtn")
};
let errorCount = 0;
function setStatus(message, type = "info") { els.status.textContent = message; els.status.dataset.type = type; }
function storageGet() { return new Promise((resolve) => chrome.storage.local.get({ [STORAGE_KEY]: [] }, (r) => resolve(r[STORAGE_KEY] || []))); }
function storageSet(leads) { return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEY]: leads }, resolve)); }
function leadKey(lead) { const name = (lead.name || "").trim().toLowerCase(); const address = (lead.brief_location || "").trim().toLowerCase(); if (name && name !== "result" && address) return `${name}|${address}`; return (lead.gmaps_link || "").split("?")[0].split("#")[0]; }
function csvEscape(value) { const text = String(value || ""); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
function toCsv(leads) { return [CSV_COLUMNS.join(","), ...leads.map((lead, i) => [i + 1, lead.name, lead.brief_location, lead.email, lead.ph, lead.ratings, lead.no_of_ratings, lead.website_status, lead.website_url, lead.gmaps_link, lead.notes].map(csvEscape).join(","))].join("\n"); }
function render(leads) { els.savedCount.textContent = leads.length; els.errorCount.textContent = errorCount; els.resultsBody.innerHTML = leads.map((lead, i) => `<tr>${[i + 1, lead.name, lead.brief_location, lead.email, lead.ph, lead.ratings, lead.no_of_ratings, lead.website_status, lead.website_url, lead.gmaps_link, lead.notes].map((v) => `<td>${String(v || "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}</td>`).join("")}</tr>`).join(""); }
async function refresh() { render(await storageGet()); }
async function getMapsTab() {
  const tabs = await chrome.tabs.query({ url: ["https://www.google.com/maps/*", "https://maps.google.com/*"] });
  const tab = tabs.find((t) => !t.url.startsWith(chrome.runtime.getURL("")));
  if (!tab) throw new Error("Open a Google Maps search results tab before starting.");
  return tab;
}
function sendToMaps(type, payload = {}) { return getMapsTab().then((tab) => chrome.tabs.sendMessage(tab.id, { type, ...payload })); }
async function saveLead(lead) {
  const leads = await storageGet();
  const key = leadKey(lead);
  if (!key || leads.some((item) => leadKey(item) === key)) return false;
  leads.push({ ...lead, saved_at: new Date().toISOString() });
  await storageSet(leads); await refresh(); return true;
}
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CRAWLER_STATUS") setStatus(message.status, message.level || "info");
  if (message?.type === "CRAWLER_ERROR") { errorCount += 1; renderFromStorage(); setStatus(message.error, "error"); }
  if (message?.type === "CRAWLER_LEAD") saveLead(message.lead).then((saved) => setStatus(saved ? `Saved: ${message.lead.name || "unnamed business"}` : `Skipped duplicate: ${message.lead.name || "unnamed business"}`, "success"));
  if (message?.type === "CRAWLER_DONE") setStatus(message.reason || "Crawl finished.", message.ok === false ? "error" : "success");
});
async function renderFromStorage() { render(await storageGet()); }
els.start.addEventListener("click", async () => { try { errorCount = 0; render(await storageGet()); await sendToMaps("CRAWLER_START", { maxResults: Number(els.maxResults.value) || 50, delayMs: Math.max(800, Number(els.delayMs.value) || 1800) }); setStatus("Crawler started."); } catch (e) { setStatus(e.message, "error"); } });
els.pause.addEventListener("click", () => sendToMaps("CRAWLER_PAUSE").then(() => setStatus("Paused."))); 
els.resume.addEventListener("click", () => sendToMaps("CRAWLER_RESUME").then(() => setStatus("Resumed."))); 
els.stop.addEventListener("click", () => sendToMaps("CRAWLER_STOP").then(() => setStatus("Stopped. Saved data kept."))); 
els.export.addEventListener("click", async () => { const leads = await storageGet(); if (!leads.length) return setStatus("No saved leads to export.", "error"); const url = URL.createObjectURL(new Blob([toCsv(leads)], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "maps_leads.csv"; link.click(); URL.revokeObjectURL(url); setStatus("CSV downloaded as maps_leads.csv.", "success"); });
els.clear.addEventListener("click", async () => { if (!confirm("Clear all saved leads from this browser?")) return; await storageSet([]); await refresh(); setStatus("Saved leads cleared.", "success"); });
refresh();

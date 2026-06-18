const STORAGE_KEY = "mapsLeadCheckerLeads";
const FIELD_IDS = [
  "name",
  "brief_location",
  "email",
  "ph",
  "ratings",
  "no_of_ratings",
  "website_status",
  "website_url",
  "gmaps_link",
  "notes"
];
const CSV_COLUMNS = [
  "sl no",
  "name",
  "brief location",
  "email",
  "ph",
  "ratings",
  "no of ratings",
  "website status",
  "website url",
  "gmaps link",
  "notes"
];

const statusEl = document.getElementById("status");
const savedCountEl = document.getElementById("savedCount");
const extractBtn = document.getElementById("extractBtn");
const saveBtn = document.getElementById("saveBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const websiteUrlInput = document.getElementById("website_url");
const websiteStatusInput = document.getElementById("website_status");

const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linktr.ee", "solo.to", "beacons.ai"];
const ORDERING_DOMAINS = ["ubereats", "doordash", "skipthedishes", "grubhub", "deliveroo", "just-eat"];

function setStatus(message, type = "info") {
  statusEl.textContent = message;
  statusEl.dataset.type = type;
}

function getFieldValue(id) {
  return document.getElementById(id).value.trim();
}

function setFieldValue(id, value) {
  document.getElementById(id).value = value || "";
}

function getCurrentLead() {
  return FIELD_IDS.reduce((lead, id) => {
    lead[id] = getFieldValue(id);
    return lead;
  }, {});
}

function fillForm(lead) {
  FIELD_IDS.forEach((id) => setFieldValue(id, lead[id] || ""));
}

function getWebsiteStatus(url) {
  if (!url) return "NO WEBSITE";
  const lowerUrl = url.toLowerCase();
  if (SOCIAL_DOMAINS.some((domain) => lowerUrl.includes(domain))) return "SOCIAL ONLY";
  if (ORDERING_DOMAINS.some((domain) => lowerUrl.includes(domain))) return "ORDERING PLATFORM ONLY";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? "HAS WEBSITE" : "UNCLEAR";
  } catch (_) {
    return "UNCLEAR";
  }
}

function storageGet() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => resolve(result[STORAGE_KEY] || []));
  });
}

function storageSet(leads) {
  return new Promise((resolve) => chrome.storage.local.set({ [STORAGE_KEY]: leads }, resolve));
}

async function updateSavedCount() {
  const leads = await storageGet();
  savedCountEl.textContent = `${leads.length} saved`;
}

function csvEscape(value) {
  const text = String(value || "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(leads) {
  const rows = [CSV_COLUMNS.join(",")];
  leads.forEach((lead, index) => {
    rows.push([
      index + 1,
      lead.name,
      lead.brief_location,
      lead.email,
      lead.ph,
      lead.ratings,
      lead.no_of_ratings,
      lead.website_status,
      lead.website_url,
      lead.gmaps_link,
      lead.notes
    ].map(csvEscape).join(","));
  });
  return rows.join("\n");
}

async function getActiveMapsTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/(www\.)?google\.com\/maps\//.test(tab.url || "") && !/^https:\/\/maps\.google\.com\//.test(tab.url || "")) {
    throw new Error("Open a Google Maps business profile before extracting.");
  }
  return tab;
}

extractBtn.addEventListener("click", async () => {
  try {
    setStatus("Extracting visible business details...");
    const tab = await getActiveMapsTab();
    const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CURRENT_BUSINESS" });
    if (!response || !response.ok) throw new Error("Could not read this page. Refresh Google Maps and try again.");
    fillForm(response.lead);
    setStatus("Extracted. Review and correct fields before saving.", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

saveBtn.addEventListener("click", async () => {
  const lead = getCurrentLead();
  if (!lead.name && !lead.brief_location && !lead.ph && !lead.website_url) {
    setStatus("Nothing to save yet. Extract a business or enter details manually.", "error");
    return;
  }
  const leads = await storageGet();
  leads.push({ ...lead, saved_at: new Date().toISOString() });
  await storageSet(leads);
  await updateSavedCount();
  setStatus("Lead saved locally.", "success");
});

exportBtn.addEventListener("click", async () => {
  const leads = await storageGet();
  if (!leads.length) {
    setStatus("No saved leads to export.", "error");
    return;
  }
  const blob = new Blob([toCsv(leads)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "maps_leads.csv";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("CSV downloaded as maps_leads.csv.", "success");
});

clearBtn.addEventListener("click", async () => {
  await storageSet([]);
  await updateSavedCount();
  setStatus("Saved leads cleared.", "success");
});

websiteUrlInput.addEventListener("input", () => {
  websiteStatusInput.value = getWebsiteStatus(websiteUrlInput.value.trim());
});

updateSavedCount();

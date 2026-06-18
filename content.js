(function () {
  const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linktr.ee", "solo.to", "beacons.ai"];
  const ORDERING_DOMAINS = ["ubereats", "doordash", "skipthedishes", "grubhub", "deliveroo", "just-eat", "ritual", "toasttab"];
  const EXCLUDED_RESULT_WORDS = ["feedback", "send feedback", "report", "share", "save", "directions", "call", "website", "menu", "reviews", "photos"];
  let crawler = { running: false, paused: false, stopped: true, index: 0, maxResults: 50, delayMs: 1800, visitedResultKeys: new Set(), errors: 0, emptyScrolls: 0 };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textOf = (node) => ((node && (node.innerText || node.textContent)) || "").replace(/\s+/g, " ").trim();
  function isVisible(el) { const rect = el?.getBoundingClientRect?.(); const style = el ? window.getComputedStyle(el) : null; return !!(rect && rect.width > 10 && rect.height > 10 && style.visibility !== "hidden" && style.display !== "none"); }
  const visibleNodes = (selector, root = document) => Array.from(root.querySelectorAll(selector)).filter(isVisible);
  function post(message) { try { const sent = chrome.runtime.sendMessage(message); if (sent?.catch) sent.catch(() => {}); } catch (_) {} }
  function log(...args) { console.log("[MapsCrawler]", ...args); }
  function normalizedUrl(url) { if (!url) return ""; try { const parsed = new URL(url, location.href); if (parsed.hostname.includes("google") && parsed.pathname === "/url") return parsed.searchParams.get("q") || parsed.searchParams.get("url") || parsed.href; return parsed.href; } catch (_) { return url; } }
  function cleanedLabel(node) { return `${node?.getAttribute?.("aria-label") || ""} ${textOf(node)} ${node?.getAttribute?.("data-item-id") || ""}`.replace(/\s+/g, " ").trim(); }
  function findByAriaTextOrData(keywords, selectors = "button, a, div[role='button'], span, div") { const lower = keywords.map((k) => k.toLowerCase()); return visibleNodes(selectors).find((node) => lower.some((k) => cleanedLabel(node).toLowerCase().includes(k))); }
  const stripLeadLabel = (value, label) => (value || "").replace(new RegExp(`^${label}:?\\s*`, "i"), "").trim();

  function normalizePlaceKey(href, index) {
    try {
      const url = new URL(href, location.origin);
      const raw = url.href;
      const placeMatch = raw.match(/\/maps\/place\/([^/?#]+)/);
      const placeName = placeMatch ? decodeURIComponent(placeMatch[1]).replace(/\+/g, " ").trim() : "";
      const cidMatch = raw.match(/[?&]cid=([^&]+)/);
      if (cidMatch) return "cid:" + cidMatch[1];
      const dataIdMatch = raw.match(/!1s([^!]+)/);
      if (dataIdMatch) return "data:" + dataIdMatch[1];
      const coordMatch = raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      const coords = coordMatch ? coordMatch[1] + "," + coordMatch[2] : "";
      if (placeName && coords) return "place:" + placeName.toLowerCase() + "|" + coords;
      if (placeName) return "place:" + placeName.toLowerCase();
      return "href:" + raw.split("&authuser=")[0].split("&hl=")[0].split("#")[0];
    } catch (e) {
      return "fallback:" + index + ":" + String(href || "").slice(0, 120);
    }
  }

  function stopForBlockIfPresent() { const txt = textOf(document.body).toLowerCase(); return ["unusual traffic", "captcha", "not a robot", "sign in", "can't access", "something went wrong"].some((v) => txt.includes(v)); }
  function findFeed() { return document.querySelector('div[role="feed"]'); }
  function findResultsScrollContainer() { return findFeed() || visibleNodes("div, section").filter((el) => el.scrollHeight > el.clientHeight + 120 && el.querySelector('a[href*="/maps/place/"]')).sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null; }
  function resultLabel(anchor) { const aria = anchor.getAttribute("aria-label") || ""; if (aria && aria.toLowerCase() !== "result" && !EXCLUDED_RESULT_WORDS.some((word) => aria.toLowerCase().includes(word))) return aria.trim(); return textOf(anchor); }
  function collectResultCandidates() {
    const feed = findFeed();
    const root = feed || findResultsScrollContainer() || document;
    const seen = new Set();
    const candidates = [];
    const anchors = Array.from(root.querySelectorAll('a[href*="/maps/place/"]'));
    anchors.forEach((anchor, index) => {
      const href = anchor.href || anchor.getAttribute("href") || "";
      const labelText = cleanedLabel(anchor).toLowerCase();
      if (!isVisible(anchor) || !href.includes("/maps/place/") || href.includes("google.com/maps/contrib")) return;
      if (EXCLUDED_RESULT_WORDS.some((word) => labelText.includes(word))) return;
      if (feed && !feed.contains(anchor)) return;
      const key = normalizePlaceKey(href, index);
      if (!key || key === "result" || seen.has(key)) return;
      seen.add(key);
      candidates.push({ key, href, label: resultLabel(anchor), element: anchor });
    });
    log("candidates found:", candidates.length);
    candidates.forEach((candidate) => log("candidate:", candidate.key, candidate.href));
    return candidates;
  }

  function profileNameText() { const value = textOf(document.querySelector("h1")); const lower = value.toLowerCase(); return value && !["google maps", "results", "result"].includes(lower) ? value : ""; }
  async function waitForProfileLoad() { for (let i = 0; i < 32; i++) { await sleep(250); if (profileNameText()) return true; } return false; }
  async function waitWhilePaused() { while (crawler.running && crawler.paused && !crawler.stopped) await sleep(400); }
  async function returnToResults() {
    const back = visibleNodes('button[aria-label*="Back" i], button[jsaction*="back"], button').find((node) => cleanedLabel(node).toLowerCase().includes("back"));
    if (back) back.click(); else history.back();
    for (let i = 0; i < 20; i++) { await sleep(250); if (collectResultCandidates().length) return true; }
    return false;
  }

  function extractName() { const name = profileNameText(); log("extracted name:", name); return name; }
  function extractAddress() { const n = document.querySelector('button[data-item-id="address"]') || findByAriaTextOrData(["address"], "button, div[role='button'], a"); return stripLeadLabel(n ? cleanedLabel(n) : "", "address"); }
  function extractWebsite() {
    const direct = document.querySelector('a[data-item-id="authority"]'); if (direct?.href) { const website = normalizedUrl(direct.href); log("extracted website:", website); return website; }
    const a = visibleNodes('a[href], button[aria-label*="Website" i], a[aria-label*="Website" i]').find((x) => cleanedLabel(x).toLowerCase().includes("website") && (!x.href || !x.href.includes("/maps/")));
    const website = normalizedUrl(a?.href || ""); log("extracted website:", website); return website;
  }
  function extractPhone() { const pat = /(?:\+?\d[\d\s().-]{7,}\d)/; const node = document.querySelector('button[data-item-id*="phone"]') || findByAriaTextOrData(["phone", "call"], "button, div[role='button'], a, span"); const m = cleanedLabel(node).match(pat); if (m) return m[0].trim(); const body = textOf(document.querySelector("[role='main']") || document.body).match(pat); return body ? body[0].trim() : ""; }
  function extractRatingInfo() { const profile = document.querySelector("[role='main']") || document.body; const combined = `${visibleNodes('[aria-label*="stars" i], [aria-label*="rating" i], button, span, div', profile).map(cleanedLabel).join(" ")} ${textOf(profile)}`; const rating = combined.match(/([0-5]\.\d)\s*(?:stars?)?/i) || combined.match(/\b([0-5]\.\d)\b/); const reviews = combined.match(/\(([\d,]+)\)/) || combined.match(/\b([\d,]+)\s*(?:reviews?|ratings?)\b/i); const info = { ratings: rating ? rating[1] : "", no_of_ratings: reviews ? reviews[1].replace(/,/g, "") : "" }; log("extracted rating:", info.ratings); log("extracted review count:", info.no_of_ratings); return info; }
  function extractEmail() { const m = textOf(document.querySelector("[role='main']") || document.body).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m ? m[0] : ""; }
  function websiteStatus(url) { if (!url) return "NO WEBSITE"; const lower = url.toLowerCase(); if (SOCIAL_DOMAINS.some((d) => lower.includes(d))) return "SOCIAL ONLY"; if (ORDERING_DOMAINS.some((d) => lower.includes(d))) return "ORDERING PLATFORM ONLY"; try { const p = new URL(url); return ["http:", "https:"].includes(p.protocol) ? "HAS WEBSITE" : "UNCLEAR"; } catch (_) { return "UNCLEAR"; } }
  function extractLead() { const website_url = extractWebsite(); const rating = extractRatingInfo(); const name = extractName(); return { name, brief_location: extractAddress(), email: extractEmail(), ph: extractPhone(), ratings: rating.ratings, no_of_ratings: rating.no_of_ratings, website_status: websiteStatus(website_url), website_url, gmaps_link: location.href, notes: name ? "" : "Name unclear" }; }

  async function openCandidate(candidate) {
    log("clicking:", candidate.key, candidate.label);
    candidate.element.scrollIntoView({ block: "center", behavior: "smooth" });
    await sleep(500);
    candidate.element.click();
    const loaded = await waitForProfileLoad();
    if (!loaded) { await sleep(500); candidate.element.click(); return waitForProfileLoad(); }
    return true;
  }

  async function crawlLoop() {
    post({ type: "CRAWLER_STATUS", status: "Detecting Google Maps results..." });
    while (crawler.running && !crawler.stopped && crawler.visitedResultKeys.size < crawler.maxResults) {
      if (stopForBlockIfPresent()) { crawler.running = false; post({ type: "CRAWLER_DONE", ok: false, reason: "Crawler stopped because Google Maps showed a block/captcha/error." }); return; }
      await waitWhilePaused(); if (!crawler.running || crawler.stopped) break;
      const candidates = collectResultCandidates();
      let next = candidates.find((candidate) => { const visited = crawler.visitedResultKeys.has(candidate.key); if (visited) log("skipped duplicate:", candidate.key, candidate.href); return !visited; });
      if (!next) { const scroller = findResultsScrollContainer(); if (!scroller || crawler.emptyScrolls >= 3) break; const beforeKeys = new Set(candidates.map((c) => c.key)); scroller.scrollBy({ top: Math.max(500, scroller.clientHeight * 0.85), behavior: "smooth" }); post({ type: "CRAWLER_STATUS", status: "Scrolling results panel for more businesses..." }); await sleep(Math.max(2200, crawler.delayMs)); const hasNew = collectResultCandidates().some((c) => !beforeKeys.has(c.key) && !crawler.visitedResultKeys.has(c.key)); crawler.emptyScrolls = hasNew ? 0 : crawler.emptyScrolls + 1; continue; }
      crawler.emptyScrolls = 0; crawler.visitedResultKeys.add(next.key); crawler.index += 1; post({ type: "CRAWLER_STATUS", status: `Opening result ${crawler.visitedResultKeys.size} of ${crawler.maxResults}...` });
      const loaded = await openCandidate(next); await sleep(crawler.delayMs); const lead = loaded ? extractLead() : { name: "", brief_location: "", email: "", ph: "", ratings: "", no_of_ratings: "", website_status: "UNCLEAR", website_url: "", gmaps_link: next.href, notes: "Profile load failed" };
      post({ type: "CRAWLER_LEAD", lead }); await sleep(Math.max(500, crawler.delayMs / 2)); await returnToResults(); await sleep(Math.max(500, crawler.delayMs / 2));
    }
    crawler.running = false; post({ type: "CRAWLER_DONE", ok: true, reason: `Crawl finished. Visited ${crawler.visitedResultKeys.size} result(s).` });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EXTRACT_CURRENT_BUSINESS") sendResponse({ ok: true, lead: extractLead() });
    if (message?.type === "CRAWLER_START") { crawler = { running: true, paused: false, stopped: false, index: 0, maxResults: message.maxResults || 50, delayMs: message.delayMs || 1800, visitedResultKeys: new Set(), errors: 0, emptyScrolls: 0 }; crawlLoop(); sendResponse({ ok: true }); }
    if (message?.type === "CRAWLER_PAUSE") { crawler.paused = true; sendResponse({ ok: true }); }
    if (message?.type === "CRAWLER_RESUME") { crawler.paused = false; sendResponse({ ok: true }); }
    if (message?.type === "CRAWLER_STOP") { crawler.stopped = true; crawler.running = false; sendResponse({ ok: true }); }
    return true;
  });
})();

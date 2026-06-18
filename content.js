(function () {
  const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linktr.ee", "solo.to", "beacons.ai"];
  const ORDERING_DOMAINS = ["ubereats", "doordash", "skipthedishes", "grubhub", "deliveroo", "just-eat", "ritual", "toasttab"];
  let crawler = { running: false, paused: false, stopped: true, index: 0, maxResults: 50, delayMs: 1800, visited: new Set(), errors: 0 };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const textOf = (node) => ((node && (node.innerText || node.textContent)) || "").replace(/\s+/g, " ").trim();
  function isVisible(node) { if (!node || !(node instanceof Element)) return false; const s = getComputedStyle(node); const r = node.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0; }
  const visibleNodes = (selector, root = document) => Array.from(root.querySelectorAll(selector)).filter(isVisible);
  function post(message) { try { const sent = chrome.runtime.sendMessage(message); if (sent?.catch) sent.catch(() => {}); } catch (_) {} }
  function normalizedUrl(url) { if (!url) return ""; try { const parsed = new URL(url, location.href); if (parsed.hostname.includes("google") && parsed.pathname === "/url") return parsed.searchParams.get("q") || parsed.searchParams.get("url") || parsed.href; return parsed.href; } catch (_) { return url; } }
  function cleanedLabel(node) { return `${node?.getAttribute?.("aria-label") || ""} ${textOf(node)} ${node?.getAttribute?.("data-item-id") || ""}`.replace(/\s+/g, " ").trim(); }
  function findByAriaTextOrData(keywords, selectors = "button, a, div[role='button'], span, div") { const lower = keywords.map((k) => k.toLowerCase()); return visibleNodes(selectors).find((node) => lower.some((k) => cleanedLabel(node).toLowerCase().includes(k))); }
  const stripLeadLabel = (value, label) => (value || "").replace(new RegExp(`^${label}:?\\s*`, "i"), "").trim();

  function stopForBlockIfPresent() { const txt = textOf(document.body).toLowerCase(); return ["unusual traffic", "captcha", "not a robot", "sign in", "can't access", "something went wrong"].some((v) => txt.includes(v)); }
  function findFeed() { return document.querySelector("div[role='feed']") || visibleNodes("div, section").filter((el) => el.scrollHeight > el.clientHeight + 120).sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null; }
  function getResultCards() {
    const feed = findFeed() || document;
    const links = visibleNodes('a[href*="/maps/place"], a[href*="!1s0x"]', feed);
    const cards = links.map((link) => link.closest('[role="article"], div[jsaction], div.Nv2PK, div[role="feed"] > div') || link).filter(Boolean);
    return Array.from(new Set(cards)).filter((card) => textOf(card).toLowerCase() !== "result");
  }
  function cardKey(card) { const link = card.matches?.("a[href]") ? card : card.querySelector?.('a[href*="/maps/place"], a[href*="!1s0x"]'); return normalizedUrl(link?.href || "") || textOf(card).slice(0, 120); }
  async function waitForProfileChange(oldUrl) { for (let i = 0; i < 30; i++) { await sleep(250); if (location.href !== oldUrl && extractName()) return true; if (extractName() && visibleNodes("h1").length) return true; } return false; }
  async function waitWhilePaused() { while (crawler.running && crawler.paused && !crawler.stopped) await sleep(400); }
  async function returnToResults() {
    const back = visibleNodes('button[aria-label*="Back" i], button[jsaction*="back"], button').find((node) => cleanedLabel(node).toLowerCase().includes("back"));
    if (back) back.click(); else history.back();
    for (let i = 0; i < 20; i++) { await sleep(250); if (getResultCards().length) return true; }
    return false;
  }

  function extractName() {
    for (const selector of ["h1 span", "h1[aria-level='1']", "h1.DUwDvf", "[role='main'] h1", "h1"]) { const value = textOf(visibleNodes(selector)[0]); if (value && value.toLowerCase() !== "result") return value; }
    return "";
  }
  function extractAddress() { const n = document.querySelector('button[data-item-id="address"]') || findByAriaTextOrData(["address"], "button, div[role='button'], a"); return stripLeadLabel(n ? cleanedLabel(n) : "", "address"); }
  function extractWebsite() {
    const direct = document.querySelector('a[data-item-id="authority"]'); if (direct?.href) return normalizedUrl(direct.href);
    const anchors = visibleNodes("a[href]"); const a = anchors.find((x) => cleanedLabel(x).toLowerCase().includes("website") && !x.href.includes("/maps/")); return normalizedUrl(a?.href || "");
  }
  function extractPhone() { const pat = /(?:\+?\d[\d\s().-]{7,}\d)/; const node = document.querySelector('button[data-item-id*="phone"]') || findByAriaTextOrData(["phone", "call"], "button, div[role='button'], a, span"); const m = cleanedLabel(node).match(pat); if (m) return m[0].trim(); const body = textOf(document.querySelector("[role='main']") || document.body).match(pat); return body ? body[0].trim() : ""; }
  function extractRatingInfo() { const main = textOf(document.querySelector("[role='main']") || document.body); const aria = visibleNodes('[aria-label*="stars" i], button[aria-label*="rating" i], span, div, button').map(cleanedLabel).join(" "); const combined = `${aria} ${main}`; const rating = combined.match(/([0-5]\.\d)\s*(stars?)?/i) || combined.match(/\b([0-5]\.\d)\b/); const reviews = combined.match(/\(?([\d,]+)\)?\s*(?:reviews?|ratings?)/i); return { ratings: rating ? rating[1] : "", no_of_ratings: reviews ? reviews[1].replace(/,/g, "") : "" }; }
  function extractEmail() { const m = textOf(document.querySelector("[role='main']") || document.body).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); return m ? m[0] : ""; }
  function websiteStatus(url) { if (!url) return "NO WEBSITE"; const lower = url.toLowerCase(); if (SOCIAL_DOMAINS.some((d) => lower.includes(d))) return "SOCIAL ONLY"; if (ORDERING_DOMAINS.some((d) => lower.includes(d))) return "ORDERING PLATFORM ONLY"; try { const p = new URL(url); return ["http:", "https:"].includes(p.protocol) ? "HAS WEBSITE" : "UNCLEAR"; } catch (_) { return "UNCLEAR"; } }
  function extractLead() { const website_url = extractWebsite(); const rating = extractRatingInfo(); const name = extractName(); return { name, brief_location: extractAddress(), email: extractEmail(), ph: extractPhone(), ratings: rating.ratings, no_of_ratings: rating.no_of_ratings, website_status: websiteStatus(website_url), website_url, gmaps_link: location.href, notes: name ? "" : "Name unclear" }; }

  async function crawlLoop() {
    post({ type: "CRAWLER_STATUS", status: "Detecting Google Maps results..." });
    while (crawler.running && !crawler.stopped && crawler.visited.size < crawler.maxResults) {
      if (stopForBlockIfPresent()) { crawler.running = false; post({ type: "CRAWLER_DONE", ok: false, reason: "Crawler stopped because Google Maps showed a block/captcha/error." }); return; }
      await waitWhilePaused(); if (!crawler.running || crawler.stopped) break;
      const cards = getResultCards();
      let next = cards.find((card) => !crawler.visited.has(cardKey(card)));
      if (!next) { const feed = findFeed(); if (!feed) break; const before = feed.scrollTop; feed.scrollBy({ top: Math.max(500, feed.clientHeight * 0.85), behavior: "smooth" }); post({ type: "CRAWLER_STATUS", status: "Scrolling results panel for more businesses..." }); await sleep(Math.max(2200, crawler.delayMs)); if (feed.scrollTop === before && getResultCards().every((c) => crawler.visited.has(cardKey(c)))) break; continue; }
      const key = cardKey(next); crawler.visited.add(key); crawler.index += 1; next.scrollIntoView({ block: "center", behavior: "smooth" }); await sleep(350); const oldUrl = location.href; next.click(); post({ type: "CRAWLER_STATUS", status: `Opening result ${crawler.visited.size} of ${crawler.maxResults}...` }); await waitForProfileChange(oldUrl); await sleep(crawler.delayMs); const lead = extractLead(); if (!lead.name) lead.notes = "Name unclear"; post({ type: "CRAWLER_LEAD", lead }); await sleep(Math.max(500, crawler.delayMs / 2)); await returnToResults(); await sleep(Math.max(500, crawler.delayMs / 2));
    }
    crawler.running = false; post({ type: "CRAWLER_DONE", ok: true, reason: `Crawl finished. Visited ${crawler.visited.size} result(s).` });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "EXTRACT_CURRENT_BUSINESS") sendResponse({ ok: true, lead: extractLead() });
    if (message?.type === "CRAWLER_START") { crawler = { running: true, paused: false, stopped: false, index: 0, maxResults: message.maxResults || 50, delayMs: message.delayMs || 1800, visited: new Set(), errors: 0 }; crawlLoop(); sendResponse({ ok: true }); }
    if (message?.type === "CRAWLER_PAUSE") { crawler.paused = true; sendResponse({ ok: true }); }
    if (message?.type === "CRAWLER_RESUME") { crawler.paused = false; sendResponse({ ok: true }); }
    if (message?.type === "CRAWLER_STOP") { crawler.stopped = true; crawler.running = false; sendResponse({ ok: true }); }
    return true;
  });
})();

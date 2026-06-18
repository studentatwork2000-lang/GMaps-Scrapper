(function () {
  const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linktr.ee", "solo.to", "beacons.ai"];
  const ORDERING_DOMAINS = ["ubereats", "doordash", "skipthedishes", "grubhub", "deliveroo", "just-eat"];

  function textOf(node) {
    return ((node && (node.innerText || node.textContent)) || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(node) {
    if (!node || !(node instanceof Element)) return false;
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }

  function normalizedUrl(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.hostname.includes("google") && parsed.pathname === "/url") {
        return parsed.searchParams.get("q") || parsed.searchParams.get("url") || parsed.href;
      }
      return parsed.href;
    } catch (_) {
      return url;
    }
  }

  function cleanedLabel(node) {
    return `${node.getAttribute("aria-label") || ""} ${textOf(node)} ${node.getAttribute("data-item-id") || ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function visibleNodes(selectors) {
    return Array.from(document.querySelectorAll(selectors)).filter(isVisible);
  }

  function findByAriaTextOrData(keywords, selectors = "button, a, div[role='button'], span, div") {
    const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
    return visibleNodes(selectors).find((node) => {
      const haystack = cleanedLabel(node).toLowerCase();
      return lowerKeywords.some((keyword) => haystack.includes(keyword));
    });
  }

  function stripLeadLabel(value, label) {
    return (value || "").replace(new RegExp(`^${label}:?\\s*`, "i"), "").trim();
  }

  function extractName() {
    const candidates = [
      "h1[aria-level='1']",
      "h1.DUwDvf",
      "[role='main'] h1",
      "h1"
    ];

    for (const selector of candidates) {
      const text = textOf(visibleNodes(selector)[0]);
      if (text) return text;
    }

    const main = document.querySelector("[role='main']");
    const mainText = textOf(main).split(" ").slice(0, 8).join(" ");
    return mainText || "";
  }

  function extractAddress() {
    const addressNode = findByAriaTextOrData(["address"], "button, div[role='button'], a");
    return stripLeadLabel(addressNode ? cleanedLabel(addressNode) : "", "address");
  }

  function extractWebsite() {
    const anchors = visibleNodes("a[href]");
    const websiteAnchor = anchors.find((anchor) => {
      const haystack = cleanedLabel(anchor).toLowerCase();
      const href = anchor.getAttribute("href") || "";
      return haystack.includes("website") && !href.includes("/maps/");
    });

    if (websiteAnchor) return normalizedUrl(websiteAnchor.href);

    const dataWebsite = anchors.find((anchor) => (anchor.getAttribute("data-item-id") || "").toLowerCase().includes("authority"));
    return normalizedUrl(dataWebsite && dataWebsite.href);
  }

  function extractPhone() {
    const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/;
    const phoneNode = findByAriaTextOrData(["phone", "call"], "button, div[role='button'], a, span");
    const label = phoneNode ? cleanedLabel(phoneNode) : "";
    const labelMatch = label.match(phonePattern);
    if (labelMatch) return labelMatch[0].trim();

    const mainText = textOf(document.querySelector("[role='main']") || document.body);
    const bodyMatch = mainText.match(phonePattern);
    return bodyMatch ? bodyMatch[0].trim() : "";
  }

  function extractRatingInfo() {
    const mainText = textOf(document.querySelector("[role='main']") || document.body);
    const ratingNode = findByAriaTextOrData(["stars", "reviews", "rating"], "span, div, button");
    const combined = `${ratingNode ? cleanedLabel(ratingNode) : ""} ${mainText}`;
    const ratingMatch = combined.match(/(?:rated\s*)?([1-5](?:\.\d)?)\s*(?:stars?|rating)?/i);
    const reviewsMatch = combined.match(/\(?([\d,]+)\)?\s*(?:reviews?|ratings?)/i);

    return {
      ratings: ratingMatch ? ratingMatch[1] : "",
      no_of_ratings: reviewsMatch ? reviewsMatch[1].replace(/,/g, "") : ""
    };
  }

  function extractEmail() {
    const mainText = textOf(document.querySelector("[role='main']") || document.body);
    const match = mainText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : "";
  }

  function websiteStatus(url) {
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

  function extractLead() {
    const website_url = extractWebsite();
    const ratingInfo = extractRatingInfo();

    return {
      name: extractName(),
      brief_location: extractAddress(),
      email: extractEmail(),
      ph: extractPhone(),
      ratings: ratingInfo.ratings,
      no_of_ratings: ratingInfo.no_of_ratings,
      website_url,
      website_status: websiteStatus(website_url),
      gmaps_link: window.location.href,
      notes: ""
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "EXTRACT_CURRENT_BUSINESS") {
      sendResponse({ ok: true, lead: extractLead() });
    }
    return true;
  });
})();

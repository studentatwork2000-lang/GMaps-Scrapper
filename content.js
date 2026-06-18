(function () {
  const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "linktr.ee", "solo.to", "beacons.ai"];
  const ORDERING_DOMAINS = ["ubereats", "doordash", "skipthedishes", "grubhub", "deliveroo", "just-eat"];

  function textOf(node) {
    return (node && (node.innerText || node.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function visible(node) {
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

  function firstVisibleBySelectors(selectors) {
    for (const selector of selectors) {
      const node = Array.from(document.querySelectorAll(selector)).find(visible);
      const text = textOf(node);
      if (text) return text;
    }
    return "";
  }

  function findByAriaOrText(keywords, selectors = "button, a, div[role='button'], span, div") {
    const lowerKeywords = keywords.map((keyword) => keyword.toLowerCase());
    return Array.from(document.querySelectorAll(selectors)).find((node) => {
      if (!visible(node)) return false;
      const haystack = `${node.getAttribute("aria-label") || ""} ${textOf(node)} ${node.getAttribute("data-item-id") || ""}`.toLowerCase();
      return lowerKeywords.some((keyword) => haystack.includes(keyword));
    });
  }

  function extractName() {
    return firstVisibleBySelectors([
      "h1[aria-level='1']",
      "h1",
      "[role='main'] h1",
      "div[aria-label][role='main'] h1"
    ]);
  }

  function extractAddress() {
    const addressNode = findByAriaOrText(["address"], "button, div[role='button'], a");
    const label = addressNode && (addressNode.getAttribute("aria-label") || textOf(addressNode));
    return (label || "").replace(/^address:\s*/i, "").trim();
  }

  function extractWebsite() {
    const anchors = Array.from(document.querySelectorAll("a[href]")).filter(visible);
    const websiteAnchor = anchors.find((anchor) => {
      const haystack = `${anchor.getAttribute("aria-label") || ""} ${textOf(anchor)} ${anchor.href}`.toLowerCase();
      return haystack.includes("website") && !anchor.href.includes("google.com/maps");
    });
    return normalizedUrl(websiteAnchor && websiteAnchor.href);
  }

  function extractPhone() {
    const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/;
    const phoneNode = findByAriaOrText(["phone", "call"], "button, div[role='button'], a, span");
    const label = phoneNode && `${phoneNode.getAttribute("aria-label") || ""} ${textOf(phoneNode)}`;
    const ariaMatch = label && label.match(phonePattern);
    if (ariaMatch) return ariaMatch[0].trim();

    const bodyMatch = textOf(document.body).match(phonePattern);
    return bodyMatch ? bodyMatch[0].trim() : "";
  }

  function extractRatingInfo() {
    const ratingNode = findByAriaOrText(["stars", "reviews", "rating"], "span, div, button");
    const text = ratingNode ? `${ratingNode.getAttribute("aria-label") || ""} ${textOf(ratingNode)}` : textOf(document.body);
    const ratingMatch = text.match(/([1-5](?:\.\d)?)\s*(?:stars?|rating)?/i);
    const reviewsMatch = text.match(/([\d,]+)\s*(?:reviews?|ratings?)/i);
    return {
      ratings: ratingMatch ? ratingMatch[1] : "",
      no_of_ratings: reviewsMatch ? reviewsMatch[1].replace(/,/g, "") : ""
    };
  }

  function extractEmail() {
    const match = textOf(document.body).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : "";
  }

  function websiteStatus(url) {
    if (!url) return "NO WEBSITE";
    const lowerUrl = url.toLowerCase();
    if (SOCIAL_DOMAINS.some((domain) => lowerUrl.includes(domain))) return "SOCIAL ONLY";
    if (ORDERING_DOMAINS.some((domain) => lowerUrl.includes(domain))) return "ORDERING PLATFORM ONLY";
    if (/^https?:\/\//i.test(url)) return "HAS WEBSITE";
    return "UNCLEAR";
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
  });
})();

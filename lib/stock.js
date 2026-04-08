"use strict";

const cheerio = require("cheerio");
const crypto  = require("crypto");
const { CTA_SELECTOR, hasPriceText } = require("./selectors");

const JSON_LD_MAX_DEPTH = 10;
const JSON_LD_MAX_SIZE  = 100000; // max JSON-LD string length before skipping (100KB)
const CTA_ELEMENT_MAX   = 500;    // max outerHTML chars per element before hashing

// detectStock parses an HTML page and returns stock signals.
//
// Primary signal:  text of the main CTA button (a[href="#!"])
//   In stock:      shows price, e.g. "40,00 C$"
//   Out of stock:  shows "Indisponible"
//
// Secondary:  enabled add-to-cart button, JSON-LD offers.availability
// CTA is the authoritative source; secondary signals are used only as fallback.
function detectStock(html) {
  const $ = cheerio.load(html);

  let ctaText = "";
  $(CTA_SELECTOR).each(function() {
    const t = $(this).text().trim();
    if (t.length > 0) { ctaText = t; return false; } // take first non-empty match
  });

  const ctaHasPrice      = hasPriceText(ctaText);
  const ctaIsUnavailable = /indisponible/i.test(ctaText);
  const ctaIsAddToCart   = /ajouter|panier|add.to.cart/i.test(ctaText);

  const hasActiveButton = $("button, input[type=submit]").filter(function() {
    const t = ($(this).text() + $(this).val()).toLowerCase();
    return t.includes("ajouter") || t.includes("panier") || t.includes("add to cart");
  }).filter(function() {
    return !$(this).attr("disabled");
  }).length > 0;

  let jsonLdInStock = false;
  let jsonLdOOS     = false;

  $('script[type="application/ld+json"]').each(function() {
    try {
      const jsonText = $(this).html();
      // Skip oversized JSON-LD blocks to prevent slowdowns from compromised pages.
      if (jsonText.length > JSON_LD_MAX_SIZE) return;

      // WeakSet prevents infinite recursion on circular references or shared nodes.
      const visited = new WeakSet();
      const walk = (obj, depth) => {
        if (!obj || typeof obj !== "object" || depth > JSON_LD_MAX_DEPTH) return;
        if (visited.has(obj)) return;
        visited.add(obj);
        if (obj["@type"] === "Product" && obj.offers) {
          [].concat(obj.offers).forEach((o) => {
            if (!o || !o.availability) return;
            const a = o.availability.toLowerCase();
            if (a.includes("instock") || a.includes("preorder") || a.includes("presale"))
              jsonLdInStock = true;
            if (a.includes("outofstock") || a.includes("discontinued") || a.includes("soldout"))
              jsonLdOOS = true;
          });
        }
        Object.values(obj).forEach((v) => { if (v && typeof v === "object") walk(v, depth + 1); });
      };
      walk(JSON.parse(jsonText), 0);
    } catch (_) {}
  });

  let likelyAvailable, likelyUnavailable;
  if (ctaHasPrice || ctaIsAddToCart) {
    likelyAvailable = true; likelyUnavailable = false;
  } else if (ctaIsUnavailable) {
    likelyAvailable = false; likelyUnavailable = true;
  } else {
    likelyAvailable   = jsonLdInStock || hasActiveButton;
    likelyUnavailable = jsonLdOOS;
  }

  const fingerprint = simpleHash(extractCtaRegion($));
  return { likelyAvailable, likelyUnavailable, ctaText, fingerprint };
}

// Extracts the CTA area HTML for fingerprinting.
// Each element is capped at CTA_ELEMENT_MAX chars to prevent unbounded strings
// (e.g. inlined SVGs or giant data-* attributes).
function extractCtaRegion($) {
  const parts = [];
  $(CTA_SELECTOR + ", button, input[type=submit], [class*=\"add-to-cart\"], [class*=\"product-action\"]")
    .each(function() {
      parts.push(($(this).prop("outerHTML") || "").slice(0, CTA_ELEMENT_MAX));
    });
  return parts.join("|") || "no-cta";
}

// SHA-256 truncated to 16 hex chars (64 bits).
// Collision-resistant enough for change detection; not for adversarial use.
function simpleHash(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

module.exports = { detectStock, extractCtaRegion, simpleHash };

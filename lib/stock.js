"use strict";

const cheerio = require("cheerio");
const crypto = require("crypto");
const { CTA_SELECTOR, SALABLE_FORM_SELECTOR, hasPriceText } = require("./selectors");

const JSON_LD_MAX_DEPTH = 10;
const JSON_LD_MAX_SIZE = 100000; // max JSON-LD string length before skipping (100KB)
const CTA_ELEMENT_MAX = 500; // max outerHTML chars per element before hashing

// Reads the server-rendered inventory state from the salable-item form.
// Returns { exists, available, unavailable } — exists=false means no form found,
// in which case detectStock falls back to the legacy CTA / JSON-LD signals.
//
// As of the 2026 redesign the form is authoritative:
//   data-track-inventory="true" + data-inventory="N"  ->  N>0 available, N==0 not
// For products that don't track inventory we fall back to the CSS state classes
// (out-of-stock / not-available). Note: "not-available" contains the substring
// "available", so we only ever match the NEGATIVE tokens as whole words.
function readFormStock($) {
  const $form = $(SALABLE_FORM_SELECTOR).first();
  if ($form.length === 0) return { exists: false, available: false, unavailable: false };

  const cls = " " + ($form.attr("class") || "").toLowerCase() + " ";
  const classOOS = cls.includes(" out-of-stock ") || cls.includes(" not-available ");

  const tracks = ($form.attr("data-track-inventory") || "").toLowerCase() === "true";
  const invNum = parseInt($form.attr("data-inventory"), 10);

  if (tracks && Number.isFinite(invNum)) {
    // Authoritative numeric inventory count.
    return { exists: true, available: invNum > 0, unavailable: invNum <= 0 };
  }
  // Inventory not tracked / no parseable count: lean on the CSS state class.
  if (classOOS) return { exists: true, available: false, unavailable: true };
  return { exists: true, available: true, unavailable: false };
}

// Human-readable status shown in logs and change-reason messages.
// Mirrors what a visitor sees: the product-price element ("Indisponible" when
// out of stock, the price when available), falling back to the form's state label.
function readStatusText($) {
  const price = $(".product-price").first().text().trim().replace(/\s+/g, " ");
  if (price) return price;
  const label = $(SALABLE_FORM_SELECTOR)
    .first()
    .find("em.unless-available, em.not-available, em.if-out-of-stock")
    .first()
    .text()
    .trim();
  return label;
}

// detectStock parses an HTML page and returns stock signals.
//
// Primary signal (current site):  the salable-item inventory form (see readFormStock).
// Legacy fallbacks (older markup / other product types, kept for resilience):
//   - main CTA button text (a[href="#!"]): price -> in stock, "Indisponible" -> out
//   - enabled add-to-cart button
//   - JSON-LD offers.availability
function detectStock(html) {
  const $ = cheerio.load(html);

  const form = readFormStock($);

  let ctaText = "";
  $(CTA_SELECTOR).each(function () {
    const t = $(this).text().trim();
    if (t.length > 0) {
      ctaText = t;
      return false;
    } // take first non-empty match
  });

  const ctaHasPrice = hasPriceText(ctaText);
  const ctaIsUnavailable = /indisponible/i.test(ctaText);
  const ctaIsAddToCart = /ajouter|panier|add.to.cart/i.test(ctaText);

  const hasActiveButton =
    $("button, input[type=submit]")
      .filter(function () {
        const t = ($(this).text() + $(this).val()).toLowerCase();
        return t.includes("ajouter") || t.includes("panier") || t.includes("add to cart");
      })
      .filter(function () {
        return !$(this).attr("disabled");
      }).length > 0;

  let jsonLdInStock = false;
  let jsonLdOOS = false;

  $('script[type="application/ld+json"]').each(function () {
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
        Object.values(obj).forEach((v) => {
          if (v && typeof v === "object") walk(v, depth + 1);
        });
      };
      walk(JSON.parse(jsonText), 0);
    } catch (_) {}
  });

  let likelyAvailable, likelyUnavailable;
  if (form.exists) {
    // Authoritative current-site signal.
    likelyAvailable = form.available;
    likelyUnavailable = form.unavailable;
  } else if (ctaHasPrice || ctaIsAddToCart) {
    likelyAvailable = true;
    likelyUnavailable = false;
  } else if (ctaIsUnavailable) {
    likelyAvailable = false;
    likelyUnavailable = true;
  } else {
    likelyAvailable = jsonLdInStock || hasActiveButton;
    likelyUnavailable = jsonLdOOS;
  }

  // Prefer the form-era human-readable status; fall back to the legacy CTA text.
  const statusText = form.exists ? readStatusText($) : "";
  const reportText = statusText || ctaText;

  const fingerprint = simpleHash(extractCtaRegion($));
  return { likelyAvailable, likelyUnavailable, ctaText: reportText, fingerprint };
}

// Extracts a stable representation of the stock area for change-fingerprinting.
// Each segment is capped at CTA_ELEMENT_MAX chars to prevent unbounded strings
// (e.g. inlined SVGs or giant data-* attributes).
//
// IMPORTANT: the salable-item form contains a per-request CSRF authenticity_token
// that changes on every fetch. We must NOT hash the raw form HTML or the
// fingerprint would change constantly and trigger spurious "page changed" alerts.
// Instead we hash only the stable, stock-relevant attributes + visible status.
function extractCtaRegion($) {
  const parts = [];

  const $form = $(SALABLE_FORM_SELECTOR).first();
  if ($form.length) {
    const stable = [
      "class:" + ($form.attr("class") || ""),
      "inv:" + ($form.attr("data-inventory") || ""),
      "track:" + ($form.attr("data-track-inventory") || ""),
      "price:" + ($form.attr("data-min-price") || ""),
      "checkout:" + ($form.attr("data-requires-checkout") || ""),
    ].join(" ");
    parts.push(stable.slice(0, CTA_ELEMENT_MAX));
  }

  const priceText = $(".product-price").first().text().trim().replace(/\s+/g, " ");
  if (priceText) parts.push(priceText.slice(0, CTA_ELEMENT_MAX));

  // Legacy CTA elements (older markup / other product types). Hidden inputs that
  // carry CSRF tokens are not matched by these selectors, so no token leaks in.
  $(
    CTA_SELECTOR + ', button, input[type=submit], [class*="add-to-cart"], [class*="product-action"]'
  ).each(function () {
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

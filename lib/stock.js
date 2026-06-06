"use strict";

const crypto = require("crypto");

// Formats a Shopify price (integer minor currency units, e.g. 4000 => "€40")
// into a short display string for logs and notifications.
function formatPrice(cents) {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const value = (cents / 100).toFixed(2).replace(/\.00$/, "");
  return "€" + value;
}

// detectStock inspects a parsed Shopify product object (from /products/<slug>.js)
// and returns stock signals.
//
// Shopify exposes an authoritative `available` boolean at the product level
// (true when at least one variant is purchasable) and on each variant. This is
// far more stable than scraping HTML - no CSS selectors, no per-request tokens,
// no JS-rendered markup. We treat it as the single source of truth.
function detectStock(product) {
  if (!product || typeof product !== "object") {
    return {
      likelyAvailable: false,
      likelyUnavailable: false,
      ctaText: "",
      fingerprint: simpleHash("no-product"),
    };
  }

  const variants = Array.isArray(product.variants) ? product.variants : [];
  const anyVariantAvailable = variants.some((v) => v && v.available === true);
  const available = product.available === true || anyVariantAvailable;

  // We only assert "unavailable" when Shopify actually told us the state
  // (a boolean product.available or at least one variant). Otherwise it's unknown.
  const known = typeof product.available === "boolean" || variants.length > 0;

  const likelyAvailable = available;
  const likelyUnavailable = known && !available;

  const price = formatPrice(product.price);
  const ctaText = available ? price || "In stock" : "Sold out";

  // Stable fingerprint over stock-relevant fields only (the JSON carries no
  // per-request/volatile data, so this stays constant between checks until
  // availability or price actually changes).
  const fingerprint = simpleHash(
    JSON.stringify({
      a: available,
      p: typeof product.price === "number" ? product.price : null,
      v: variants.map((v) => [v && v.id, v && v.available === true]),
    })
  );

  return { likelyAvailable, likelyUnavailable, ctaText, fingerprint };
}

// SHA-256 truncated to 16 hex chars (64 bits).
// Collision-resistant enough for change detection; not for adversarial use.
function simpleHash(str) {
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

module.exports = { detectStock, simpleHash, formatPrice };

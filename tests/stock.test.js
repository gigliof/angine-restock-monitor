"use strict";

const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { detectStock, simpleHash, extractCtaRegion } = require("../lib/stock");

// ─── detectStock ─────────────────────────────────────────────

test("detectStock: CTA with price -> available", () => {
  const html = '<a href="#!">40,00 C$</a>';
  const r = detectStock(html);
  assert.equal(r.likelyAvailable, true);
  assert.equal(r.likelyUnavailable, false);
  assert.equal(r.ctaText, "40,00 C$");
});

test("detectStock: CTA with euro price -> available", () => {
  const r = detectStock('<a href="#!">25,00 \u20AC</a>');
  assert.equal(r.likelyAvailable, true);
});

test("detectStock: CTA with Indisponible -> unavailable", () => {
  const html = '<a href="#!">Indisponible</a>';
  const r = detectStock(html);
  assert.equal(r.likelyAvailable, false);
  assert.equal(r.likelyUnavailable, true);
  assert.equal(r.ctaText, "Indisponible");
});

test("detectStock: CTA with ajouter -> available", () => {
  const r = detectStock('<a href="#!">Ajouter au panier</a>');
  assert.equal(r.likelyAvailable, true);
});

test("detectStock: empty HTML -> unknown state", () => {
  const r = detectStock("<html><body></body></html>");
  assert.equal(r.likelyAvailable, false);
  assert.equal(r.likelyUnavailable, false);
  assert.equal(r.ctaText, "");
});

test("detectStock: JSON-LD InStock -> available", () => {
  const schema = JSON.stringify({
    "@type": "Product",
    offers: { availability: "https://schema.org/InStock" },
  });
  const html = '<script type="application/ld+json">' + schema + "</script>";
  const r = detectStock(html);
  assert.equal(r.likelyAvailable, true);
});

test("detectStock: JSON-LD OutOfStock -> unavailable", () => {
  const schema = JSON.stringify({
    "@type": "Product",
    offers: { availability: "https://schema.org/OutOfStock" },
  });
  const html = '<script type="application/ld+json">' + schema + "</script>";
  const r = detectStock(html);
  assert.equal(r.likelyUnavailable, true);
});

test("detectStock: JSON-LD @graph wrapping -> available", () => {
  const schema = JSON.stringify({
    "@graph": [{
      "@type": "Product",
      offers: { availability: "https://schema.org/InStock" },
    }],
  });
  const html = '<script type="application/ld+json">' + schema + "</script>";
  const r = detectStock(html);
  assert.equal(r.likelyAvailable, true);
});

test("detectStock: deeply nested JSON-LD does not throw", () => {
  // Depth > JSON_LD_MAX_DEPTH - should terminate gracefully without hitting call stack limit.
  let obj = { "@type": "Product", offers: { availability: "InStock" } };
  for (let i = 0; i < 20; i++) obj = { nested: obj };
  const html = '<script type="application/ld+json">' + JSON.stringify(obj) + "</script>";
  assert.doesNotThrow(() => detectStock(html));
});

test("detectStock: invalid JSON-LD does not throw", () => {
  const html = '<script type="application/ld+json">{invalid json</script>';
  assert.doesNotThrow(() => detectStock(html));
});

test("detectStock: oversized JSON-LD is skipped (no crash, no signal)", () => {
  const bigPayload = "x".repeat(150000);
  const schema = JSON.stringify({
    "@type": "Product",
    offers: { availability: "https://schema.org/InStock" },
    description: bigPayload,
  });
  const html = '<script type="application/ld+json">' + schema + "</script>";
  const r = detectStock(html);
  // Should not throw and should not detect the InStock signal (skipped due to size)
  assert.equal(r.likelyAvailable, false);
});

test("detectStock: enabled add-to-cart button -> available (fallback)", () => {
  const html = "<button>Ajouter au panier</button>";
  const r = detectStock(html);
  assert.equal(r.likelyAvailable, true);
});

test("detectStock: disabled add-to-cart button -> not available", () => {
  const html = '<button disabled>Ajouter au panier</button>';
  const r = detectStock(html);
  assert.equal(r.likelyAvailable, false);
});

test("detectStock: CTA takes priority over JSON-LD", () => {
  // CTA says unavailable; JSON-LD says in stock - CTA wins.
  const schema = JSON.stringify({
    "@type": "Product",
    offers: { availability: "https://schema.org/InStock" },
  });
  const html = '<a href="#!">Indisponible</a>' +
    '<script type="application/ld+json">' + schema + "</script>";
  const r = detectStock(html);
  assert.equal(r.likelyAvailable, false);
  assert.equal(r.likelyUnavailable, true);
});

test("detectStock: fingerprint changes when CTA changes", () => {
  const r1 = detectStock('<a href="#!">40,00 C$</a>');
  const r2 = detectStock('<a href="#!">Indisponible</a>');
  assert.notEqual(r1.fingerprint, r2.fingerprint);
});

test("detectStock: identical HTML produces same fingerprint", () => {
  const html = '<a href="#!">40,00 C$</a>';
  assert.equal(detectStock(html).fingerprint, detectStock(html).fingerprint);
});

// ─── extractCtaRegion ─────────────────────────────────────────

test("extractCtaRegion: caps each element at 500 chars", () => {
  const cheerio = require("cheerio");
  const bigAttr = "x".repeat(1000);
  const $ = cheerio.load('<a href="#!" data-x="' + bigAttr + '">Buy</a>');
  const region = extractCtaRegion($);
  // Each segment must be at most 500 chars
  region.split("|").forEach((seg) => {
    assert.ok(seg.length <= 500, "segment too long: " + seg.length);
  });
});

// ─── simpleHash ───────────────────────────────────────────────

test("simpleHash: returns 16 hex chars", () => {
  const h = simpleHash("hello");
  assert.equal(h.length, 16);
  assert.match(h, /^[0-9a-f]{16}$/);
});

test("simpleHash: same input -> same hash", () => {
  assert.equal(simpleHash("test"), simpleHash("test"));
});

test("simpleHash: different input -> different hash", () => {
  assert.notEqual(simpleHash("a"), simpleHash("b"));
});

"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { detectStock, simpleHash, formatPrice } = require("../lib/stock");

// Shopify /products/<slug>.js shapes (trimmed to the fields detectStock reads).
const PRODUCT_OOS = {
  title: "Angine de Poitrine – Vinyle Vol. I",
  available: false,
  price: 4000,
  variants: [{ id: 1, title: "Default Title", available: false }],
};

const PRODUCT_IN_STOCK = {
  title: "Angine de Poitrine – Vinyle Vol. I",
  available: true,
  price: 4000,
  variants: [{ id: 1, title: "Default Title", available: true }],
};

// ─── detectStock ─────────────────────────────────────────────

test("detectStock: product available -> available", () => {
  const r = detectStock(PRODUCT_IN_STOCK);
  assert.equal(r.likelyAvailable, true);
  assert.equal(r.likelyUnavailable, false);
});

test("detectStock: product not available -> unavailable", () => {
  const r = detectStock(PRODUCT_OOS);
  assert.equal(r.likelyAvailable, false);
  assert.equal(r.likelyUnavailable, true);
  assert.equal(r.ctaText, "Sold out");
});

test("detectStock: product-level false but a variant available -> available", () => {
  const product = {
    available: false,
    price: 4000,
    variants: [
      { id: 1, available: false },
      { id: 2, available: true },
    ],
  };
  const r = detectStock(product);
  assert.equal(r.likelyAvailable, true);
  assert.equal(r.likelyUnavailable, false);
});

test("detectStock: available product reports a price as ctaText", () => {
  const r = detectStock(PRODUCT_IN_STOCK);
  assert.match(r.ctaText, /\d/); // contains a digit (price)
});

test("detectStock: null / non-object -> unknown state", () => {
  for (const bad of [null, undefined, "x", 42]) {
    const r = detectStock(bad);
    assert.equal(r.likelyAvailable, false);
    assert.equal(r.likelyUnavailable, false);
    assert.equal(r.ctaText, "");
  }
});

test("detectStock: empty object -> unknown (no boolean, no variants)", () => {
  const r = detectStock({});
  assert.equal(r.likelyAvailable, false);
  assert.equal(r.likelyUnavailable, false);
});

test("detectStock: identical product -> same fingerprint", () => {
  assert.equal(detectStock(PRODUCT_OOS).fingerprint, detectStock(PRODUCT_OOS).fingerprint);
});

test("detectStock: fingerprint changes when availability flips", () => {
  assert.notEqual(detectStock(PRODUCT_OOS).fingerprint, detectStock(PRODUCT_IN_STOCK).fingerprint);
});

test("detectStock: fingerprint changes when price changes", () => {
  const cheaper = { ...PRODUCT_OOS, price: 3500 };
  assert.notEqual(detectStock(PRODUCT_OOS).fingerprint, detectStock(cheaper).fingerprint);
});

// ─── formatPrice ─────────────────────────────────────────────

test("formatPrice: whole euro drops the .00", () => {
  assert.equal(formatPrice(4000), "€40");
});

test("formatPrice: keeps cents when non-zero", () => {
  assert.equal(formatPrice(2595), "€25.95");
});

test("formatPrice: non-number -> empty string", () => {
  assert.equal(formatPrice(undefined), "");
  assert.equal(formatPrice(NaN), "");
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

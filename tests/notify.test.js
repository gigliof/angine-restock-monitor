"use strict";

const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { buildMessages, esc, escTg } = require("../lib/notify");

const PRODUCT = {
  name: "Angine de Poitrine - Vol. 1 (Vinyle)",
  url:  "https://anginedepoitrine.com/product/1150712-angine-de-poitrine-vol-1-vinyle",
};

// ─── esc ─────────────────────────────────────────────────────

test("esc: escapes all five HTML special chars", () => {
  assert.equal(esc("&"),  "&amp;");
  assert.equal(esc("<"),  "&lt;");
  assert.equal(esc(">"),  "&gt;");
  assert.equal(esc('"'),  "&quot;");
  assert.equal(esc("'"),  "&#39;");
});

test("esc: escapes XSS payload", () => {
  const r = esc('<script>alert("xss")</script>');
  assert.ok(!r.includes("<script>"));
  assert.ok(r.includes("&lt;script&gt;"));
  assert.ok(r.includes("&quot;"));
});

test("esc: coerces non-strings", () => {
  assert.equal(esc(42), "42");
  assert.equal(esc(null), "null");
});

test("esc: safe strings pass through unchanged", () => {
  assert.equal(esc("hello world"), "hello world");
});

// ─── escTg ───────────────────────────────────────────────────

test("escTg: escapes &, <, > for Telegram HTML", () => {
  assert.equal(escTg("a & b"), "a &amp; b");
  assert.equal(escTg("<b>"), "&lt;b&gt;");
});

test("escTg: escapes double quotes (used in href attributes)", () => {
  assert.equal(escTg('"hello"'), "&quot;hello&quot;");
});

test("escTg: does not escape single quotes (not used as attribute delimiters)", () => {
  assert.equal(escTg("it's"), "it's");
});

// ─── buildMessages ───────────────────────────────────────────

test("buildMessages: subject prefixed with RESTOCK", () => {
  const m = buildMessages(PRODUCT, "reason", null);
  assert.ok(m.subject.startsWith("RESTOCK:"));
  assert.ok(m.subject.includes(PRODUCT.name));
});

test("buildMessages: plain contains product name and URL", () => {
  const m = buildMessages(PRODUCT, "CTA changed", null);
  assert.ok(m.plain.includes(PRODUCT.name));
  assert.ok(m.plain.includes(PRODUCT.url));
});

test("buildMessages: plain without checkout URL says add manually", () => {
  const m = buildMessages(PRODUCT, "CTA changed", null);
  assert.ok(m.plain.includes("Add to cart manually"));
  assert.ok(!m.plain.includes("Checkout:"));
});

test("buildMessages: plain with checkout URL includes it", () => {
  const checkoutUrl = "https://anginedepoitrine.com/go/checkout?session=abc";
  const m = buildMessages(PRODUCT, "CTA changed", checkoutUrl);
  assert.ok(m.plain.includes("Checkout:"));
  assert.ok(m.plain.includes(checkoutUrl));
});

test("buildMessages: HTML escapes product name (XSS prevention)", () => {
  const malicious = { name: '<img src=x onerror=alert(1)>', url: PRODUCT.url };
  const m = buildMessages(malicious, "reason", null);
  assert.ok(!m.html.includes("<img"));
  assert.ok(m.html.includes("&lt;img"));
});

test("buildMessages: HTML escapes reason field", () => {
  const m = buildMessages(PRODUCT, '<script>evil()</script>', null);
  assert.ok(!m.html.includes("<script>"));
  assert.ok(m.html.includes("&lt;script&gt;"));
});

test("buildMessages: HTML escapes checkout URL in html body", () => {
  const checkoutUrl = "https://anginedepoitrine.com/checkout?a=1&b=2";
  const m = buildMessages(PRODUCT, "reason", checkoutUrl);
  assert.ok(m.html.includes("&amp;"));
  assert.ok(!m.html.includes("a=1&b=2"));
});

test("buildMessages: tg message uses escTg not esc", () => {
  const m = buildMessages(PRODUCT, "reason", null);
  // Telegram message should have <b> and <a> tags (valid HTML), not escaped
  assert.ok(m.tg.includes("<b>RESTOCK:</b>"));
  assert.ok(m.tg.includes("<a href="));
});

test("buildMessages: tg escapes ampersand in URL", () => {
  const product = { name: "Test", url: "https://anginedepoitrine.com/p?a=1&b=2" };
  const m = buildMessages(product, "reason", null);
  assert.ok(!m.tg.includes("a=1&b=2"));
  assert.ok(m.tg.includes("a=1&amp;b=2"));
});

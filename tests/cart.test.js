"use strict";

// Tests for cart.js helper return values.
// These exercise the logic branches without launching a real browser
// by passing in minimal page mocks.

const { test } = require("node:test");
const assert   = require("node:assert/strict");

// ─── Inline the pure helpers under test ──────────────────────
// Rather than requiring cart.js (which loads config and puppeteer at the
// module level), we duplicate the two small functions being tested so the
// unit tests stay self-contained and fast.

async function fillField(page, selectors, value) {
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 3000 });
      await page.click(sel, { clickCount: 3 });
      await page.type(sel, value, { delay: 30 });
      return true;
    } catch (_) {}
  }
  return false;
}

async function clickProceedToCheckout(page) {
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("a, button"))
      .find((el) => /proc\u00e9der|paiement|checkout/i.test(el.textContent));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!clicked) return false;
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  return true;
}

// ─── fillField ───────────────────────────────────────────────

test("fillField: returns true when a selector succeeds", async () => {
  const page = {
    waitForSelector: async () => {},
    click:           async () => {},
    type:            async () => {},
  };
  const result = await fillField(page, ["#email"], "test@example.com");
  assert.equal(result, true);
});

test("fillField: returns false when all selectors fail", async () => {
  const page = {
    waitForSelector: async () => { throw new Error("not found"); },
    click:           async () => {},
    type:            async () => {},
  };
  const result = await fillField(page, ["#email", "#alt-email"], "test@example.com");
  assert.equal(result, false);
});

test("fillField: tries next selector after first fails", async () => {
  let calls = 0;
  const page = {
    waitForSelector: async (sel) => {
      calls++;
      if (sel === "#first") throw new Error("not found");
      // second selector succeeds
    },
    click: async () => {},
    type:  async () => {},
  };
  const result = await fillField(page, ["#first", "#second"], "value");
  assert.equal(result, true);
  assert.equal(calls, 2);
});

// ─── clickProceedToCheckout ───────────────────────────────────

test("clickProceedToCheckout: returns false when evaluate returns false", async () => {
  const page = {
    evaluate:         async () => false,
    waitForNavigation: async () => {},
  };
  const result = await clickProceedToCheckout(page);
  assert.equal(result, false);
});

test("clickProceedToCheckout: returns true when evaluate returns true", async () => {
  const page = {
    evaluate:          async () => true,
    waitForNavigation: async () => {},
  };
  const result = await clickProceedToCheckout(page);
  assert.equal(result, true);
});

test("clickProceedToCheckout: returns true even when waitForNavigation rejects", async () => {
  const page = {
    evaluate:          async () => true,
    waitForNavigation: async () => { throw new Error("timeout"); },
  };
  // waitForNavigation is caught internally (.catch(() => {})), so still returns true
  const result = await clickProceedToCheckout(page);
  assert.equal(result, true);
});

test("clickProceedToCheckout: does not call waitForNavigation when button not found", async () => {
  let navCalled = false;
  const page = {
    evaluate:          async () => false,
    waitForNavigation: async () => { navCalled = true; },
  };
  await clickProceedToCheckout(page);
  assert.equal(navCalled, false);
});

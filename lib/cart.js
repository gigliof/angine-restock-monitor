"use strict";

const config = require("../config");
const { log, sanitizeLog } = require("./logger");
const { assertAllowedUrl, FETCH_HEADERS } = require("./fetch");
const { CTA_SELECTOR } = require("./selectors");

let puppeteerLib  = null;
let activeBrowser = null; // tracked so shutdown() can close it cleanly

function loadPuppeteer() {
  if (puppeteerLib) return puppeteerLib;
  try {
    puppeteerLib = require("puppeteer");
    return puppeteerLib;
  } catch (_) {
    throw new Error(
      "Puppeteer is not installed. Cart automation requires it.\n" +
      "Run: npm install puppeteer  (downloads Chromium, ~300 MB)"
    );
  }
}

// Closes the active browser with a timeout guard.
// Called on graceful shutdown and after each cart flow (success or error).
async function closeBrowser() {
  if (!activeBrowser) return;
  const browser = activeBrowser;
  activeBrowser = null;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
  } catch (err) {
    log("  Warning: browser close error: " + sanitizeLog(err.message));
  }
}

// Fill a text input - tries each selector in order, stops on first success.
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

// Set a <select> dropdown - tries page.select() first, then falls back
// to evaluating in-page to find the option by value or label text.
async function fillDropdown(page, selectors, code, label) {
  for (const sel of selectors) {
    try {
      await page.select(sel, code);
      return true;
    } catch (_) {}

    try {
      const selected = await page.evaluate((sel, code, label) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const opt = Array.from(el.options).find((o) =>
          o.value.toLowerCase() === code.toLowerCase() ||
          o.text.toLowerCase().includes(label.toLowerCase())
        );
        if (!opt) return false;
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }, sel, code, label);
      if (selected) return true;
    } catch (_) {}
  }
  return false;
}

async function clickBuyButton(page) {
  await page.waitForSelector(CTA_SELECTOR, { timeout: 10000 });
  return page.evaluate((sel) => {
    const btn = Array.from(document.querySelectorAll(sel))
      .find((el) => /\d/.test(el.textContent) && /[$\u20AC\u00A3]/.test(el.textContent));
    if (btn) { btn.click(); return true; }
    return false;
  }, CTA_SELECTOR);
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

async function fillCheckoutForm(page, f) {
  const emailFilled = await fillField(page, ['input[name="email"]', 'input[type="email"]', "#email"], f.email);
  if (!emailFilled) return false;
  await fillField(page, ['input[name="first_name"]', "#first_name"],                      f.firstName);
  await fillField(page, ['input[name="last_name"]', "#last_name"],                        f.lastName);
  await fillField(page, ['input[name="address1"]', 'input[name="address"]', "#address1"], f.address1);
  await fillField(page, ['input[name="city"]', "#city"],                                  f.city);
  await fillField(page, ['input[name="zip"]', 'input[name="postal_code"]', "#zip"],       f.postalCode);
  await fillField(page, ['input[name="phone"]', "#phone"],                                f.phone);

  await fillDropdown(page, ['select[name="country"]', "#country"], f.countryCode, f.country);
  // Wait for state/province dropdown to become populated after country selection.
  // waitForFunction is more reliable than a fixed sleep under variable network latency.
  try {
    await page.waitForFunction(
      (sels) => sels.some((sel) => {
        const el = document.querySelector(sel);
        return el && !el.disabled && el.options.length > 1;
      }),
      { timeout: 5000 },
      ['select[name="state"]', 'select[name="province"]', "#state"]
    );
  } catch (_) {}
  await fillDropdown(page, ['select[name="state"]', 'select[name="province"]', "#state"], f.stateCode, f.state);

  // Uncheck newsletter opt-in if present
  await page.evaluate(() => {
    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      const label = cb.closest("label") || document.querySelector('[for="' + cb.id + '"]');
      if (label && /liste|newsletter|envoi|subscribe/i.test(label.textContent) && cb.checked)
        cb.click();
    });
  });

  return true;
}

async function clickContinueToPayment(page) {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button, input[type=submit], a"))
      .find((el) => /continuer|continue|paiement|payment/i.test(el.textContent + el.value));
    if (btn) btn.click();
  });
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
}

async function addToCartAndGetCheckoutUrl(productUrl, productName) {
  assertAllowedUrl(productUrl);
  const pup = loadPuppeteer();

  try {
    log("  Launching browser for: " + productName);

    // --no-sandbox is required for headless Chromium in most Linux environments
    // and containerized deployments. Configurable via PUPPETEER_NO_SANDBOX env var.
    // When false (default), Chromium's sandbox provides an extra layer of isolation.
    const puppeteerArgs = config.puppeteerNoSandbox
      ? ["--no-sandbox", "--disable-setuid-sandbox"]
      : [];

    activeBrowser = await pup.launch({
      headless: true,
      args: puppeteerArgs,
    });

    const page = await activeBrowser.newPage();
    await page.setUserAgent(FETCH_HEADERS["User-Agent"]);
    await page.setExtraHTTPHeaders({ "Accept-Language": "fr-FR,fr;q=0.9" });

    // Enable request interception BEFORE registering the listener.
    // (Registering the listener first can cause a race in Puppeteer.)
    await page.setRequestInterception(true);

    // Block document navigations to any hostname outside the allowlist.
    // Uses hostname comparison (not startsWith) to prevent subdomain spoofing.
    page.on("request", (req) => {
      if (req.resourceType() === "document") {
        const url = req.url();
        // Allow browser-internal schemes that carry no hostname.
        if (!url.startsWith("about:")) {
          let allowed = false;
          try { allowed = new URL(url).hostname === config.allowedHostname; } catch (_) {}
          if (!allowed) {
            log("  Blocked navigation to disallowed URL: " + url.slice(0, 80));
            req.abort();
            return;
          }
        }
      }
      req.continue();
    });

    log("  Navigating to product page...");
    await page.goto(productUrl, { waitUntil: "networkidle2", timeout: 30000 });

    const clicked = await clickBuyButton(page);
    if (!clicked) {
      log("  Could not find buy button - product may not be available.");
      await closeBrowser();
      return null;
    }

    await page.waitForFunction((sel) =>
      Array.from(document.querySelectorAll(sel))
        .some((el) => /ajout\u00e9/i.test(el.textContent)),
      { timeout: 10000 },
      CTA_SELECTOR
    ).catch(() => { log("  Warning: could not confirm cart addition - continuing."); });

    log("  Item added to cart.");

    await page.goto(config.allowedOrigin + "go/cart", { waitUntil: "networkidle2", timeout: 30000 });

    const proceeded = await clickProceedToCheckout(page);
    if (!proceeded) {
      log("  Could not find checkout button - aborting cart automation.");
      await closeBrowser();
      return null;
    }

    log("  Filling checkout form...");
    const formFilled = await fillCheckoutForm(page, config.checkoutDetails);
    if (!formFilled) {
      log("  Could not fill required checkout fields - aborting cart automation.");
      await closeBrowser();
      return null;
    }
    await clickContinueToPayment(page);

    const checkoutUrl = page.url();

    // Validate the checkout URL hostname before returning it.
    let checkoutHostOk = false;
    try { checkoutHostOk = new URL(checkoutUrl).hostname === config.allowedHostname; } catch (_) {}
    if (!checkoutHostOk) {
      log("  Warning: checkout landed on unexpected URL - discarding for safety.");
      await closeBrowser();
      return null;
    }

    // Do not log the URL - it may contain a session token.
    log("  Checkout URL captured (sent via notification only).");
    await closeBrowser();
    return checkoutUrl;

  } catch (err) {
    log("  Browser automation error: " + sanitizeLog(err.message), { level: "error" });
    await closeBrowser();
    return null;
  }
}

module.exports = { addToCartAndGetCheckoutUrl, loadPuppeteer, closeBrowser };

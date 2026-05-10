#!/usr/bin/env node
// ============================================================
//  monitor.js - entry point and scheduler
// ============================================================
"use strict";

const fs = require("fs");
const path = require("path");
const { parseArgs } = require("node:util");

// ─── CLI arguments (parsed early for --help) ─────────────────

const { values: args } = parseArgs({
  strict: false,
  options: {
    once: { type: "boolean", default: false },
    test: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "clear-cooldown": { type: "boolean", default: false },
    "debug-wa": { type: "boolean", default: false },
    "debug-telegram": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

// ─── Help (shown before loading config/dependencies) ─────────

if (args.help) {
  console.log(`
Angine de Poitrine - Restock Monitor

Usage: node monitor.js [options]

Options:
  --once             Run one check cycle and exit
  --test             Send a test notification (60s cooldown, use --force to bypass)
  --force            Bypass cooldowns (use with --test)
  --dry-run          Run detection without sending notifications or cart automation
  --clear-cooldown   Reset notification cooldown for all products
  --debug-telegram   Verify Telegram token and find chat ID
  --debug-wa         Diagnose WhatsApp connection issues
  --help             Show this help message

Examples:
  node monitor.js                     Start monitoring (loops indefinitely)
  node monitor.js --once              Run one check cycle and exit
  node monitor.js --test              Send a test notification
  node monitor.js --test --force      Send test notification (bypass cooldown)
  node monitor.js --dry-run           Test detection without notifications

Documentation: See README.md for full setup instructions.
`);
  process.exit(0);
}

// ─── Load dependencies (after --help check) ──────────────────

const config = require("./config");
const { log, sanitizeLog } = require("./lib/logger");
const { loadStates, saveStates, STATE_FIELD_MAX } = require("./lib/state");
const { detectStock } = require("./lib/stock");
const { fetchPage } = require("./lib/fetch");
const { addToCartAndGetCheckoutUrl, loadPuppeteer, closeBrowser } = require("./lib/cart");
const { notify, initWhatsApp, runDebugTelegram, runDebugWA } = require("./lib/notify");

const INTER_CHECK_DELAY = 2000; // ms between product checks in one cycle
const CYCLE_TIMEOUT_MS = 5 * 60 * 1000; // abort a check cycle after 5 minutes
const TEST_COOLDOWN_MS = 60 * 1000; // 60 seconds between test notifications
const TEST_COOLDOWN_FILE = path.join(__dirname, ".last-test");

// ─── Check loop ──────────────────────────────────────────────

async function checkProduct(product, states, dryRun = false) {
  log("Checking: " + product.name);
  let html;
  try {
    html = await fetchPage(product.url);
  } catch (err) {
    log("  Fetch error: " + sanitizeLog(err.message), { level: "error", product: product.name });
    return;
  }

  const result = detectStock(html);
  const key = product.url;
  const prevState = states[key];
  const now = new Date();

  const current = {
    likelyAvailable: result.likelyAvailable,
    likelyUnavailable: result.likelyUnavailable,
    fingerprint: result.fingerprint,
    // Cap ctaText stored in state - prevents a compromised page from
    // bloating .states.json with an unbounded string.
    ctaText: String(result.ctaText || "").slice(0, STATE_FIELD_MAX),
    checkedAt: now.toISOString(),
    lastNotifiedAt: prevState ? prevState.lastNotifiedAt : null,
  };

  log(
    "  " +
      (result.likelyAvailable
        ? "AVAILABLE  <- " + sanitizeLog(result.ctaText)
        : result.likelyUnavailable
          ? "unavailable (" + sanitizeLog(result.ctaText) + ")"
          : "unknown (" + sanitizeLog(result.ctaText) + ")") +
      " | fp:" +
      result.fingerprint
  );

  if (!prevState) {
    log("  (first run - baseline saved)");
    states[key] = current;
    return;
  }

  // Determine reasons for alerting
  const reasons = [];

  if (prevState.likelyUnavailable && result.likelyAvailable) {
    reasons.push(
      "Button changed from '" +
        sanitizeLog(prevState.ctaText) +
        "' to '" +
        sanitizeLog(result.ctaText) +
        "'."
    );
  } else if (
    !prevState.likelyAvailable &&
    result.ctaText !== prevState.ctaText &&
    /\d/.test(result.ctaText) &&
    (prevState.likelyUnavailable || result.likelyAvailable)
  ) {
    reasons.push(
      "Buy button text changed: '" +
        sanitizeLog(prevState.ctaText) +
        "' -> '" +
        sanitizeLog(result.ctaText) +
        "'"
    );
  } else if (
    prevState.fingerprint !== result.fingerprint &&
    result.likelyAvailable &&
    !prevState.likelyAvailable
  ) {
    reasons.push("Page stock area changed and product now appears available.");
  }

  if (prevState.likelyUnavailable && !result.likelyUnavailable && !result.likelyAvailable) {
    reasons.push("Out-of-stock indicators disappeared (check manually).");
  }

  if (reasons.length > 0) {
    const cooldownMs = config.notificationCooldownMinutes * 60 * 1000;
    const lastNotified = prevState.lastNotifiedAt
      ? new Date(prevState.lastNotifiedAt).getTime()
      : 0;
    const elapsed = now.getTime() - lastNotified;

    if (elapsed < cooldownMs) {
      const waitMin = Math.ceil((cooldownMs - elapsed) / 60000);
      log("  Change detected but within cooldown - next notification in ~" + waitMin + " min.");
      states[key] = current;
      return;
    }

    log("  *** RESTOCK DETECTED: " + product.name + " ***");

    // In dry-run mode, log what would happen but don't send notifications or run cart automation.
    if (dryRun) {
      log("  [DRY-RUN] Would send notification: " + reasons.join(" "));
      if (result.likelyAvailable && config.checkoutDetails) {
        log("  [DRY-RUN] Would run cart automation for: " + product.url);
      }
      states[key] = current;
      return;
    }

    let checkoutUrl = null;
    if (result.likelyAvailable && config.checkoutDetails) {
      log("  Running cart automation...");
      checkoutUrl = await addToCartAndGetCheckoutUrl(product.url, product.name);
    }
    const notified = await notify(product, reasons.join(" "), checkoutUrl);
    if (notified) current.lastNotifiedAt = now.toISOString();
  }

  states[key] = current;
}

async function runChecks(dryRun = false) {
  const states = loadStates();
  for (const product of config.products) {
    await checkProduct(product, states, dryRun);
    await new Promise((r) => setTimeout(r, INTER_CHECK_DELAY));
  }
  saveStates(states);
}

async function runChecksWithTimeout() {
  let timeoutHandle;
  const timeout = new Promise((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error("Check cycle timed out after " + CYCLE_TIMEOUT_MS / 60000 + " min")),
      CYCLE_TIMEOUT_MS
    );
  });
  try {
    await Promise.race([runChecks(), timeout]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ─── Test mode ───────────────────────────────────────────────

async function runTest() {
  // Enforce cooldown between test notifications to prevent spam (unless --force is used).
  if (!args.force) {
    try {
      const lastTest = parseInt(fs.readFileSync(TEST_COOLDOWN_FILE, "utf-8"), 10);
      const elapsed = Date.now() - lastTest;
      if (elapsed < TEST_COOLDOWN_MS) {
        const waitSec = Math.ceil((TEST_COOLDOWN_MS - elapsed) / 1000);
        log("Test cooldown active. Wait " + waitSec + " seconds or use --force to bypass.");
        return;
      }
    } catch (_) {
      // File doesn't exist - first test, proceed.
    }
  }

  const target =
    config.notificationMethod === "email"
      ? config.email.to
      : config.notificationMethod === "telegram"
        ? config.telegram.chatId
        : config.whatsapp.recipientNumber;
  log("Sending test notification via " + config.notificationMethod + " to: " + target);

  if (config.notificationMethod === "whatsapp") await initWhatsApp();

  await notify(
    { name: "TEST PRODUCT", url: config.allowedOrigin + "boutique" },
    "This is a test - your monitor is configured correctly.",
    config.allowedOrigin + "go/cart?purchase=TEST"
  );

  // Record last test time.
  fs.writeFileSync(TEST_COOLDOWN_FILE, String(Date.now()), { mode: 0o600 });
  log("Done. Check your " + config.notificationMethod + ".");
}

// ─── Clear cooldown mode ─────────────────────────────────────

async function runClearCooldown() {
  const states = loadStates();
  let cleared = 0;
  for (const key of Object.keys(states)) {
    if (states[key].lastNotifiedAt) {
      states[key].lastNotifiedAt = null;
      cleared++;
    }
  }
  saveStates(states);
  log("Cleared notification cooldown for " + cleared + " product(s).");
  log("Next check will send notifications if stock changes are detected.");
}

// ─── Dry-run mode ────────────────────────────────────────────

async function runDryRun() {
  log("====================================================");
  log("  DRY-RUN MODE - No notifications will be sent");
  log("====================================================");
  await runChecks(true);
  log("Dry-run complete. Review the output above.");
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  log("====================================================");
  log("  Angine de Poitrine -- Restock Monitor");
  log("  Notify via:  " + config.notificationMethod);
  log("  Interval:    every " + config.checkIntervalMinutes + " min");
  log("  Cooldown:    " + config.notificationCooldownMinutes + " min between alerts");
  log("  Products:    " + config.products.length);
  log(
    "  Cart auto:   " +
      (config.checkoutDetails ? "enabled" : "disabled (set ENABLE_CART_AUTOMATION=true to enable)")
  );
  log("====================================================");

  try {
    loadPuppeteer();
    log("  Puppeteer: OK");
  } catch (_) {
    log("  Puppeteer: NOT FOUND (cart automation disabled)");
  }

  if (config.notificationMethod === "whatsapp") {
    log("Initializing WhatsApp...");
    await initWhatsApp();
  }

  await runChecksWithTimeout();
  if (args.once) {
    log("--once: exiting.");
    return;
  }

  // Recursive setTimeout instead of setInterval so overlapping check cycles
  // are impossible - the next check only starts after the current one finishes.
  const scheduleNext = () => {
    setTimeout(
      async () => {
        try {
          await runChecksWithTimeout();
        } catch (err) {
          log("ERROR in check cycle: " + sanitizeLog(err.message), { level: "error" });
        }
        log("Next check in " + config.checkIntervalMinutes + " minutes.");
        scheduleNext();
      },
      config.checkIntervalMinutes * 60 * 1000
    );
  };

  log("Next check in " + config.checkIntervalMinutes + " minutes.");
  scheduleNext();
}

// ─── Graceful shutdown ───────────────────────────────────────
// Closes any in-flight Puppeteer browser before exiting so Chromium
// is not left as a zombie process on Ctrl+C or SIGTERM.

async function shutdown(signal) {
  log("Received " + signal + " - shutting down.");
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT").catch(() => process.exit(1)));
process.on("SIGTERM", () => shutdown("SIGTERM").catch(() => process.exit(1)));

process.on("unhandledRejection", (reason) => {
  log("UNHANDLED REJECTION: " + sanitizeLog(String(reason)), { level: "error" });
});

// ─── Dispatch ────────────────────────────────────────────────

const HANDLERS = {
  "debug-telegram": runDebugTelegram,
  "debug-wa": runDebugWA,
  "clear-cooldown": runClearCooldown,
  "dry-run": runDryRun,
  test: runTest,
};

const activeHandler = Object.entries(args).find(([k, v]) => v && HANDLERS[k]);
const run = activeHandler ? HANDLERS[activeHandler[0]] : main;

run().catch((err) => {
  log("FATAL: " + sanitizeLog(err.message), { level: "error" });
  process.exit(1);
});

// ============================================================
//  config.js - reads all settings from .env
//  No secrets or personal info live here. Safe to commit.
// ============================================================

require("dotenv").config({ quiet: true });
const { sanitizeLog } = require("./lib/logger");

// ─── Constants ────────────────────────────────────────────────
const NOTIFICATION_METHODS = Object.freeze(["email", "whatsapp", "telegram"]);

// ─── Validation helpers (exported for testing) ────────────────

function required(key) {
  const val = process.env[key];
  if (!val || !val.trim()) {
    console.error("[config] Missing required env var: " + key);
    console.error("[config] Copy .env.example to .env and fill in your values.");
    process.exit(1);
  }
  return val.trim();
}

function optional(key, fallback) {
  const val = process.env[key];
  return val && val.trim() ? val.trim() : fallback !== undefined ? fallback : "";
}

function optionalBool(key, fallback) {
  const val = optional(key, "");
  if (val === "") return fallback;
  return val.toLowerCase() === "true";
}

function isValidEmail(addr) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr);
}

function positiveInt(key, fallback, min, max) {
  const n = parseInt(optional(key, String(fallback)), 10);
  const lo = min !== undefined ? min : 1;
  const hi = max !== undefined ? max : Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(n) || n < lo || n > hi) {
    console.error(
      "[config] " +
        key +
        " must be an integer between " +
        lo +
        " and " +
        hi +
        ", got: " +
        sanitizeLog(process.env[key])
    );
    process.exit(1);
  }
  return n;
}

const method = optional("NOTIFICATION_METHOD", "email");
if (!NOTIFICATION_METHODS.includes(method)) {
  console.error(
    "[config] NOTIFICATION_METHOD must be one of: " +
      NOTIFICATION_METHODS.join(", ") +
      ", got: " +
      sanitizeLog(method)
  );
  process.exit(1);
}

// Set ENABLE_CART_AUTOMATION=false to skip checkout field requirements and disable
// browser automation entirely (pure notification mode).
const cartEnabled = optional("ENABLE_CART_AUTOMATION", "true") === "true";

// Allowed base URL and hostname - Puppeteer will refuse to navigate anywhere else.
const ALLOWED_ORIGIN = "https://anginedepoitrine.com/";
const ALLOWED_HOSTNAME = "anginedepoitrine.com";

// Product page URLs on the Shopify store (2026 migration). Stock is read from
// the Shopify product JSON endpoint (<url>.js), which exposes an authoritative
// `available` flag - see lib/fetch.js fetchProductJson + lib/stock.js detectStock.
const products = [
  {
    name: "Angine de Poitrine - Vol. 1 (Vinyle)",
    url: "https://anginedepoitrine.com/products/vinyle-vol-i",
  },
  {
    name: "Angine de Poitrine - Vol. II (Vinyle)",
    url: "https://anginedepoitrine.com/products/vinyle-vol-ii",
  },
  {
    // The bundle has no Shopify product page yet (the old URL 404s). Kept here
    // intentionally so it's monitored the moment it returns; until then each
    // check logs a fetch error and is skipped gracefully. Update the slug to
    // the new /products/<slug> URL once the bundle is relisted.
    name: "Bundle Vol. I & II (Vinyle)",
    url: "https://anginedepoitrine.com/product/1230619-bundle-vol-i-et-ii-vinyle",
  },
];

// Validate every product URL at startup using URL constructor + hostname check.
// Prevents bypass via subdomain spoofing (e.g. "https://anginedepoitrine.com.evil.com/"
// passes a startsWith check but fails hostname comparison).
// Also requires HTTPS to prevent MITM attacks.
for (const p of products) {
  try {
    const parsed = new URL(p.url);
    if (parsed.protocol !== "https:") {
      console.error("[config] Product URL must use HTTPS: " + p.url);
      process.exit(1);
    }
    if (parsed.hostname !== ALLOWED_HOSTNAME) {
      console.error(
        "[config] Product URL hostname is not allowed (" + ALLOWED_HOSTNAME + "): " + p.url
      );
      process.exit(1);
    }
  } catch (_) {
    console.error("[config] Product URL is invalid: " + p.url);
    process.exit(1);
  }
}

module.exports = {
  checkIntervalMinutes: positiveInt("CHECK_INTERVAL_MINUTES", 10),
  notificationCooldownMinutes: positiveInt("NOTIFICATION_COOLDOWN_MINUTES", 60),
  notificationMethod: method,
  allowedOrigin: ALLOWED_ORIGIN,
  allowedHostname: ALLOWED_HOSTNAME,

  email: (() => {
    const from = method === "email" ? required("EMAIL_FROM") : optional("EMAIL_FROM");
    const to = method === "email" ? required("EMAIL_TO") : optional("EMAIL_TO");
    if (method === "email") {
      if (!isValidEmail(from)) {
        console.error("[config] EMAIL_FROM is not a valid email address: " + sanitizeLog(from));
        process.exit(1);
      }
      if (!isValidEmail(to)) {
        console.error("[config] EMAIL_TO is not a valid email address: " + sanitizeLog(to));
        process.exit(1);
      }
    }
    return {
      host: optional("SMTP_HOST", "smtp.gmail.com"),
      port: positiveInt("SMTP_PORT", 587, 1, 65535),
      secure: optional("SMTP_SECURE", "false") === "true",
      user: method === "email" ? required("SMTP_USER") : optional("SMTP_USER"),
      pass: method === "email" ? required("SMTP_PASS") : optional("SMTP_PASS"),
      from,
      to,
    };
  })(),

  whatsapp: (() => {
    const recipientNumber =
      method === "whatsapp" ? required("WA_RECIPIENT_NUMBER") : optional("WA_RECIPIENT_NUMBER");
    if (method === "whatsapp" && recipientNumber && !/^\+\d{7,15}$/.test(recipientNumber)) {
      console.error(
        "[config] WA_RECIPIENT_NUMBER must be in E.164 format (e.g. +15551234567), got: " +
          sanitizeLog(recipientNumber)
      );
      process.exit(1);
    }
    return {
      recipientNumber,
      chatId: optional("WA_CHAT_ID"),
    };
  })(),

  telegram: (() => {
    const botToken =
      method === "telegram" ? required("TELEGRAM_BOT_TOKEN") : optional("TELEGRAM_BOT_TOKEN");
    const chatId =
      method === "telegram" ? required("TELEGRAM_CHAT_ID") : optional("TELEGRAM_CHAT_ID");
    if (method === "telegram" && chatId && !/^-?\d+$/.test(chatId)) {
      console.error(
        "[config] TELEGRAM_CHAT_ID must be a numeric chat ID (e.g. 123456789 or -100123456789), got: " +
          sanitizeLog(chatId)
      );
      process.exit(1);
    }
    return { botToken, chatId };
  })(),

  // null when cart automation is disabled - callers check for null before running automation.
  checkoutDetails: cartEnabled
    ? (() => {
        const email = required("CHECKOUT_EMAIL");
        if (!isValidEmail(email)) {
          console.error("[config] CHECKOUT_EMAIL is not a valid email: " + sanitizeLog(email));
          process.exit(1);
        }
        const phone = required("CHECKOUT_PHONE");
        if (phone.length > 30 || !/^\+?[\d\s\-().]{6,30}$/.test(phone)) {
          console.error("[config] CHECKOUT_PHONE format looks invalid: " + sanitizeLog(phone));
          process.exit(1);
        }
        return {
          email,
          firstName: required("CHECKOUT_FIRST_NAME").slice(0, 100),
          lastName: required("CHECKOUT_LAST_NAME").slice(0, 100),
          address1: required("CHECKOUT_ADDRESS").slice(0, 200),
          city: required("CHECKOUT_CITY").slice(0, 100),
          postalCode: required("CHECKOUT_POSTAL_CODE").slice(0, 20),
          phone,
          country: required("CHECKOUT_COUNTRY").slice(0, 60),
          countryCode: required("CHECKOUT_COUNTRY_CODE").slice(0, 5),
          state: required("CHECKOUT_STATE").slice(0, 60),
          stateCode: required("CHECKOUT_STATE_CODE").slice(0, 5),
        };
      })()
    : null,

  // Puppeteer sandbox settings. Set to true in containerized environments that require it.
  // When false (default), Chromium's sandbox provides an extra security layer.
  puppeteerNoSandbox: optionalBool("PUPPETEER_NO_SANDBOX", false),

  products,

  // Exported for testing - validation helpers
  _testing: {
    isValidEmail,
    NOTIFICATION_METHODS,
    isValidE164: (phone) => /^\+\d{7,15}$/.test(phone),
    isValidTelegramChatId: (id) => /^-?\d+$/.test(id),
    isValidHttpsUrl: (url, allowedHostname) => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && parsed.hostname === allowedHostname;
      } catch (_) {
        return false;
      }
    },
    parsePositiveInt: (val, min = 1, max = Number.MAX_SAFE_INTEGER) => {
      const n = parseInt(val, 10);
      if (!Number.isFinite(n) || n < min || n > max) return null;
      return n;
    },
    parseBool: (val) => {
      if (val === "" || val === undefined || val === null) return null;
      return String(val).toLowerCase() === "true";
    },
  },
};

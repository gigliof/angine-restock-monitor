"use strict";

const fs         = require("fs");
const path       = require("path");
const axios      = require("axios");
const nodemailer = require("nodemailer");
const config     = require("../config");
const { log, sanitizeLog } = require("./logger");

// ─── HTML escaping ─────────────────────────────────────────────────────────
// Used whenever content from external sources is embedded in message bodies.

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

// Telegram HTML parse mode needs &, <, >, and " escaped (used in double-quoted href attributes).
function escTg(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Message builders ──────────────────────────────────────────────────────

function buildMessages(product, reason, checkoutUrl) {
  const checkoutBlock = checkoutUrl
    ? [
        "<h3>Continue to payment (form pre-filled):</h3>",
        "<p><a href='" + esc(checkoutUrl) + "'>" + esc(checkoutUrl) + "</a></p>",
        "<p><small>Your details are pre-filled. Complete payment via PayPal.</small></p>",
      ].join("\n")
    : "<h3>Cart automation failed - add to cart manually via the product page above.</h3>";

  const html = [
    "<h2>Restock detected: " + esc(product.name) + "</h2>",
    "<p><strong>Why:</strong> " + esc(reason) + "</p>",
    "<hr>",
    "<h3>Product page:</h3>",
    "<p><a href='" + esc(product.url) + "'>" + esc(product.url) + "</a></p>",
    "<hr>",
    checkoutBlock,
    "<hr>",
    "<p><small>Detected at " + new Date().toLocaleString("fr-FR") + "</small></p>",
  ].join("\n");

  const plain = "RESTOCK: " + product.name + "\n\n" +
    product.url + (checkoutUrl ? "\n\nCheckout: " + checkoutUrl : "\n\nAdd to cart manually.");

  const tg = "<b>RESTOCK:</b> " + escTg(product.name) + "\n\n" +
    "<a href=\"" + escTg(product.url) + "\">" + escTg(product.url) + "</a>" +
    (checkoutUrl
      ? "\n\n<a href=\"" + escTg(checkoutUrl) + "\">Checkout (pre-filled)</a>"
      : "\n\nAdd to cart manually.");

  return { subject: "RESTOCK: " + product.name, html, plain, tg };
}

// ─── Email ─────────────────────────────────────────────────────────────────
// Transporter is created once and reused to avoid reconnecting on every send.

const emailTransporter = nodemailer.createTransport({
  host:   config.email.host,
  port:   config.email.port,
  secure: config.email.secure,
  auth:   { user: config.email.user, pass: config.email.pass },
});

async function sendEmail(subject, html) {
  await emailTransporter.sendMail({ from: config.email.from, to: config.email.to, subject, html });
  log("Email sent: " + subject);
}

// ─── Telegram ──────────────────────────────────────────────────────────────

const TELEGRAM_API_BASE = "https://api.telegram.org";

// Return value contains the bot token in the URL path. Never log it.
function buildTelegramUrl(token, method) {
  return `${TELEGRAM_API_BASE}/bot${token}/${method}`;
}

async function sendTelegram(message) {
  const token  = config.telegram.botToken;
  const chatId = config.telegram.chatId;
  const url    = buildTelegramUrl(token, "sendMessage");
  try {
    await axios.post(url, { chat_id: chatId, text: message, parse_mode: "HTML" },
      { timeout: 10000, maxRedirects: 0 });
    log("Telegram sent to chat: " + chatId);
  } catch (err) {
    // Sanitize error object to prevent token leakage in logs/stack traces.
    if (err.config) err.config = null;
    if (err.request) err.request = null;
    let detail;
    if (err.response) {
      let body = "";
      try { body = JSON.stringify(err.response.data).slice(0, 200); } catch (_) { body = String(err.response.data).slice(0, 200); }
      detail = "HTTP " + err.response.status + " - " + body;
    } else {
      detail = err.code || "Unknown error";
    }
    throw new Error("Telegram send failed: " + detail);
  }
}

// ─── WhatsApp ──────────────────────────────────────────────────────────────

let waClient = null;
let waReady  = false;

async function initWhatsApp() {
  if (waReady) return;
  const { Client, LocalAuth } = require("whatsapp-web.js");
  const qrcode = require("qrcode-terminal");

  const authPath = path.join(__dirname, "..", ".wwebjs_auth");
  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { mode: 0o700, recursive: true });
  }

  const puppeteerArgs = config.puppeteerNoSandbox
    ? ["--no-sandbox", "--disable-setuid-sandbox"]
    : [];

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: { headless: true, args: puppeteerArgs },
  });

  return new Promise((resolve, reject) => {
    waClient.on("qr", (qr) => {
      console.log("\n-  SCAN THIS QR CODE WITH WHATSAPP  -\n");
      qrcode.generate(qr, { small: true });
      console.log("\nSettings -> Linked Devices -> Link a Device\n");
    });
    waClient.on("ready", () => { log("WhatsApp ready."); waReady = true; resolve(); });
    waClient.on("auth_failure", (msg) => reject(new Error("WhatsApp auth failed: " + msg)));
    waClient.initialize().catch(reject);
  });
}

async function resolveChat(raw) {
  const chats    = await waClient.getChats();
  const contacts = await waClient.getContacts();

  // Explicit chat ID override - most reliable path
  if (config.whatsapp.chatId) {
    const byId = chats.find((ch) => ch.id._serialized === config.whatsapp.chatId);
    if (byId) { log("Using WA_CHAT_ID: " + config.whatsapp.chatId); return byId; }
    log("Chat ID not in recent chats, sending directly to: " + config.whatsapp.chatId);
    return {
      name: config.whatsapp.chatId,
      id:   { _serialized: config.whatsapp.chatId },
      sendMessage: (msg) => waClient.sendMessage(config.whatsapp.chatId, msg),
    };
  }

  // Brazilian numbers may omit the 9th digit internally
  const alt     = raw.replace(/^(55\d{2})9(\d{8})$/, "$1$2");
  const contact = contacts.find((c) => c.number === raw || c.number === alt);
  if (contact) {
    const byContactId = chats.find((ch) => ch.id._serialized === contact.id._serialized);
    if (byContactId) return byContactId;
    try { const c2 = await contact.getChat(); if (c2) return c2; } catch (_) {}
  }

  return chats.find((ch) => {
    const u = ch.id.user || "";
    return u === raw || u === alt;
  }) || null;
}

async function sendWhatsApp(message) {
  await initWhatsApp();
  const raw  = config.whatsapp.recipientNumber.replace(/\D/g, "");
  const chat = await resolveChat(raw);
  if (!chat) {
    throw new Error(
      "Could not find WhatsApp chat for " + config.whatsapp.recipientNumber + ".\n" +
      "NOTE: WhatsApp does not deliver messages sent to yourself.\n" +
      "Use a different recipient number, or run: node monitor.js --debug-wa"
    );
  }
  log("Sending via WhatsApp...");
  await chat.sendMessage(message);
  log("WhatsApp sent.");
}

// ─── Dispatch ──────────────────────────────────────────────────────────────
// Adding a new notification channel = adding one entry here + a send function above.

const NOTIFIERS = {
  email:    ({ subject, html }) => sendEmail(subject, html),
  telegram: ({ tg })            => sendTelegram(tg),
  whatsapp: ({ plain })         => sendWhatsApp(plain),
};

async function notify(product, reason, checkoutUrl) {
  const msgs     = buildMessages(product, reason, checkoutUrl);
  const notifier = NOTIFIERS[config.notificationMethod];
  try {
    await notifier(msgs);
    return true;
  } catch (err) {
    log("ERROR sending notification: " + sanitizeLog(err.message), { level: "error" });
    return false;
  }
}

// ─── Debug helpers ─────────────────────────────────────────────────────────

async function runDebugTelegram() {
  const token  = config.telegram.botToken;
  const chatId = config.telegram.chatId;

  if (!token || token === "your-bot-token") {
    console.log("ERROR: TELEGRAM_BOT_TOKEN is not set in your .env");
    console.log("Create a bot via @BotFather on Telegram, then add the token to .env");
    process.exit(1);
  }

  try {
    const me = await axios.get(buildTelegramUrl(token, "getMe"),
      { timeout: 10000, maxRedirects: 0 });
    console.log("Bot verified: @" + me.data.result.username + " (" + me.data.result.first_name + ")");
  } catch (err) {
    if (err.config) err.config = null;
    if (err.request) err.request = null;
    const detail = err.response ? JSON.stringify(err.response.data) : (err.code || err.message);
    console.log("ERROR: Invalid bot token - " + detail);
    process.exit(1);
  }

  if (!chatId || chatId === "your-chat-id") {
    console.log("\nTELEGRAM_CHAT_ID not set. Fetching recent messages to find it...");
    console.log("(Make sure you sent at least one message to your bot first)\n");
    try {
      const updates = await axios.get(buildTelegramUrl(token, "getUpdates"),
        { timeout: 10000, maxRedirects: 0 });
      const msgs = updates.data.result;
      if (!msgs || msgs.length === 0) {
        console.log("No messages found. Send any message to your bot in Telegram, then run this again.");
      } else {
        console.log("Recent senders:");
        const seen = new Set();
        msgs.forEach((u) => {
          const chat = u.message && u.message.chat;
          if (chat && !seen.has(chat.id)) {
            seen.add(chat.id);
            console.log("  " + (chat.first_name || chat.title || "?").padEnd(25) +
              " -> TELEGRAM_CHAT_ID=" + chat.id);
          }
        });
        console.log("\nAdd the correct ID to your .env and re-run --debug-telegram to send a test message.");
      }
    } catch (err) {
      if (err.config) err.config = null;
      if (err.request) err.request = null;
      console.log("Could not fetch updates: " + (err.code || err.message));
    }
    return;
  }

  console.log("Sending test message to chat_id " + chatId + "...");
  try {
    await sendTelegram("Telegram test from restock monitor - it works!");
    console.log("Done! Check your Telegram.");
  } catch (err) {
    console.log("ERROR: " + err.message);
  }
}

async function runDebugWA() {
  console.log("WARNING: --debug-wa prints your WhatsApp contact list.");
  console.log("         Treat this output as sensitive - do not share it.\n");

  log("Initializing WhatsApp...");
  await initWhatsApp();
  log("Connected.\n");

  const chats    = await waClient.getChats();
  const contacts = await waClient.getContacts();

  console.log("CONTACTS (first 30):");
  contacts.filter((c) => c.isMyContact && c.number).slice(0, 30).forEach((c) => {
    console.log("  " + (c.name || c.pushname || "(no name)").padEnd(30) + " -> " + c.number);
  });

  console.log("\nRECENT CHATS:");
  chats.slice(0, 15).forEach((ch) => {
    console.log("  " + (ch.name || "?").padEnd(30) + " -> " + ch.id._serialized);
  });

  const raw  = config.whatsapp.recipientNumber.replace(/\D/g, "");
  const chat = await resolveChat(raw);
  console.log("\nRESOLVING: " + config.whatsapp.recipientNumber);
  if (chat) {
    console.log("  Found: " + sanitizeLog(chat.name) + " (" + sanitizeLog(chat.id._serialized) + ")");
    console.log("  Sending test message...");
    await chat.sendMessage("WhatsApp test from restock monitor.");
    console.log("  Done! Check your WhatsApp.");
    console.log("\n  If message did not arrive, add to .env:");
    console.log("  WA_CHAT_ID=" + chat.id._serialized);
    console.log("\n  NOTE: WhatsApp does not deliver messages sent to yourself.");
    console.log("  Use a different recipient number.");
  } else {
    console.log("  Could not resolve. Check contacts/chats above.");
    console.log("  Set WA_CHAT_ID=<id> in your .env to override.");
  }
}

module.exports = {
  notify, initWhatsApp, runDebugTelegram, runDebugWA,
  // Exported for testing
  buildMessages, esc, escTg,
};

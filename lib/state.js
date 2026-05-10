"use strict";

const fs = require("fs");
const path = require("path");
const config = require("../config");

const STATE_FILE = path.join(__dirname, "..", ".states.json");
const STATE_TMP = STATE_FILE + ".tmp";
const STATE_FIELD_MAX = 200;

// Matches ISO 8601 strings produced by Date#toISOString(), e.g.
// "2024-01-01T00:00:00.000Z" or "2024-01-01T00:00:00+05:30".
// Rejects free-form strings that new Date() would otherwise accept
// (e.g. "January 1 2020", "2020/01/01", "not-a-date").
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isValidIsoDate(s) {
  if (typeof s !== "string") return false;
  if (!ISO_DATE_RE.test(s)) return false;
  const t = new Date(s).getTime();
  if (!Number.isFinite(t)) return false;
  // Reject future timestamps - a poisoned state file must not bypass cooldowns
  // by claiming the last notification was in the future (making elapsed always negative).
  if (t > Date.now()) return false;
  return true;
}

function validateStateEntry(entry) {
  // Reject entries with unexpected types to prevent state file poisoning.
  if (!entry || typeof entry !== "object") return null;
  return {
    likelyAvailable: typeof entry.likelyAvailable === "boolean" ? entry.likelyAvailable : false,
    likelyUnavailable:
      typeof entry.likelyUnavailable === "boolean" ? entry.likelyUnavailable : true,
    fingerprint: typeof entry.fingerprint === "string" ? entry.fingerprint.slice(0, 64) : "",
    ctaText: typeof entry.ctaText === "string" ? entry.ctaText.slice(0, STATE_FIELD_MAX) : "",
    checkedAt: isValidIsoDate(entry.checkedAt) ? entry.checkedAt : new Date(0).toISOString(),
    lastNotifiedAt: isValidIsoDate(entry.lastNotifiedAt) ? entry.lastNotifiedAt : null,
  };
}

function loadStates() {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const validated = {};
    for (const [key, val] of Object.entries(raw)) {
      if (!config.products.some((p) => p.url === key)) continue;
      const entry = validateStateEntry(val);
      if (entry) validated[key] = entry;
    }
    return validated;
  } catch (_) {
    return {};
  }
}

function saveStates(s) {
  // Atomic write: write to a temp file then rename.
  // Prevents corrupt state if the process crashes mid-write.
  // Mode 0o600 restricts access to owner only.
  const data = JSON.stringify(s, null, 2);
  fs.writeFileSync(STATE_TMP, data, { mode: 0o600 });
  fs.renameSync(STATE_TMP, STATE_FILE);
}

module.exports = { loadStates, saveStates, validateStateEntry, isValidIsoDate, STATE_FIELD_MAX };

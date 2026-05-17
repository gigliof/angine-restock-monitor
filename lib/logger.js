"use strict";

const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "..", "monitor.log");
const LOG_MAX_BYTES = 2 * 1024 * 1024; // rotate at 2 MB
const LOG_FIELD_MAX = 200; // max chars of external data written to log

// Sanitize a string before writing to the log file.
// Strips ANSI escape sequences and control characters to prevent log injection.
function sanitizeLog(s) {
  return String(s)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "") // strip ANSI escape sequences
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, LOG_FIELD_MAX);
}

// Writes a human-readable line to stdout and a structured JSON entry to the log file.
// extra: optional fields merged into the JSON log entry (e.g. { level: "error", product: "..." })
function log(msg, extra = {}) {
  const now = new Date();
  const ts = now.toISOString(); // UTC - used in the log file for precision
  const tsLocal = now.toLocaleString(); // system timezone - used in console output
  const level = extra.level || "info";
  // Sanitize msg at write point so callers don't have to sanitize internal strings.
  const entry = Object.assign({ ts, level, msg: sanitizeLog(msg) }, extra);

  const prefix = level === "error" ? "[ERROR] " : level === "warn" ? "[WARN]  " : "";
  console.log("[" + tsLocal + "] " + prefix + msg);

  try {
    try {
      if (fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) fs.renameSync(LOG_FILE, LOG_FILE + ".1");
    } catch (_) {}
    // Mode 0o600 restricts log file access to owner only.
    // The mode arg to openSync only applies on file creation; explicit chmod
    // enforces 0o600 even when the file pre-existed with permissive perms.
    const fd = fs.openSync(LOG_FILE, "a", 0o600);
    fs.writeSync(fd, JSON.stringify(entry) + "\n");
    try {
      fs.fchmodSync(fd, 0o600);
    } catch (_) {}
    fs.closeSync(fd);
  } catch (err) {
    console.error("[logger] Failed to write to log file: " + err.message);
  }
}

module.exports = { log, sanitizeLog, LOG_FIELD_MAX };

"use strict";

const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { _testing } = require("../config");

const {
  isValidEmail,
  NOTIFICATION_METHODS,
  isValidE164,
  isValidTelegramChatId,
  isValidHttpsUrl,
  parsePositiveInt,
  parseBool,
} = _testing;

// ─── isValidEmail ─────────────────────────────────────────────

test("isValidEmail: accepts standard email format", () => {
  assert.equal(isValidEmail("user@example.com"), true);
  assert.equal(isValidEmail("user.name@example.co.uk"), true);
  assert.equal(isValidEmail("user+tag@example.com"), true);
});

test("isValidEmail: rejects email without @", () => {
  assert.equal(isValidEmail("userexample.com"), false);
});

test("isValidEmail: rejects email without domain", () => {
  assert.equal(isValidEmail("user@"), false);
});

test("isValidEmail: rejects email without TLD", () => {
  assert.equal(isValidEmail("user@example"), false);
});

test("isValidEmail: rejects email with spaces", () => {
  assert.equal(isValidEmail("user @example.com"), false);
  assert.equal(isValidEmail("user@ example.com"), false);
});

test("isValidEmail: rejects empty string", () => {
  assert.equal(isValidEmail(""), false);
});

// ─── isValidE164 ──────────────────────────────────────────────

test("isValidE164: accepts valid E.164 format", () => {
  assert.equal(isValidE164("+15551234567"), true);
  assert.equal(isValidE164("+442071234567"), true);
  assert.equal(isValidE164("+5511999887766"), true);
});

test("isValidE164: rejects without plus sign", () => {
  assert.equal(isValidE164("15551234567"), false);
});

test("isValidE164: rejects with spaces or dashes", () => {
  assert.equal(isValidE164("+1 555 123 4567"), false);
  assert.equal(isValidE164("+1-555-123-4567"), false);
});

test("isValidE164: rejects too short", () => {
  assert.equal(isValidE164("+123456"), false);
});

test("isValidE164: rejects too long", () => {
  assert.equal(isValidE164("+1234567890123456"), false);
});

test("isValidE164: rejects empty string", () => {
  assert.equal(isValidE164(""), false);
});

// ─── isValidTelegramChatId ────────────────────────────────────

test("isValidTelegramChatId: accepts positive numeric ID", () => {
  assert.equal(isValidTelegramChatId("123456789"), true);
});

test("isValidTelegramChatId: accepts negative group ID", () => {
  assert.equal(isValidTelegramChatId("-100123456789"), true);
});

test("isValidTelegramChatId: rejects non-numeric", () => {
  assert.equal(isValidTelegramChatId("abc123"), false);
  assert.equal(isValidTelegramChatId("@username"), false);
});

test("isValidTelegramChatId: rejects empty string", () => {
  assert.equal(isValidTelegramChatId(""), false);
});

test("isValidTelegramChatId: rejects floating point", () => {
  assert.equal(isValidTelegramChatId("123.456"), false);
});

// ─── isValidHttpsUrl ──────────────────────────────────────────

test("isValidHttpsUrl: accepts HTTPS URL with correct hostname", () => {
  assert.equal(isValidHttpsUrl("https://example.com/path", "example.com"), true);
});

test("isValidHttpsUrl: rejects HTTP URL", () => {
  assert.equal(isValidHttpsUrl("http://example.com/path", "example.com"), false);
});

test("isValidHttpsUrl: rejects different hostname", () => {
  assert.equal(isValidHttpsUrl("https://other.com/path", "example.com"), false);
});

test("isValidHttpsUrl: rejects subdomain spoofing", () => {
  assert.equal(isValidHttpsUrl("https://example.com.evil.com/", "example.com"), false);
});

test("isValidHttpsUrl: rejects invalid URL", () => {
  assert.equal(isValidHttpsUrl("not-a-url", "example.com"), false);
});

test("isValidHttpsUrl: rejects empty string", () => {
  assert.equal(isValidHttpsUrl("", "example.com"), false);
});

// ─── parsePositiveInt ─────────────────────────────────────────

test("parsePositiveInt: parses valid integer", () => {
  assert.equal(parsePositiveInt("42"), 42);
  assert.equal(parsePositiveInt("1"), 1);
  assert.equal(parsePositiveInt("100"), 100);
});

test("parsePositiveInt: returns null for non-numeric", () => {
  assert.equal(parsePositiveInt("abc"), null);
  assert.equal(parsePositiveInt(""), null);
  assert.equal(parsePositiveInt("12.5"), 12); // parseInt truncates
});

test("parsePositiveInt: respects min bound", () => {
  assert.equal(parsePositiveInt("5", 10), null);
  assert.equal(parsePositiveInt("10", 10), 10);
});

test("parsePositiveInt: respects max bound", () => {
  assert.equal(parsePositiveInt("100", 1, 50), null);
  assert.equal(parsePositiveInt("50", 1, 50), 50);
});

test("parsePositiveInt: rejects negative numbers with default min", () => {
  assert.equal(parsePositiveInt("-5"), null);
});

test("parsePositiveInt: rejects zero with default min", () => {
  assert.equal(parsePositiveInt("0"), null);
});

test("parsePositiveInt: accepts zero when min is 0", () => {
  assert.equal(parsePositiveInt("0", 0), 0);
});

test("parsePositiveInt: rejects Infinity", () => {
  assert.equal(parsePositiveInt("Infinity"), null);
});

test("parsePositiveInt: rejects NaN", () => {
  assert.equal(parsePositiveInt("NaN"), null);
});

// ─── parseBool ────────────────────────────────────────────────

test("parseBool: returns true for 'true'", () => {
  assert.equal(parseBool("true"), true);
});

test("parseBool: returns true for 'TRUE' (case insensitive)", () => {
  assert.equal(parseBool("TRUE"), true);
  assert.equal(parseBool("True"), true);
});

test("parseBool: returns false for 'false'", () => {
  assert.equal(parseBool("false"), false);
});

test("parseBool: returns false for any non-'true' string", () => {
  assert.equal(parseBool("yes"), false);
  assert.equal(parseBool("1"), false);
  assert.equal(parseBool("on"), false);
});

test("parseBool: returns null for empty string", () => {
  assert.equal(parseBool(""), null);
});

test("parseBool: returns null for undefined", () => {
  assert.equal(parseBool(undefined), null);
});

test("parseBool: returns null for null", () => {
  assert.equal(parseBool(null), null);
});

// ─── NOTIFICATION_METHODS ─────────────────────────────────────

test("NOTIFICATION_METHODS: contains expected values", () => {
  assert.ok(NOTIFICATION_METHODS.includes("email"));
  assert.ok(NOTIFICATION_METHODS.includes("telegram"));
  assert.ok(NOTIFICATION_METHODS.includes("whatsapp"));
  assert.equal(NOTIFICATION_METHODS.length, 3);
});

test("NOTIFICATION_METHODS: is frozen (immutable)", () => {
  assert.ok(Object.isFrozen(NOTIFICATION_METHODS));
});

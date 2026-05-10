"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateStateEntry, isValidIsoDate } = require("../lib/state");

// ─── isValidIsoDate ──────────────────────────────────────────

test("isValidIsoDate: valid past date returns true", () => {
  assert.equal(isValidIsoDate("2024-01-01T00:00:00.000Z"), true);
});

test("isValidIsoDate: epoch returns true", () => {
  assert.equal(isValidIsoDate(new Date(0).toISOString()), true);
});

test("isValidIsoDate: future date returns false", () => {
  assert.equal(isValidIsoDate("2999-01-01T00:00:00.000Z"), false);
});

test("isValidIsoDate: invalid string returns false", () => {
  assert.equal(isValidIsoDate("not-a-date"), false);
  assert.equal(isValidIsoDate(""), false);
  assert.equal(isValidIsoDate("0"), false);
});

test("isValidIsoDate: non-string types return false", () => {
  assert.equal(isValidIsoDate(null), false);
  assert.equal(isValidIsoDate(undefined), false);
  assert.equal(isValidIsoDate(123), false);
  assert.equal(isValidIsoDate({}), false);
});

// ─── validateStateEntry ──────────────────────────────────────

test("validateStateEntry: null/undefined/primitive returns null", () => {
  assert.equal(validateStateEntry(null), null);
  assert.equal(validateStateEntry(undefined), null);
  assert.equal(validateStateEntry("string"), null);
  assert.equal(validateStateEntry(42), null);
});

test("validateStateEntry: valid entry passes through cleanly", () => {
  const entry = {
    likelyAvailable: true,
    likelyUnavailable: false,
    fingerprint: "abcd1234",
    ctaText: "40,00 C$",
    checkedAt: "2024-01-01T00:00:00.000Z",
    lastNotifiedAt: "2024-01-01T00:00:00.000Z",
  };
  const r = validateStateEntry(entry);
  assert.equal(r.likelyAvailable, true);
  assert.equal(r.likelyUnavailable, false);
  assert.equal(r.fingerprint, "abcd1234");
  assert.equal(r.ctaText, "40,00 C$");
  assert.equal(r.lastNotifiedAt, "2024-01-01T00:00:00.000Z");
});

test("validateStateEntry: future lastNotifiedAt is rejected (becomes null)", () => {
  const entry = {
    likelyAvailable: false,
    likelyUnavailable: true,
    fingerprint: "abcd",
    ctaText: "Indisponible",
    checkedAt: "2024-01-01T00:00:00.000Z",
    lastNotifiedAt: "2999-01-01T00:00:00.000Z",
  };
  const r = validateStateEntry(entry);
  assert.equal(r.lastNotifiedAt, null);
});

test("validateStateEntry: null lastNotifiedAt stays null", () => {
  const entry = {
    likelyAvailable: true,
    likelyUnavailable: false,
    fingerprint: "x",
    ctaText: "40 C$",
    checkedAt: "2024-01-01T00:00:00.000Z",
    lastNotifiedAt: null,
  };
  assert.equal(validateStateEntry(entry).lastNotifiedAt, null);
});

test("validateStateEntry: fingerprint capped at 64 chars", () => {
  const entry = {
    likelyAvailable: false,
    likelyUnavailable: true,
    fingerprint: "a".repeat(200),
    ctaText: "x",
    checkedAt: "2024-01-01T00:00:00.000Z",
    lastNotifiedAt: null,
  };
  assert.equal(validateStateEntry(entry).fingerprint.length, 64);
});

test("validateStateEntry: ctaText capped at 200 chars", () => {
  const entry = {
    likelyAvailable: false,
    likelyUnavailable: true,
    fingerprint: "a",
    ctaText: "x".repeat(500),
    checkedAt: "2024-01-01T00:00:00.000Z",
    lastNotifiedAt: null,
  };
  assert.equal(validateStateEntry(entry).ctaText.length, 200);
});

test("validateStateEntry: wrong boolean types default safely", () => {
  const entry = {
    likelyAvailable: "yes", // wrong type -> false
    likelyUnavailable: 1, // wrong type -> true (default)
    fingerprint: "x",
    ctaText: "x",
    checkedAt: "2024-01-01T00:00:00.000Z",
    lastNotifiedAt: null,
  };
  const r = validateStateEntry(entry);
  assert.equal(r.likelyAvailable, false);
  assert.equal(r.likelyUnavailable, true);
});

test("validateStateEntry: wrong string types default to empty string", () => {
  const entry = {
    likelyAvailable: false,
    likelyUnavailable: true,
    fingerprint: 12345, // wrong type -> ""
    ctaText: null, // wrong type -> ""
    checkedAt: "2024-01-01T00:00:00.000Z",
    lastNotifiedAt: null,
  };
  const r = validateStateEntry(entry);
  assert.equal(r.fingerprint, "");
  assert.equal(r.ctaText, "");
});

test("validateStateEntry: invalid checkedAt defaults to epoch", () => {
  const entry = {
    likelyAvailable: false,
    likelyUnavailable: true,
    fingerprint: "x",
    ctaText: "x",
    checkedAt: "not-a-date",
    lastNotifiedAt: null,
  };
  assert.equal(validateStateEntry(entry).checkedAt, new Date(0).toISOString());
});

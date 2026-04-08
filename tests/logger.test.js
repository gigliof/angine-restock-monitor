"use strict";

const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { sanitizeLog, LOG_FIELD_MAX } = require("../lib/logger");

test("sanitizeLog: strips ANSI SGR sequences", () => {
  assert.equal(sanitizeLog("\x1b[31mred\x1b[0m"), "red");
  assert.equal(sanitizeLog("\x1b[1;32mbold green\x1b[0m"), "bold green");
});

test("sanitizeLog: strips ANSI cursor/erase sequences", () => {
  assert.equal(sanitizeLog("\x1b[2Jclear screen"), "clear screen");
  assert.equal(sanitizeLog("\x1b[Hmove cursor"), "move cursor");
});

test("sanitizeLog: replaces newlines with spaces", () => {
  assert.equal(sanitizeLog("line1\nline2"), "line1 line2");
  assert.equal(sanitizeLog("a\r\nb"), "a  b"); // \r and \n each become a space
});

test("sanitizeLog: replaces tabs with spaces", () => {
  assert.equal(sanitizeLog("col1\tcol2"), "col1 col2");
});

test("sanitizeLog: strips null bytes and other control characters", () => {
  assert.equal(sanitizeLog("a\x00b\x07c\x08d"), "a b c d");
});

test("sanitizeLog: truncates to LOG_FIELD_MAX", () => {
  const long = "x".repeat(LOG_FIELD_MAX + 100);
  assert.equal(sanitizeLog(long).length, LOG_FIELD_MAX);
});

test("sanitizeLog: short strings are not truncated", () => {
  assert.equal(sanitizeLog("hello world"), "hello world");
});

test("sanitizeLog: coerces non-string types to string", () => {
  assert.equal(sanitizeLog(123), "123");
  assert.equal(sanitizeLog(null), "null");
  assert.equal(sanitizeLog(undefined), "undefined");
  assert.equal(sanitizeLog(true), "true");
});

test("sanitizeLog: empty string passes through", () => {
  assert.equal(sanitizeLog(""), "");
});

test("sanitizeLog: combined ANSI + newline + long string", () => {
  const input = "\x1b[31m" + "a".repeat(300) + "\n\x1b[0m";
  const result = sanitizeLog(input);
  assert.equal(result.length, LOG_FIELD_MAX);
  assert.ok(!result.includes("\x1b"));
  assert.ok(!result.includes("\n"));
});

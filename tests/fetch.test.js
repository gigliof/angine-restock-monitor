"use strict";

const { test } = require("node:test");
const assert   = require("node:assert/strict");
const { assertAllowedUrl } = require("../lib/fetch");

// ─── assertAllowedUrl ─────────────────────────────────────────

test("assertAllowedUrl: allows valid URL with correct hostname", () => {
  assert.doesNotThrow(() => {
    assertAllowedUrl("https://anginedepoitrine.com/product/123");
  });
});

test("assertAllowedUrl: allows URL with path and query string", () => {
  assert.doesNotThrow(() => {
    assertAllowedUrl("https://anginedepoitrine.com/go/cart?session=abc123");
  });
});

test("assertAllowedUrl: rejects subdomain spoofing (hostname.evil.com)", () => {
  assert.throws(
    () => assertAllowedUrl("https://anginedepoitrine.com.evil.com/product/123"),
    /Refusing to fetch URL outside allowed hostname/
  );
});

test("assertAllowedUrl: rejects different hostname", () => {
  assert.throws(
    () => assertAllowedUrl("https://example.com/product/123"),
    /Refusing to fetch URL outside allowed hostname/
  );
});

test("assertAllowedUrl: rejects subdomain of allowed hostname", () => {
  assert.throws(
    () => assertAllowedUrl("https://www.anginedepoitrine.com/product/123"),
    /Refusing to fetch URL outside allowed hostname/
  );
});

test("assertAllowedUrl: rejects HTTP (non-HTTPS) URLs", () => {
  assert.throws(
    () => assertAllowedUrl("http://anginedepoitrine.com/product/123"),
    /URL must use HTTPS/
  );
});

test("assertAllowedUrl: rejects invalid URL format", () => {
  assert.throws(
    () => assertAllowedUrl("not-a-valid-url"),
    /Invalid URL/
  );
});

test("assertAllowedUrl: URL with multiple @ resolves to last hostname (WHATWG spec)", () => {
  // The WHATWG URL parser uses the last @ as the userinfo/host separator, so
  // "user:pass@evil.com" becomes userinfo and the hostname is anginedepoitrine.com.
  // This is safe - the request goes to the allowed host, not evil.com.
  assert.doesNotThrow(() => {
    assertAllowedUrl("https://user:pass@evil.com@anginedepoitrine.com/");
  });
});

test("assertAllowedUrl: rejects URL with credentials for a different host", () => {
  assert.throws(
    () => assertAllowedUrl("https://user:pass@evil.com/"),
    /Refusing to fetch URL outside allowed hostname/
  );
});

test("assertAllowedUrl: rejects javascript: protocol", () => {
  // javascript: URLs parse successfully with an empty hostname, so the
  // hostname check rejects them (not the URL parser).
  assert.throws(
    () => assertAllowedUrl("javascript:alert(1)"),
    /Refusing to fetch URL outside allowed hostname/
  );
});

test("assertAllowedUrl: rejects data: protocol", () => {
  assert.throws(
    () => assertAllowedUrl("data:text/html,<script>alert(1)</script>"),
    /Refusing to fetch URL outside allowed hostname/
  );
});

test("assertAllowedUrl: rejects file: protocol", () => {
  assert.throws(
    () => assertAllowedUrl("file:///etc/passwd"),
    /Refusing to fetch URL outside allowed hostname/
  );
});

test("assertAllowedUrl: allows URL with non-standard port (same hostname)", () => {
  // URL.hostname does not include the port, so the hostname check passes.
  assert.doesNotThrow(() => {
    assertAllowedUrl("https://anginedepoitrine.com:8080/product/123");
  });
});

test("assertAllowedUrl: handles empty string", () => {
  assert.throws(
    () => assertAllowedUrl(""),
    /Invalid URL/
  );
});

test("assertAllowedUrl: handles null/undefined (type coercion)", () => {
  assert.throws(
    () => assertAllowedUrl(null),
    /Invalid URL/
  );
  assert.throws(
    () => assertAllowedUrl(undefined),
    /Invalid URL/
  );
});

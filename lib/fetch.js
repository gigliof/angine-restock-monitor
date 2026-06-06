"use strict";

const axios = require("axios");
const https = require("https");
const zlib = require("zlib");
const config = require("../config");
const { log } = require("./logger");

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB cap on raw AND decompressed

const FETCH_HEADERS = Object.freeze({
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-CA;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
});

// Shared axios instance with keep-alive for connection reuse across requests.
// decompress: false + manual decompression with zlib's maxOutputLength defends
// against zip-bomb DoS: a small compressed payload that decompresses to GBs.
// axios's own maxContentLength caps the *raw* (compressed) bytes; the manual
// decompress below caps the *decompressed* bytes.
const httpsAgent = new https.Agent({ keepAlive: true });
const axiosInstance = axios.create({
  httpsAgent,
  timeout: 25000,
  maxRedirects: 0,
  maxContentLength: MAX_RESPONSE_BYTES,
  maxBodyLength: MAX_RESPONSE_BYTES,
  decompress: false,
  responseType: "arraybuffer",
});

// Uses URL constructor + hostname check to prevent subdomain spoofing
// (e.g. "https://anginedepoitrine.com.evil.com/" passes startsWith but fails here).
function assertAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== config.allowedHostname) {
      throw new Error(
        "Refusing to fetch URL outside allowed hostname (" + config.allowedHostname + "): " + url
      );
    }
    if (parsed.protocol !== "https:") {
      throw new Error("URL must use HTTPS: " + url);
    }
  } catch (err) {
    if (err.message.startsWith("Refusing") || err.message.startsWith("URL must")) throw err;
    throw new Error("Invalid URL: " + url);
  }
}

// Decompress a Buffer using the algorithm in Content-Encoding, with a hard
// cap on decompressed output. Throws on unknown encoding or size overflow.
function decompressBody(buffer, contentEncoding) {
  const opts = { maxOutputLength: MAX_RESPONSE_BYTES };
  const enc = (contentEncoding || "").toLowerCase().trim();
  switch (enc) {
    case "":
    case "identity":
      return buffer;
    case "gzip":
    case "x-gzip":
      return zlib.gunzipSync(buffer, opts);
    case "deflate":
      return zlib.inflateSync(buffer, opts);
    case "br":
      return zlib.brotliDecompressSync(buffer, opts);
    default:
      throw new Error("Unsupported Content-Encoding: " + enc);
  }
}

// Exponential backoff delays: 5s, 10s, 20s
function retryDelay(attempt) {
  return 5000 * Math.pow(2, attempt - 1);
}

async function fetchPage(url) {
  assertAllowedUrl(url);
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Use shared axios instance with keep-alive for connection reuse.
      const res = await axiosInstance.get(url, { headers: FETCH_HEADERS });
      const body = decompressBody(Buffer.from(res.data), res.headers["content-encoding"]);
      return body.toString("utf8");
    } catch (err) {
      lastErr = err;
      const retryable =
        err.code === "ECONNRESET" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ECONNABORTED" ||
        (err.response && err.response.status >= 500);
      if (!retryable || attempt === 3) break;
      const wait = retryDelay(attempt);
      log("  Retrying in " + wait / 1000 + "s (attempt " + attempt + "/3)...");
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// Fetches the Shopify product JSON for a product page URL by appending ".js"
// (e.g. https://host/products/foo -> https://host/products/foo.js) and parsing
// the result. The endpoint exposes an authoritative `available` flag plus
// per-variant availability - far more stable than scraping HTML.
// Throws on network error, non-2xx (e.g. 404 for a missing product), or bad JSON.
async function fetchProductJson(url) {
  assertAllowedUrl(url);
  const jsonUrl = url.replace(/\/+$/, "") + ".js";
  const text = await fetchPage(jsonUrl);
  return JSON.parse(text);
}

module.exports = {
  fetchPage,
  fetchProductJson,
  assertAllowedUrl,
  FETCH_HEADERS,
  decompressBody,
};

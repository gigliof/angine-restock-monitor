"use strict";

const axios  = require("axios");
const https  = require("https");
const config = require("../config");
const { log } = require("./logger");

const FETCH_HEADERS = Object.freeze({
  "User-Agent":                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language":           "fr-FR,fr;q=0.9,en-CA;q=0.8,en;q=0.7",
  "Accept-Encoding":           "gzip, deflate, br",
  "Connection":                "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest":            "document",
  "Sec-Fetch-Mode":            "navigate",
  "Sec-Fetch-Site":            "none",
  "Sec-Fetch-User":            "?1",
  "Cache-Control":             "max-age=0",
});

// Shared axios instance with keep-alive for connection reuse across requests.
const httpsAgent = new https.Agent({ keepAlive: true });
const axiosInstance = axios.create({
  httpsAgent,
  timeout: 25000,
  maxRedirects: 0,
  maxContentLength: 5 * 1024 * 1024, // 5 MB
});

// Uses URL constructor + hostname check to prevent subdomain spoofing
// (e.g. "https://anginedepoitrine.com.evil.com/" passes startsWith but fails here).
function assertAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== config.allowedHostname) {
      throw new Error(
        "Refusing to fetch URL outside allowed hostname (" +
        config.allowedHostname + "): " + url
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
      return res.data;
    } catch (err) {
      lastErr = err;
      const retryable = err.code === "ECONNRESET" || err.code === "ETIMEDOUT" ||
                        err.code === "ECONNABORTED" ||
                        (err.response && err.response.status >= 500);
      if (!retryable || attempt === 3) break;
      const wait = retryDelay(attempt);
      log("  Retrying in " + (wait / 1000) + "s (attempt " + attempt + "/3)...");
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

module.exports = { fetchPage, assertAllowedUrl, FETCH_HEADERS };

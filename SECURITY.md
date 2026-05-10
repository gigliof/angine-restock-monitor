# Security Policy

## Scope

The Angine Restock Monitor is a self-hosted Node.js script. It has no server, no user accounts, and stores no third-party data. The realistic attack surface is:

- **Notification credentials** stored in `.env` (SMTP password, Telegram bot token, WhatsApp session)
- **Cart automation** - when enabled, a real Chromium instance types your shipping details into `anginedepoitrine.com`
- **Scraped HTML** - anything fetched from the upstream site is untrusted input
- **Supply chain** - npm dependencies pulled at install time

## What to report

Worth reporting privately:

- Remote code execution via crafted HTML from the upstream site, or via a malicious dependency
- Credential or session-token leakage (logs, error output, anything written to disk)
- Bypass of the URL allowlist, the HTTPS-only check, or the Puppeteer navigation interceptor
- Log-injection or terminal-escape vulnerabilities in scraped content
- Any way to trigger checkout-form submission or state mutation on the upstream site beyond what's documented

Probably not a security issue (open a regular bug instead):

- A selector breaking because the upstream site changed its HTML
- False positives / false negatives in stock detection
- Notifications not being delivered due to provider limits

## Reporting

Use **GitHub's private vulnerability reporting**:

1. Go to the [Security tab](https://github.com/gigliof/angine-restock-monitor/security) of this repo
2. Click **"Report a vulnerability"**
3. Fill in the details - steps to reproduce, impact, any suggested fix

You'll get a response within a few days. There's no formal embargo policy given the nature of this project, but please give a reasonable heads-up before going public.

## Hardening already in place

This is documented in detail in the [README's security notes section](README.md#security-notes), but the highlights:

- **URL allowlist** - fetch and Puppeteer navigation are restricted to `anginedepoitrine.com`; HTTPS is enforced
- **All dependencies version-pinned** - including `axios` pinned to `1.14.0` after the [2026 supply chain incident](https://www.elastic.co/security-labs/axios-one-rat-to-rule-them-all)
- **Secrets stay in `.env`** - gitignored; the state file and log file are written with owner-only permissions (0600)
- **Checkout URLs are never logged** - they contain a session token and are sent only via your configured notification channel
- **Input validation at startup** - bad email/phone/chat-ID/country-code values cause immediate exit with a clear error
- **HTML escaping** - all scraped strings are escaped before insertion into email bodies
- **Log sanitization** - ANSI escapes and control characters are stripped from anything written to the log
- **Response and JSON-LD size caps** - oversized payloads from the upstream site are rejected, not buffered
- **Cycle timeout** - each monitoring cycle is bounded; a hung network call cannot stall the scheduler indefinitely

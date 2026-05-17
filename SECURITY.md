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

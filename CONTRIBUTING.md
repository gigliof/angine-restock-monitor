# Contributing to Angine Restock Monitor

Thanks for your interest! This guide covers the practical bits of working on the codebase.

## Quick start (development)

```bash
npm install
cp .env.example .env     # fill in at least one notification channel
npm test                 # unit tests, no network access needed
node monitor.js --once   # run a single check cycle
```

## Project layout

- `monitor.js` - entry point and main loop (CLI flags, scheduler, restock detection)
- `config.js` - env validation and configuration loading (fail fast on bad input)
- `lib/` - internal modules
  - `notify-*.js` - email, Telegram, WhatsApp notification adapters
  - `cart.js` - Puppeteer-driven checkout automation (optional)
  - `state.js` - atomic state-file reads/writes
  - `logger.js` - file logging with rotation and sanitization
- `tests/` - unit tests, run with the built-in `node --test` runner

The project is intentionally a single Node script, not a framework. Keep it that way.

## Conventions

- **No new top-level dependencies without a clear reason.** Most additions can be done with `https`, `cheerio`, or `axios`, which are already pinned.
- **All deps are version-pinned** (no `^`, no `~`). Dependabot proposes upgrades; we review them.
- **No `any`-style escapes.** This is plain JS - favor small, well-named functions over clever one-liners.
- **Validate at startup, not at call site.** Bad config should make the process exit immediately with a clear error, not blow up mid-run.
- **All scraped content is treated as untrusted.** HTML-escape before email; sanitize before logging; reject anything outside the URL allowlist.

## Before opening a PR

1. `npm test` - unit tests must pass
2. `npm run lint` - ESLint must pass with zero warnings
3. `npx prettier --check .` - formatting must be clean (or run `npx prettier --write .`)
4. If you touched detection or notification code: run `node monitor.js --test` and `node monitor.js --once` against a known state to sanity-check end-to-end

CI runs the same checks on every push and PR.

## Reporting bugs

Include:

- Node.js version (`node --version`)
- OS
- Notification method you're using (email / Telegram / WhatsApp)
- Whether cart automation is enabled
- Steps to reproduce
- Relevant log output from `monitor.log` (with secrets redacted)

## Security

Found a vulnerability? Please don't open a public issue. See [SECURITY.md](SECURITY.md) for how to report it privately.

# Angine de Poitrine - Restock Monitor

<p align="center">
  <a href="https://github.com/gigliof/angine-restock-monitor/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/gigliof/angine-restock-monitor/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/gigliof/angine-restock-monitor/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-7c3aed"></a>
  <a href="https://github.com/gigliof/angine-restock-monitor/issues"><img alt="Issues" src="https://img.shields.io/github/issues/gigliof/angine-restock-monitor"></a>
  <a href="https://ko-fi.com/gigliof"><img alt="Support on Ko-fi" src="https://img.shields.io/badge/support-ko--fi-FF5E5B?logo=ko-fi&logoColor=white"></a>
</p>

A self-hosted Node.js script that watches the [Angine de Poitrine](https://anginedepoitrine.com) vinyl shop and notifies you the **moment sold-out products come back in stock**.

When a restock is detected it sends you a notification (email, Telegram, or WhatsApp) with a direct link to the product page, so you can grab it before it sells out again. Stock is read from the shop's Shopify product JSON, so detection is exact - no fragile HTML scraping.

## Products monitored

- Angine de Poitrine - Vol. 1 (Vinyle)
- Angine de Poitrine - Vol. II (Vinyle)
- Bundle Vol. I & II (Vinyle)

---

## Requirements

- [Node.js](https://nodejs.org/) v18+
- One of: a Gmail/SMTP account, a Telegram bot, or a WhatsApp account

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/gigliof/angine-restock-monitor
cd angine-restock-monitor
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and fill in your values. See the [notification methods](#notification-methods) section for which fields are required.

### 3. Run the test suite

```bash
npm test
```

Runs unit tests for stock detection, state validation, logging, and message formatting. No network access required.

### 4. Send a test notification

```bash
node monitor.js --test
```

### 5. Run

```bash
# macOS - caffeinate prevents idle sleep while the script runs
caffeinate -i node monitor.js

# Linux / always-on machine
node monitor.js

# One-shot check (useful for verifying detection logic)
node monitor.js --once
```

The first run saves a baseline and sends no alerts. From the second check onward, you get notified on any stock change.

---

## Notification methods

> **Heads-up:** Email is the channel I personally use and verify before each release. Telegram and WhatsApp are supported and unit-tested at the message-formatting level, but their live delivery paths (SMTP-style libraries aside) aren't part of my regular smoke tests. If you use those channels and something breaks - especially after a dependency bump - please [open an issue](https://github.com/gigliof/angine-restock-monitor/issues/new/choose).

### Email (recommended)

Simplest and most reliable. Works with Gmail, iCloud, Outlook (with app password), or any SMTP provider.

```env
NOTIFICATION_METHOD=email

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASS=your-app-password
EMAIL_FROM=you@example.com
EMAIL_TO=you@example.com
```

> **Gmail App Password:** Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and create a password for "Mail". Use that - not your regular Gmail password.

> `EMAIL_FROM` and `EMAIL_TO` are validated at startup. The monitor exits immediately with a clear error if either address is not a valid email format.

---

### Telegram (recommended for push notifications)

No extra dependencies - uses the Telegram Bot API directly via the axios client that's already installed.

**Setup:**

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts, copy the token it gives you
3. Open a chat with your new bot and send any message (e.g. "hello")
4. Add the token to `.env` and run the debug command to find your chat ID:

```env
NOTIFICATION_METHOD=telegram
TELEGRAM_BOT_TOKEN=your-bot-token
```

```bash
node monitor.js --debug-telegram
```

This verifies your token, lists recent senders with their chat IDs, and tells you exactly what to add to `.env`. Once `TELEGRAM_CHAT_ID` is set, re-run `--debug-telegram` and it will send a real test message.

```env
TELEGRAM_CHAT_ID=123456789
```

> `TELEGRAM_CHAT_ID` must be a numeric ID. Group chat IDs are negative (e.g. `-100123456789`). The monitor exits at startup if the value is not numeric.

Then run `node monitor.js --test` to confirm the full notification flow works.

---

### WhatsApp (optional)

Requires installing extra dependencies (~300 MB for Chromium) and an initial QR scan.

> **Known limitation:** WhatsApp does not deliver messages sent to yourself (the same account used to authenticate). You must use a different recipient number - a partner, a second phone, etc.

```bash
npm run setup-whatsapp
```

```env
NOTIFICATION_METHOD=whatsapp
WA_RECIPIENT_NUMBER=+11234567890
```

Run once to authenticate:

```bash
node monitor.js --test
```

Scan the QR in WhatsApp → Settings → Linked Devices → Link a Device. Your session is saved locally; no re-scanning needed.

**Troubleshooting:**

```bash
node monitor.js --debug-wa
```

> Prints your contact list and chat IDs to the terminal. Treat this output as sensitive - do not share it.

If auto-resolution fails, copy the chat ID from the output and set it in `.env`:

```env
WA_CHAT_ID=11234567890@c.us
```

---

### Signal (not supported)

Signal does not have a public bot API. The only self-hosted option is [signal-cli](https://github.com/AsamK/signal-cli), which requires Java, D-Bus (Linux only), and registering a phone number - significant setup with no cross-platform support. Telegram is a simpler alternative with comparable privacy for this use case.

---

## CLI reference

| Command                            | Description                                           |
| ---------------------------------- | ----------------------------------------------------- |
| `node monitor.js`                  | Start monitoring (loops indefinitely)                 |
| `node monitor.js --once`           | Run one check cycle and exit                          |
| `node monitor.js --test`           | Send a test notification (60s cooldown between tests) |
| `node monitor.js --test --force`   | Send a test notification (bypass cooldown)            |
| `node monitor.js --dry-run`        | Run detection without sending notifications           |
| `node monitor.js --clear-cooldown` | Reset notification cooldown for all products          |
| `node monitor.js --debug-telegram` | Verify Telegram token and find chat ID                |
| `node monitor.js --debug-wa`       | Diagnose WhatsApp connection issues                   |
| `node monitor.js --help`           | Show help message with all options                    |

---

## Security

This script handles notification credentials and talks to a third-party site you don't control - some attack surface for a tool you'll leave running unattended. The threat model and reporting process are documented in [SECURITY.md](SECURITY.md).

Found a vulnerability? Please report it privately via [GitHub Security Advisories](https://github.com/gigliof/angine-restock-monitor/security/advisories/new) rather than a public issue.

---

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev quick-start, project layout, and what CI checks before merge.

---

## Support

If this tool helped you snag a vinyl, consider [buying me a coffee on Ko-fi ☕](https://ko-fi.com/gigliof). Every bit helps keep the project maintained.

---

## License

[MIT](LICENSE) - see [NOTICE](NOTICE) for third-party attribution.

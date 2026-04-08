# Angine de Poitrine - Restock Monitor

Monitors the [Angine de Poitrine](https://anginedepoitrine.com) vinyl shop and notifies you the moment sold-out products come back in stock.

When a restock is detected it:
1. Sends you a notification (email, Telegram, or WhatsApp) with the product link
2. Launches a headless browser, adds the item to cart, fills your checkout form, and sends you the checkout URL so you can jump straight to PayPal

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

### 1 - Clone and install

```bash
git clone https://github.com/gigliof/angine-restock-monitor
cd angine-restock-monitor
npm install
```

### 2 - Configure

```bash
cp .env.example .env
```

Open `.env` and fill in your values. See the notification sections below for which fields are required.

### 3 - Run the test suite

```bash
npm test
```

Runs unit tests for stock detection, state validation, logging, and message formatting. No network access required.

### 4 - Send a test notification

```bash
node monitor.js --test
```

### 5 - Run

```bash
# macOS - caffeinate prevents idle sleep while the script runs
caffeinate -i node monitor.js

# Linux / always-on machine
node monitor.js

# One-shot check (useful for verifying detection logic)
node monitor.js --once
```

The first run saves a baseline and sends no alerts. From the second check onward it notifies you on any stock change.

---

## Notification methods

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

> `EMAIL_FROM` and `EMAIL_TO` are validated at startup. The monitor will exit immediately with a clear error if either address is not a valid email format.

---

### Telegram (recommended if you want push notifications)

No extra dependencies - uses the Telegram Bot API directly via the axios client that is already installed.

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

> `TELEGRAM_CHAT_ID` must be a numeric ID. Group chat IDs are negative (e.g. `-100123456789`). The monitor will exit at startup with a clear error if the value is not numeric.

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

Scan the QR in WhatsApp - Settings -> Linked Devices -> Link a Device. Your session is saved locally, no re-scanning needed.

**Troubleshooting:**

```bash
node monitor.js --debug-wa
```

> This prints your contact list and chat IDs to the terminal. Treat this output as sensitive - do not share it.

If auto-resolution fails, copy the chat ID from the output and set it in `.env`:

```env
WA_CHAT_ID=11234567890@c.us
```

---

### Signal (not supported)

Signal does not have a public bot API. The only self-hosted option is [signal-cli](https://github.com/AsamK/signal-cli), which requires Java, D-Bus (Linux only), and registering a phone number - significant setup with no cross-platform support. Telegram is a simpler alternative with comparable privacy for this use case.

---

## Cart automation

When a restock is detected, the script launches a headless Chromium browser to:

1. Navigate to the product page and click the buy button
2. Go to cart and click "Proceder au paiement"
3. Fill in your checkout details from `.env`
4. Capture the checkout URL and send it to you

You open that URL and complete payment via PayPal yourself.

The checkout URL contains a session token and is sent only via your notification channel - it is never written to the log file.

If any critical step fails (checkout button not found, email field not fillable), the automation aborts cleanly and the notification is sent with the product URL only — you will never receive a broken or incomplete checkout link.

Install Puppeteer to enable this feature:

```bash
npm install puppeteer
```

Without Puppeteer, the script still monitors and notifies - it just skips the cart automation step and sends the product URL only.

To disable cart automation entirely (and skip the `CHECKOUT_*` fields in `.env`), set:

```env
ENABLE_CART_AUTOMATION=false
```

---

## Checkout details

Fill in your shipping info in `.env`. These are used to pre-fill the checkout form when a restock fires. They are only required when `ENABLE_CART_AUTOMATION=true` (the default). Set `ENABLE_CART_AUTOMATION=false` to skip them entirely.

```env
CHECKOUT_EMAIL=you@example.com
CHECKOUT_FIRST_NAME=Firstname
CHECKOUT_LAST_NAME=Lastname
CHECKOUT_ADDRESS=123 Your Street
CHECKOUT_CITY=Your City
CHECKOUT_POSTAL_CODE=A1B 2C3
CHECKOUT_PHONE=+11234567890
CHECKOUT_COUNTRY=Canada
CHECKOUT_COUNTRY_CODE=CA
CHECKOUT_STATE=Ontario
CHECKOUT_STATE_CODE=ON
```

`CHECKOUT_COUNTRY_CODE` is the ISO 3166-1 alpha-2 code (e.g. `CA`, `US`, `DE`, `FR`).
`CHECKOUT_STATE_CODE` is the ISO 3166-2 subdivision code (e.g. `ON`, `CA`, `BE`, `IDF`).

---

## Security notes

- **Check cycle timeout** - each monitoring cycle is bounded to 5 minutes; a hung network call cannot stall the scheduler indefinitely
- **All secrets live in `.env`** - gitignored, never committed
- **WhatsApp session data** (`.wwebjs_auth/`) is gitignored and created with restricted permissions (owner-only)
- **All dependencies are version-pinned** - no `^` ranges, no silent auto-upgrades
  - `axios` pinned to `1.14.0` (see [2026 supply chain incident](https://www.elastic.co/security-labs/axios-one-rat-to-rule-them-all))
- **URL allowlist** - the script refuses to fetch or navigate to any URL outside `anginedepoitrine.com`
- **HTTPS required** - all product URLs must use HTTPS; HTTP URLs are rejected at startup and enforced at runtime on every fetch and navigation
- **Navigation interception** - Puppeteer blocks document navigations to any origin outside `anginedepoitrine.com`, including `data:` and other non-HTTPS schemes; sub-resource requests (XHR, images, scripts) are not filtered, as the site needs them to function
- **Chromium sandbox** - enabled by default for extra isolation; set `PUPPETEER_NO_SANDBOX=true` only in containerized environments that require it
- **HTML escaping** - all scraped content is escaped before insertion into the email body
- **Checkout URL not logged** - session tokens are sent via notification only, never written to disk
- **Input format validation at startup** - `WA_RECIPIENT_NUMBER` must be E.164 format (e.g. `+15551234567`); `TELEGRAM_CHAT_ID` must be a numeric ID (e.g. `123456789` or `-100123456789` for groups); `CHECKOUT_EMAIL` must be a valid email; `CHECKOUT_PHONE` must be a valid phone format; all checkout fields are length-capped to prevent abuse
- **Log sanitization** - all external data written to the log file is stripped of ANSI escape sequences and control characters (null bytes, BEL, etc.) and truncated to 200 characters to prevent log injection
- **Notification cooldown** - configurable minimum time between repeat alerts for the same product (default: 60 min)
- **Test notification cooldown** - 60 seconds between test notifications to prevent spam
- **Log rotation** - log file is rotated at 2 MB
- **Restricted file permissions** - state file and log file are created with owner-only permissions (0600)
- **Atomic state writes** - state file written via temp-then-rename to prevent corruption on crash
- **No unexpected third-party services** - notifications go only to the provider you configure (Gmail/SMTP, Telegram, or WhatsApp). No analytics, no telemetry, no external logging.
- **Cart automation trust model** - when cart automation is enabled, your checkout details (name, address, phone, email) are typed into `anginedepoitrine.com` by a real browser. The site can read those values. Only enable cart automation if you trust the site.
- **Response size cap** - HTTP responses are capped at 5 MB; a server returning an unexpectedly large body is rejected rather than buffered into memory
- **JSON-LD size cap** - JSON-LD blocks larger than 100KB are skipped to prevent slowdowns from oversized payloads

---

## CLI reference

| Command | Description |
|---------|-------------|
| `node monitor.js` | Start monitoring (loops indefinitely) |
| `node monitor.js --once` | Run one check cycle and exit |
| `node monitor.js --test` | Send a test notification (60s cooldown between tests) |
| `node monitor.js --test --force` | Send a test notification (bypass cooldown) |
| `node monitor.js --dry-run` | Run detection without sending notifications or cart automation |
| `node monitor.js --clear-cooldown` | Reset notification cooldown for all products |
| `node monitor.js --debug-telegram` | Verify Telegram token and find chat ID |
| `node monitor.js --debug-wa` | Diagnose WhatsApp connection issues |
| `node monitor.js --help` | Show help message with all options |


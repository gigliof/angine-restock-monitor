"use strict";

// Shared CTA selector and price-text predicate.
// Centralised here so stock.js (HTML parsing) and cart.js (Puppeteer) stay in sync.

/** CSS / querySelector selector for the main buy-button on anginedepoitrine.com. */
const CTA_SELECTOR = 'a[href="#!"]';

/**
 * Returns true when the given text looks like a buy-button label showing a price.
 * E.g. "40,00 C$" → true   "Indisponible" → false
 *
 * Note: this runs in Node context only. When calling from inside page.evaluate(),
 * pass CTA_SELECTOR as an argument rather than closing over it.
 */
function hasPriceText(text) {
  return /\d/.test(text) && /[$\u20AC\u00A3]/.test(text);
}

module.exports = { CTA_SELECTOR, hasPriceText };

"use strict";

// Shared CTA selector and price-text predicate.
// Centralised here so stock.js (HTML parsing) and cart.js (Puppeteer) stay in sync.

/** CSS / querySelector selector for the main buy-button on anginedepoitrine.com. */
const CTA_SELECTOR = 'a[href="#!"]';

/**
 * Selector for the Stimulus "salable item" form that carries server-rendered
 * inventory state. As of the 2026 site redesign this is the authoritative
 * stock signal: the form exposes data-track-inventory and data-inventory
 * (a numeric count) plus state classes (out-of-stock / not-available).
 */
const SALABLE_FORM_SELECTOR = "form.salable-item, form[data-controller*='inventory-form']";

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

module.exports = { CTA_SELECTOR, SALABLE_FORM_SELECTOR, hasPriceText };

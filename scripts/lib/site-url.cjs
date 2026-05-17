"use strict";

/**
 * site-url.cjs — Single source for the production site URL fallback.
 *
 * Consumers (astro.config.mjs, src/pages/llms*.ts) prefer process.env.SITE_URL
 * when set; otherwise fall back to this default. Centralizing avoids drift.
 */

var SITE_URL = process.env.SITE_URL || "https://volivarii.github.io/actian-ds-docs";

module.exports = { SITE_URL: SITE_URL };

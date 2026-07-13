"use strict";

/**
 * foundations-token-coverage.test.cjs — Coverage gate: every foundations
 * token section vendored to vendor/foundations/dist/tokens/ must have a
 * corresponding hand-authored docs page under
 * src/content/docs/foundations/.
 *
 * Why this exists: the knowledge substrate can add a new token section (a
 * new top-level entry under foundations/dist/tokens/) at any time via its
 * own sync, but the docs page list is hand-maintained. Nothing previously
 * checked that the two stayed in sync, so two whole sections
 * (heights-and-trigger-areas, focus-rings) were vendored correctly and
 * silently never published. This test reads the REAL vendored directory
 * and the REAL docs directory (not fixtures) so it catches drift the
 * moment it happens, not just at authoring time.
 */

var fs = require("fs");
var path = require("path");
var test = require("node:test");
var assert = require("node:assert/strict");
var PATHS = require("../../scripts/lib/paths.cjs");

// Explicit, commented alias map for the known cases where a substrate
// section's directory/file name does not match its docs page filename
// 1:1. Deliberately NOT fuzzy/substring matching: a brand-new section that
// isn't in this map, and whose name doesn't match a page either, MUST fail
// loudly rather than being silently absorbed by a "close enough" heuristic.
var SECTION_TO_PAGE_ALIAS = {
  "global-color": "color", // substrate slug "global-color" -> docs page "color.mdx"
  backgrounds: "background", // substrate slug "backgrounds" (plural) -> docs page "background.mdx" (singular)
};

var TOKENS_DIR = path.join(PATHS.foundations.distDir, "tokens");
var FOUNDATIONS_DOCS_DIR = path.join(
  PATHS.repoRoot,
  "src",
  "content",
  "docs",
  "foundations",
);

// A foundations token "section" is any top-level entry under
// dist/tokens/ except the section index (_index.json) itself — it can be
// either a single JSON file (e.g. breakpoints.json) or a directory of
// sub-sections (e.g. borders/, typography/).
function listSubstrateSections() {
  return fs
    .readdirSync(TOKENS_DIR)
    .filter(function (entry) {
      return entry !== "_index.json";
    })
    .map(function (entry) {
      return entry.replace(/\.json$/, "");
    })
    .sort();
}

function expectedDocsPageFor(section) {
  return SECTION_TO_PAGE_ALIAS[section] || section;
}

test("every vendored foundations token section has a docs page (coverage gate)", function () {
  var sections = listSubstrateSections();
  assert.ok(
    sections.length > 0,
    "no substrate sections found under " + TOKENS_DIR + " — check the vendor snapshot",
  );

  var missing = sections
    .map(function (section) {
      var page = expectedDocsPageFor(section);
      var pagePath = path.join(FOUNDATIONS_DOCS_DIR, page + ".mdx");
      return fs.existsSync(pagePath)
        ? null
        : { section: section, expectedPage: page + ".mdx" };
    })
    .filter(Boolean);

  assert.deepEqual(
    missing,
    [],
    "The following foundations token section(s) are vendored to " +
      TOKENS_DIR +
      " but have NO docs page under " +
      FOUNDATIONS_DOCS_DIR +
      " — their tokens are never published: " +
      missing
        .map(function (m) {
          return m.section + " (expected " + m.expectedPage + ")";
        })
        .join(", "),
  );
});

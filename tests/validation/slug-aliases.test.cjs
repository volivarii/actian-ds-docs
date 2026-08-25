"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// ---------------------------------------------------------------------------
// SLUG_ALIASES (scripts/lib/render-mdx.cjs) is a hand-maintained table that
// restates two facts the vendored registry owns: that the alias TARGET is a
// published component, and that the alias KEY is a name with no component of
// its own. Both can silently go false on a vendor refresh, and on 2026-08-25
// both did at once: knowledge v0.34.150 (knowledge #588) retired
// `card-for-items` and published a base `card`, while the table still read
// `card -> card-for-items`. The alias hijacked the real slug, five pages kept a
// bare `[card](card)` link to a page that exists, the links validator went red
// and the site stopped deploying.
//
// This joins the table against what the generator actually emitted: the
// slug -> page-path sidecar it writes (src/data/slug-paths.json, the very map
// resolveSlugLink consults) and the page files on disk. So "has a page" is the
// generator's own answer, not a second reading of the registry, and drift
// fails here naming the entry instead of in the nightly build.
//
// Runs against generated files, so it needs a prebuild first (CI runs the
// suite after the build step for exactly this reason). Skips when the sidecar
// is absent rather than failing a bare checkout.
// ---------------------------------------------------------------------------

var ROOT = path.resolve(__dirname, "..", "..");
var SLUG_PATHS = path.join(ROOT, "src", "data", "slug-paths.json");
var DOCS_ROOT = path.join(ROOT, "src", "content", "docs");

function loadSlugPaths(t) {
  if (!fs.existsSync(SLUG_PATHS)) {
    t.skip("src/data/slug-paths.json not generated yet; run `npm run prebuild` first");
    return null;
  }
  return JSON.parse(fs.readFileSync(SLUG_PATHS, "utf8"));
}

function pageExists(slugPath) {
  // slugPath is root-absolute and trailing-slashed: /components/<cat>/<slug>/
  return fs.existsSync(path.join(DOCS_ROOT, slugPath, "index.mdx"));
}

test("every SLUG_ALIASES target has a generated component page", function (t) {
  var slugPaths = loadSlugPaths(t);
  if (!slugPaths) return;
  var dead = Object.entries(renderMdx.SLUG_ALIASES)
    .filter(function (pair) { return !slugPaths[pair[1]] || !pageExists(slugPaths[pair[1]]); })
    .map(function (pair) { return pair[0] + " -> " + pair[1]; });
  assert.deepEqual(
    dead,
    [],
    "SLUG_ALIASES entries whose target has no generated page: " + dead.join(", ") +
      ". The target left the registry in a vendor refresh, or never had a page. Remove the " +
      "entry, or repoint it if the component was renamed (see the knowledge changelog).",
  );
});

test("no SLUG_ALIASES key is itself a slug the generator resolves", function (t) {
  var slugPaths = loadSlugPaths(t);
  if (!slugPaths) return;
  var shadowing = Object.keys(renderMdx.SLUG_ALIASES).filter(function (key) {
    return Object.prototype.hasOwnProperty.call(slugPaths, key);
  });
  assert.deepEqual(
    shadowing,
    [],
    "SLUG_ALIASES keys that are now real registry slugs: " + shadowing.join(", ") +
      ". A registry slug resolves to its own page and its alias is never consulted, so the " +
      "entry is dead. Remove it.",
  );
});

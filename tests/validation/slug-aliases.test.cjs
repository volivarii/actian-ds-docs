"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// ---------------------------------------------------------------------------
// SLUG_ALIASES and REMOVE_LINK_SLUGS (scripts/lib/render-mdx.cjs) are
// hand-maintained tables that restate a fact the vendored registry owns: that
// their keys are names with no page of their own. That can silently go false
// on a vendor refresh, and on 2026-08-25 it did: knowledge v0.34.150 (knowledge
// #588) retired `card-for-items` and published a base `card`, while the alias
// table still read `card -> card-for-items`. The alias hijacked the real slug,
// five pages kept a bare `[card](card)` link to a page that exists, the links
// validator went red and the site stopped deploying.
//
// This joins both tables against what the generator actually emitted: the
// slug -> page-path sidecar it writes (src/data/slug-paths.json, the very map
// the resolver consults) and the page files on disk. `hasPage` is the resolver's
// own predicate over that map, so "has a page" is one definition shared with
// the code under test, and drift fails here naming the entry instead of in the
// nightly build.
//
// Deliberately NOT asserted here: that every alias TARGET has a page. The
// resolver degrades or flags the links through a dead target on its own, and
// failing `npm test` for it (which runs inside the `build` job that `links`,
// `a11y` and `deploy` all need) froze the site on every target retirement even
// when the links were fine. The prebuild prints those entries with their
// remedy instead (deriveDeadAliases).
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
  var map = JSON.parse(fs.readFileSync(SLUG_PATHS, "utf8"));
  // Same cross-process handoff sync-vendored-md.cjs uses, so hasPage below
  // answers from the generator's map, not from a second reading of it.
  renderMdx.setSlugToPathMap(map);
  return map;
}

function pageFileExists(slugPath) {
  // slugPath is root-absolute and trailing-slashed: /components/<cat>/<slug>/
  return fs.existsSync(path.join(DOCS_ROOT, slugPath, "index.mdx"));
}

function hasPage(slug) {
  return renderMdx.hasPage(slug);
}

test("the slug-to-path map holds only slugs with a generated page", function (t) {
  var slugPaths = loadSlugPaths(t);
  if (!slugPaths) return;
  assert.ok(Object.keys(slugPaths).length > 0, "the generator emitted an empty map; nothing below would be checked");
  var pageless = Object.entries(slugPaths)
    .filter(function (pair) { return !pageFileExists(pair[1]); })
    .map(function (pair) { return pair[0] + " -> " + pair[1]; });
  assert.deepEqual(
    pageless,
    [],
    "slugs the resolver treats as having a page with no index.mdx under src/content/docs: " +
      pageless.join(", ") + ". The alias table is not at fault: writesPage in " +
      "scripts/generate-component-pages.cjs (the filter buildSlugToPathMap receives) disagrees " +
      "with what the write loop wrote, so the resolver's definition of a page is wrong.",
  );
});

test("no SLUG_ALIASES key has a page of its own", function (t) {
  if (!loadSlugPaths(t)) return;
  var shadowing = Object.keys(renderMdx.getSlugAliases()).filter(hasPage);
  assert.deepEqual(
    shadowing,
    [],
    "SLUG_ALIASES keys that have a page: " + shadowing.join(", ") +
      ". A slug with a page links to it before its alias is consulted, so the entry is dead. " +
      "Remove it.",
  );
});

test("no REMOVE_LINK_SLUGS entry has a page", function (t) {
  if (!loadSlugPaths(t)) return;
  var published = renderMdx.getRemoveLinkSlugs().filter(hasPage);
  assert.deepEqual(
    published,
    [],
    "REMOVE_LINK_SLUGS entries that have a page: " + published.join(", ") +
      ". A slug with a page links to it before the removal is consulted, so the entry is dead. " +
      "Remove it.",
  );
});

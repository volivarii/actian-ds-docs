"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var loader = require("../../scripts/lib/category-defaults-loader.cjs");

// Tests in this file depend on the live vendor snapshot at vendor/. If
// vendor is absent or stale, the "known slug returns X" tests below will
// fail loudly (asserting truthy on returned values); the "unknown slug
// returns null" tests would pass vacuously since a missing file yields
// an empty cache. Read failures top-to-bottom — the first failure that
// says "must resolve" or "must return a defaults object" is the real
// signal that the vendor needs a refresh via
// scripts/vendor/vendor-snapshot.cjs --range.

test.beforeEach(function () {
  loader._resetCache();
});

// --- normalizeCategorySlug ---

test("normalizeCategorySlug — known labels map correctly", function () {
  assert.equal(loader.normalizeCategorySlug("Action"), "action");
  // A retired label, kept deliberately: it is the case that exercises the `&`
  // and parenthesis handling, and this test touches no dist so it cannot go
  // stale. The dist-backed tests below take their category from the dist.
  assert.equal(
    loader.normalizeCategorySlug("Form (input & selection)"),
    "form-input-selection",
  );
  assert.equal(loader.normalizeCategorySlug("Form"), "form");
  assert.equal(loader.normalizeCategorySlug("Navigation"), "navigation");
  assert.equal(loader.normalizeCategorySlug("Data Display"), "data-display");
  assert.equal(loader.normalizeCategorySlug("Feedback"), "feedback");
  assert.equal(loader.normalizeCategorySlug("Overlays"), "overlays");
});

test("normalizeCategorySlug — already-slugged input returns unchanged", function () {
  assert.equal(
    loader.normalizeCategorySlug("form-input-selection"),
    "form-input-selection",
  );
  assert.equal(loader.normalizeCategorySlug("data-display"), "data-display");
});

test("normalizeCategorySlug — null/empty returns null", function () {
  assert.equal(loader.normalizeCategorySlug(null), null);
  assert.equal(loader.normalizeCategorySlug(""), null);
  assert.equal(loader.normalizeCategorySlug(undefined), null);
});

// --- loadDefaultsForCategory ---

// These two read the REAL vendored dist, so a hand-written category name strands
// them on the next rename. That is what happened: they named
// `form-input-selection`, which knowledge #541 renamed to `form` after the Figma
// page was retitled, and because this repo has no PR checks they would have gone
// red silently on the nightly vendor refresh. The category under test is now
// taken from the dist itself.
function aLiveCategory() {
  var fs = require("fs");
  var path = require("path");
  var PATHS = require("../../scripts/lib/paths.cjs");
  var dir = path.dirname(PATHS.components.categoryDefaults.byKey("action"));
  var file = fs
    .readdirSync(dir)
    .filter(function (f) {
      return /-defaults\.json$/.test(f);
    })
    .sort()[0];
  assert.ok(file, "the vendored dist ships at least one category defaults file");
  return JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
}

test("loadDefaultsForCategory — known category returns parsed dist JSON", function () {
  var live = aLiveCategory();
  var defaults = loader.loadDefaultsForCategory(live.slug);
  assert.ok(defaults, "must return a defaults object");
  assert.equal(defaults.slug, live.slug);
  assert.equal(defaults._schema_version, 2);
  assert.ok(defaults.anatomy);
  assert.ok(defaults.variants);
  assert.ok(defaults.motion_refs);
  assert.ok(defaults.a11y_refs);
});

test("loadDefaultsForCategory — accepts label, normalizes to slug", function () {
  // The join every consumer actually makes: the registry publishes a display
  // label, and the loader has to reach the file from it. This is the assertion
  // that was missing everywhere, and its absence is why a rename could leave 19
  // components resolving to nothing while every suite stayed green.
  var live = aLiveCategory();
  var defaults = loader.loadDefaultsForCategory(live.label);
  assert.ok(
    defaults,
    "the live label " +
      JSON.stringify(live.label) +
      " must resolve to its own defaults file",
  );
  assert.equal(defaults.slug, live.slug);
});

test("loadDefaultsForCategory — unknown slug returns null", function () {
  assert.equal(loader.loadDefaultsForCategory("nonexistent-category"), null);
});

test("loadDefaultsForCategory — null input returns null", function () {
  assert.equal(loader.loadDefaultsForCategory(null), null);
});

test("loadDefaultsForCategory — caches by slug (2nd call returns same object)", function () {
  var a = loader.loadDefaultsForCategory("action");
  var b = loader.loadDefaultsForCategory("action");
  assert.strictEqual(a, b, "second call must return cached reference");
});

// --- resolveMotionRef ---

test("resolveMotionRef — known slug returns pattern object", function () {
  var pattern = loader.resolveMotionRef("state-transitions");
  assert.ok(pattern, "must resolve");
  assert.equal(pattern.slug, "state-transitions");
  assert.ok(pattern.name);
  assert.ok(Array.isArray(pattern.phases));
});

test("resolveMotionRef — slug-renamed pattern resolves (slug !== key)", function () {
  // motion.json's `.patterns.drawer` has slug "drawer-open-close".
  // Loader must match by `.slug`, not by object key.
  var pattern = loader.resolveMotionRef("drawer-open-close");
  assert.ok(
    pattern,
    "drawer-open-close must resolve (lookup by .slug, not by key)",
  );
  assert.equal(pattern.slug, "drawer-open-close");
});

test("resolveMotionRef — unknown slug returns null", function () {
  assert.equal(loader.resolveMotionRef("nonexistent-motion-pattern"), null);
});

test("resolveMotionRef — null input returns null", function () {
  assert.equal(loader.resolveMotionRef(null), null);
  assert.equal(loader.resolveMotionRef(""), null);
});

// --- resolveAccessibilityRef ---

test("resolveAccessibilityRef — known slug returns section object", function () {
  // `color-contrast` is a structurally stable a11y section id — it survives
  // across guideline restructures (unlike topic sections that get renamed),
  // so this test stays valid regardless of which knowledge snapshot is
  // vendored. Avoid hardcoding rename-prone slugs here.
  var section = loader.resolveAccessibilityRef("color-contrast");
  assert.ok(section);
  assert.equal(section.slug, "color-contrast");
  assert.ok(section.title);
});

test("resolveAccessibilityRef — known slug 'color-contrast' resolves", function () {
  var section = loader.resolveAccessibilityRef("color-contrast");
  assert.ok(section);
  assert.equal(section.slug, "color-contrast");
});

test("resolveAccessibilityRef — unknown slug returns null", function () {
  assert.equal(loader.resolveAccessibilityRef("nonexistent-a11y-slug"), null);
});

test("resolveAccessibilityRef — null input returns null", function () {
  assert.equal(loader.resolveAccessibilityRef(null), null);
});

// --- All category-MD motion_refs + accessibility refs resolve end-to-end ---

test("category defaults — every motion_refs.ref resolves against motion.json", function () {
  var slugs = [
    "action",
    "form-input-selection",
    "navigation",
    "data-display",
    "feedback",
    "overlays",
  ];
  var unresolved = [];
  slugs.forEach(function (catSlug) {
    var d = loader.loadDefaultsForCategory(catSlug);
    var refs = (d && d.motion_refs && d.motion_refs.patternRefs) || [];
    refs.forEach(function (r) {
      if (!loader.resolveMotionRef(r.ref)) {
        unresolved.push(catSlug + " → " + r.ref);
      }
    });
  });
  assert.deepEqual(
    unresolved,
    [],
    "all motion_refs must resolve: " + unresolved.join("; "),
  );
});

test("category defaults — every accessibility.ref resolves against a11y-index", function () {
  var slugs = [
    "action",
    "form-input-selection",
    "navigation",
    "data-display",
    "feedback",
    "overlays",
  ];
  var unresolved = [];
  slugs.forEach(function (catSlug) {
    var d = loader.loadDefaultsForCategory(catSlug);
    var refs =
      (d && d.a11y_refs && d.a11y_refs.requirementRefs) || [];
    refs.forEach(function (r) {
      if (!loader.resolveAccessibilityRef(r.ref)) {
        unresolved.push(catSlug + " → " + r.ref);
      }
    });
  });
  assert.deepEqual(
    unresolved,
    [],
    "all accessibility refs must resolve: " + unresolved.join("; "),
  );
});

// --- _motionPath manifest-driven resolution ---

var path = require("node:path");
var fs = require("node:fs");

test("_motionPath resolves via paths-manifest.foundations.tokens.motion", function () {
  var manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../vendor/paths-manifest.json"), "utf8"),
  );
  var motionEntry = manifest.paths["foundations.tokens.motion"];
  assert.ok(motionEntry, "manifest must declare foundations.tokens.motion");
  assert.equal(motionEntry.path, "foundations/dist/tokens/motion.json");

  assert.ok(loader._motionPath, "category-defaults-loader must expose _motionPath for tests");
  var resolved = loader._motionPath();
  assert.ok(
    resolved.endsWith(motionEntry.path),
    "expected resolved path to end with " + motionEntry.path + ", got " + resolved,
  );
});

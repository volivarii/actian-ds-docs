"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

// ---------------------------------------------------------------------------
// the /content page split: /content used to be one page generated from
// vendor/content/dist/global.md. scripts/sync-vendored-md.cjs now emits four
// pages instead — content/index.md (the "Global guidelines" section, which
// has no home on any of the three split family pages, plus links to the
// three pages below), content/writing.md, content/patterns.md,
// content/product.md.
//
// This is a build-output check (all four files are produced ONLY by
// `npm run prebuild` / `npm run build`), so it skips on a bare checkout —
// same convention as content-md-links.test.cjs.
// ---------------------------------------------------------------------------

var DOCS_CONTENT_DIR = path.resolve(__dirname, "..", "..", "src", "content", "docs", "content");
var PAGES = {
  index: path.join(DOCS_CONTENT_DIR, "index.md"),
  writing: path.join(DOCS_CONTENT_DIR, "writing.md"),
  patterns: path.join(DOCS_CONTENT_DIR, "patterns.md"),
  product: path.join(DOCS_CONTENT_DIR, "product.md"),
};

function allPagesExist() {
  return Object.values(PAGES).every(function (p) { return fs.existsSync(p); });
}

test("all four content pages are emitted (index, writing, patterns, product)", function (t) {
  if (!allPagesExist()) {
    t.skip("content pages not generated yet; run `npm run prebuild` (or `npm run build`) first");
    return;
  }
  Object.entries(PAGES).forEach(function (entry) {
    assert.ok(fs.existsSync(entry[1]), entry[0] + " page missing at " + entry[1]);
  });
});

test("index page (content/index.md) carries the Global guidelines section", function (t) {
  if (!fs.existsSync(PAGES.index)) {
    t.skip("content/index.md not generated yet; run `npm run prebuild` first");
    return;
  }
  var body = fs.readFileSync(PAGES.index, "utf8");
  assert.match(body, /^## Global guidelines$/m);
  // Known prose from vendor/content/dist/global.md's "Global guidelines"
  // section — confirms this is the REAL extracted section, not a stub.
  assert.match(body, /speaks to data professionals/);
});

test("index page links to the three family sub-pages", function (t) {
  if (!fs.existsSync(PAGES.index)) {
    t.skip("content/index.md not generated yet; run `npm run prebuild` first");
    return;
  }
  var body = fs.readFileSync(PAGES.index, "utf8");
  assert.match(body, /\(\/content\/writing\/\)/);
  assert.match(body, /\(\/content\/patterns\/\)/);
  assert.match(body, /\(\/content\/product\/\)/);
});

test("the three family pages do NOT duplicate the Global guidelines section", function (t) {
  if (!allPagesExist()) {
    t.skip("content pages not generated yet; run `npm run prebuild` first");
    return;
  }
  ["writing", "patterns", "product"].forEach(function (name) {
    var body = fs.readFileSync(PAGES[name], "utf8");
    assert.doesNotMatch(body, /^## Global guidelines$/m,
      name + ".md must not duplicate the Global guidelines section (index-only)");
  });
});

test("each family page carries its own known section, not another family's", function (t) {
  if (!allPagesExist()) {
    t.skip("content pages not generated yet; run `npm run prebuild` first");
    return;
  }
  var writing = fs.readFileSync(PAGES.writing, "utf8");
  var patterns = fs.readFileSync(PAGES.patterns, "utf8");
  var product = fs.readFileSync(PAGES.product, "utf8");

  assert.match(writing, /^## Voice and tone$/m);
  assert.doesNotMatch(writing, /^## Forms$/m);
  assert.doesNotMatch(writing, /^## Object preview panels$/m);

  assert.match(patterns, /^## Forms$/m);
  assert.doesNotMatch(patterns, /^## Voice and tone$/m);
  assert.doesNotMatch(patterns, /^## Object preview panels$/m);

  // The trap, re-verified at the page-output level: object-preview-panels and
  // related-content-panels live on product.md, not patterns.md.
  assert.match(product, /^## Object preview panels$/m);
  assert.match(product, /^## Related content panels$/m);
  assert.doesNotMatch(product, /^## Voice and tone$/m);
  assert.doesNotMatch(product, /^## Forms$/m);
});

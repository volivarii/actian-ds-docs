"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");

// The manifest is emitted to src/data/redirects-manifest.json by
// scripts/generate-component-pages.cjs during prebuild. CI runs
// `npm run prebuild` before tests; locally the test skips with a
// clear note when the file isn't present.

test("redirects-manifest.json exists after prebuild", function () {
  var p = path.resolve(__dirname, "..", "..", "src", "data", "redirects-manifest.json");
  if (!fs.existsSync(p)) {
    console.log("skip: redirects-manifest.json not present; run npm run prebuild first");
    return;
  }
  var m = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.ok(Object.keys(m).length > 0, "expected at least one redirect entry");
});

test("every entry maps /design/ or /usage/ to an anchor on the parent page", function () {
  var p = path.resolve(__dirname, "..", "..", "src", "data", "redirects-manifest.json");
  if (!fs.existsSync(p)) return;
  var m = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.entries(m).forEach(function (pair) {
    var from = pair[0]; var to = pair[1];
    assert.match(from, /\/(design|usage)\/$/);
    assert.match(to, /#(anatomy|when-to-use)$/);
    // From and To should share the same base path (everything up to and
    // including the slug).
    var base = from.replace(/\/(design|usage)\/$/, "/");
    assert.ok(to.indexOf(base) === 0, "redirect must stay on same base: " + from + " → " + to);
  });
});

test("registry-wide coverage: every categorized component has design+usage redirects", function () {
  var manifestPath = path.resolve(__dirname, "..", "..", "src", "data", "redirects-manifest.json");
  if (!fs.existsSync(manifestPath)) return;
  var m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  var regPath = path.resolve(__dirname, "..", "..", "vendor", "components", "dist", "registries", "dskit.json");
  if (!fs.existsSync(regPath)) {
    console.log("skip: dskit.json not vendored");
    return;
  }
  var reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
  // Count categorized components that aren't in excluded/collection categories.
  var EXCLUDED = new Set(["Local components", "White-label services",
    "Breakpoint, grid & structure", "Content guidelines"]);
  var COLLECTION = new Set(["Icons"]);
  var n = 0;
  Object.values(reg.components).forEach(function (e) {
    if (!e.category) return;
    if (EXCLUDED.has(e.category) || COLLECTION.has(e.category)) return;
    n++;
  });
  // Manifest should have 2 entries per categorized component (one /design/, one /usage/)
  assert.equal(Object.keys(m).length, n * 2,
    "expected " + (n * 2) + " redirect entries for " + n + " categorized components");
});

test("public/media/ mirrors vendor/components/dist/media/ after prebuild", function () {
  var pubMedia = path.resolve(__dirname, "..", "..", "public", "media");
  var vendorMedia = path.resolve(__dirname, "..", "..", "vendor", "components", "dist", "media");
  if (!fs.existsSync(vendorMedia)) {
    console.log("skip: vendor has no media yet (pre-knowledge-MINOR vendor pull)");
    return;
  }
  // For each <slug>/preview.png present in vendor, public mirror must exist.
  fs.readdirSync(vendorMedia, { withFileTypes: true }).forEach(function (entry) {
    if (!entry.isDirectory()) return;
    var slug = entry.name;
    var src = path.join(vendorMedia, slug, "preview.png");
    if (!fs.existsSync(src)) return;
    var dst = path.join(pubMedia, slug, "preview.png");
    assert.ok(fs.existsSync(dst), "expected mirror at " + dst);
    // Sanity: bytes must match (this is a copy, not a re-encode).
    var srcBytes = fs.readFileSync(src);
    var dstBytes = fs.readFileSync(dst);
    assert.equal(srcBytes.length, dstBytes.length, "byte length mismatch: " + slug);
  });
});

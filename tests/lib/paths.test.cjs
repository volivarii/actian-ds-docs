"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var PATHS = require("../../scripts/lib/paths.cjs");

test("paths.cjs — manifest loads without error", function () {
  assert.ok(PATHS);
});

test("paths.cjs — accessibility.guide migrated to per-section collection (knowledge v0.23.0)", function () {
  // Pre-v0.23.0 accessibility.guide was a leaf path to a single
  // accessibility.md file. The per-section split retired the single-file
  // SoT in favor of accessibility/src/<slug>.md per-section files (filenames
  // were NN-prefixed pre-_order.json migration; the migration moved canonical
  // order into a sibling _order.json manifest and renamed files to slug-only),
  // so accessibility.guide is now a collection-style function (parallel to
  // components.categoryDefaults.byKey) with pattern `{slug}.md`.
  //
  // No docs consumer currently uses this entry post-split, so this test just
  // verifies the surface shape; consumers needing real paths should read
  // _order.json (or fall back to alphabetical readdirSync on the collection dir).
  assert.equal(typeof PATHS.accessibility.guide, "function");
});

test("paths.cjs — accessibility.index leaf resolves to the JSON file", function () {
  assert.equal(typeof PATHS.accessibility.index, "string");
  assert.ok(PATHS.accessibility.index.endsWith("a11y-index.json"));
  assert.ok(fs.existsSync(PATHS.accessibility.index));
});

test("paths.cjs — components.categoryDefaults.byKey is a function (collection)", function () {
  assert.equal(typeof PATHS.components.categoryDefaults.byKey, "function");
  var p = PATHS.components.categoryDefaults.byKey("action");
  assert.equal(typeof p, "string");
  assert.ok(p.endsWith("action-defaults.json"));
  assert.ok(fs.existsSync(p));
});

test("paths.cjs — components.categoryDefaults.bundle is a string leaf", function () {
  assert.equal(typeof PATHS.components.categoryDefaults.bundle, "string");
  assert.ok(PATHS.components.categoryDefaults.bundle.endsWith("categories.bundle.json"));
  assert.ok(fs.existsSync(PATHS.components.categoryDefaults.bundle));
});

test("paths.cjs — components.registries.dskit is a leaf", function () {
  assert.equal(typeof PATHS.components.registries.dskit, "string");
  assert.ok(PATHS.components.registries.dskit.endsWith("dskit.json"));
});

test("paths.cjs — repoRoot + vendor are exposed", function () {
  assert.equal(typeof PATHS.repoRoot, "string");
  assert.equal(typeof PATHS.vendor, "string");
});

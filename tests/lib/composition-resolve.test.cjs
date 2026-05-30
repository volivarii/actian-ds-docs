"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var R = require("../../scripts/lib/composition-resolve.cjs");

var bundle = new Map([
  ["tokens/spacing", { id: "tokens/spacing", title: "Spacing",
    blocks: [{ type: "table", headers: ["Token", "Value"],
      rows: [{ Token: "--zen-spacing-md", Value: "8px" }] }] }],
  ["color-primitives", { id: "color-primitives", title: "Color Primitives",
    children: [{ id: "color-primitives/background", title: "Background", order: 1 }] }],
  ["color-primitives/background", { id: "color-primitives/background", title: "Background",
    blocks: [{ type: "table", headers: ["Token", "Hex"],
      rows: [{ Token: "--zen-bg-default", Hex: "#fff" }] }] }],
]);

test("resolveSection: plain ref returns heading + blocks", function () {
  var r = R.resolveSection({ ref: "tokens/spacing" }, bundle);
  assert.equal(r.heading, "Spacing");
  assert.equal(r.blocks[0].type, "table");
});
test("resolveSection: label overrides heading", function () {
  var r = R.resolveSection({ ref: "tokens/spacing", label: "Sizing" }, bundle);
  assert.equal(r.heading, "Sizing");
});
test("resolveSection: intro-only (no ref) returns prose, no blocks", function () {
  var r = R.resolveSection({ intro: "Hello" }, bundle);
  assert.equal(r.intro, "Hello");
  assert.deepEqual(r.blocks, []);
});
test("resolveSection: fragment selects a child by id suffix", function () {
  var r = R.resolveSection({ ref: "color-primitives", fragment: "#background" }, bundle);
  assert.equal(r.heading, "Background");
  assert.equal(r.blocks[0].rows[0].Token, "--zen-bg-default");
});
test("resolveSection: tokenLabels=names drops the value column", function () {
  var r = R.resolveSection({ ref: "color-primitives", fragment: "#background",
    render: { tokenLabels: "names" } }, bundle);
  assert.deepEqual(r.blocks[0].headers, ["Token"]);
  assert.deepEqual(r.blocks[0].rows[0], { Token: "--zen-bg-default" });
});
test("resolveSection: unresolved ref throws with the id", function () {
  assert.throws(function () { R.resolveSection({ ref: "nope/missing" }, bundle); },
    /nope\/missing/);
});
test("resolveSection: unresolved fragment throws with the tried id", function () {
  assert.throws(function () {
    R.resolveSection({ ref: "color-primitives", fragment: "#nonexistent" }, bundle);
  }, /color-primitives\/nonexistent/);
});
test("resolveSection: surfaces node.body when present", function () {
  var b = new Map([["principles", { id: "principles", title: "Principles",
    body: "The four WCAG principles define what accessible products do.",
    blocks: [] }]]);
  var r = R.resolveSection({ ref: "principles" }, b);
  assert.equal(r.body, "The four WCAG principles define what accessible products do.");
});
test("resolveSection: body is null when node has none (foundations case)", function () {
  var r = R.resolveSection({ ref: "tokens/spacing" }, bundle);
  assert.equal(r.body, null);
});

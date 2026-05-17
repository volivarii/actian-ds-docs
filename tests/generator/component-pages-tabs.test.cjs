"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");
var fs = require("fs");
var gen = require("../../scripts/generate-component-pages.cjs");

var REG = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "fixtures", "registries", "dskit-mini.json"), "utf8"));
var BTN_GUIDE = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "fixtures", "guidelines", "button.json"), "utf8"));

test("generator emits six sibling files per component (one per tab)", function () {
  var out = gen.buildComponent("button", REG.components.button, BTN_GUIDE, null, REG);
  var rels = Object.keys(out.files).sort();
  assert.deepEqual(rels, [
    "accessibility.mdx", "code.mdx", "content.mdx",
    "design.mdx", "index.mdx", "usage.mdx",
  ]);
});

test("non-index pages set sidebar: { hidden: true }", function () {
  var out = gen.buildComponent("button", REG.components.button, BTN_GUIDE, null, REG);
  assert.ok(out.files["index.mdx"].indexOf("sidebar:") === -1,
    "index.mdx must not hide itself from sidebar");
  ["usage.mdx", "content.mdx", "design.mdx", "accessibility.mdx", "code.mdx"]
    .forEach(function (f) {
      assert.match(out.files[f], /sidebar:\s*\{\s*hidden:\s*true\s*\}/,
        f + " must hide itself from sidebar");
    });
});

test("stub component renders all six tabs with <StubFooter> on under-documented bodies", function () {
  var out = gen.buildComponent(
    "sticky-footer", REG.components["sticky-footer"], null, null, REG);
  assert.equal(Object.keys(out.files).length, 6);
  // content domain absent → content.mdx must show stub footer
  assert.match(out.files["content.mdx"], /<StubFooter/);
});

test("every emitted page sets template: doc and a valid tab: frontmatter", function () {
  var out = gen.buildComponent("button", REG.components.button, BTN_GUIDE, null, REG);
  var validTabs = /tab:\s*"(overview|usage|content|design|accessibility|code)"/;
  Object.keys(out.files).forEach(function (f) {
    assert.match(out.files[f], /template:\s*doc/,
      f + " must set template: doc");
    assert.match(out.files[f], validTabs,
      f + " must declare a valid tab: frontmatter key");
  });
});

test("tab pages do not disable tableOfContents (right-rail TOC stays on)", function () {
  var out = gen.buildComponent("button", REG.components.button, BTN_GUIDE, null, REG);
  Object.keys(out.files).forEach(function (f) {
    assert.doesNotMatch(out.files[f], /tableOfContents:\s*false/,
      f + " must NOT disable the right-rail TOC");
  });
});

// ---------------------------------------------------------------------------
// buildSidebarManifest — group nesting + per-section targeting
// ---------------------------------------------------------------------------

test("buildSidebarManifest: 2+ components sharing a group wrap into a subnode", function () {
  var miniReg = {
    components: {
      "tag-a": { name: "Tag A", category: "Data Display", section: "Components", group: "Tag, Identification key" },
      "tag-b": { name: "Tag B", category: "Data Display", section: "Components", group: "Tag, Identification key" },
      "lonely": { name: "Lonely", category: "Data Display", section: "Components", group: "Solo group" },
      "flat":   { name: "Flat",   category: "Data Display", section: "Components" },
    },
  };
  var manifest = gen.buildSidebarManifest(miniReg, { targetSection: "components" });
  var dd = manifest.find(function (c) { return c.label === "Data Display"; });
  assert.ok(dd, "Data Display category present");
  var tagNode = dd.items.find(function (i) { return i.label === "Tag, Identification key"; });
  assert.ok(tagNode, "shared-group items wrapped into one subnode");
  assert.equal(tagNode.items.length, 2, "subnode carries both members");
  // Solo group with one component must NOT wrap (would create a node with one child)
  var lonely = dd.items.find(function (i) { return i.label === "Lonely"; });
  assert.ok(lonely && lonely.link, "single-member group renders as flat leaf");
  // Group-less component stays flat
  var flat = dd.items.find(function (i) { return i.label === "Flat"; });
  assert.ok(flat && flat.link, "groupless component renders as flat leaf");
});

test("buildSidebarManifest: groups and leaves interleave A-Z by label", function () {
  var miniReg = {
    components: {
      "z-flat": { name: "Z Flat", category: "X", section: "Components" },
      "a-flat": { name: "A Flat", category: "X", section: "Components" },
      "m1":     { name: "M1",     category: "X", section: "Components", group: "M Group" },
      "m2":     { name: "M2",     category: "X", section: "Components", group: "M Group" },
    },
  };
  var manifest = gen.buildSidebarManifest(miniReg, { targetSection: "components" });
  var labels = manifest[0].items.map(function (i) { return i.label; });
  assert.deepEqual(labels, ["A Flat", "M Group", "Z Flat"]);
});

test("buildSidebarManifest: targetSection filters out other-section entries", function () {
  var miniReg = {
    components: {
      "comp": { name: "Comp", category: "X", section: "Components" },
      "brand-thing": { name: "Brand thing", category: "Y", section: "Brand Assets" },
    },
  };
  var componentsManifest = gen.buildSidebarManifest(miniReg, { targetSection: "components" });
  var brandManifest = gen.buildSidebarManifest(miniReg, { targetSection: "brand" });
  assert.equal(componentsManifest.length, 1);
  assert.equal(componentsManifest[0].label, "X");
  assert.equal(brandManifest.length, 1);
  assert.equal(brandManifest[0].label, "Y");
});

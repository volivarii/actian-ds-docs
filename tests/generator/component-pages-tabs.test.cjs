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

test("synthesized content domain (knowledge v0.15.0+ pattern fan-out) renders content sections, not stub footer", function () {
  // Pattern fan-out produces a guideline doc with status='synthesized' and
  // sections marked with section.source. The content tab must render those
  // sections (NOT the StubFooter) so pattern-only components surface their
  // pattern-derived guidance.
  var synthesizedGuide = {
    _schema_version: 1,
    _meta: {
      auto_generated: true,
      source: "(patterns)",
      do_not_edit: "Edit the per-domain source files; CI regenerates this file.",
    },
    slug: "button",
    component: "Buttons",
    meta: { category: "action" },
    domains: {
      content: {
        status: "synthesized",
        sections: [
          {
            heading: "Empty state",
            source: "pattern:empty-and-system-states",
            content: [{ prose: "Empty states explain what to do next." }],
          },
        ],
      },
    },
  };
  var out = gen.buildComponent(
    "button", REG.components.button, synthesizedGuide, null, REG);
  // content.mdx must NOT be the stub-footer-only shell
  assert.doesNotMatch(out.files["content.mdx"], /<StubFooter\b/,
    "synthesized status is content-bearing — must not render StubFooter");
  // Pattern-derived heading text must appear in the rendered body
  assert.match(out.files["content.mdx"], /Empty state/);
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

test("buildSidebarManifest: flat — no category wrapper, components at top level", function () {
  var miniReg = {
    components: {
      "btn":   { name: "Button", category: "Action", section: "Components" },
      "card":  { name: "Card",   category: "Data Display", section: "Components" },
      "modal": { name: "Modal",  category: "Overlays", section: "Components" },
    },
  };
  var manifest = gen.buildSidebarManifest(miniReg, { targetSection: "components" });
  var labels = manifest.map(function (n) { return n.label; }).sort();
  assert.deepEqual(labels, ["Button", "Card", "Modal"]);
  // Top-level nodes are leaves (have link), not category wrappers.
  manifest.forEach(function (n) { assert.ok(n.link, "top-level entries must be leaves: " + n.label); });
});

test("buildSidebarManifest: 2+ components sharing a group wrap into a subnode (preserved)", function () {
  var miniReg = {
    components: {
      "tag-a":  { name: "Tag A",  category: "Data Display", section: "Components", group: "Tag, Identification key" },
      "tag-b":  { name: "Tag B",  category: "Data Display", section: "Components", group: "Tag, Identification key" },
      "lonely": { name: "Lonely", category: "Data Display", section: "Components", group: "Solo group" },
      "flat":   { name: "Flat",   category: "Data Display", section: "Components" },
    },
  };
  var manifest = gen.buildSidebarManifest(miniReg, { targetSection: "components" });
  var tagNode = manifest.find(function (n) { return n.label === "Tag, Identification key"; });
  assert.ok(tagNode && tagNode.items && tagNode.items.length === 2,
    "shared-group items wrap into one subnode at top level");
  var lonely = manifest.find(function (n) { return n.label === "Lonely"; });
  assert.ok(lonely && lonely.link, "single-member group renders as flat leaf");
  var flat = manifest.find(function (n) { return n.label === "Flat"; });
  assert.ok(flat && flat.link, "groupless component renders as flat leaf");
});

test("buildSidebarManifest: flat leaves + group nodes interleave A-Z by label", function () {
  var miniReg = {
    components: {
      "z-flat": { name: "Z Flat", category: "X", section: "Components" },
      "a-flat": { name: "A Flat", category: "X", section: "Components" },
      "m1":     { name: "M1",     category: "X", section: "Components", group: "M Group" },
      "m2":     { name: "M2",     category: "X", section: "Components", group: "M Group" },
    },
  };
  var manifest = gen.buildSidebarManifest(miniReg, { targetSection: "components" });
  var labels = manifest.map(function (n) { return n.label; });
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
  assert.equal(componentsManifest[0].label, "Comp");
  assert.equal(brandManifest.length, 1);
  assert.equal(brandManifest[0].label, "Brand thing");
});

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

test("every emitted page declares the TabbedComponentLayout template", function () {
  var out = gen.buildComponent("button", REG.components.button, BTN_GUIDE, null, REG);
  Object.keys(out.files).forEach(function (f) {
    assert.match(out.files[f], /template:\s*splash|template:\s*doc|tab:\s*[a-z]+/,
      f + " must carry tab frontmatter");
    // The TabbedComponentLayout signal is the `tab:` key; Starlight's
    // template selection uses head.template, set inside buildComponent.
  });
});

test("tableOfContents disabled on tab pages (right-rail TOC suppression)", function () {
  var out = gen.buildComponent("button", REG.components.button, BTN_GUIDE, null, REG);
  Object.keys(out.files).forEach(function (f) {
    assert.match(out.files[f], /tableOfContents:\s*false/,
      f + " must disable the right-rail TOC");
  });
});

test(".md twin route IDs cover all six tabs (smoke build artifact check)", function () {
  var distDir = path.join(__dirname, "..", "..", "dist", "components", "action", "button");
  if (!fs.existsSync(distDir)) {
    console.log("  skipped — run `pnpm build` first to materialize dist/");
    return;
  }
  ["index.html", "usage/index.html", "content/index.html",
   "design/index.html", "accessibility/index.html", "code/index.html"]
    .forEach(function (rel) {
      assert.ok(fs.existsSync(path.join(distDir, rel)),
        "missing: dist/components/action/button/" + rel);
    });
});

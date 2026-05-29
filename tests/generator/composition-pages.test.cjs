"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var G = require("../../scripts/generate-composition-pages.cjs");

test("renderPageMdx emits frontmatter, static heading, and TokenTable JSX", function () {
  var page = { slug: "spacing", title: "Spacing", sidebarOrder: 3,
    resolved: [{ heading: "Spacing", intro: null,
      blocks: [{ type: "table", headers: ["Token", "Value"],
        rows: [{ Token: "--zen-spacing-md", Value: "8px" }] }] }] };
  var mdx = G.renderPageMdx(page);
  assert.match(mdx, /^---\ntitle: "Spacing"/);
  assert.match(mdx, /order: 3/);
  assert.match(mdx, /^## Spacing/m);                 // static heading (TOC)
  assert.match(mdx, /<TokenTable\b/);                // JSX table
  assert.match(mdx, /import TokenTable/);            // import emitted
  assert.match(mdx, /<PageMetadata/);
});
test("renderPageMdx emits intro prose before blocks", function () {
  var page = { slug: "x", title: "X", sidebarOrder: 0,
    resolved: [{ heading: "Sec", intro: "Lead in.", blocks: [] }] };
  var mdx = G.renderPageMdx(page);
  assert.match(mdx, /Lead in\./);
});

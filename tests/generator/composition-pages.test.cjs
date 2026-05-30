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
test("renderSection: data table (no swatch headers) renders as markdown table", function () {
  var sec = { heading: "Principles", intro: null, body: null, children: [],
    blocks: [{ type: "table", headers: ["Principle", "Requirement"],
      rows: [{ Principle: "**Perceivable**", Requirement: "See or hear content" }] }] };
  var out = G.renderSection(sec, 2);
  assert.match(out, /\| Principle \| Requirement \|/);
  assert.match(out, /\| --- \| --- \|/);
  assert.match(out, /\*\*Perceivable\*\*/);            // emphasis preserved
  assert.doesNotMatch(out, /<TokenTable/);
});
test("renderSection: token table (Token/Value headers) still renders TokenTable", function () {
  var sec = { heading: "Spacing", intro: null, body: null, children: [],
    blocks: [{ type: "table", headers: ["Token", "Value"], rows: [{ Token: "--x", Value: "8px" }] }] };
  assert.match(G.renderSection(sec, 2), /<TokenTable\b/);
});
test("renderSection: renders body prose after heading and before blocks", function () {
  var sec = { heading: "Principles", intro: null, body: "WCAG has four principles.", children: [],
    blocks: [{ type: "list", items: ["Use semantic markup."] }] };
  var out = G.renderSection(sec, 2);
  assert.match(out, /WCAG has four principles\./);
  assert.ok(out.indexOf("WCAG has four principles.") < out.indexOf("Use semantic markup."),
    "body should render before blocks");
});
test("renderSection: escapes angle brackets in table cells", function () {
  var sec = { heading: "C", intro: null, body: null, children: [],
    blocks: [{ type: "table", headers: ["Content type", "Min ratio"],
      rows: [{ "Content type": "Normal text (< 18px)", "Min ratio": "4.5:1" }] }] };
  var out = G.renderSection(sec, 2);
  assert.match(out, /&lt; 18px/);
});
test("renderSection: recurses children at the next heading level", function () {
  var sec = { heading: "Components", intro: null, body: null, blocks: [],
    children: [{ heading: "Buttons", intro: null, body: null, blocks: [], children: [] }] };
  var out = G.renderSection(sec, 2);
  assert.match(out, /^## Components/m);
  assert.match(out, /^### Buttons/m);
});
test("renderPageMdx: directory output keeps foundations slug + schema 1 + 3-level import", function () {
  var page = { slug: "spacing", title: "Spacing", sidebarOrder: 3,
    resolved: [{ heading: "Spacing", intro: null, body: null, children: [],
      blocks: [{ type: "table", headers: ["Token", "Value"], rows: [{ Token: "--x", Value: "8px" }] }] }] };
  var mdx = G.renderPageMdx(page, { chapterSlug: "foundations", manifestFile: "foundations.json",
    schemaVersion: 1, output: "directory" });
  assert.match(mdx, /slug="foundations\.spacing"/);
  assert.match(mdx, /source="composition\/foundations\.json"/);
  assert.match(mdx, /schema=\{1\}/);
  assert.match(mdx, /import TokenTable from "\.\.\/\.\.\/\.\.\/components\/TokenTable\.astro"/);
});
test("renderPageMdx: page output uses bare slug, 2-level import, omits unused TokenTable import", function () {
  var page = { slug: "accessibility", title: "Accessibility", sidebarOrder: 0,
    resolved: [{ heading: "Principles", intro: null, body: "Four principles.", children: [], blocks: [] }] };
  var mdx = G.renderPageMdx(page, { chapterSlug: "accessibility", manifestFile: "accessibility.json",
    schemaVersion: 2, output: "page" });
  assert.match(mdx, /slug="accessibility"/);
  assert.match(mdx, /source="composition\/accessibility\.json"/);
  assert.match(mdx, /schema=\{2\}/);
  assert.match(mdx, /import PageMetadata from "\.\.\/\.\.\/components\/PageMetadata\.astro"/);
  assert.doesNotMatch(mdx, /import TokenTable/);
});
test("renderPageMdx: 1-arg call still works (foundations defaults)", function () {
  var page = { slug: "spacing", title: "Spacing", sidebarOrder: 3,
    resolved: [{ heading: "Spacing", intro: null, body: null, children: [],
      blocks: [{ type: "table", headers: ["Token", "Value"], rows: [{ Token: "--x", Value: "8px" }] }] }] };
  var mdx = G.renderPageMdx(page);
  assert.match(mdx, /slug="foundations\.spacing"/);
  assert.match(mdx, /schema=\{1\}/);
});

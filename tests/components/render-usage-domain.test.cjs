"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// The usage domain is { status, markdown } — a markdown BLOB, unlike the
// content domain's { status, sections[] }. The renderer passes the markdown
// through (rewriting bare-slug links) and prepends a review-status line.
// It must NOT assume the canonical four headings: one component authors its
// own.

test("draft usage renders its markdown verbatim", function () {
  var out = renderMdx.renderUsageDomain({
    status: "draft",
    markdown: "## When to use\n\n* Trigger an action.\n\n## When not to use\n\n* Navigation.",
  });
  assert.match(out, /## When to use/);
  assert.match(out, /## When not to use/);
  assert.match(out, /Trigger an action\./);
});

test("draft usage carries the review-status disclosure", function () {
  var out = renderMdx.renderUsageDomain({ status: "draft", markdown: "## When to use\n\n* x" });
  assert.match(out, /Authored, pending design lead review\./);
});

test("approved usage renders WITHOUT the draft disclosure", function () {
  var out = renderMdx.renderUsageDomain({ status: "approved", markdown: "## When to use\n\n* x" });
  assert.match(out, /## When to use/);
  assert.doesNotMatch(out, /pending design lead review/);
});

test("bare-slug component links are rewritten to absolute paths", function () {
  // This is the regression that took the docs build down on 2026-07-13:
  // authored markdown links components by bare slug, and the substrate is
  // not allowed to know the docs site's URL layout.
  renderMdx.setSlugToPathMap({ table: "components/data-display/table/table" });
  var out = renderMdx.renderUsageDomain({
    status: "draft",
    markdown: "## When to use\n\n* Use in a [table](table) row.",
  });
  assert.doesNotMatch(out, /\]\(table\)/);          // the bare slug is gone
  assert.match(out, /components\/data-display\/table\/table/);
});

test("headings stay at H2 so they land in the page ToC", function () {
  // Carbon ships this bug: it uses H4 for "When to use" on Button and H3 on
  // Modal, so the heading silently drops out of Button's table of contents.
  // Assert we do not promote/demote.
  var out = renderMdx.renderUsageDomain({ status: "draft", markdown: "## When to use\n\n* x" });
  assert.match(out, /^## When to use$/m);
  assert.doesNotMatch(out, /^### When to use$/m);
});

test("non-canonical headings pass through unharmed", function () {
  var out = renderMdx.renderUsageDomain({
    status: "draft",
    markdown: "## Where it lives\n\n* x\n\n## When AI content appears\n\n* y",
  });
  assert.match(out, /## Where it lives/);
  assert.match(out, /## When AI content appears/);
});

test("absent, empty, or non-content-bearing usage renders nothing", function () {
  assert.equal(renderMdx.renderUsageDomain(null), "");
  assert.equal(renderMdx.renderUsageDomain(undefined), "");
  assert.equal(renderMdx.renderUsageDomain({ status: "draft" }), "");
  assert.equal(renderMdx.renderUsageDomain({ status: "draft", markdown: "   " }), "");
  assert.equal(renderMdx.renderUsageDomain({ status: "inherited", markdown: "## When to use\n\n* x" }), "");
});

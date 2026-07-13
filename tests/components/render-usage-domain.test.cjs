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

test("the note lands AFTER the first heading, not before the blob", function () {
  // I1/I2: Starlight pages are flat (no nesting), and the /usage/ redirect
  // targets the heading's auto-slugged anchor (#when-to-use). If the note
  // rendered BEFORE the heading, a reader deep-linking to that anchor would
  // land past the disclosure and never see it. Assert order, not just
  // presence: the heading must come first.
  var out = renderMdx.renderUsageDomain({
    status: "draft",
    markdown: "## When to use\n\n* Trigger an action.",
  });
  var headingIndex = out.indexOf("## When to use");
  var noteIndex = out.indexOf(":::note");
  assert.ok(headingIndex !== -1, "heading must be present");
  assert.ok(noteIndex !== -1, "note must be present");
  assert.ok(noteIndex > headingIndex, "note must sit AFTER the heading, not before it");
});

test("a lede paragraph with no leading heading gets a normalized ## Usage heading, and cannot bleed into the previous section", function () {
  // 8 of the 56 usage docs (card, scroll-bar, search, search-dropdown-menu,
  // search-filters, search-result-card, tag, tag-default) open with a
  // deliberate lede paragraph instead of a heading. Without normalization,
  // that lede is absorbed as the tail of whatever design ## heading
  // preceded it in the concatenated page (e.g. scroll-bar's lede reading as
  // part of "## Behavior").
  var lede = "Scroll bars are a behavior primitive that appears whenever content overflows.";
  var out = renderMdx.renderUsageDomain({ status: "draft", markdown: lede });
  assert.ok(out.startsWith("## Usage"), "output must start with a normalized ## Usage heading");
  var headingIndex = out.indexOf("## Usage");
  var noteIndex = out.indexOf(":::note");
  var ledeIndex = out.indexOf(lede);
  assert.ok(headingIndex === 0);
  assert.ok(noteIndex > headingIndex, "note must sit AFTER the normalized heading");
  assert.ok(ledeIndex > noteIndex, "lede must sit AFTER the note, not before it");
  // The lede must NOT be the first thing in the output — it cannot bleed
  // into whatever section preceded this domain in the concatenated page.
  assert.notEqual(out.indexOf(lede), 0);
});

test("an approved lede doc still gets heading normalization, with no note", function () {
  var lede = "Scroll bars are a behavior primitive that appears whenever content overflows.";
  var out = renderMdx.renderUsageDomain({ status: "approved", markdown: lede });
  assert.ok(out.startsWith("## Usage"), "approved docs still get the heading normalization");
  assert.doesNotMatch(out, /:::note/);
  assert.doesNotMatch(out, /pending design lead review/);
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
  // Real src/data/slug-paths.json values are root-absolute and
  // trailing-slashed (e.g. "/components/navigation/tabs/") — match that
  // shape here. The renderer strips a leading slash, so this test would
  // keep passing even if that strip regressed if the fixture used a bare
  // relative path; use the real shape so it actually exercises the strip.
  renderMdx.setSlugToPathMap({ table: "/components/data-display/table/" });
  var out = renderMdx.renderUsageDomain({
    status: "draft",
    markdown: "## When to use\n\n* Use in a [table](table) row.",
  });
  assert.doesNotMatch(out, /\]\(table\)/);          // the bare slug is gone
  assert.match(out, /components\/data-display\/table\//);
  renderMdx.setSlugToPathMap({}); // reset module-level state for later tests
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

test("confidence chips report usage: draft -> medium", function () {
  var out = renderMdx.renderConfidenceChips(
    { confidence: { design: "high" } },
    { status: "approved", sections: [] },
    { status: "draft", markdown: "## When to use\n\n* x" }
  );
  assert.match(out, /field="usage"/);
  assert.match(out, /<ConfidenceChip variant="medium" field="usage"/);
});

test("confidence chips report usage: approved -> high", function () {
  var out = renderMdx.renderConfidenceChips(
    { confidence: { design: "high" } },
    { status: "approved", sections: [] },
    { status: "approved", markdown: "## When to use\n\n* x" }
  );
  assert.match(out, /<ConfidenceChip variant="high" field="usage"/);
});

test("confidence chips report usage: absent -> low", function () {
  var out = renderMdx.renderConfidenceChips(
    { confidence: { design: "high" } },
    { status: "approved", sections: [] },
    null
  );
  assert.match(out, /<ConfidenceChip variant="low" field="usage"/);
});

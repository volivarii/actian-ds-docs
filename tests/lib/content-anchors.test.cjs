"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("node:path");
var contentAnchors = require("../../scripts/lib/content-anchors.cjs");

// ---------------------------------------------------------------------------
// content-anchors.cjs derives the section-heading → content-family-page map
// that renderRelatedPatterns (scripts/lib/render-mdx.cjs) uses to resolve a
// pattern slug like `object-preview-panels` to the correct split content page
// (the /content page split: /content/{writing,patterns,product}).
//
// The trap this guards against: a naive "patterns fan out to /content/patterns"
// mapping is wrong. object-preview-panels and related-content-panels live on
// vendor/content/dist/product.md, NOT patterns.md. These tests read the REAL
// vendored files (checked into git, always present — no build step needed).
// ---------------------------------------------------------------------------

var REPO_ROOT = path.resolve(__dirname, "..", "..");

test("buildSectionPageMap resolves the real trap cases to their actual family page", function () {
  var map = contentAnchors.buildSectionPageMap(REPO_ROOT);
  // The trap: these two are on product.md, not patterns.md, even though they
  // read as "UX patterns" at a glance.
  assert.equal(map["object-preview-panels"], "product");
  assert.equal(map["related-content-panels"], "product");
  // Sanity: a genuine patterns.md section resolves to "patterns".
  assert.equal(map["forms"], "patterns");
  // Sanity: a genuine writing.md section resolves to "writing".
  assert.equal(map["voice-and-tone"], "writing");
});

test("resolvePatternPage returns the mapped page for a known slug", function () {
  var map = contentAnchors.buildSectionPageMap(REPO_ROOT);
  assert.equal(contentAnchors.resolvePatternPage("object-preview-panels", map), "product");
  assert.equal(contentAnchors.resolvePatternPage("forms", map), "patterns");
  assert.equal(contentAnchors.resolvePatternPage("voice-and-tone", map), "writing");
});

test("resolvePatternPage throws (never emits a dead link) for an unknown slug", function () {
  var map = contentAnchors.buildSectionPageMap(REPO_ROOT);
  assert.throws(
    function () { contentAnchors.resolvePatternPage("not-a-real-section-slug", map); },
    /not-a-real-section-slug/,
    "must name the offending slug in the thrown error",
  );
});

test("resolvePatternPage throws against an empty/missing map rather than silently passing", function () {
  assert.throws(function () { contentAnchors.resolvePatternPage("forms", {}); }, /forms/);
  assert.throws(function () { contentAnchors.resolvePatternPage("forms", null); }, /forms/);
});

test("slugifyHeading matches the existing shipped anchor slugs", function () {
  assert.equal(contentAnchors.slugifyHeading("Object preview panels"), "object-preview-panels");
  assert.equal(contentAnchors.slugifyHeading("Related content panels"), "related-content-panels");
  assert.equal(contentAnchors.slugifyHeading("Voice and tone"), "voice-and-tone");
  assert.equal(contentAnchors.slugifyHeading("Lineage-specific UI"), "lineage-specific-ui");
});

// Regression coverage for the previously-false "same way Starlight's default
// heading-id plugin does" claim: the old hand-rolled slugifier collapsed
// runs of hyphens (`.replace(/-+/g, "-")`), which github-slugger (what
// Starlight's rehype-heading-ids.js actually uses) does NOT do. These three
// assert the REAL github-slugger output — verified independently against
// `new (require("github-slugger").default)().slug(text)` — not the old
// (wrong) collapsed-hyphen output.
test("slugifyHeading matches real github-slugger output for punctuation Starlight does not collapse", function () {
  // "/" is stripped entirely, leaving the space on either side of it as TWO
  // adjacent hyphens — a naive hyphen-collapse would wrongly merge these.
  assert.equal(contentAnchors.slugifyHeading("Do / Don't"), "do--dont");
  // "&" is stripped the same way, again leaving a double hyphen.
  assert.equal(contentAnchors.slugifyHeading("Foo & Bar"), "foo--bar");
  // An em dash surrounded by spaces is stripped too, same double-hyphen shape.
  assert.equal(contentAnchors.slugifyHeading("Foo — Bar"), "foo--bar");
});

test("splitH2Sections dedupes a heading repeated within one document the way Starlight does", function () {
  // Astro's rehype-heading-ids.js shares ONE Slugger per file across all of
  // its headings, so a second occurrence of the same heading text gets a
  // "-1" suffix. splitH2Sections must reproduce that (it shares one slugger
  // per call), not just slugifyHeading's per-call behavior (which has no way
  // to know about earlier headings in the same document).
  var md = ["## Overview", "", "first", "", "## Overview", "", "second"].join("\n");
  var sections = contentAnchors.splitH2Sections(md);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].slug, "overview");
  assert.equal(sections[1].slug, "overview-1");
});

test("splitH2Sections splits on H2 only, not H3+, and captures each section's body", function () {
  var md = [
    "# Title",
    "",
    "intro para",
    "",
    "## First",
    "",
    "first body",
    "",
    "### Nested H3 (not a split point)",
    "",
    "still first body",
    "",
    "## Second",
    "",
    "second body",
  ].join("\n");
  var sections = contentAnchors.splitH2Sections(md);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].heading, "First");
  assert.equal(sections[0].slug, "first");
  assert.match(sections[0].body, /still first body/);
  assert.doesNotMatch(sections[0].body, /second body/);
  assert.equal(sections[1].heading, "Second");
  assert.match(sections[1].body, /second body/);
});

test("extractSection pulls the named H2 section (heading line through the next H2)", function () {
  var md = "# Doc\n\n## Global guidelines\n\nglobal prose here\n\n## Voice and tone\n\nvoice prose here\n";
  var section = contentAnchors.extractSection(md, "Global guidelines");
  assert.match(section, /^## Global guidelines/);
  assert.match(section, /global prose here/);
  assert.doesNotMatch(section, /Voice and tone/);
  assert.doesNotMatch(section, /voice prose here/);
});

test("extractSection throws (naming the heading) when the heading is absent", function () {
  var md = "## Voice and tone\n\nprose\n";
  assert.throws(
    function () { contentAnchors.extractSection(md, "Global guidelines"); },
    /Global guidelines/,
  );
});

test("real global.md contains a 'Global guidelines' H2 section extractable by extractSection", function () {
  var fs = require("node:fs");
  var raw = fs.readFileSync(path.join(REPO_ROOT, "vendor", "content", "dist", "global.md"), "utf8");
  var section = contentAnchors.extractSection(raw, "Global guidelines");
  assert.match(section, /^## Global guidelines/);
  // Must stop before the next H2 ("Voice and tone" immediately follows it in
  // vendor/content/dist/global.md).
  assert.doesNotMatch(section, /## Voice and tone/);
});

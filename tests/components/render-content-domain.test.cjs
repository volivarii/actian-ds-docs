"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// ---------------------------------------------------------------------------
// Tests for renderContentDomain's "authored takes precedence" rule:
// when a component has its OWN authored content (sections WITHOUT a
// `source: "pattern:<slug>"` marker), render only those + a "Related patterns"
// links block to the split content pages — do NOT inline the fanned patterns'
// full content (which duplicates the authored guidance). When there is no
// authored content (synthesized: pattern fan-out only), inline the patterns —
// they ARE the content. Motivated by the drawer-side-panel duplication.
//
// renderRelatedPatterns resolves each pattern slug to its content-family page
// via a section→page map (the /content page split); tests here inject a small
// fixture map via setSectionPageMap rather than reading the real vendored
// files, so this stays a pure unit test of renderContentDomain's branching.
// object-preview-panels/related-content-panels are deliberately mapped to
// "product" (not "patterns") — the real trap the split introduced.
// ---------------------------------------------------------------------------

renderMdx.setSectionPageMap({
  "object-preview-panels": "product",
  "related-content-panels": "product",
  "forms": "patterns",
});

var WARN = { unknownContentShapes: 0 };

function sec(heading, source) {
  var s = { heading: heading, content: [] };
  if (source) s.source = source;
  return s;
}

test("mixed authored + patterns → authored sections + Related patterns links; patterns NOT inlined", function () {
  var domain = { status: "approved", sections: [
    sec("When to use"),
    sec("Style"),
    sec("OPP only heading", "pattern:object-preview-panels"),
    sec("Attribute label examples", "pattern:object-preview-panels"),
    sec("RCP only heading", "pattern:related-content-panels"),
  ] };
  var out = renderMdx.renderContentDomain(domain, WARN);
  // authored sections render
  assert.match(out, /### When to use/);
  assert.match(out, /### Style/);
  // a Related patterns block with links to the split content pages' anchors.
  // Both slugs live on content/product (the trap: NOT content/patterns).
  assert.match(out, /### Related patterns/);
  assert.match(out, /content\/product\/#object-preview-panels/);
  assert.match(out, /content\/product\/#related-content-panels/);
  assert.match(out, />Object preview panels</);
  assert.match(out, />Related content panels</);
  // each pattern linked once (deduped), even though it has multiple sections
  assert.equal((out.match(/content\/product\/#object-preview-panels/g) || []).length, 1);
  // the patterns' own section content is NOT inlined
  assert.doesNotMatch(out, /OPP only heading/);
  assert.doesNotMatch(out, /Attribute label examples/);
  assert.doesNotMatch(out, /RCP only heading/);
});

test("synthesized (patterns only, no authored) → inline patterns, no Related-patterns block", function () {
  var domain = { status: "synthesized", sections: [
    sec("When to use", "pattern:forms"),
    sec("Validation messages", "pattern:forms"),
  ] };
  var out = renderMdx.renderContentDomain(domain, WARN);
  assert.doesNotMatch(out, /### Related patterns/);
  // the patterns ARE the content — inlined
  assert.match(out, /### When to use/);
  assert.match(out, /### Validation messages/);
});

test("authored only (no patterns) → render authored, no Related-patterns block", function () {
  var domain = { status: "approved", sections: [ sec("When to use"), sec("Style") ] };
  var out = renderMdx.renderContentDomain(domain, WARN);
  assert.doesNotMatch(out, /### Related patterns/);
  assert.match(out, /### When to use/);
  assert.match(out, /### Style/);
});

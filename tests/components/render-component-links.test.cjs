"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// ---------------------------------------------------------------------------
// Tests for rewriteComponentLinks (via the public escapeMdxPlaceholders entry):
// bare-slug markdown links in guideline content must become base-aware JSX
// links. A plain `[label](/components/...)` markdown link drops the site base
// prefix and 404s in production (Astro does not auto-prepend `base` to markdown
// links) — the regression shown by the broken Tooltip → popover cross-link.
// ---------------------------------------------------------------------------

function slugifyCategory(label) {
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

var REGISTRY = {
  components: {
    popover: { category: "Overlays", section: "Components", name: "Popover" },
  },
};

function buildMap() {
  renderMdx.buildSlugToPathMap(REGISTRY, {}, { Components: "components" }, "components", slugifyCategory);
}

test("rewriteComponentLinks: bare-slug link → base-aware JSX <a>, never a bare root-absolute markdown link", function () {
  buildMap();
  var out = renderMdx.escapeMdxPlaceholders("For longer content, use a [popover](popover) instead.");

  // The production-breaking form (no base prefix) must NOT appear.
  assert.doesNotMatch(out, /\]\(\/components/, "must not emit a bare root-absolute markdown link");
  // It must emit the BASE_URL-prefixed JSX link used by the other cross-links.
  assert.match(out, /import\.meta\.env\.BASE_URL/, "must prefix the href with import.meta.env.BASE_URL");
  assert.match(out, /<a href=\{`/, "must emit a JSX <a> with a template-literal href");
  assert.match(out, /components\/overlays\/popover\//, "must resolve the slug to its doc path");
  assert.match(out, />popover<\/a>/, "must preserve the link label");
});

test("rewriteComponentLinks: unknown slug left untouched for the link validator to flag", function () {
  buildMap();
  var out = renderMdx.escapeMdxPlaceholders("see [mystery](does-not-exist) here");
  assert.match(out, /\[mystery\]\(does-not-exist\)/, "unknown slugs must be left as authored");
});

test("rewriteComponentLinks: REMOVE_LINK_SLUGS reduced to plain text (no broken link)", function () {
  buildMap();
  var out = renderMdx.escapeMdxPlaceholders("see [forms](forms) here");
  assert.equal(out, "see forms here");
});

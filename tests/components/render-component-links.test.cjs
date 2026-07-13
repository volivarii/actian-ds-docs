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

// ---------------------------------------------------------------------------
// Usage-wave (knowledge #403) slug resolution: usage.md files link guideline
// slugs that differ from registry names (checkbox, global-toast) or have no
// registry component at all (inline-toast, multi-select, combo-box,
// success-state).
// ---------------------------------------------------------------------------

var USAGE_WAVE_REGISTRY = {
  components: {
    "card-for-items": { category: "Data display", section: "Components", name: "Card for items" },
    "checkbox": { category: "Form input selection", section: "Components", name: "Checkbox" },
    "notification": { category: "Feedback", section: "Components", name: "Notification" },
  },
};

function buildUsageWaveMap() {
  renderMdx.buildSlugToPathMap(USAGE_WAVE_REGISTRY, {}, { Components: "components" }, "components", slugifyCategory);
}

// Figma renamed "Checkbox with label" to "Checkbox" (knowledge v0.34.89), so the
// registry key now matches the slug the content authors already link to. The
// alias that bridged the two is gone: this asserts the link resolves directly.
test("rewriteComponentLinks: checkbox resolves straight to the checkbox page, no alias hop", function () {
  buildUsageWaveMap();
  var out = renderMdx.escapeMdxPlaceholders("use a [checkbox](checkbox) instead");
  assert.match(out, /components\/form-input-selection\/checkbox\//);
  assert.doesNotMatch(out, /checkbox-with-label/, "the retired alias target is gone");
  assert.match(out, />checkbox<\/a>/, "label preserved");
});

test("rewriteComponentLinks: global-toast alias resolves to the notification page", function () {
  buildUsageWaveMap();
  var out = renderMdx.escapeMdxPlaceholders("use a [global toast](global-toast) at the screen edge");
  assert.match(out, /components\/feedback\/notification\//);
  assert.match(out, />global toast<\/a>/, "label preserved");
});

test("rewriteComponentLinks: registry-less usage-wave slugs reduce to plain text", function () {
  buildUsageWaveMap();
  ["inline-toast", "multi-select", "combo-box", "success-state"].forEach(function (slug) {
    var out = renderMdx.escapeMdxPlaceholders("see [the label](" + slug + ") here");
    assert.equal(out, "see the label here", slug + " must drop link syntax, keep label");
  });
});

test("rewriteComponentLinks: card family slug resolves to the card-for-items page", function () {
  buildUsageWaveMap();
  var out = renderMdx.escapeMdxPlaceholders("use a [card](card) grid");
  assert.match(out, /components\/data-display\/card-for-items\//);
  assert.match(out, />card<\/a>/);
});

// ---------------------------------------------------------------------------
// rewriteComponentLinksMarkdown: the plain-Markdown emitter used for the
// vendored content-guidelines page (a .md file, so JSX would render as literal
// text). Same policy as the MDX emitter, different output shape: a root-absolute
// markdown link, which remark-base-links base-prefixes at build time.
//
// Before this existed, sync-vendored-md.cjs copied the vendored markdown
// verbatim: every bare-slug cross-reference reached the HTML unresolved, and a
// hand-maintained allowlist in astro.config.mjs was the only thing keeping the
// links validator green. Knowledge #369 added four new cross-links and the
// build went red (docs main, 2026-07-10).
// ---------------------------------------------------------------------------

var CONTENT_PAGE_REGISTRY = {
  components: {
    tabs: { category: "Navigation", section: "Components", name: "Tabs" },
    "input-date": { category: "Action", section: "Components", name: "Input date" },
    "dropdown-select-default": { category: "Form (input & selection)", section: "Components", name: "Dropdown, Select, default" },
  },
};

function buildContentPageMap() {
  renderMdx.buildSlugToPathMap(CONTENT_PAGE_REGISTRY, {}, { Components: "components" }, "components", slugifyCategory);
}

test("rewriteComponentLinksMarkdown: known slug → root-absolute markdown link (not JSX)", function () {
  buildContentPageMap();
  var out = renderMdx.rewriteComponentLinksMarkdown("Do not use for page-level navigation - use [tabs](tabs) instead.");
  assert.equal(out, "Do not use for page-level navigation - use [tabs](/components/navigation/tabs/) instead.");
  assert.doesNotMatch(out, /import\.meta\.env|<a href/, "a .md page cannot evaluate JSX, so it must stay markdown");
});

test("rewriteComponentLinksMarkdown: alias resolves (dropdown-select → dropdown-select-default)", function () {
  buildContentPageMap();
  var out = renderMdx.rewriteComponentLinksMarkdown("use a [single-select dropdown](dropdown-select) instead");
  assert.equal(out, "use a [single-select dropdown](/components/form-input-selection/dropdown-select-default/) instead");
});

test("rewriteComponentLinksMarkdown: slug with no page degrades to plain text", function () {
  buildContentPageMap();
  var out = renderMdx.rewriteComponentLinksMarkdown("**Use a** **[multi-select dropdown](multi-select)** **when:**");
  assert.equal(out, "**Use a** **multi-select dropdown** **when:**", "label kept, dead link syntax dropped");
});

test("rewriteComponentLinksMarkdown: the four links that broke docs main all resolve or degrade", function () {
  buildContentPageMap();
  var body = [
    "**Use a** **[multi-select dropdown](multi-select)** **when:**",
    "For more than seven, use a [single-select dropdown](dropdown-select) instead.",
    "* Do not use for page-level navigation - use [tabs](tabs) instead.",
    "See [date input](input-date).",
  ].join("\n");
  var out = renderMdx.rewriteComponentLinksMarkdown(body);
  assert.doesNotMatch(out, /\]\((?!\/)[a-z]/, "no bare-slug link may survive; that is what the validator rejects");
  assert.match(out, /\[single-select dropdown\]\(\/components\//);
  assert.match(out, /\[tabs\]\(\/components\/navigation\/tabs\/\)/);
  assert.match(out, /\[date input\]\(\/components\/action\/input-date\/\)/);
});

test("rewriteComponentLinksMarkdown: unknown slug left untouched for the links validator to flag", function () {
  buildContentPageMap();
  var out = renderMdx.rewriteComponentLinksMarkdown("see [mystery](does-not-exist) here");
  assert.equal(out, "see [mystery](does-not-exist) here");
});

test("rewriteComponentLinksMarkdown: external and root-absolute links pass through", function () {
  buildContentPageMap();
  var body = "[docs](https://example.com) and [spacing](/foundations/spacing/) and [anchor](#heading)";
  assert.equal(renderMdx.rewriteComponentLinksMarkdown(body), body);
});

test("setSlugToPathMap / getSlugToPathMap round-trip (the cross-process handoff)", function () {
  renderMdx.setSlugToPathMap({ tabs: "/components/navigation/tabs/" });
  assert.deepEqual(renderMdx.getSlugToPathMap(), { tabs: "/components/navigation/tabs/" });
  var out = renderMdx.rewriteComponentLinksMarkdown("[tabs](tabs)");
  assert.equal(out, "[tabs](/components/navigation/tabs/)");
});

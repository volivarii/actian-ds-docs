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

// The generator's rule for which registry entries get a page, in the shape
// generate-component-pages.cjs passes to buildSlugToPathMap. Icons render as
// one collection page, so an icon slug is a registry entry with NO page.
var COLLECTION_CATEGORIES = new Set(["Icons"]);
function writesPage(entry) {
  return Boolean(entry.category) && !COLLECTION_CATEGORIES.has(entry.category);
}

function build(registry) {
  renderMdx.buildSlugToPathMap(registry, {}, { Components: "components" }, "components", slugifyCategory, writesPage);
}

var REGISTRY = {
  components: {
    popover: { category: "Overlays", section: "Components", name: "Popover" },
  },
};

function buildMap() {
  build(REGISTRY);
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
    "checkbox": { category: "Form input selection", section: "Components", name: "Checkbox" },
    "notification": { category: "Feedback", section: "Components", name: "Notification" },
  },
};

function buildUsageWaveMap() {
  build(USAGE_WAVE_REGISTRY);
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
  // These four are no longer hand-listed: they arrive through the derived
  // stranded set, exactly as the real build supplies them.
  renderMdx.setStrandedGuidelineSlugs(
    renderMdx.deriveStrandedGuidelineSlugs(["inline-toast", "multi-select", "combo-box", "success-state"]),
  );
  ["inline-toast", "multi-select", "combo-box", "success-state"].forEach(function (slug) {
    var out = renderMdx.escapeMdxPlaceholders("see [the label](" + slug + ") here");
    assert.equal(out, "see the label here", slug + " must drop link syntax, keep label");
  });
  renderMdx.setStrandedGuidelineSlugs([]);
});

// ---------------------------------------------------------------------------
// Derived stranded-guideline slugs. Replaces the hand-maintained tail of
// REMOVE_LINK_SLUGS, which drifted on every Figma retirement: `search-filters`
// left the registry on 2026-07-23 and docs main stayed red for 17 nights (17
// skipped deploys) because the removal was recorded in the knowledge repo's own
// allowlist and never mirrored here.
//
// The pair of tests below is the whole contract: guidance with no page degrades
// silently, and everything else still reaches the links validator. The second
// is the one that matters — a derive that swallowed unknown slugs too would
// trade a loud 17-day outage for a quiet permanent one.
// ---------------------------------------------------------------------------

test("deriveStrandedGuidelineSlugs: guidance with no page is stranded; a published or aliased one is not", function () {
  // Both alias targets must exist for the aliased cases to be meaningful:
  // `global-toast` → notification, `tag` → tag-interactive.
  build({
    components: {
      checkbox: { category: "Form input selection", section: "Components", name: "Checkbox" },
      notification: { category: "Feedback", section: "Components", name: "Notification" },
      "tag-interactive": { category: "Data display", section: "Components", name: "Tag, interactive" },
    },
  });
  var stranded = renderMdx.deriveStrandedGuidelineSlugs([
    "search-filters",   // guidance kept, component gone from every registry
    "upload-file",      // same, swept out 2026-07-13
    "checkbox",         // published: resolves directly
    "global-toast",     // no registry entry, but aliased onto `notification`
    "tag",              // no registry entry, but aliased onto tag-interactive
    "forms",            // concept slug: already in REMOVE_LINK_SLUGS
  ]);
  assert.deepEqual(stranded, ["search-filters", "upload-file"]);
});

test("rewriteComponentLinks: a derived stranded slug degrades, an unknown slug still reaches the validator", function () {
  buildUsageWaveMap();
  renderMdx.setStrandedGuidelineSlugs(["search-filters"]);

  var degraded = renderMdx.escapeMdxPlaceholders("pair it with [search filters](search-filters) above");
  assert.equal(degraded, "pair it with search filters above", "label kept, dead link syntax dropped");

  // A slug with no guidance doc is a typo or a rename needing an alias. It must
  // stay authored so the links validator fails the build and a human decides.
  var flagged = renderMdx.escapeMdxPlaceholders("see [mystery](serach-filters) here");
  assert.match(flagged, /\[mystery\]\(serach-filters\)/, "unknown slugs must still be flagged");

  renderMdx.setStrandedGuidelineSlugs([]);
});

test("rewriteComponentLinksMarkdown: the derived set applies to the .md emitter too", function () {
  buildUsageWaveMap();
  renderMdx.setStrandedGuidelineSlugs(["search-filters"]);
  var out = renderMdx.rewriteComponentLinksMarkdown("Narrow the list with [search filters](search-filters).");
  assert.equal(out, "Narrow the list with search filters.");
  renderMdx.setStrandedGuidelineSlugs([]);
});

test("setStrandedGuidelineSlugs / getStrandedGuidelineSlugs round-trip sorted (the cross-process handoff)", function () {
  renderMdx.setStrandedGuidelineSlugs(["upload-file", "search-filters"]);
  assert.deepEqual(renderMdx.getStrandedGuidelineSlugs(), ["search-filters", "upload-file"]);
  renderMdx.setStrandedGuidelineSlugs([]);
  assert.deepEqual(renderMdx.getStrandedGuidelineSlugs(), []);
});

// A registry slug is never shadowed by its alias entry. This is the shape of the
// 2026-08-25 outage: the family name `card` was aliased onto `card-for-items`
// while it was only a name, then knowledge v0.34.150 published `card` as a
// component and retired the alias target in the same refresh. The alias kept
// winning, so five pages linked a bare `[card](card)` to a page that existed.
// `tag` stands in here: it is aliased onto `tag-interactive` today, and the
// registry below publishes both, as a future refresh could.
test("rewriteComponentLinks: a published slug resolves to its own page even when an alias entry exists for it", function () {
  build({
    components: {
      tag: { category: "Data display", section: "Components", name: "Tag" },
      "tag-interactive": { category: "Data display", section: "Components", name: "Tag, interactive" },
      notification: { category: "Feedback", section: "Components", name: "Notification" },
    },
  });
  var out = renderMdx.escapeMdxPlaceholders("label it with a [tag](tag)");
  assert.match(out, /components\/data-display\/tag\//, "the slug's own page, not the alias target's");
  assert.doesNotMatch(out, /tag-interactive/, "the alias must not be consulted for a published slug");
  // The alias still serves a name with no page of its own.
  var aliased = renderMdx.escapeMdxPlaceholders("see [toast](global-toast)");
  assert.match(aliased, /components\/feedback\/notification\//, "global-toast has no page, so its alias target's page is the link");
  assert.match(aliased, />toast<\/a>/, "label preserved");
  // And the derive agrees: published guidance is not stranded, whatever its alias says.
  assert.deepEqual(renderMdx.deriveStrandedGuidelineSlugs(["tag", "tag-interactive"]), []);
  buildUsageWaveMap();
});

// The derive side of the same precedence, on the fixture that separates the
// two orders: `tag` published, its alias target `tag-interactive` absent. An
// alias-first derive strands `tag` here, and the resolver then drops every
// `[tag](tag)` link to a page that exists.
test("deriveStrandedGuidelineSlugs: a published slug is not stranded when its alias target is absent", function () {
  build({ components: { tag: { category: "Data display", section: "Components", name: "Tag" } } });
  assert.deepEqual(renderMdx.deriveStrandedGuidelineSlugs(["tag"]), []);
  buildUsageWaveMap();
});

// The derive strands the name that carries the doc. Through an alias that can
// be the KEY (target gone doc-and-all) or the TARGET (retired with its doc
// kept); the resolver asks both, so neither shape leaves a bare link.
test("rewriteComponentLinks: a link through an alias degrades when the key or the target is stranded", function () {
  build(USAGE_WAVE_REGISTRY); // neither `toggle-control` nor its target `toggle` has a page
  // The key carries the doc.
  renderMdx.setStrandedGuidelineSlugs(renderMdx.deriveStrandedGuidelineSlugs(["toggle-control"]));
  assert.deepEqual(renderMdx.getStrandedGuidelineSlugs(), ["toggle-control"]);
  assert.equal(renderMdx.escapeMdxPlaceholders("use a [toggle](toggle-control)"), "use a toggle");
  // The target carries the doc.
  renderMdx.setStrandedGuidelineSlugs(renderMdx.deriveStrandedGuidelineSlugs(["toggle"]));
  assert.deepEqual(renderMdx.getStrandedGuidelineSlugs(), ["toggle"]);
  assert.equal(renderMdx.escapeMdxPlaceholders("use a [toggle](toggle-control)"), "use a toggle");
  // Neither has a doc: nothing says this is dead guidance, so the validator sees it.
  renderMdx.setStrandedGuidelineSlugs([]);
  assert.match(renderMdx.escapeMdxPlaceholders("use a [toggle](toggle-control)"), /\[toggle\]\(toggle-control\)/);
});

// A registry entry the generator writes no page for (an icon) is not a link
// target, and it cannot hijack an alias that shares its name: `text-input ->
// input` sent 16 links to /foundations/icons/input/, a 404 the links validator
// cannot see because the href is emitted as JSX.
test("rewriteComponentLinks: a pageless registry entry is not a page and cannot shadow an alias", function () {
  build({
    components: {
      input: { category: "Icons", section: "Foundations", name: "Input" },
      tag: { category: "Icons", section: "Foundations", name: "Tag" },
      "tag-interactive": { category: "Data display", section: "Components", name: "Tag, interactive" },
    },
  });
  assert.equal(renderMdx.hasPage("input"), false);
  assert.match(renderMdx.escapeMdxPlaceholders("see [input](input)"), /\[input\]\(input\)/, "no page: left for the validator, not a 404 href");
  assert.match(renderMdx.escapeMdxPlaceholders("a [tag](tag)"), /components\/data-display\/tag-interactive\//, "the alias serves the name; the icon does not");
  assert.deepEqual(renderMdx.deriveStrandedGuidelineSlugs(["input"]), ["input"], "guidance for a pageless entry is stranded");
  buildUsageWaveMap();
});

// hasPage is an own-property lookup. `constructor` is a word that can appear
// as a link target in prose; a prototype-chain read returned Object's
// constructor as the "path" and the rewriter threw on `.replace`.
test("rewriteComponentLinks: a slug that is a JavaScript property name is prose, not a page", function () {
  buildUsageWaveMap();
  var s = "see [the constructor](constructor) here";
  assert.equal(renderMdx.escapeMdxPlaceholders(s), s, "must be left as authored, and must not throw");
  ["constructor", "hasOwnProperty", "toString"].forEach(function (slug) {
    assert.equal(renderMdx.hasPage(slug), false, slug);
  });
  assert.deepEqual(renderMdx.deriveStrandedGuidelineSlugs(["constructor"]), ["constructor"]);
});

// A page wins over the concept-slug removals too: should knowledge publish a
// component under one of those names, its cross-references link to it.
test("rewriteComponentLinks: a REMOVE_LINK_SLUGS slug with a page links to it", function () {
  var concept = renderMdx.getRemoveLinkSlugs()[0];
  var components = {};
  components[concept] = { category: "Patterns", section: "Components", name: concept };
  build({ components: components });
  var out = renderMdx.escapeMdxPlaceholders("see [it](" + concept + ")");
  assert.match(out, new RegExp("components/patterns/" + concept + "/"), "the page, not the removal");
  assert.deepEqual(renderMdx.deriveStrandedGuidelineSlugs([concept]), []);
  buildUsageWaveMap();
});

// The prebuild report for aliases whose target has no page. The remedy follows
// the key: with authored guidance of its own the key is stranded once the alias
// goes and its links degrade, so removing is safe; without it the links would
// reach the validator bare, so the only safe remedy is to repoint.
test("deriveDeadAliases: names each alias whose target has no page, with the remedy the key allows", function () {
  build(REGISTRY); // publishes no alias target, so every entry is dead
  var aliases = renderMdx.getSlugAliases();
  var keys = Object.keys(aliases).sort();
  var withDoc = keys[0];
  var lines = renderMdx.deriveDeadAliases([withDoc]);
  assert.deepEqual(
    lines.map(function (l) { return l.split(":")[0]; }),
    keys.map(function (k) { return k + " -> " + aliases[k]; }),
    "one line per dead entry, sorted by key",
  );
  lines.forEach(function (line) {
    var key = line.split(" -> ")[0];
    assert.match(line, /repoint it/, key);
    if (key === withDoc) assert.match(line, /remove it/, key + " has a doc, so removal is offered");
    else assert.doesNotMatch(line, /remove it/, key + " has no doc, so removal is not offered");
  });
  buildUsageWaveMap();
  assert.deepEqual(renderMdx.deriveDeadAliases([]).filter(function (l) { return /-> notification:/.test(l); }), [], "a target with a page is not dead");
});

test("getSlugAliases returns a frozen copy: the table is read-only to callers", function () {
  var a = renderMdx.getSlugAliases();
  assert.ok(Object.isFrozen(a));
  assert.notEqual(a, renderMdx.getSlugAliases(), "a fresh copy each call, never the live table");
});

test("buildSlugToPathMap refuses to run without the generator's writesPage rule", function () {
  assert.throws(
    function () {
      renderMdx.buildSlugToPathMap(REGISTRY, {}, { Components: "components" }, "components", slugifyCategory);
    },
    /writesPage\(entry\) is required/,
  );
  buildUsageWaveMap();
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
  build(CONTENT_PAGE_REGISTRY);
  // `multi-select` has authored guidance and no registry component, so in a real
  // build the derive supplies it. It used to sit in REMOVE_LINK_SLUGS by hand.
  renderMdx.setStrandedGuidelineSlugs(renderMdx.deriveStrandedGuidelineSlugs(["multi-select"]));
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

test("deriveStrandedGuidelineSlugs refuses to run before the slug→path map is built", function () {
  // Inverted silent failure: with an empty map every slug looks unresolvable, so
  // every component cross-link on the site would quietly degrade to plain text.
  renderMdx.setSlugToPathMap({});
  assert.throws(
    function () {
      renderMdx.deriveStrandedGuidelineSlugs(["search-filters"]);
    },
    /slug→path map is empty/,
    "must refuse rather than classify everything as stranded",
  );
  buildUsageWaveMap(); // restore state for any later test
});

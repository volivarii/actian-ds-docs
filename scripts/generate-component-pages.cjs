"use strict";

/**
 * generate-component-pages.cjs — Build-time generator for the 72
 * categorized DS Kit component pages.
 *
 * Reads:
 *   - vendor/components/dist/registries/dskit.json (322 components total;
 *     72 carry a `category` field)
 *   - vendor/components/dist/guidelines/<slug>.json (when present — the
 *     derived per-component multi-domain guideline objects; resolved via
 *     the manifest collection components.guidelineDoc.byKey)
 *
 * Writes:
 *   - src/content/docs/<section>/<category>/<slug>.mdx (one per categorized
 *     component; Starlight reads from src/content/docs/<dir>/)
 *
 * Uncategorized components (250) get NO page here — they're rendered on
 * /inventory only (Task 9).
 */

var fs = require("fs");
var path = require("path");
var PATHS = require("./lib/paths.cjs");
var loader = require("./lib/category-defaults-loader.cjs");
var { computeImportPrefix } = require("./lib/import-prefix.cjs");
var TABS = require(path.resolve(__dirname, "..", "src", "data", "component-tabs.config.json")).tabs;
var { escapeMdxIdentifiers } = require("./lib/mdx-escape.cjs");

// Canonical list of valid renderer keys. Must match the keys of the
// RENDERERS object built in buildComponent() below. Boot assertion (see
// validateRendererConfig()) ensures component-tabs.config.json never
// references a key absent from this list — silent-stub fallback was the
// root of a debugging session worth ~half a day.
var VALID_RENDERER_KEYS = new Set([
  "confidenceChips",
  "overview",
  "variantsSummary",
  "categoryUsageBaseline",
  "contentDomain",
  "anatomy",
  "motion",
  "a11yRefs",
  "globalA11yLink",
  "variantsTable",
  "tokensPlaceholder",
  "apiPlaceholder",
  "resources",
]);

function validateRendererConfig(tabs) {
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    if (!Array.isArray(tab.renderers)) {
      throw new Error(
        "component-tabs.config.json: tab '" + tab.slug + "' is missing 'renderers' array"
      );
    }
    for (var j = 0; j < tab.renderers.length; j++) {
      var key = tab.renderers[j];
      if (!VALID_RENDERER_KEYS.has(key)) {
        throw new Error(
          "component-tabs.config.json: tab '" + tab.slug +
          "' references unknown renderer '" + key +
          "' (valid: " + Array.from(VALID_RENDERER_KEYS).sort().join(", ") + ")"
        );
      }
    }
  }
}

var Ajv = require("ajv");
var COMPONENT_TABS_SCHEMA = require(path.resolve(__dirname, "..", "src", "data", "component-tabs.config.schema.json"));

function validateTabsConfigShape(config) {
  var ajv = new Ajv({ allErrors: true });
  var validate = ajv.compile(COMPONENT_TABS_SCHEMA);
  if (!validate(config)) {
    var errors = validate.errors.map(function (e) {
      return "  - " + (e.instancePath || "<root>") + ": " + e.message;
    }).join("\n");
    throw new Error(
      "component-tabs.config.json failed schema validation:\n" + errors
    );
  }
}

// Load the full config (not just .tabs) so the schema can see the root shape.
var FULL_CONFIG = require(path.resolve(__dirname, "..", "src", "data", "component-tabs.config.json"));
validateTabsConfigShape(FULL_CONFIG);

validateRendererConfig(TABS);

// ζ.5 follow-up (2026-05-13): output is now section-aware. Components,
// Foundations, and Brand items each land in their own top-level directory
// under src/content/docs/, mirroring Figma's section organization (per
// Vincent's "mimic Figma page structure" goal). Sidebar autogenerate per
// directory in astro.config.mjs.
var DOCS_ROOT = path.resolve(__dirname, "..", "src", "content", "docs");
var SECTION_DIRS = {
  Components: "components",
  Foundations: "foundations",
  "Brand Assets": "brand",
};
// Default for entries without a section field (e.g., fmkit/metakit syncs).
var DEFAULT_SECTION_DIR = "components";

function slugifyCategory(label) {
  return loader.normalizeCategorySlug(label);
}

function jsLit(value) {
  // Safely embed a JS-object literal into MDX. JSON.stringify produces
  // a valid JS expression for the shapes we render (arrays of objects
  // with string values + nested string arrays).
  return JSON.stringify(value);
}

// Module-level slug-to-absolute-path map.
// Populated once in main() from the registry before any pages are written.
// Used by rewriteComponentLinks() to fix bare-slug markdown links that come
// from the knowledge-repo guideline JSONs (e.g. `[ghost buttons](button)`).
var _slugToPath = {};

/**
 * Build the slug → absolute doc path map from the registry.
 * Called once in main() so all renderContentItems() calls can use it.
 * @param {Object} registry - dskit.json parsed object
 * @param {Object} groupCounts - { "catSlug::groupSlug": count } from main()
 */
function buildSlugToPathMap(registry, groupCounts) {
  var map = {};
  Object.entries(registry.components).forEach(function (pair) {
    var slug = pair[0];
    var entry = pair[1];
    if (!entry.category) return;
    var sd = SECTION_DIRS[entry.section] || DEFAULT_SECTION_DIR;
    var catSlug = slugifyCategory(entry.category);
    var parts = [sd, catSlug];
    if (entry.group) {
      var groupSlug = slugifyCategory(entry.group);
      var key = catSlug + "::" + groupSlug;
      if (groupSlug && groupCounts[key] > 1) {
        parts.push(groupSlug);
      }
    }
    parts.push(slug);
    map[slug] = "/" + parts.join("/") + "/";
  });
  _slugToPath = map;
}

// Slug aliases: knowledge-repo content uses legacy or shorthand names that
// differ from the canonical registry slugs. Map the knowledge alias → the
// canonical dskit.json slug so rewriteComponentLinks() can resolve the path.
// "forms" is intentionally absent: no standalone component page exists, so
// the link is removed entirely (see the REMOVE_LINK_SLUGS set below).
var SLUG_ALIASES = {
  "notification-toast": "notification",  // alert-banner.json references old name
  "tag": "tag-interactive",              // tag-default.json links to generic "tag"
};

// Slugs with no component page that should have their markdown link syntax
// removed entirely, leaving just the link text. This prevents both broken
// links and relative-link validator errors.
var REMOVE_LINK_SLUGS = new Set(["forms"]);

/**
 * Rewrite bare-slug markdown links to absolute doc paths.
 * Converts `[label](slug)` to `[label](/components/category/slug/)`
 * when `slug` is a known component. Unknown slugs are left untouched
 * so the validator can still flag genuinely broken links.
 * @param {string} s - input markdown/MDX text
 * @returns {string}
 */
function rewriteComponentLinks(s) {
  if (typeof s !== "string") return s;
  // Match markdown link targets that look like a bare slug (no / prefix,
  // no http://, not a hash anchor). Must be followed by ) to close the link.
  return s.replace(/\[([^\]]+)\]\(([a-z][a-z0-9-]*)\)/g, function (match, label, slug) {
    // Remove link syntax entirely for slugs with no component page.
    if (REMOVE_LINK_SLUGS.has(slug)) return label;
    // Resolve via alias first, then direct slug lookup.
    var canonical = SLUG_ALIASES[slug] || slug;
    var abs = _slugToPath[canonical];
    return abs ? ("[" + label + "](" + abs + ")") : match;
  });
}

// Wrap <placeholder> spans in code ticks so MDX doesn't try to parse them
// as JSX tags. Knowledge content uses '<assetNames>'-style placeholders in
// rule prose ("Search in <assetNames>"); without this, MDX bails on
// "Expected a closing tag for `<assetNames>`".
function escapeMdxPlaceholders(s) {
  if (typeof s !== "string") return s;
  // Step 1: link rewriting (component-specific — bare slug → absolute path).
  s = rewriteComponentLinks(s);
  // Step 2: angle-bracket escape (shared via lib/mdx-escape.cjs).
  return escapeMdxIdentifiers(s);
}

// Render a { headers, rows } table as a GitHub-flavored markdown table.
// All-empty rows are dropped: the upstream guideline-md-parser can leave a
// trailing ["", ""] artifact row when a source table is followed by a
// Jekyll `{: .do-dont-table}` annotation line — rendering it would produce
// a stray blank row in the docs table.
function renderMarkdownTable(headers, rows) {
  var esc = function (c) {
    return escapeMdxPlaceholders(String(c == null ? "" : c)).replace(/\|/g, "\\|");
  };
  var nonEmptyRows = (rows || []).filter(function (row) {
    return (row || []).some(function (c) {
      return c != null && String(c).trim() !== "";
    });
  });
  var lines = [];
  lines.push("| " + headers.map(esc).join(" | ") + " |");
  lines.push("|" + headers.map(function () { return "---"; }).join("|") + "|");
  nonEmptyRows.forEach(function (row) {
    lines.push("| " + (row || []).map(esc).join(" | ") + " |");
  });
  return lines.join("\n");
}

// content[] items come from the knowledge repo's guideline-md-parser in
// these shapes (current schema; see actian-ds-knowledge/schemas/guideline-
// component.json $defs.contentItem):
//
//   - { prose: string }                       ← standalone paragraph
//   - { bullets: [strings] }                  ← one markdown list
//   - { note: string }                        ← blockquote (opt-in callout)
//   - { do, dont } | { do } | { dont }        ← do/don't table rows or solos
//   - { term, rule|definition }               ← terminology table rows
//   - { table: { headers, rows } }            ← generic table
//   - { example } | { examples: [strings] }   ← code/example blocks
//   - string                                  ← LEGACY bullet (pre-prose
//                                               parser); kept for backwards
//                                               compatibility with old JSON
//
// Items appear in authored source order. We walk them once and emit in that
// same order. The only "bucketing" is collapsing CONSECUTIVE same-type runs
// into one compound component:
//   - consecutive {do,dont} pairs collapse into one <DoDont pairs={[...]}>
//   - consecutive terminology rows collapse into one <TermList items={[...]}>
//   - consecutive legacy strings (or solos like all dos, all donts) collapse
//     into one block
// Different types adjacent to each other emit as separate blocks, preserving
// authored order. This matches universal precedent (Primer, Polaris, Carbon,
// Starlight, Markdoc): the renderer never reorders blocks within a section.
function renderContentItems(items, headingForDiag) {
  if (!items || !items.length) return "";

  function isPair(it) { return it && typeof it === "object" && it.do && it.dont; }
  function isSoloDo(it) {
    return it && typeof it === "object" && it.do && !it.dont;
  }
  function isSoloDont(it) {
    return it && typeof it === "object" && it.dont && !it.do;
  }
  function isTerm(it) { return it && typeof it === "object" && it.term; }
  function isLegacyBullet(it) { return typeof it === "string"; }

  // Greedy: from index `i`, collect a contiguous run for which predicate(it)
  // is true. Returns { items: [...], next: index-past-the-run }.
  function takeRun(arr, i, predicate) {
    var run = [];
    var j = i;
    while (j < arr.length && predicate(arr[j])) { run.push(arr[j]); j++; }
    return { items: run, next: j };
  }

  function renderDoDontPairs(pairs) {
    var pairsJsx = pairs.map(function (p) {
      return "{ do: " + JSON.stringify(escapeMdxPlaceholders(p.do))
        + ", dont: " + JSON.stringify(escapeMdxPlaceholders(p.dont)) + " }";
    }).join(", ");
    return "<DoDont pairs={[" + pairsJsx + "]} />";
  }

  function renderTermList(rows) {
    var jsx = rows.map(function (t) {
      var def = t.definition || t.rule;
      return "{ term: " + JSON.stringify(escapeMdxPlaceholders(t.term))
        + (def ? ", definition: " + JSON.stringify(escapeMdxPlaceholders(def)) : "")
        + " }";
    }).join(", ");
    return "<TermList items={[" + jsx + "]} />";
  }

  function renderBullets(strings) {
    return strings.map(function (s) {
      return "- " + escapeMdxPlaceholders(s);
    }).join("\n");
  }

  function renderCallout(text) {
    return "<Callout variant=\"note\">\n" + escapeMdxPlaceholders(text) + "\n</Callout>";
  }

  var parts = [];
  var unknown = [];
  var i = 0;
  while (i < items.length) {
    var it = items[i];

    // Consecutive runs that collapse into one compound component.
    if (isPair(it)) {
      var run = takeRun(items, i, isPair);
      parts.push(renderDoDontPairs(run.items));
      i = run.next; continue;
    }
    if (isTerm(it)) {
      var trun = takeRun(items, i, isTerm);
      parts.push(renderTermList(trun.items));
      i = trun.next; continue;
    }
    if (isLegacyBullet(it)) {
      // Collapse consecutive legacy bullet strings into one <ul>. Newer JSON
      // uses {bullets:[...]} so each list is already a unit.
      var brun = takeRun(items, i, isLegacyBullet);
      parts.push(renderBullets(brun.items));
      i = brun.next; continue;
    }
    if (isSoloDo(it)) {
      var drun = takeRun(items, i, isSoloDo);
      parts.push(drun.items.map(function (x) {
        return "<DoDont do={" + JSON.stringify(escapeMdxPlaceholders(x.do)) + "} />";
      }).join("\n\n"));
      i = drun.next; continue;
    }
    if (isSoloDont(it)) {
      var xrun = takeRun(items, i, isSoloDont);
      parts.push(xrun.items.map(function (x) {
        return "<DoDont dont={" + JSON.stringify(escapeMdxPlaceholders(x.dont)) + "} />";
      }).join("\n\n"));
      i = xrun.next; continue;
    }

    // Single-item shapes — emit in source order, no run collapsing.
    if (it && typeof it === "object") {
      if (Array.isArray(it.bullets)) {
        parts.push(renderBullets(it.bullets));
        i++; continue;
      }
      if (typeof it.prose === "string") {
        parts.push(escapeMdxPlaceholders(it.prose));
        i++; continue;
      }
      if (typeof it.note === "string") {
        parts.push(renderCallout(it.note));
        i++; continue;
      }
      if (it.table && Array.isArray(it.table.headers)) {
        parts.push(renderMarkdownTable(it.table.headers, it.table.rows));
        i++; continue;
      }
      if (Array.isArray(it.examples) || typeof it.examples === "string") {
        var ex = Array.isArray(it.examples) ? it.examples : [it.examples];
        parts.push("**Examples:** " + ex.map(function (e) { return "`" + e + "`"; }).join(", "));
        i++; continue;
      }
      if (typeof it.example === "string") {
        parts.push("**Example:** `" + it.example + "`");
        i++; continue;
      }
      if (typeof it.rule === "string") {
        // Bare {rule} (no do/dont/term sibling) — treat as prose.
        parts.push(escapeMdxPlaceholders(it.rule));
        i++; continue;
      }
      unknown.push(it);
    }
    i++;
  }

  if (unknown.length) {
    process.stderr.write("[generate] WARNING: unknown content item shape(s) in section '"
      + (headingForDiag || "") + "': " + JSON.stringify(unknown) + "\n");
  }

  return parts.join("\n\n");
}

// Render one domains.content section: an H3 heading (skipped when empty —
// the parser emits an untitled lead section before the first heading) plus
// its content[], plus one reserved level of `subsections` (H4).
function renderContentSection(s) {
  var parts = [];
  if (s.heading) parts.push("### " + s.heading);
  var body = renderContentItems(s.content, s.heading);
  if (body) parts.push(body);
  (s.subsections || []).forEach(function (sub) {
    if (sub.subheading) parts.push("#### " + sub.subheading);
    var subBody = renderContentItems(sub.content, sub.subheading);
    if (subBody) parts.push(subBody);
  });
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Named render helpers — extracted from the original buildPage body so that
// buildComponent can dispatch them individually by tab config.
// Each helper returns "" when its inputs are absent (stub case).
// ---------------------------------------------------------------------------

function renderOverview(entry) {
  var overviewText = (entry.description && entry.description.trim()) || "";
  if (!overviewText) return "";
  return "## Overview\n\n" + escapeMdxPlaceholders(overviewText);
}

function renderAnatomy(defaults) {
  if (!(defaults && defaults.card_anatomy && Array.isArray(defaults.card_anatomy.parts) && defaults.card_anatomy.parts.length)) return "";
  return "## Anatomy\n\n<Anatomy parts={" + jsLit(defaults.card_anatomy.parts) + "} />";
}

function renderVariantsMatrix(entry, defaults) {
  if (entry.variants && Object.keys(entry.variants).length) {
    var axes = Object.entries(entry.variants).map(function (pair) {
      return { axis: pair[0], values: pair[1] };
    });
    return "## Variants\n\n<VariantMatrix variantAxes={" + jsLit(axes) + "} />";
  }
  if (defaults && defaults.card_component && Array.isArray(defaults.card_component.variantAxes) && defaults.card_component.variantAxes.length) {
    return "## Variants\n\n<VariantMatrix variantAxes={" + jsLit(defaults.card_component.variantAxes) + "} />";
  }
  return "";
}

// Alias — used by the "code" tab's variantsTable renderer key.
function renderVariantsTable(entry, defaults) {
  return renderVariantsMatrix(entry, defaults);
}

function renderMotion(defaults) {
  if (!(defaults && defaults.card_motion && Array.isArray(defaults.card_motion.patternRefs))) return "";
  return "## Motion\n\n<MotionPattern patternRefs={" + jsLit(defaults.card_motion.patternRefs) + "} />";
}

function renderContentDomain(contentDomain) {
  if (!contentDomain) return "";
  return "## Content guidelines\n\n" + contentDomain.sections.map(renderContentSection).join("\n\n");
}

function renderA11yRefs(defaults) {
  if (!(defaults && defaults.card_accessibility && Array.isArray(defaults.card_accessibility.requirementRefs))) return "";
  return "## Accessibility\n\n<AccessibilityRefs requirementRefs={" + jsLit(defaults.card_accessibility.requirementRefs) + "} />";
}

function renderConfidenceChips(defaults, contentDomain) {
  if (!defaults || !defaults.confidence) return "";
  var contentConfidence = "low";
  if (contentDomain && contentDomain.status === "approved") contentConfidence = "high";
  else if (contentDomain && contentDomain.status === "draft") contentConfidence = "medium";
  var merged = Object.assign({}, defaults.confidence, { content: contentConfidence });
  var chips = Object.entries(merged).map(function (kv) {
    return '<span class={`confidence-chip confidence-chip--' + kv[1] + '`}>'
      + '<span class="confidence-chip__field">' + kv[0] + '</span>'
      + '<span>' + kv[1] + '</span>'
      + '</span>';
  }).join("\n  ");
  return '<div class="confidence-row">\n  <span class="confidence-row__label">Confidence</span>\n  ' + chips + '\n</div>';
}

function renderResources(slug, entry, registry, guideline) {
  var figmaUrl = (entry.nodeId && registry && registry.fileKey)
    ? "https://www.figma.com/file/" + registry.fileKey + "?node-id=" + String(entry.nodeId).replace(":", "-")
    : null;
  if (!figmaUrl && !guideline) return "";
  var resourceLines = [
    "## Resources",
    "",
  ];
  if (figmaUrl) resourceLines.push("- [Open in Figma](" + figmaUrl + ")");
  if (guideline) {
    var knowledgeUrl = "https://github.com/volivarii/actian-ds-knowledge/tree/main/components/src/" + slug;
    resourceLines.push("- [Knowledge source](" + knowledgeUrl + ")");
  }
  return resourceLines.join("\n");
}

function renderStubFooter(categorySlug) {
  if (!categorySlug) return "";
  return '<StubFooter category="' + categorySlug + '" />';
}

// ---------------------------------------------------------------------------
// Small placeholder helpers for tabs that have no real data yet.
// ---------------------------------------------------------------------------

function renderCategoryUsageBaseline(defaults) {
  if (!defaults || !defaults.card_usage || !Array.isArray(defaults.card_usage.points)) return "";
  return "## When to use\n\n" + defaults.card_usage.points
    .map(function (p) { return "- " + escapeMdxPlaceholders(p); }).join("\n");
}

function renderGlobalA11yLink() {
  var base = "${import.meta.env.BASE_URL.replace(/\\/?$/, '/')}";
  return "## Cross-cutting accessibility\n\nSee the full <a href={`" + base + "accessibility`}>WCAG 2.2 AA guidance</a> for criteria that apply to every component.";
}

function renderTokensPlaceholder() {
  return "## Tokens\n\nPer-component token documentation pending. See the <a href={`${import.meta.env.BASE_URL.replace(/\\/?$/, '/')}foundations/color`}>foundations tokens</a> for the full scale.";
}

function renderApiPlaceholder(entry) {
  if (!entry.variants) return "";
  return "## API surface\n\nVariant axes are listed under Variants above. Public properties are defined in the registry at `components/dist/registries/dskit.json#" + (entry.name || "") + "`.";
}

// ---------------------------------------------------------------------------
// renderTabMdx — per-file frontmatter + MDX shell.
// ---------------------------------------------------------------------------

function renderTabMdx(ctx) {
  var fm = [
    "---",
    "title: " + JSON.stringify(ctx.title),
    "description: " + JSON.stringify(ctx.description),
    "template: doc",
    "tab: " + JSON.stringify(ctx.tabSlug),
    "component: " + JSON.stringify(ctx.slug),
    "status: " + JSON.stringify(ctx.status),
  ];
  if (!ctx.isIndex) {
    fm.push("sidebar: { hidden: true }");
  }
  fm.push("---");

  var imports = [
    "Anatomy", "VariantMatrix", "MotionPattern", "AccessibilityRefs",
    "PageMetadata", "StubFooter", "DoDont", "Callout", "TermList",
    "ComponentTabs",
  ].map(function (name) {
    return 'import ' + name + ' from "' + ctx.importPrefix + "/" + name + '.astro";';
  }).join("\n");

  return [
    fm.join("\n"),
    "",
    imports,
    "",
    "<PageMetadata",
    '  slug="components.' + ctx.slug + '.' + ctx.tabSlug + '"',
    '  source="components/dist/registries/dskit.json#' + ctx.slug + '"',
    "  schema={1}",
    "/>",
    "",
    "<ComponentTabs component={" + JSON.stringify(ctx.slug) + "} activeTab={" + JSON.stringify(ctx.tabSlug) + "} />",
    "",
    ctx.body,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// buildComponent — new top-level export. Returns { files: { [relPath]: string } }
// (testable without fs writes).
// ---------------------------------------------------------------------------

function buildComponent(slug, entry, guideline, defaults, registry, opts) {
  opts = opts || {};
  var nestDepth = opts.nestDepth || 0;
  // Tab MDX files live one level deeper than the legacy flat layout:
  // src/content/docs/<section>/<category>/<slug>/<tab>.mdx
  // → import paths need +1 "../" vs old (4 → 5; nested +1 again → 6).
  // Use path.relative so the count is derived from real paths rather than
  // a magic constant that can silently break if the emit-path structure changes.
  var representativeEmit = nestDepth === 0
    ? path.join(DOCS_ROOT, "components", "_cat", "_slug", "index.mdx")
    : path.join(DOCS_ROOT, "components", "_cat", "_group", "_slug", "index.mdx");
  var importPrefix = computeImportPrefix(
    representativeEmit,
    path.join(__dirname, "..", "src", "components")
  );

  var contentDomain = guideline && guideline.domains && guideline.domains.content;
  var hasContent = !!(contentDomain
    && Array.isArray(contentDomain.sections)
    && (contentDomain.status === "approved" || contentDomain.status === "draft"));
  var categorySlug = slugifyCategory(entry.category);

  var RENDERERS = {
    confidenceChips:       function () { return renderConfidenceChips(defaults, contentDomain); },
    overview:              function () { return renderOverview(entry); },
    variantsSummary:       function () { return renderVariantsMatrix(entry, defaults); },
    categoryUsageBaseline: function () { return renderCategoryUsageBaseline(defaults); },
    contentDomain:         function () { return hasContent ? renderContentDomain(contentDomain) : ""; },
    anatomy:               function () { return renderAnatomy(defaults); },
    motion:                function () { return renderMotion(defaults); },
    a11yRefs:              function () { return renderA11yRefs(defaults); },
    globalA11yLink:        function () { return renderGlobalA11yLink(); },
    variantsTable:         function () { return renderVariantsTable(entry, defaults); },
    tokensPlaceholder:     function () { return renderTokensPlaceholder(); },
    apiPlaceholder:        function () { return renderApiPlaceholder(entry); },
    resources:             function () { return renderResources(slug, entry, registry, guideline); },
  };

  var files = {};
  TABS.forEach(function (tab) {
    var body = tab.renderers
      .map(function (r) {
          if (!RENDERERS[r]) {
            // Should be unreachable — validateRendererConfig(TABS) at module-top
            // catches unknown keys. Throw rather than silently emit an empty
            // string in case the config is mutated at runtime.
            throw new Error("internal: unknown renderer '" + r + "' (config validator should have caught this)");
          }
          return RENDERERS[r]();
        })
      .filter(function (s) { return s && s.trim() !== ""; })
      .join("\n\n");

    var isStubTab = body.trim() === "";
    if (isStubTab && categorySlug) {
      body = renderStubFooter(categorySlug);
    }

    var tabStatus = "stub";
    if (tab.domains.length === 0) {
      tabStatus = isStubTab ? "stub" : "synthesized";
    } else {
      var domStatuses = tab.domains
        .map(function (d) { return guideline && guideline.domains && guideline.domains[d] && guideline.domains[d].status; })
        .filter(Boolean);
      if (domStatuses.indexOf("approved") !== -1) tabStatus = "approved";
      else if (domStatuses.indexOf("draft") !== -1) tabStatus = "draft";
      else if (domStatuses.indexOf("inherited") !== -1) tabStatus = "inherited";
    }

    var filename = tab.isIndex ? "index.mdx" : (tab.slug + ".mdx");
    files[filename] = renderTabMdx({
      title: entry.name || slug,
      description: (entry.description && entry.description.trim())
        || ("Component documentation for " + (entry.name || slug) + " — " + tab.label + "."),
      isIndex: !!tab.isIndex,
      importPrefix: importPrefix,
      slug: slug,
      tabSlug: tab.slug,
      tabLabel: tab.label,
      status: tabStatus,
      body: body,
    });
  });
  return { files: files };
}

// ---------------------------------------------------------------------------
// buildSidebarManifest — generates the components-sidebar.json consumed by
// astro.config.mjs. Replaces autogenerate to avoid the directory+index.mdx
// duplication that occurs with the sub-route tabs architecture.
// ---------------------------------------------------------------------------

function buildSidebarManifest(registry, opts) {
  opts = opts || {};
  var excludedCategories = opts.excludedCategories || new Set();
  var collectionCategories = opts.collectionCategories || new Set();
  var targetSection = opts.targetSection || "components";

  // Pre-compute groupCounts so we can reproduce the nesting logic.
  var groupCounts = {};
  Object.entries(registry.components).forEach(function (pair) {
    var e = pair[1];
    if (!e.category || !e.group) return;
    if (excludedCategories.has(e.category)) return;
    if (collectionCategories.has(e.category)) return;
    var sd = SECTION_DIRS[e.section] || DEFAULT_SECTION_DIR;
    if (sd !== targetSection) return;
    var cs = slugifyCategory(e.category);
    var gs = slugifyCategory(e.group);
    if (!cs || !gs) return;
    groupCounts[cs + "::" + gs] = (groupCounts[cs + "::" + gs] || 0) + 1;
  });

  // category label → { label, items[] }
  var catMap = {};

  Object.entries(registry.components).forEach(function (pair) {
    var slug = pair[0];
    var entry = pair[1];
    if (!entry.category) return;
    if (excludedCategories.has(entry.category)) return;
    if (collectionCategories.has(entry.category)) return;
    var sd = SECTION_DIRS[entry.section] || DEFAULT_SECTION_DIR;
    if (sd !== targetSection) return;

    var catSlug = slugifyCategory(entry.category);
    var parts = [targetSection, catSlug];
    var nested = false;
    var groupLabel = null;
    if (entry.group) {
      var groupSlug = slugifyCategory(entry.group);
      var key = catSlug + "::" + groupSlug;
      if (groupSlug && groupCounts[key] > 1) {
        parts.push(groupSlug);
        nested = true;
        groupLabel = entry.group;
      }
    }
    parts.push(slug);
    var link = "/" + parts.join("/") + "/";

    if (!catMap[entry.category]) {
      catMap[entry.category] = {
        label: entry.category,
        catSlug: catSlug,
        items: [],
        groups: {}, // groupLabel → { label, items[] }
      };
    }
    var leaf = { label: entry.name || slug, link: link };
    if (nested) {
      // Wrap into a group subnode so the sidebar mirrors the URL structure
      // (and the old Starlight-autogenerate filesystem-based nesting that
      // was lost when buildSidebarManifest replaced autogenerate).
      if (!catMap[entry.category].groups[groupLabel]) {
        catMap[entry.category].groups[groupLabel] = { label: groupLabel, items: [] };
      }
      catMap[entry.category].groups[groupLabel].items.push(leaf);
    } else {
      catMap[entry.category].items.push(leaf);
    }
  });

  // Sort categories alphabetically; within each category interleave group
  // subnodes and flat items A-Z by label, so the sidebar reads as one
  // consistent list whether an entry is a single component or a
  // collapsible group.
  var categories = Object.values(catMap);
  categories.sort(function (a, b) { return a.label.localeCompare(b.label); });
  return categories.map(function (cat) {
    var groupNodes = Object.values(cat.groups || {}).map(function (g) {
      g.items.sort(function (a, b) { return a.label.localeCompare(b.label); });
      return { label: g.label, collapsed: true, items: g.items };
    });
    var merged = cat.items.concat(groupNodes);
    merged.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return { label: cat.label, collapsed: true, items: merged };
  });
}

function main() {
  var registryPath = PATHS.components.registries.dskit;
  var registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  // Phase 4b.2: per-component guideline JSONs now come from the derived
  // components/dist/guidelines/<slug>.json layer (the new multi-domain
  // shape), resolved via the manifest collection. The legacy scraped
  // components/src/guidelines/*.json layer is no longer read.
  var guidelineFor = PATHS.components.guidelineDoc.byKey;

  // Ensure each section root exists. Generator writes per-category dirs
  // under each section root. Tracked content lives:
  //   - foundations/*.mdx (root-level token pages — pre-existing)
  //   - components/<cat>/index.mdx (category overview pages — tracked)
  //   - brand/ (no tracked content yet — fully generator-output)
  Object.values(SECTION_DIRS).forEach(function (sd) {
    var dir = path.join(DOCS_ROOT, sd);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });

  loader._resetCache();

  // ζ.2 follow-up (2026-05-13): exclude scratchpad / non-public categories
  // from docs publication. The knowledge registry is the canonical SoT and
  // carries everything (plugin + MCP need the full picture); docs is a
  // CURATED PRESENTATION SUBSET. Excluded categories are skipped at
  // generation time — entries don't get MDX pages and don't appear in the
  // sidebar.
  //
  // Add to this set if the design team introduces a new working/private
  // category in Figma that shouldn't be published. Sections (top-level
  // Figma markers) could become a coarser knob later; per-category is
  // sufficient today.
  var EXCLUDED_CATEGORIES = new Set([
    // Figma scratchpad / internal-only — never publish
    "Local components",
    "White-label services",
    // ζ.6 (2026-05-13) — categories whose auto-generated content is
    // either entirely covered by a tracked hand-curated page OR is
    // empty/stub-only and adds noise to the sidebar:
    //   - "Breakpoint, grid & structure": foundations/breakpoints.mdx
    //     (tracked) already covers breakpoints with the token table +
    //     authoritative grid description; the registry's grid components
    //     (L/M/S/XL/XS grids) are Figma layout visualizations, not
    //     separately documentable.
    //   - "Content guidelines": the top-level /content link in the
    //     sidebar (sourced from content/dist/global.md) is the
    //     canonical place; the registry's single auto-stub item
    //     ("Content Checklist") was empty.
    "Breakpoint, grid & structure",
    "Content guidelines",
  ]);

  // ζ.5 (2026-05-13): collection-mode categories. Per-component MDX
  // generation is SKIPPED for these — the category instead renders as a
  // SINGLE inline-grid page (src/content/docs/categories/<slug>.mdx,
  // tracked manually). Use for categories where individual pages add no
  // value over a grouped grid view.
  //
  // Today: Icons (234 entries; the docs sidebar can't fit 234 nodes; an
  // <IconGrid> with semantic-group headers is the right UI). Future
  // candidates: Product logos, Illustrations, Color/spacing tokens.
  var COLLECTION_CATEGORIES = new Set(["Icons"]);

  // ζ.5 follow-up: pre-pass to compute the set of <section>/<category>
  // dirs we'll write to in this run, keyed by absolute path. Used for
  // two cleanup behaviors:
  //   1. Orphan sweep: remove any existing category subdir under a
  //      section root that isn't in this run's expected set (handles
  //      stale dirs from prior generator runs that placed Foundations/
  //      Brand items under components/).
  //   2. Per-dir lazy clean: wipe non-index.mdx files + subdirs inside
  //      each expected category dir before writing fresh content.
  var expectedCategoryDirs = new Set();
  Object.entries(registry.components).forEach(function (pair) {
    var e = pair[1];
    if (!e.category) return;
    if (EXCLUDED_CATEGORIES.has(e.category)) return;
    if (COLLECTION_CATEGORIES.has(e.category)) return;
    var sd = SECTION_DIRS[e.section] || DEFAULT_SECTION_DIR;
    var cd = path.join(DOCS_ROOT, sd, slugifyCategory(e.category));
    expectedCategoryDirs.add(cd);
  });

  // Orphan sweep: walk each section root, delete any immediate subdir
  // that isn't in expectedCategoryDirs. Preserves root-level tracked
  // files (foundations/color.mdx etc.) since we only descend into dirs.
  Object.values(SECTION_DIRS).forEach(function (sd) {
    var sectionRoot = path.join(DOCS_ROOT, sd);
    if (!fs.existsSync(sectionRoot)) return;
    fs.readdirSync(sectionRoot, { withFileTypes: true }).forEach(function (entry) {
      if (!entry.isDirectory()) return;
      var dir = path.join(sectionRoot, entry.name);
      if (!expectedCategoryDirs.has(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // Per-dir lazy clean: tracked across the main loop so we wipe each
  // expected category dir only once, on first write. Removes non-index
  // .mdx + all nested subdirs. Sub-route layout (2026-05-16): each
  // component then re-creates its own <slug>/ subdir containing six tab
  // MDX files — so the wipe-then-write order is intentional.
  var cleanedCategoryDirs = new Set();
  function cleanCategoryDirOnce(categoryDir) {
    if (cleanedCategoryDirs.has(categoryDir)) return;
    cleanedCategoryDirs.add(categoryDir);
    if (!fs.existsSync(categoryDir)) return;
    var entries = fs.readdirSync(categoryDir, { withFileTypes: true });
    entries.forEach(function (entry) {
      var p = path.join(categoryDir, entry.name);
      if (entry.isDirectory()) {
        fs.rmSync(p, { recursive: true, force: true });
      } else if (entry.isFile() && entry.name !== "index.mdx") {
        fs.rmSync(p, { force: true });
      }
    });
  }

  // Count components per (categorySlug, groupSlug) so we can decide whether
  // to nest. The `group` field is populated by knowledge v0.7.0+; absent on
  // older vendor snapshots — in which case nestedGroups stays empty and the
  // generator behaves identically to pre-ζ.2 (flat layout). No regression
  // for consumers still on v0.6.x.
  //
  // Nesting rule: nest under <group-slug>/ ONLY when 2+ components share
  // the (category, group) tuple. Solo components keep the flat layout —
  // a "Button" page wouldn't be served by being nested inside a
  // single-child "Button" folder.
  var groupCounts = {};
  Object.entries(registry.components).forEach(function (pair) {
    var e = pair[1];
    if (!e.category || !e.group) return;
    if (EXCLUDED_CATEGORIES.has(e.category)) return;
    if (COLLECTION_CATEGORIES.has(e.category)) return;
    var cs = slugifyCategory(e.category);
    var gs = slugifyCategory(e.group);
    if (!cs || !gs) return;
    var key = cs + "::" + gs;
    groupCounts[key] = (groupCounts[key] || 0) + 1;
  });

  // Build the slug → absolute-path lookup before the write loop so that
  // rewriteComponentLinks() (called inside escapeMdxPlaceholders) can convert
  // bare-slug markdown links in guideline JSON content to absolute doc paths.
  buildSlugToPathMap(registry, groupCounts);

  var written = 0;
  var skipped = 0;
  var excluded = 0;
  var collection = 0;
  var nested = 0;
  Object.entries(registry.components).forEach(function (pair) {
    var slug = pair[0];
    var entry = pair[1];
    if (!entry.category) { skipped++; return; }
    if (EXCLUDED_CATEGORIES.has(entry.category)) {
      excluded++;
      return;
    }
    if (COLLECTION_CATEGORIES.has(entry.category)) {
      // Rendered inline via the category's collection MDX
      // (src/content/docs/categories/<slug>.mdx) — no per-component MDX.
      collection++;
      return;
    }

    var guidelinePath = guidelineFor(slug);
    var guideline = null;
    if (fs.existsSync(guidelinePath)) {
      try {
        guideline = JSON.parse(fs.readFileSync(guidelinePath, "utf8"));
      } catch (err) {
        process.stderr.write("[generate] WARNING: couldn't parse " + guidelinePath + " — " + err.message + "\n");
      }
    }

    var defaults = loader.loadDefaultsForCategory(entry.category);

    // ζ.5 follow-up: route per-section. Foundations items go to
    // foundations/<category>/<slug>.mdx, Brand items to
    // brand/<category>/<slug>.mdx, Components items stay at
    // components/<category>/<slug>.mdx. Falls back to components/ for
    // entries without a section (legacy data / fmkit-metakit syncs).
    var sectionDir = SECTION_DIRS[entry.section] || DEFAULT_SECTION_DIR;
    var sectionRoot = path.join(DOCS_ROOT, sectionDir);
    var categorySlug = slugifyCategory(entry.category);
    var categoryDir = path.join(sectionRoot, categorySlug);
    if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });
    // Lazy-clean per category dir on first visit so subsequent slugs
    // in the same category write into a clean slate.
    cleanCategoryDirOnce(categoryDir);

    // ζ.2: nest under <group-slug>/ when 2+ components share the group.
    // Tag's 9 variants land in data-display/tag-identification-key/ so
    // Starlight's autogenerate produces one collapsible sidebar node
    // instead of 9 flat siblings.
    var outDir = categoryDir;
    var nestDepth = 0;
    if (entry.group) {
      var groupSlug = slugifyCategory(entry.group);
      var groupKey = groupSlug ? (categorySlug + "::" + groupSlug) : null;
      if (groupKey && groupCounts[groupKey] > 1) {
        outDir = path.join(categoryDir, groupSlug);
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        nestDepth = 1;
        nested++;
      }
    }

    var out = buildComponent(slug, entry, guideline, defaults, registry, { nestDepth: nestDepth });
    var compDir = path.join(outDir, slug);
    if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
    Object.entries(out.files).forEach(function (pair) {
      fs.writeFileSync(path.join(compDir, pair[0]), pair[1]);
    });
    written++;
  });

  // Emit one manifest per generator-managed top-level section. The sub-route
  // tabs architecture writes <slug>/index.mdx + 5 sibling tab files; Starlight's
  // autogenerate would render BOTH the directory and the index.mdx, doubling
  // every entry. Both components and brand need manifest-based sidebars to
  // avoid that. Foundations stays on autogenerate (it has tracked top-level
  // MDX files, not generated tab dirs).
  ["components", "brand"].forEach(function (section) {
    var manifest = buildSidebarManifest(registry, {
      excludedCategories: EXCLUDED_CATEGORIES,
      collectionCategories: COLLECTION_CATEGORIES,
      targetSection: section,
    });
    var sidebarDataPath = path.join(
      __dirname,
      "..",
      "src",
      "data",
      section + "-sidebar.json",
    );
    fs.writeFileSync(sidebarDataPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(
      "generate-component-pages: wrote " +
        section +
        " sidebar manifest → src/data/" +
        section +
        "-sidebar.json (" +
        manifest.length +
        " categories)",
    );
  });

  console.log(
    "generate-component-pages: wrote " +
      written +
      " pages (" +
      nested +
      " in nested groups), skipped " +
      skipped +
      " uncategorized, excluded " +
      excluded +
      " in non-public categories (" +
      Array.from(EXCLUDED_CATEGORIES).join(", ") +
      "), deferred " +
      collection +
      " to collection pages (" +
      Array.from(COLLECTION_CATEGORIES).join(", ") +
      ")",
  );
}

if (require.main === module) {
  main();
}

module.exports = { main: main, buildComponent: buildComponent, buildSidebarManifest: buildSidebarManifest };

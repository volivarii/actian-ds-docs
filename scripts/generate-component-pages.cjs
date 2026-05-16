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
var TABS = require(path.resolve(__dirname, "..", "src", "data", "component-tabs.config.json")).tabs;

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
  // Rewrite bare-slug markdown links to absolute paths first, so the
  // MDX validator sees real links rather than relative slug references.
  s = rewriteComponentLinks(s);
  // Convert <foo>, <foo-bar>, <FooBar>, <a.b> into `<foo>` etc.
  return s.replace(/<([a-zA-Z][\w.-]*)>/g, "`<$1>`");
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

// content[] items come from the knowledge repo's guideline-md-parser in a
// small set of shapes: plain strings (rules/bullets), { do, dont } pairs,
// { term, rule } terminology entries, { note } callouts, and
// { table: { headers, rows } } generic tables. Bucket them and emit the
// right component/markdown as JSX.
function renderContentItems(items, headingForDiag) {
  var pairs = [];   // [{ do, dont }, ...]
  var dos = [];     // solo dos
  var donts = [];   // solo donts
  var rules = [];   // strings
  var notes = [];   // strings
  var terms = [];   // [{ term, definition }]
  var examples = [];
  var tables = [];  // [{ headers, rows }]
  var unknown = []; // for diagnostics

  (items || []).forEach(function (item) {
    if (typeof item === "string") { rules.push(item); return; }
    if (item && typeof item === "object") {
      if (item.do && item.dont) { pairs.push({ do: item.do, dont: item.dont }); return; }
      if (item.do) { dos.push(item.do); return; }
      if (item.dont) { donts.push(item.dont); return; }
      // `term` must be checked before `rule`: terminology items are
      // { term, rule } where `rule` carries the definition text.
      if (item.term) { terms.push({ term: item.term, definition: item.definition || item.rule }); return; }
      if (item.rule) { rules.push(item.rule); return; }
      if (item.note) { notes.push(item.note); return; }
      if (item.table && Array.isArray(item.table.headers)) { tables.push(item.table); return; }
      if (item.examples) {
        var ex = Array.isArray(item.examples) ? item.examples : [item.examples];
        ex.forEach(function (e) { examples.push(String(e)); });
        return;
      }
      if (item.example) { examples.push(String(item.example)); return; }
      unknown.push(item);
    }
  });

  if (unknown.length) {
    process.stderr.write("[generate] WARNING: unknown content item shape(s) in section '"
      + (headingForDiag || "") + "': " + JSON.stringify(unknown) + "\n");
  }

  var parts = [];
  if (rules.length) {
    parts.push(rules.map(function (r) { return "- " + escapeMdxPlaceholders(r); }).join("\n"));
  }
  if (pairs.length) {
    var pairsJsx = pairs.map(function (p) {
      return "{ do: " + JSON.stringify(escapeMdxPlaceholders(p.do))
        + ", dont: " + JSON.stringify(escapeMdxPlaceholders(p.dont)) + " }";
    }).join(", ");
    parts.push("<DoDont pairs={[" + pairsJsx + "]} />");
  }
  if (dos.length) {
    parts.push(dos.map(function (d) {
      return "<DoDont do={" + JSON.stringify(escapeMdxPlaceholders(d)) + "} />";
    }).join("\n\n"));
  }
  if (donts.length) {
    parts.push(donts.map(function (d) {
      return "<DoDont dont={" + JSON.stringify(escapeMdxPlaceholders(d)) + "} />";
    }).join("\n\n"));
  }
  if (notes.length) {
    parts.push(notes.map(function (n) {
      return "<Callout variant=\"note\">\n" + escapeMdxPlaceholders(n) + "\n</Callout>";
    }).join("\n\n"));
  }
  if (terms.length) {
    var termsJsx = terms.map(function (t) {
      return "{ term: " + JSON.stringify(escapeMdxPlaceholders(t.term))
        + (t.definition ? ", definition: " + JSON.stringify(escapeMdxPlaceholders(t.definition)) : "")
        + " }";
    }).join(", ");
    parts.push("<TermList items={[" + termsJsx + "]} />");
  }
  if (tables.length) {
    tables.forEach(function (tbl) {
      parts.push(renderMarkdownTable(tbl.headers, tbl.rows));
    });
  }
  if (examples.length) {
    parts.push("**Examples:** " + examples.map(function (e) { return "`" + e + "`"; }).join(", "));
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
  var importPrefix = "../".repeat(5 + nestDepth) + "components";

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
      .map(function (r) { return RENDERERS[r] ? RENDERERS[r]() : ""; })
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
// buildPage — legacy single-file emitter. Kept for backward compatibility.
// Calls the named helpers extracted above. The main() call site now uses
// buildComponent instead (step 3.6).
// ---------------------------------------------------------------------------

function buildPage(slug, entry, guideline, defaults, registry, opts) {
  opts = opts || {};
  // ζ.2 (2026-05-13): when a component is nested into a group subfolder
  // (e.g., data-display/tag-identification-key/tag-default.mdx), the
  // relative import path back to src/components/ needs one extra "../".
  // nestDepth=0 → 4 ups (flat layout, unchanged); nestDepth=1 → 5 ups.
  var nestDepth = opts.nestDepth || 0;
  var importPrefix = "../".repeat(4 + nestDepth) + "components";
  var title = entry.name || slug;
  var description = (entry.description && entry.description.trim())
    || `Component documentation for ${title}.`;
  var categoryLabel = entry.category;
  var categorySlug = slugifyCategory(categoryLabel);

  var contentDomain = guideline && guideline.domains && guideline.domains.content;
  var hasContent = !!(contentDomain
    && Array.isArray(contentDomain.sections)
    && (contentDomain.status === "approved" || contentDomain.status === "draft"));
  var isStub = !hasContent;

  var sections = [];

  var overviewResult = renderOverview(entry);
  if (overviewResult) sections.push(overviewResult);

  var anatomyResult = renderAnatomy(defaults);
  if (anatomyResult) sections.push(anatomyResult);

  var variantsResult = renderVariantsMatrix(entry, defaults);
  if (variantsResult) sections.push(variantsResult);

  var motionResult = renderMotion(defaults);
  if (motionResult) sections.push(motionResult);

  if (hasContent) {
    sections.push(renderContentDomain(contentDomain));
  }

  var a11yResult = renderA11yRefs(defaults);
  if (a11yResult) sections.push(a11yResult);

  sections.push(renderResources(slug, entry, registry, guideline));

  var imports = [
    "Anatomy",
    "VariantMatrix",
    "MotionPattern",
    "AccessibilityRefs",
    "PageMetadata",
    "StubFooter",
    "DoDont",
    "Callout",
    "TermList",
  ].map(function (name) {
    return 'import ' + name + ' from "' + importPrefix + "/" + name + '.astro";';
  }).join("\n");

  // BASE_URL-aware category link: emit as inline MDX expression so the
  // resulting <a href> picks up the site's BASE_URL prefix at build time.
  // (Starlight does NOT base-rewrite raw markdown links with absolute paths.)
  var categoryLink = categorySlug
    ? '**Category:** <a href={`${import.meta.env.BASE_URL.replace(/\\/?$/, "/")}categories/' + categorySlug + '`}>' + categoryLabel + "</a>"
    : "";

  // Confidence chips — inherit 4 fields (anatomy/variants/motion/a11y) from
  // category-defaults, plus a synthesized `content` field per-component
  // driven by the content domain's status:
  //   - high   : content domain `approved`
  //   - medium : content domain `draft`
  //   - low    : no curated content domain (stub)
  var contentConfidence = "low";
  if (hasContent) {
    contentConfidence = contentDomain.status === "approved" ? "high" : "medium";
  }
  var confidenceLine = "";
  if (defaults && defaults.confidence) {
    var merged = Object.assign({}, defaults.confidence, { content: contentConfidence });
    var pairs = Object.entries(merged).map(function (kv) {
      return '<span class={`confidence-chip confidence-chip--' + kv[1] + '`}><span class="confidence-chip__field">' + kv[0] + '</span><span>' + kv[1] + '</span></span>';
    }).join("\n  ");
    confidenceLine = '<div class="confidence-row">\n  <span class="confidence-row__label">Confidence</span>\n  ' + pairs + '\n</div>';
  }

  var stubFooter = (isStub && categorySlug)
    ? '<StubFooter category="' + categorySlug + '" />'
    : "";

  var lines = [
    "---",
    "title: " + JSON.stringify(title),
    "description: " + JSON.stringify(description),
    "---",
    "",
    imports,
    "",
    "<PageMetadata",
    '  slug="components.' + slug + '"',
    '  source="components/dist/registries/dskit.json#' + slug + '"',
    "  schema={1}",
    "/>",
    "",
    categoryLink,
    "",
    confidenceLine,
    "",
    sections.join("\n\n"),
    "",
    stubFooter,
    "",
  ];

  return lines.join("\n");
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
    if (entry.group) {
      var groupSlug = slugifyCategory(entry.group);
      var key = catSlug + "::" + groupSlug;
      if (groupSlug && groupCounts[key] > 1) {
        parts.push(groupSlug);
      }
    }
    parts.push(slug);
    var link = "/" + parts.join("/") + "/";

    if (!catMap[entry.category]) {
      catMap[entry.category] = { label: entry.category, catSlug: catSlug, items: [] };
    }
    catMap[entry.category].items.push({ label: entry.name || slug, link: link });
  });

  // Sort categories alphabetically, sort items within each category.
  var categories = Object.values(catMap);
  categories.sort(function (a, b) { return a.label.localeCompare(b.label); });
  categories.forEach(function (cat) {
    cat.items.sort(function (a, b) { return a.label.localeCompare(b.label); });
  });

  return categories.map(function (cat) {
    return { label: cat.label, collapsed: true, items: cat.items };
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

  var manifest = buildSidebarManifest(registry, {
    excludedCategories: EXCLUDED_CATEGORIES,
    collectionCategories: COLLECTION_CATEGORIES,
    targetSection: "components",
  });
  var sidebarDataPath = path.join(__dirname, "..", "src", "data", "components-sidebar.json");
  fs.writeFileSync(sidebarDataPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("generate-component-pages: wrote sidebar manifest → src/data/components-sidebar.json");

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

module.exports = { main: main, buildPage: buildPage, buildComponent: buildComponent, buildSidebarManifest: buildSidebarManifest };

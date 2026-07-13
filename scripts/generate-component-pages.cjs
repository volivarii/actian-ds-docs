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
 *
 * Phase 4a (2026-05-17): render helpers extracted to scripts/lib/render-mdx.cjs;
 * sidebar builders extracted to scripts/lib/sidebar-manifest.cjs.
 */

var fs = require("fs");
var path = require("path");
var PATHS = require("./lib/paths.cjs");
var loader = require("./lib/category-defaults-loader.cjs");
var { computeImportPrefix } = require("./lib/import-prefix.cjs");
var TABS = require(path.resolve(__dirname, "..", "src", "data", "component-tabs.config.json")).tabs;
var renderMdx = require("./lib/render-mdx.cjs");
var { buildSidebarManifest } = require("./lib/sidebar-manifest.cjs");

// Aggregated warning counters — incremented by warning-emitting sites below;
// summarized in one line at end of main(). Existing stderr writes preserved for
// per-occurrence detail during build.
var WARNINGS = { unknownContentShapes: 0, unparseableGuidelines: 0 };

// Fallback "last updated" date for the Starlight footer: components without a
// guideline updated_at (stubs) fall back to the knowledge vendor-snapshot date
// — the same fallback PageMetadata.astro uses for the actian-ds-updated meta.
var VENDORED = require(path.resolve(__dirname, "..", "vendored.json"));
var VENDORED_DATE = /^\d{4}-\d{2}-\d{2}/.test(String(VENDORED.vendored_at || ""))
  ? String(VENDORED.vendored_at).slice(0, 10)
  : null;

// Canonical list of valid renderer keys. Must match the keys of the
// RENDERERS object built in buildComponent() below. Boot assertion (see
// validateRendererConfig()) ensures component-tabs.config.json never
// references a key absent from this list — silent-stub fallback was the
// root of a debugging session worth ~half a day.
var VALID_RENDERER_KEYS = new Set([
  "mediaPreview",
  "overview",
  "categoryUsageBaseline",
  "usageDomain",
  "contentDomain",
  "designSections",
  "a11yRefs",
  "globalA11yLink",
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

// ---------------------------------------------------------------------------
// Small placeholder helpers for tabs that have no real data yet.
// These close over nothing from render-mdx, so they stay in main.
// ---------------------------------------------------------------------------

function renderCategoryUsageBaseline(defaults) {
  if (!defaults || !defaults.card_usage || !Array.isArray(defaults.card_usage.points)) return "";
  // Markdown heading (not raw <h2>) so it lands in Starlight's ToC.
  // "When to use" auto-slugs to id="when-to-use" — the /usage/ redirect
  // below targets that fragment.
  return "## When to use\n\n" + defaults.card_usage.points
    .map(function (p) { return "- " + renderMdx.escapeMdxPlaceholders(p); }).join("\n");
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
  // Date-only (YYYY-MM-DD) form of the guideline's updated_at. Guard: only
  // trust the value when it has an ISO-8601 prefix — a malformed value sliced
  // blind would become garbage. null when absent/malformed.
  var dateOnly = ctx.updated && /^\d{4}-\d{2}-\d{2}/.test(String(ctx.updated))
    ? String(ctx.updated).slice(0, 10)
    : null;

  var fm = [
    "---",
    "title: " + JSON.stringify(ctx.title),
    "description: " + JSON.stringify(ctx.description),
    "template: doc",
    "tab: " + JSON.stringify(ctx.tabSlug),
    "component: " + JSON.stringify(ctx.slug),
    "status: " + JSON.stringify(ctx.status),
  ];
  // Starlight's footer "Last updated" reads this frontmatter date (these
  // generated pages are untracked, so git-based detection would be wrong).
  // Stubs with no guideline date fall back to the vendor-snapshot date.
  var lastUpdated = dateOnly || VENDORED_DATE;
  if (lastUpdated) {
    fm.push("lastUpdated: " + lastUpdated);
  }
  if (!ctx.isIndex) {
    fm.push("sidebar: { hidden: true }");
  }
  fm.push("---");

  var imports = [
    "Anatomy", "VariantMatrix", "MotionPattern", "AccessibilityRefs",
    "PageMetadata", "StubFooter", "DoDont", "Callout", "TermList",
    "ComponentTabs", "ConfidenceChip", "MediaAsset", "Media",
  ].map(function (name) {
    return 'import ' + name + ' from "' + ctx.importPrefix + "/" + name + '.astro";';
  }).join("\n");

  var pageMetaProps = [
    '  slug="components.' + ctx.slug + '.' + ctx.tabSlug + '"',
    '  source="components/dist/registries/dskit.json#' + ctx.slug + '"',
    "  schema={1}",
  ];
  // Mirrors the frontmatter date into the actian-ds-updated <meta> tag.
  if (dateOnly) pageMetaProps.push('  updated="' + dateOnly + '"');

  // Confidence chips ride in the PageMetadata slot — the page header meta
  // row pairs them (left) with "Last updated" (right). See PageMetadata.astro.
  // When absent (no confidence data, or a non-index tab) PageMetadata is
  // emitted self-closing and the row carries just the updated line.
  var pageMetadataLines = ["<PageMetadata"].concat(pageMetaProps);
  if (ctx.confidenceHtml && ctx.confidenceHtml.trim() !== "") {
    pageMetadataLines = pageMetadataLines.concat([">", ctx.confidenceHtml, "</PageMetadata>"]);
  } else {
    pageMetadataLines = pageMetadataLines.concat(["/>"]);
  }

  return [
    fm.join("\n"),
    "",
    imports,
    "",
  ].concat(pageMetadataLines).concat([
    "",
    "<ComponentTabs component={" + JSON.stringify(ctx.slug) + "} activeTab={" + JSON.stringify(ctx.tabSlug) + "} />",
    "",
    ctx.body,
    "",
  ]).join("\n");
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
  // Three content-bearing statuses: approved + draft (per-component authored)
  // + synthesized (pattern fan-out only; knowledge v0.15.0+). All three carry
  // a `sections[]` array the renderer can display. Pattern-sourced sections
  // are marked with `section.source = "pattern:<slug>"` for future provenance UI.
  var hasContent = !!(contentDomain
    && Array.isArray(contentDomain.sections)
    && (contentDomain.status === "approved"
        || contentDomain.status === "draft"
        || contentDomain.status === "synthesized"));

  var usageDomain = guideline && guideline.domains && guideline.domains.usage;
  // renderUsageDomain() owns the status gate; "" means nothing to show.
  var usageBody = renderMdx.renderUsageDomain(usageDomain);
  var hasAuthoredUsage = usageBody.trim() !== "";

  var categorySlug = slugifyCategory(entry.category);

  // Confidence chips are component-level metadata, not a tab-body section:
  // they render into the page header meta row via the PageMetadata slot.
  // "" when the component carries no confidence data.
  var confidenceHtml = renderMdx.renderConfidenceChips(defaults, contentDomain);

  var RENDERERS = {
    mediaPreview:          function () { return renderMdx.renderMediaPreview(slug); },
    overview:              function () { return renderMdx.renderOverview(entry); },
    // Authored usage and the category baseline BOTH emit "## When to use".
    // Rendering both would duplicate the heading and the #when-to-use anchor
    // (which the /usage/ redirect targets). Authored wins; baseline is the
    // fallback for components with no guideline file.
    categoryUsageBaseline: function () { return hasAuthoredUsage ? "" : renderCategoryUsageBaseline(defaults); },
    usageDomain:           function () { return usageBody; },
    contentDomain:         function () { return hasContent ? renderMdx.renderContentDomain(contentDomain, WARNINGS) : ""; },
    designSections:        function () { return renderMdx.renderDesignSections(entry, defaults, guideline, slug, WARNINGS); },
    a11yRefs:              function () { return renderMdx.renderA11yRefs(defaults); },
    globalA11yLink:        function () { return renderGlobalA11yLink(); },
    tokensPlaceholder:     function () { return renderTokensPlaceholder(); },
    apiPlaceholder:        function () { return renderApiPlaceholder(entry); },
    resources:             function () { return renderMdx.renderResources(slug, entry, registry, guideline); },
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
      body = renderMdx.renderStubFooter(categorySlug);
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
      // synthesized (knowledge v0.15.0+ pattern fan-out) is content-bearing
      // but indicates no per-component authored copy — sits between draft and
      // inherited in the cascade so the coverage signal stays visible.
      else if (domStatuses.indexOf("synthesized") !== -1) tabStatus = "synthesized";
      else if (domStatuses.indexOf("inherited") !== -1) tabStatus = "inherited";
    }

    var filename = tab.isIndex ? "index.mdx" : (tab.slug + ".mdx");
    files[filename] = renderTabMdx({
      title: entry.name || slug,
      // Collapsed to one line: this feeds the YAML frontmatter / <meta>
      // description, which must stay flat. The Overview body keeps the
      // original line structure via renderOverview.
      description: (entry.description && entry.description.trim().replace(/\s+/g, " "))
        || ("Component documentation for " + (entry.name || slug) + " — " + tab.label + "."),
      isIndex: !!tab.isIndex,
      importPrefix: importPrefix,
      slug: slug,
      tabSlug: tab.slug,
      tabLabel: tab.label,
      status: tabStatus,
      body: body,
      updated: guideline && guideline.updated_at,
      // Confidence is component-level metadata — show the chips on every tab
      // so the header meta row stays consistent as the user moves between
      // Overview / Content / Accessibility / Code.
      confidenceHtml: confidenceHtml,
    });
  });
  return { files: files };
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
  renderMdx.buildSlugToPathMap(registry, groupCounts, SECTION_DIRS, DEFAULT_SECTION_DIR, slugifyCategory);

  // Load the media index sidecar (knowledge v0.17.0+). Components with media
  // but no guideline doc (e.g. avatar) appear here even though they have no
  // components/dist/guidelines/<slug>.json. Falls back gracefully when the
  // sidecar is missing — renderMediaPreview returns "" and no <MediaAsset>
  // tags get emitted (matches pre-0.17.0 behavior).
  var mediaIndexPath = path.resolve(__dirname, "..", "vendor", "components", "dist", "media", "_index.json");
  var mediaIndex = null;
  if (fs.existsSync(mediaIndexPath)) {
    try {
      mediaIndex = JSON.parse(fs.readFileSync(mediaIndexPath, "utf8"));
    } catch (err) {
      process.stderr.write(
        "[generate] WARNING: couldn't parse media index " + mediaIndexPath +
        " — " + err.message + "\n"
      );
    }
  }
  renderMdx.setMediaIndex(mediaIndex);

  // Load the anatomy bundle sidecar (knowledge v0.32.0+). Components with a
  // usable capture render an image-led anatomy callout; the rest fall back to
  // the category-defaults placeholder. Missing/unparseable bundle -> null ->
  // every component falls back; the build does not fail.
  var anatomyBundlePath = path.resolve(__dirname, "..", "vendor", "components", "dist", "anatomy.bundle.json");
  var anatomyIndex = null;
  if (fs.existsSync(anatomyBundlePath)) {
    try {
      anatomyIndex = JSON.parse(fs.readFileSync(anatomyBundlePath, "utf8"));
    } catch (err) {
      process.stderr.write(
        "[generate] WARNING: couldn't parse anatomy bundle " + anatomyBundlePath +
        " (" + err.message + ") — anatomy callouts will fall back to placeholders.\n"
      );
    }
  }
  renderMdx.setAnatomyIndex(anatomyIndex);

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
        WARNINGS.unparseableGuidelines += 1;
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
      sectionDirs: SECTION_DIRS,
      defaultSectionDir: DEFAULT_SECTION_DIR,
      slugifyCategory: slugifyCategory,
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
        " top-level entries)",
    );
  });

  // Emit the slug → page-path map that buildSlugToPathMap() just built.
  // sync-vendored-md.cjs runs in a separate Node process (prebuild chains
  // scripts, so module state does not carry over) and needs the same map to
  // resolve the bare-slug cross-references inside the vendored content page.
  // Emitting it here keeps ONE owner of the category/group nesting rules; the
  // prebuild order in package.json runs this generator before sync-vendored-md.
  var slugPathsPath = path.join(__dirname, "..", "src", "data", "slug-paths.json");
  var slugPaths = renderMdx.getSlugToPathMap();
  fs.writeFileSync(slugPathsPath, JSON.stringify(slugPaths, null, 2) + "\n");
  console.log(
    "generate-component-pages: wrote slug→path map → src/data/slug-paths.json (" +
      Object.keys(slugPaths).length +
      " slugs)",
  );

  // Emit redirects manifest — preserves deep links from the legacy
  // /components/<cat>/<slug>/{design,usage}/ tab URLs (now merged into the
  // Overview tab) by mapping them to fragment anchors on the parent page.
  // Astro 6's `redirects` config generates static HTML with <meta http-equiv="refresh">
  // entries from this JSON. Astro picks the manifest up via an import at the
  // top of astro.config.mjs (added in this task).
  //   /<base>/design/ → /<base>/#anatomy   (Anatomy is the upstream design-domain heading)
  //   /<base>/usage/  → /<base>/#when-to-use  (When to use heading on Overview)
  // Destinations stay base-agnostic (root-absolute); astro.config.mjs prefixes
  // them with the configured site base at the consumption point.
  var redirects = {};
  Object.entries(registry.components).forEach(function (pair) {
    var slug = pair[0];
    var entry = pair[1];
    if (!entry.category) return;
    if (EXCLUDED_CATEGORIES.has(entry.category)) return;
    if (COLLECTION_CATEGORIES.has(entry.category)) return;
    var sd = SECTION_DIRS[entry.section] || DEFAULT_SECTION_DIR;
    var catSlug = slugifyCategory(entry.category);
    var parts = [sd, catSlug];
    if (entry.group) {
      var groupSlug = slugifyCategory(entry.group);
      var key = catSlug + "::" + groupSlug;
      if (groupSlug && groupCounts[key] > 1) parts.push(groupSlug);
    }
    parts.push(slug);
    var base = "/" + parts.join("/") + "/";
    redirects[base + "design/"] = base + "#anatomy";
    redirects[base + "usage/"]  = base + "#when-to-use";
  });
  var redirectsPath = path.join(__dirname, "..", "src", "data", "redirects-manifest.json");
  fs.writeFileSync(redirectsPath, JSON.stringify(redirects, null, 2) + "\n");
  console.log("generate-component-pages: wrote " + Object.keys(redirects).length + " redirects → src/data/redirects-manifest.json");

  // Mirror vendor binary media into public/ so Astro can serve it.
  // Source: vendor/components/dist/media/<slug>/<file> (CI-origin assets
  // synced from Figma via the media-preview phase in actian-ds-knowledge).
  // Target: public/media/<slug>/<file> (Astro serves these at BASE/media/...
  // — see media-asset-resolver.mjs).
  // Reset the target on every prebuild so removed assets don't linger.
  var vendorMedia = path.resolve(__dirname, "..", "vendor", "components", "dist", "media");
  var publicMedia = path.resolve(__dirname, "..", "public", "media");
  if (fs.existsSync(vendorMedia)) {
    fs.rmSync(publicMedia, { recursive: true, force: true });
    fs.mkdirSync(publicMedia, { recursive: true });
    var copyTree = function (srcRoot, dstRoot) {
      fs.readdirSync(srcRoot, { withFileTypes: true }).forEach(function (e) {
        var s = path.join(srcRoot, e.name);
        var d = path.join(dstRoot, e.name);
        if (e.isDirectory()) {
          fs.mkdirSync(d, { recursive: true });
          copyTree(s, d);
        } else if (e.isFile()) {
          fs.copyFileSync(s, d);
        }
      });
    };
    copyTree(vendorMedia, publicMedia);
    var count = 0;
    fs.readdirSync(publicMedia, { withFileTypes: true }).forEach(function (e) {
      if (e.isDirectory()) {
        var slugDir = path.join(publicMedia, e.name);
        fs.readdirSync(slugDir).forEach(function () { count++; });
      }
    });
    console.log("generate-component-pages: mirrored " + count + " vendor media files → public/media/");
  }

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
  var totalWarnings = WARNINGS.unknownContentShapes + WARNINGS.unparseableGuidelines;
  if (totalWarnings > 0) {
    console.log(
      "[generate-component-pages] " + totalWarnings + " warnings (" +
      WARNINGS.unknownContentShapes + " unknown content shape" + (WARNINGS.unknownContentShapes === 1 ? "" : "s") + ", " +
      WARNINGS.unparseableGuidelines + " unparseable guideline" + (WARNINGS.unparseableGuidelines === 1 ? "" : "s") +
      ")"
    );
  }
}

if (require.main === module) {
  main();
}

module.exports = { main: main, buildComponent: buildComponent, buildSidebarManifest: buildSidebarManifest };

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

// Wrap <placeholder> spans in code ticks so MDX doesn't try to parse them
// as JSX tags. Knowledge content uses '<assetNames>'-style placeholders in
// rule prose ("Search in <assetNames>"); without this, MDX bails on
// "Expected a closing tag for `<assetNames>`".
function escapeMdxPlaceholders(s) {
  if (typeof s !== "string") return s;
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

  // The per-component guideline JSON (components/dist/guidelines/<slug>.json)
  // carries a `domains` object; only the `content` domain is authored as
  // structured sections today (usage/design/behavior/tokens are `inherited`
  // or `not-started`). A page is treated as a "stub" when no curated content
  // domain is present — anatomy / motion / a11y / variants then come purely
  // from the registry + category-defaults baseline.
  var contentDomain = guideline && guideline.domains && guideline.domains.content;
  var hasContent = !!(contentDomain
    && Array.isArray(contentDomain.sections)
    && (contentDomain.status === "approved" || contentDomain.status === "draft"));
  var isStub = !hasContent;

  var sections = [];

  // ζ.5 follow-up (2026-05-13): stub pages were previously rendered as
  // title-only — but the registry HAS useful data for stubs (description,
  // variants from Figma sync, Figma URL). Hiding it produced "empty page"
  // confusion (Vincent's screenshot of Tag, Catalog). New strategy:
  //   - Registry-driven sections render ALWAYS (Overview from
  //     entry.description, Variants matrix from entry.variants, Resources
  //     with Figma + knowledge URLs)
  //   - Defaults-driven sections render ALWAYS when defaults exist for
  //     this category (Anatomy, Motion, Accessibility — the category
  //     baseline is meaningful even before per-component curation)
  //   - Guideline-only sections (Content guidelines) render only when the
  //     guideline is non-stub AND has the data
  //   - StubFooter still appears for stubs to signal curation status

  // Overview — short prose hoist from the registry description. Hoisted
  // so the page leads with prose before the first H2.
  var overviewText = (entry.description && entry.description.trim()) || "";
  if (overviewText) {
    sections.push("## Overview\n\n" + escapeMdxPlaceholders(overviewText));
  }

  // Anatomy: from category-defaults. The per-component `design` domain is
  // `inherited` (resolves to the category baseline) — the guideline JSON
  // carries no component-specific anatomy of its own.
  if (defaults && defaults.card_anatomy && Array.isArray(defaults.card_anatomy.parts) && defaults.card_anatomy.parts.length) {
    sections.push("## Anatomy\n\n<Anatomy parts={" + jsLit(defaults.card_anatomy.parts) + "} />");
  }

  // Variants — registry-driven (live Figma sync data). Always render
  // when present, even for stubs.
  if (entry.variants && Object.keys(entry.variants).length) {
    var axes = Object.entries(entry.variants).map(function (pair) {
      return { axis: pair[0], values: pair[1] };
    });
    sections.push("## Variants\n\n<VariantMatrix variantAxes={" + jsLit(axes) + "} />");
  } else if (defaults && defaults.card_component && Array.isArray(defaults.card_component.variantAxes) && defaults.card_component.variantAxes.length) {
    sections.push("## Variants\n\n<VariantMatrix variantAxes={" + jsLit(defaults.card_component.variantAxes) + "} />");
  }

  // Motion + Accessibility: from category-defaults. The per-component
  // `behavior` domain is `inherited` (motion + a11y resolve to the
  // category baseline) — the guideline JSON carries no component-specific
  // motion/accessibility of its own.
  if (defaults && defaults.card_motion && Array.isArray(defaults.card_motion.patternRefs)) {
    sections.push("## Motion\n\n<MotionPattern patternRefs={" + jsLit(defaults.card_motion.patternRefs) + "} />");
  }
  if (defaults && defaults.card_accessibility && Array.isArray(defaults.card_accessibility.requirementRefs)) {
    sections.push("## Accessibility\n\n<AccessibilityRefs requirementRefs={" + jsLit(defaults.card_accessibility.requirementRefs) + "} />");
  }

  // Content guidelines — the curated `content` domain. Emitted only when
  // the component has an approved/draft content domain with sections.
  if (hasContent) {
    sections.push("## Content guidelines\n\n" + contentDomain.sections.map(renderContentSection).join("\n\n"));
  }

  // Resources — Figma node + knowledge-source link. The Figma link is
  // registry-driven (emitted always). The knowledge-source link points at
  // the per-component authoring directory and is emitted only when a
  // guideline JSON exists for this component (`if (guideline)`) — otherwise
  // the directory wouldn't exist and the link would 404.
  {
    var figmaUrl = (entry.nodeId && registry && registry.fileKey)
      ? "https://www.figma.com/file/" + registry.fileKey + "?node-id=" + String(entry.nodeId).replace(":", "-")
      : null;
    var resourceLines = [
      "## Resources",
      "",
    ];
    if (figmaUrl) resourceLines.push("- [Open in Figma](" + figmaUrl + ")");
    if (guideline) {
      var knowledgeUrl = "https://github.com/volivarii/actian-ds-knowledge/tree/main/components/src/" + slug;
      resourceLines.push("- [Knowledge source](" + knowledgeUrl + ")");
    }
    sections.push(resourceLines.join("\n"));
  }

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
  // .mdx + all nested subdirs (those are 100% generator output).
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

    var mdx = buildPage(slug, entry, guideline, defaults, registry, {
      nestDepth: nestDepth,
    });
    var outPath = path.join(outDir, slug + ".mdx");
    fs.writeFileSync(outPath, mdx);
    written++;
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

module.exports = { main: main, buildPage: buildPage };

"use strict";

/**
 * generate-component-pages.cjs — Build-time generator for the 72
 * categorized DS Kit component pages.
 *
 * Reads:
 *   - vendor/components/dist/registries/dskit.json (322 components total;
 *     72 carry a `category` field)
 *   - vendor/components/src/guidelines/<slug>.json (when present;
 *     44 curated + 41 stubs in v0.5.1)
 *
 * Writes:
 *   - src/content/docs/components/<slug>.mdx (one per categorized component;
 *     Starlight v0.39 reads from src/content/docs/<dir>/)
 *
 * Uncategorized components (250) get NO page here — they're rendered on
 * /inventory only (Task 9).
 */

var fs = require("fs");
var path = require("path");
var PATHS = require("./lib/paths.cjs");
var loader = require("./lib/category-defaults-loader.cjs");

var OUT_DIR = path.resolve(__dirname, "..", "src", "content", "docs", "components");

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

// content_guidelines.sections[].content[] items are objects with various
// shapes (rule | note | do/dont | term[/definition] | examples). Bucket
// them by shape and emit the right component as JSX in the MDX.
function renderContentSection(s) {
  var pairs = [];   // [{ do, dont }, ...]
  var dos = [];     // solo dos
  var donts = [];   // solo donts
  var rules = [];   // strings
  var notes = [];   // strings
  var terms = [];   // [{ term, definition }]
  var examples = [];
  var unknown = []; // for diagnostics

  (s.content || []).forEach(function (item) {
    if (typeof item === "string") { rules.push(item); return; }
    if (item && typeof item === "object") {
      if (item.do && item.dont) { pairs.push({ do: item.do, dont: item.dont }); return; }
      if (item.do) { dos.push(item.do); return; }
      if (item.dont) { donts.push(item.dont); return; }
      if (item.rule) { rules.push(item.rule); return; }
      if (item.note) { notes.push(item.note); return; }
      if (item.term) { terms.push({ term: item.term, definition: item.definition }); return; }
      if (item.examples) {
        var ex = Array.isArray(item.examples) ? item.examples : [item.examples];
        ex.forEach(function (e) { examples.push(String(e)); });
        return;
      }
      unknown.push(item);
    }
  });

  if (unknown.length) {
    process.stderr.write("[generate] WARNING: unknown content_guideline shape(s) in section '"
      + (s.heading || "") + "': " + JSON.stringify(unknown) + "\n");
  }

  var parts = [];
  parts.push("### " + (s.heading || ""));

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
  if (examples.length) {
    parts.push("**Examples:** " + examples.map(function (e) { return "`" + e + "`"; }).join(", "));
  }

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
  var description = (guideline && guideline.description) || `Component documentation for ${title}.`;
  var categoryLabel = entry.category;
  var categorySlug = slugifyCategory(categoryLabel);
  var isStub = !guideline || guideline._stub === true;

  var sections = [];

  // Stub pages: render ONLY title + category link + StubFooter (handled below).
  // Skip all section emission so the page reads clean instead of showing
  // empty Anatomy/Variants/Motion/Accessibility headers.
  if (!isStub) {
    // Overview — short prose hoist, from registry description or guideline description.
    // Hoisted from frontmatter so the page leads with prose before the first H2.
    var overviewText = (entry.description && entry.description.trim())
      || (guideline && guideline.description ? guideline.description : "");
    if (overviewText) {
      sections.push("## Overview\n\n" + escapeMdxPlaceholders(overviewText));
    }

    // Anatomy: from guideline (curated) or category-defaults (fallback)
    if (guideline && guideline.anatomy && Array.isArray(guideline.anatomy.parts) && guideline.anatomy.parts.length) {
      sections.push("## Anatomy\n\n<Anatomy parts={" + jsLit(guideline.anatomy.parts) + "} />");
    } else if (defaults && defaults.card_anatomy && Array.isArray(defaults.card_anatomy.parts) && defaults.card_anatomy.parts.length) {
      sections.push("## Anatomy\n\n<Anatomy parts={" + jsLit(defaults.card_anatomy.parts) + "} />");
    }

    // Variants: prefer registry.variants (the live shape from Figma sync) over guideline
    if (entry.variants && Object.keys(entry.variants).length) {
      var axes = Object.entries(entry.variants).map(function (pair) {
        return { axis: pair[0], values: pair[1] };
      });
      sections.push("## Variants\n\n<VariantMatrix variantAxes={" + jsLit(axes) + "} />");
    } else if (defaults && defaults.card_component && Array.isArray(defaults.card_component.variantAxes) && defaults.card_component.variantAxes.length) {
      sections.push("## Variants\n\n<VariantMatrix variantAxes={" + jsLit(defaults.card_component.variantAxes) + "} />");
    }

    // Motion: prefer guideline.behavior.motion.pattern; fall back to category-defaults
    if (guideline && guideline.behavior && guideline.behavior.motion && guideline.behavior.motion.pattern) {
      var slugStr = guideline.behavior.motion.pattern;
      sections.push("## Motion\n\n<MotionPattern patternRefs={" + jsLit([{ ref: slugStr }]) + "} />");
    } else if (defaults && defaults.card_motion && Array.isArray(defaults.card_motion.patternRefs)) {
      sections.push("## Motion\n\n<MotionPattern patternRefs={" + jsLit(defaults.card_motion.patternRefs) + "} />");
    }

    // Accessibility: prefer guideline.accessibility; fall back to category-defaults refs
    if (guideline && guideline.accessibility) {
      if (typeof guideline.accessibility === "string") {
        sections.push("## Accessibility\n\n" + guideline.accessibility);
      } else if (Array.isArray(guideline.accessibility.requirementRefs)) {
        sections.push("## Accessibility\n\n<AccessibilityRefs requirementRefs={" + jsLit(guideline.accessibility.requirementRefs) + "} />");
      }
    } else if (defaults && defaults.card_accessibility && Array.isArray(defaults.card_accessibility.requirementRefs)) {
      sections.push("## Accessibility\n\n<AccessibilityRefs requirementRefs={" + jsLit(defaults.card_accessibility.requirementRefs) + "} />");
    }

    // Content guidelines: only from guideline (no category fallback)
    if (guideline && guideline.content_guidelines && Array.isArray(guideline.content_guidelines.sections)) {
      sections.push("## Content guidelines\n\n" + guideline.content_guidelines.sections.map(renderContentSection).join("\n\n"));
    }

    // Resources — Figma node + knowledge-source JSON. Always emit on non-stub
    // pages so authors land somewhere actionable below the in-page docs.
    var figmaUrl = (entry.nodeId && registry && registry.fileKey)
      ? "https://www.figma.com/file/" + registry.fileKey + "?node-id=" + String(entry.nodeId).replace(":", "-")
      : null;
    var knowledgeUrl = "https://github.com/volivarii/actian-ds-knowledge/tree/main/components/src/guidelines/" + slug + ".json";
    var resourceLines = [
      "## Resources",
      "",
    ];
    if (figmaUrl) resourceLines.push("- [Open in Figma](" + figmaUrl + ")");
    resourceLines.push("- [Knowledge source (JSON)](" + knowledgeUrl + ")");
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
  // category-defaults, plus a synthesized `content` field per-component:
  //   - high   : curated guideline with content_guidelines.sections present
  //   - medium : curated guideline, but no content_guidelines block
  //   - low    : stub / missing guideline
  var contentConfidence = "low";
  if (guideline && !guideline._stub) {
    contentConfidence = (guideline.content_guidelines && Array.isArray(guideline.content_guidelines.sections) && guideline.content_guidelines.sections.length)
      ? "high"
      : "medium";
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
  var guidelinesDir = path.join(PATHS.vendor, "components", "src", "guidelines");

  // Wipe + recreate — generated content is gitignored. Recursive blow-away
  // also handles old flat-layout MDX files left over from pre-nesting builds.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

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
    "Local components",
    "White-label services",
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

    var guidelinePath = path.join(guidelinesDir, slug + ".json");
    var guideline = null;
    if (fs.existsSync(guidelinePath)) {
      try {
        guideline = JSON.parse(fs.readFileSync(guidelinePath, "utf8"));
      } catch (err) {
        process.stderr.write("[generate] WARNING: couldn't parse " + guidelinePath + " — " + err.message + "\n");
      }
    }

    var defaults = loader.loadDefaultsForCategory(entry.category);

    var categorySlug = slugifyCategory(entry.category);
    var categoryDir = path.join(OUT_DIR, categorySlug);
    if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

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

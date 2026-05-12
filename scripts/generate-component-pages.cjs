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

function buildPage(slug, entry, guideline, defaults) {
  var title = entry.name || slug;
  var description = (guideline && guideline.description) || `Component documentation for ${title}.`;
  var categoryLabel = entry.category;
  var categorySlug = slugifyCategory(categoryLabel);
  var isStub = !guideline || guideline._stub === true;

  var sections = [];

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
    sections.push("## Content guidelines\n\n" + guideline.content_guidelines.sections.map(function (s) {
      var heading = "### " + (s.heading || "");
      var content = Array.isArray(s.content)
        ? s.content.map(function (line) { return "- " + line; }).join("\n")
        : String(s.content || "");
      return heading + "\n\n" + content;
    }).join("\n\n"));
  }

  var imports = [
    "Anatomy",
    "VariantMatrix",
    "MotionPattern",
    "AccessibilityRefs",
    "PageMetadata",
    "StubFooter",
  ].map(function (name) {
    return 'import ' + name + ' from "../../../components/' + name + '.astro";';
  }).join("\n");

  // BASE_URL-aware category link: emit as inline MDX expression so the
  // resulting <a href> picks up the site's BASE_URL prefix at build time.
  // (Starlight does NOT base-rewrite raw markdown links with absolute paths.)
  var categoryLink = categorySlug
    ? '**Category:** <a href={`${import.meta.env.BASE_URL.replace(/\\/?$/, "/")}categories/' + categorySlug + '`}>' + categoryLabel + "</a>"
    : "";

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

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Clear stale pages first — vendor refresh may have dropped slugs.
  fs.readdirSync(OUT_DIR).forEach(function (f) {
    if (f.endsWith(".mdx")) fs.unlinkSync(path.join(OUT_DIR, f));
  });

  loader._resetCache();
  var written = 0;
  var skipped = 0;
  Object.entries(registry.components).forEach(function (pair) {
    var slug = pair[0];
    var entry = pair[1];
    if (!entry.category) { skipped++; return; }

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

    var mdx = buildPage(slug, entry, guideline, defaults);
    var outPath = path.join(OUT_DIR, slug + ".mdx");
    fs.writeFileSync(outPath, mdx);
    written++;
  });

  console.log("generate-component-pages: wrote " + written + " pages, skipped " + skipped + " uncategorized");
}

if (require.main === module) {
  main();
}

module.exports = { main: main, buildPage: buildPage };

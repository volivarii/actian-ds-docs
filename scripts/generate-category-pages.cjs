"use strict";

/**
 * generate-category-pages.cjs — Build-time generator for /categories/<slug>/
 * landing pages. One MDX per distinct `category` string in the DS Kit
 * registry. Plain shell: H1 + count + grid of ComponentCards.
 *
 * Reads:
 *   - vendor/components/dist/registries/dskit.json
 *
 * Writes:
 *   - src/content/docs/categories/<slug>.mdx
 *
 * Filling 404s referenced from homepage cards, StubFooter, ComponentCard,
 * InventoryGrid, state.astro, llms*.ts (per audit #1, #2).
 */

const fs = require("fs");
const path = require("path");
const PATHS = require("./lib/paths.cjs");
const loader = require("./lib/category-defaults-loader.cjs");

const DEFAULT_REGISTRY = path.join(PATHS.vendor, "components", "dist", "registries", "dskit.json");
const DEFAULT_OUT_DIR = path.join(__dirname, "..", "src", "content", "docs", "categories");

// COMPONENT_IMPORT is the relative path from each emitted MDX to the
// ComponentCard.astro source. Emitted files live at
// src/content/docs/categories/<slug>.mdx (depth 4 from src/), so three
// `../` steps reach src/components/ComponentCard.astro.
const COMPONENT_IMPORT = "../../../components/ComponentCard.astro";

function escapeQuotes(s) {
  return String(s).replace(/"/g, '\\"');
}

// Icons are documented as a single grouped catalog (with live, themeable
// glyphs) on the Foundations → Icons page, NOT as per-component pages. A grid
// of ComponentCards here would link to /components/icons/<slug>, which 404s
// (no per-icon pages exist). So the icons category page is a thin pointer to
// the catalog. The root-relative link is base-prefixed by Starlight.
function buildIconsPage(categoryLabel, count) {
  const lines = [];
  lines.push("---");
  lines.push('title: "' + escapeQuotes(categoryLabel) + '"');
  lines.push("---");
  lines.push("");
  lines.push(
    "The DS-Kit ships " + count +
    " icons. They are documented as one grouped, searchable catalog — with live, themeable glyphs — on the **[Icons foundations page](/foundations/icons/)**."
  );
  lines.push("");
  lines.push(
    "Unlike interactive components, icons have no per-icon documentation page; browse and copy them from the catalog."
  );
  lines.push("");
  return lines.join("\n");
}

function buildPage(categoryLabel, slug, components) {
  const lines = [];
  lines.push("---");
  lines.push('title: "' + escapeQuotes(categoryLabel) + '"');
  lines.push("---");
  lines.push("");
  lines.push("import ComponentCard from \"" + COMPONENT_IMPORT + "\";");
  lines.push("");
  lines.push(components.length + " " + (components.length === 1 ? "component" : "components"));
  lines.push("");
  lines.push("<div class=\"category-grid\">");
  for (const c of components) {
    lines.push(
      "  <ComponentCard slug=\"" + c.slug +
      "\" name=\"" + escapeQuotes(c.name) +
      "\" category=\"" + escapeQuotes(categoryLabel) +
      "\" categorySlug=\"" + slug + "\" />"
    );
  }
  lines.push("</div>");
  lines.push("");
  return lines.join("\n");
}

function main(opts) {
  opts = opts || {};
  const registryPath = opts.registryPath || DEFAULT_REGISTRY;
  const outDir = opts.outDir || DEFAULT_OUT_DIR;

  const dskit = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const byCategory = {};

  for (const slug of Object.keys(dskit.components)) {
    const entry = dskit.components[slug];
    if (!entry.category) continue;
    const catSlug = loader.normalizeCategorySlug(entry.category);
    if (!catSlug) {
      throw new Error(
        "generate-category-pages: category '" + entry.category +
        "' on component '" + slug + "' slugified to empty — fix the label in dskit.json"
      );
    }
    if (!byCategory[catSlug]) byCategory[catSlug] = { label: entry.category, items: [] };
    byCategory[catSlug].items.push({
      slug: slug,
      name: entry.name || slug,
    });
  }

  const catSlugs = Object.keys(byCategory).sort();
  if (catSlugs.length === 0) {
    throw new Error(
      "generate-category-pages: no components have a category — registry at " +
      registryPath + " has no categorized entries"
    );
  }

  fs.mkdirSync(outDir, { recursive: true });

  for (const catSlug of catSlugs) {
    const group = byCategory[catSlug];
    if (group.items.length === 0) {
      // Defensive — current grouping never produces empty groups, but a
      // future filter could. Loud-fail per the spec's verification gate.
      throw new Error(
        "generate-category-pages: category '" + group.label + "' has no components — empty group"
      );
    }
    group.items.sort(function (a, b) { return a.name.localeCompare(b.name); });
    const body = catSlug === "icons"
      ? buildIconsPage(group.label, group.items.length)
      : buildPage(group.label, catSlug, group.items);
    fs.writeFileSync(path.join(outDir, catSlug + ".mdx"), body);
  }

  return catSlugs;
}

if (require.main === module) {
  const written = main();
  process.stdout.write("[generate-category-pages] wrote " + written.length + " category pages\n");
}

module.exports = { main: main, buildPage: buildPage };

"use strict";

/**
 * content-anchors.cjs — derives the section-heading → content-family-page
 * map that both generate-component-pages.cjs (via render-mdx.cjs's
 * renderRelatedPatterns) and sync-vendored-md.cjs need.
 *
 * Why this exists: the docs site used to publish ALL content guidance as one
 * page (/content), so a component's "Related patterns" link could always
 * point at `content/#<slug>`. The knowledge substrate ships that guidance
 * pre-split by family (vendor/content/dist/{writing,patterns,product}.md);
 * splitting the docs site to match means a pattern slug like
 * `object-preview-panels` now lives on a DIFFERENT page than a slug like
 * `forms` (product vs. patterns — see each file's own H2 headings). The
 * mapping must be derived from the vendored files, never hardcoded, so a
 * future re-shuffle of sections between families is picked up automatically
 * instead of silently producing a dead anchor.
 *
 * Ordering constraint: generate-component-pages.cjs (which resolves pattern
 * links via this map) runs BEFORE sync-vendored-md.cjs in the prebuild chain
 * (see package.json). So this module reads vendor/content/dist/*.md
 * directly — never anything sync-vendored-md.cjs produces.
 *
 * No I/O happens at require-time; callers pass a repoRoot into
 * buildSectionPageMap() explicitly (mirrors the rest of this codebase's
 * "read vendor once in main(), inject the result" pattern — see
 * render-mdx.cjs's setMediaIndex/setAnatomyIndex/setSlugToPathMap).
 */

var fs = require("fs");
var path = require("path");

// The content-family pages a `## Heading` can resolve to post-split. Keep in
// sync with sync-vendored-md.cjs's PAGES table: those three (not the
// "content" index, which only carries the "Global guidelines" section that
// has no other home) are where a fanned-out pattern section actually lives.
var FAMILY_PAGES = [
  { pageSlug: "writing", source: "vendor/content/dist/writing.md" },
  { pageSlug: "patterns", source: "vendor/content/dist/patterns.md" },
  { pageSlug: "product", source: "vendor/content/dist/product.md" },
];

// Matches an H2 line ("## Heading text"), not H3+ ("### ..." has a third
// "#" immediately after, which fails the [ \t]+ requirement here).
var H2_LINE = /^##[ \t]+(.+?)[ \t]*$/gm;

/**
 * Slugify a heading the same way Starlight's default heading-id plugin does
 * for the plain ASCII, punctuation-light headings this content uses:
 * lowercase, spaces → hyphens, strip characters outside [a-z0-9 -], collapse
 * runs of hyphens, trim leading/trailing hyphens. Verified to match the
 * existing shipped anchors (e.g. "Object preview panels" → "object-preview-
 * panels", "Lineage-specific UI" → "lineage-specific-ui").
 * @param {string} text
 * @returns {string}
 */
function slugifyHeading(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Split a markdown document into its top-level (H2) sections.
 * @param {string} markdown
 * @returns {Array<{heading: string, slug: string, body: string}>} body is the
 *   raw markdown from the "## Heading" line up to (not including) the next H2,
 *   trailing whitespace trimmed.
 */
function splitH2Sections(markdown) {
  var text = String(markdown || "");
  var headings = [];
  var m;
  H2_LINE.lastIndex = 0;
  while ((m = H2_LINE.exec(text)) !== null) {
    headings.push({ heading: m[1].trim(), index: m.index });
  }
  return headings.map(function (entry, i) {
    var end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    var body = text.slice(entry.index, end).replace(/\s+$/, "");
    return { heading: entry.heading, slug: slugifyHeading(entry.heading), body: body };
  });
}

/**
 * Extract one H2 section's full body (heading line included) by its exact
 * heading text. Used by sync-vendored-md.cjs to pull "Global guidelines" out
 * of vendor/content/dist/global.md — that section has no home on any of the
 * three split family pages, so the /content index page is built from it
 * directly rather than duplicating prose by hand.
 * @param {string} markdown
 * @param {string} headingText - exact heading text, e.g. "Global guidelines"
 * @returns {string}
 * @throws if no H2 with that exact heading text exists
 */
function extractSection(markdown, headingText) {
  var sections = splitH2Sections(markdown);
  var found = sections.filter(function (s) { return s.heading === headingText; });
  if (!found.length) {
    throw new Error(
      "content-anchors: heading '## " + headingText + "' not found (" +
        sections.length + " H2 section(s) present: " +
        sections.map(function (s) { return s.heading; }).join(", ") + ")",
    );
  }
  return found[0].body;
}

/**
 * Build the section-slug → content-family-page-slug map by reading the three
 * split vendor files and slugifying each of their H2 headings.
 * @param {string} [repoRoot] - defaults to the actian-ds-docs repo root
 * @returns {Record<string,string>} e.g. { "object-preview-panels": "product" }
 * @throws if a source file is missing, or the same section slug appears on
 *   two different family pages (a genuine authoring conflict — a heading
 *   must resolve to exactly one page)
 */
function buildSectionPageMap(repoRoot) {
  var root = repoRoot || path.resolve(__dirname, "..", "..");
  var map = {};
  FAMILY_PAGES.forEach(function (fam) {
    var srcPath = path.join(root, fam.source);
    if (!fs.existsSync(srcPath)) {
      throw new Error("content-anchors: expected vendored file missing: " + srcPath);
    }
    var raw = fs.readFileSync(srcPath, "utf8");
    splitH2Sections(raw).forEach(function (section) {
      if (!section.slug) return;
      if (map[section.slug] && map[section.slug] !== fam.pageSlug) {
        throw new Error(
          "content-anchors: section slug '" + section.slug + "' (\"" + section.heading +
            "\") appears on both '" + map[section.slug] + "' and '" + fam.pageSlug +
            "' — a heading must resolve to exactly one content-family page.",
        );
      }
      map[section.slug] = fam.pageSlug;
    });
  });
  return map;
}

/**
 * Resolve a "Related patterns" pattern slug (e.g. from a guideline's
 * `source: "pattern:<slug>"` marker) to the content-family page it now lives
 * on. Throws — naming the slug — rather than letting a caller emit a dead
 * anchor when the substrate references a section that doesn't exist in any
 * of the three split files.
 * @param {string} slug
 * @param {Record<string,string>} sectionPageMap - from buildSectionPageMap()
 * @returns {string} page slug, e.g. "product"
 * @throws if the slug matches no section
 */
function resolvePatternPage(slug, sectionPageMap) {
  var map = sectionPageMap || {};
  var pageSlug = map[slug];
  if (!pageSlug) {
    throw new Error(
      "content-anchors: pattern slug '" + slug + "' does not match any H2 section in " +
        "writing.md, patterns.md, or product.md. Either the section was renamed/removed in " +
        "the knowledge substrate, or the pattern reference is stale — fix one or the other; " +
        "do not let this resolve to a dead link.",
    );
  }
  return pageSlug;
}

module.exports = {
  FAMILY_PAGES: FAMILY_PAGES,
  slugifyHeading: slugifyHeading,
  splitH2Sections: splitH2Sections,
  extractSection: extractSection,
  buildSectionPageMap: buildSectionPageMap,
  resolvePatternPage: resolvePatternPage,
};

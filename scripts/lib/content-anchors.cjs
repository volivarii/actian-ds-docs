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
// github-slugger is the exact library Astro's own heading-id plugin uses
// (@astrojs/markdown-remark's rehype-heading-ids.js: `new Slugger()` per
// file) — see slugifyHeading()/splitH2Sections() below for why we depend on
// it directly instead of hand-rolling an approximation. v2 is ESM-only
// ("type": "module", no "main"-compatible CJS export), but Node's stable
// require(esm) support (unflagged since 22.12.0, which this repo's
// engines.node already requires) lets a synchronous require() here resolve
// it, so no caller needs to become async.
var GithubSluggerModule = require("github-slugger");
var GithubSlugger = GithubSluggerModule.default || GithubSluggerModule;

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
 * Slugify ONE heading using github-slugger — the same library, same version,
 * that Starlight's build actually uses for heading ids (Astro's
 * @astrojs/markdown-remark rehype-heading-ids.js constructs `new Slugger()`
 * and calls `.slug(text)` per heading). This is a genuine equivalence, not an
 * approximation: it correctly handles cases a hand-rolled regex previously
 * got wrong, e.g. slug("Do / Don't") === "do--dont" (a `/` becomes a bare
 * removed character leaving TWO adjacent hyphens, which github-slugger does
 * NOT collapse — a former version of this function incorrectly collapsed
 * hyphen runs and returned "do-dont" instead).
 *
 * Scope note: this constructs a FRESH GithubSlugger instance per call, so it
 * matches Starlight's output for a heading that is the first (or only)
 * occurrence of its text in a document. github-slugger's slug() is stateful
 * per instance — Starlight dedupes a REPEATED heading within the same file
 * by appending "-1", "-2", etc. from a single slugger shared across that
 * file's headings. This function cannot reproduce that cross-heading dedup
 * because it has no notion of "the rest of the document". For a full
 * document scan where repeats must dedupe exactly like Starlight,
 * splitH2Sections() below shares ONE slugger instance across all of a
 * document's H2 headings instead of calling this function.
 * @param {string} text
 * @returns {string}
 */
function slugifyHeading(text) {
  var slugger = new GithubSlugger();
  return slugger.slug(String(text || ""));
}

/**
 * Split a markdown document into its top-level (H2) sections.
 *
 * Uses ONE GithubSlugger instance for the whole document (constructed fresh
 * per call, never shared across calls/files) — this mirrors Astro's
 * rehype-heading-ids.js exactly, which builds `new Slugger()` once per file
 * and slugs every heading against it in document order. That means a heading
 * repeated within THIS document gets the same "-1", "-2", ... suffix
 * Starlight's real build would produce, and slugging one file's headings can
 * never pollute another file's (or another call's) results.
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
  var slugger = new GithubSlugger();
  return headings.map(function (entry, i) {
    var end = i + 1 < headings.length ? headings[i + 1].index : text.length;
    var body = text.slice(entry.index, end).replace(/\s+$/, "");
    return { heading: entry.heading, slug: slugger.slug(entry.heading), body: body };
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

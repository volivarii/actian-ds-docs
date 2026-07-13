"use strict";

/**
 * sync-vendored-md.cjs — Build-time copy of vendored prose MDs into the
 * Starlight docs collection so they render natively (right-rail TOC,
 * proper H2 styling, header-injected meta tags) instead of via marked +
 * set:html.
 *
 * Run by prebuild/predev, AFTER generate-component-pages.cjs: the bare-slug
 * link rewrite below reads the slug→path map that generator emits.
 *
 * Outputs (all gitignored — regenerated each build), one Starlight page per
 * content family — the /content page split from a single giant page into these:
 *   src/content/docs/content/index.md    — index: "Global guidelines" (the
 *                                           only section with no family home)
 *                                           + links to the three pages below
 *   src/content/docs/content/writing.md  — vendor/content/dist/writing.md
 *   src/content/docs/content/patterns.md — vendor/content/dist/patterns.md
 *   src/content/docs/content/product.md  — vendor/content/dist/product.md
 *
 * NOTE: the index page is emitted to content/index.md, never a sibling
 * content.md alongside the content/ directory — Starlight renders BOTH a
 * file and a same-named directory if they coexist. Starlight's docsLoader
 * strips the trailing "/index" off content/index.md's id, so it still
 * serves at the /content route (and its .md twin still resolves to
 * /content.md — see buildFrontmatter's twinHref, unchanged for this slug).
 */

var fs = require("fs");
var path = require("path");
var renderMdx = require("./lib/render-mdx.cjs");
var contentAnchors = require("./lib/content-anchors.cjs");

var REPO_ROOT = path.resolve(__dirname, "..");
var OUT_DIR = path.join(REPO_ROOT, "src", "content", "docs");
var SLUG_PATHS = path.join(REPO_ROOT, "src", "data", "slug-paths.json");

// Resolve vendored.json once for version + timestamp metadata.
var vendored = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "vendored.json"), "utf8"));
var VERSION = vendored.knowledge_repo_resolved_version || "unknown";
var UPDATED = vendored.vendored_at || "";

// PAGES — { slug, file, source path, title, description, .md URL twin }.
//
// `slug` is the logical route ("content", "content/writing", ...) — used to
// compute the .md twin href (buildFrontmatter) and to build the index page's
// links to the three family pages.
// `file` is the on-disk path under OUT_DIR (without extension) — the index
// page's is "content/index", NOT "content" (see the file-header note above).
//
// `extractHeading`, when set, marks the index page: instead of copying the
// whole source verbatim, pull out just that one H2 section (it has no home
// on any of the three split family pages) and append a generated links
// block to the other PAGES entries.
var PAGES = [
  {
    slug: "content",
    file: "content/index",
    source: "vendor/content/dist/global.md",
    sourceKey: "content/dist/global.md",
    title: "Content guidelines",
    description: "Global content guidelines, plus writing, pattern, and product-specific guidance — Actian DS.",
    extractHeading: "Global guidelines",
  },
  {
    slug: "content/writing",
    file: "content/writing",
    source: "vendor/content/dist/writing.md",
    sourceKey: "content/dist/writing.md",
    title: "Writing",
    description: "Voice, tone, writing style, capitalization, words to avoid, punctuation, numerical formatting, prepositions, acronyms, plurals, abbreviations, and grid & spacing — Actian DS.",
  },
  {
    slug: "content/patterns",
    file: "content/patterns",
    source: "vendor/content/dist/patterns.md",
    sourceKey: "content/dist/patterns.md",
    title: "Patterns",
    description: "UX-pattern content guidance: empty and system states, forms, icons, notifications and messaging, onboarding, validation messages, and wizards — Actian DS.",
  },
  {
    slug: "content/product",
    file: "content/product",
    source: "vendor/content/dist/product.md",
    sourceKey: "content/dist/product.md",
    title: "Product",
    description: "Product-specific content guidance: lineage-specific UI, object preview panels, and related content panels — Actian DS.",
  },
];

function stripFirstH1(body) {
  // Strip the first '# Heading' line (Starlight renders the title from
  // frontmatter; keeping the source-level h1 would double up).
  return body.replace(/^\s*#[^\n#][^\n]*\n+/, "");
}

function buildFrontmatter(page) {
  // page.slug ("content", "content/writing", ...) drives the twin href, NOT
  // page.file — the index page's file is "content/index" on disk, but the
  // route (and its .md twin) is "/content" / "/content.md" (Starlight's
  // docsLoader strips the trailing "/index" segment from the entry id).
  var twinHref = "/actian-ds-docs/" + page.slug + ".md";
  return [
    "---",
    "title: " + JSON.stringify(page.title),
    "description: " + JSON.stringify(page.description),
    "head:",
    "  - tag: meta",
    "    attrs: { name: \"actian-ds-slug\", content: " + JSON.stringify(page.slug) + " }",
    "  - tag: meta",
    "    attrs: { name: \"actian-ds-source\", content: " + JSON.stringify(page.sourceKey) + " }",
    "  - tag: meta",
    "    attrs: { name: \"actian-ds-version\", content: " + JSON.stringify(VERSION) + " }",
    "  - tag: meta",
    "    attrs: { name: \"actian-ds-updated\", content: " + JSON.stringify(UPDATED) + " }",
    "  - tag: meta",
    "    attrs: { name: \"actian-ds-schema\", content: \"1\" }",
    "  - tag: link",
    "    attrs: { rel: \"alternate\", type: \"text/markdown\", href: " + JSON.stringify(twinHref) + " }",
    "---",
    "",
  ].join("\n");
}

// Build the index page's "Explore by family" links block from the other
// PAGES entries, so it can never drift from the actual set of family pages —
// no hand-maintained duplicate list to fall out of sync.
function buildFamilyLinksSection(familyPages) {
  var lines = familyPages.map(function (p) {
    return "- [" + p.title + "](/" + p.slug + "/) — " + p.description;
  });
  return "## Explore by family\n\n" + lines.join("\n");
}

// Load the slug→path map emitted by generate-component-pages.cjs and hand it
// to render-mdx, so rewriteComponentLinksMarkdown() below resolves the same
// slugs, aliases, and removals the component pages use. Missing map = prebuild
// ran out of order; fail loudly rather than silently shipping dead links.
function loadSlugPaths() {
  if (!fs.existsSync(SLUG_PATHS)) {
    throw new Error(
      "sync-vendored-md: " + SLUG_PATHS + " not found. It is emitted by " +
        "generate-component-pages.cjs, which must run BEFORE this script " +
        "(see the prebuild chain in package.json).",
    );
  }
  renderMdx.setSlugToPathMap(JSON.parse(fs.readFileSync(SLUG_PATHS, "utf8")));
}

// Pre-split builds wrote a single src/content/docs/content.md file. .gitignore
// only ignores the post-split src/content/docs/content/ directory now, so a
// leftover content.md from an old working tree is untracked AND unignored —
// left in place it sits alongside the content/ directory this script writes
// below and Starlight logs a "Duplicate id \"content\"" warning at build time
// (content/index.md still wins, so the build itself isn't broken, but it's a
// stray file an unwary `git add -A` could pick up). Remove it defensively
// before writing the new pages.
var STALE_PRESPLIT_CONTENT_MD = path.join(OUT_DIR, "content.md");

function removeStalePresplitContentMd() {
  if (fs.existsSync(STALE_PRESPLIT_CONTENT_MD)) {
    fs.unlinkSync(STALE_PRESPLIT_CONTENT_MD);
    console.log("sync-vendored-md: removed stale pre-split src/content/docs/content.md");
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  loadSlugPaths();
  removeStalePresplitContentMd();

  var familyPages = PAGES.filter(function (p) { return !p.extractHeading; });

  PAGES.forEach(function (page) {
    var srcPath = path.join(REPO_ROOT, page.source);
    if (!fs.existsSync(srcPath)) {
      process.stderr.write("[sync-vendored-md] WARNING: source missing: " + srcPath + "\n");
      return;
    }
    var raw = fs.readFileSync(srcPath, "utf8");
    var body;
    if (page.extractHeading) {
      // The index page: pull just the "Global guidelines" section out of the
      // combined file (it has no home on any split family page) and append
      // links to the three family pages.
      body = contentAnchors.extractSection(raw, page.extractHeading);
      body = renderMdx.rewriteComponentLinksMarkdown(body);
      body += "\n\n" + buildFamilyLinksSection(familyPages);
    } else {
      body = stripFirstH1(raw);
      // Knowledge content cross-references components by bare slug:
      // `[tabs](tabs)`, `[date input](input-date)`. Copied verbatim those reach
      // the HTML as relative links that resolve to nothing, and the links
      // validator fails the build on every new one. Resolve them to real page
      // paths (root-absolute; remark-base-links applies the site base at
      // build time) and degrade slugs with no page to plain text.
      body = renderMdx.rewriteComponentLinksMarkdown(body);
    }
    var out = buildFrontmatter(page) + body;
    var outPath = path.join(OUT_DIR, page.file + ".md");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, out);
    console.log("sync-vendored-md: wrote src/content/docs/" + page.file + ".md");
  });
}

if (require.main === module) main();

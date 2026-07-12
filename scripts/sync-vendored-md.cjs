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
 * Outputs (all gitignored — regenerated each build):
 *   src/content/docs/content.md
 */

var fs = require("fs");
var path = require("path");
var renderMdx = require("./lib/render-mdx.cjs");

var REPO_ROOT = path.resolve(__dirname, "..");
var OUT_DIR = path.join(REPO_ROOT, "src", "content", "docs");
var SLUG_PATHS = path.join(REPO_ROOT, "src", "data", "slug-paths.json");

// Resolve vendored.json once for version + timestamp metadata.
var vendored = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "vendored.json"), "utf8"));
var VERSION = vendored.knowledge_repo_resolved_version || "unknown";
var UPDATED = vendored.vendored_at || "";

// PAGES — { slug, source path, title, description, .md URL twin }
var PAGES = [
  {
    // Phase 4b: the /content page now renders global / cross-cutting
    // content guidance only (voice, tone, terminology, UX-pattern topics).
    // Component-scoped content guidance lives on each component page,
    // sourced from the per-component guideline JSONs. The full transitional
    // content.md concat is no longer the docs source.
    slug: "content",
    source: "vendor/content/dist/global.md",
    sourceKey: "content/dist/global.md",
    title: "Content guidelines",
    description: "Voice, tone, terminology, and UX-pattern copy guidance — Actian DS.",
  },
];

function stripFirstH1(body) {
  // Strip the first '# Heading' line (Starlight renders the title from
  // frontmatter; keeping the source-level h1 would double up).
  return body.replace(/^\s*#[^\n#][^\n]*\n+/, "");
}

function buildFrontmatter(page) {
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

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  loadSlugPaths();

  PAGES.forEach(function (page) {
    var srcPath = path.join(REPO_ROOT, page.source);
    if (!fs.existsSync(srcPath)) {
      process.stderr.write("[sync-vendored-md] WARNING: source missing: " + srcPath + "\n");
      return;
    }
    var raw = fs.readFileSync(srcPath, "utf8");
    var body = stripFirstH1(raw);
    // Knowledge content cross-references components by bare slug:
    // `[tabs](tabs)`, `[date input](input-date)`. Copied verbatim those reach
    // the HTML as relative links that resolve to nothing, and the links
    // validator fails the build on every new one. Resolve them to real page
    // paths (root-absolute; remark-base-links applies the site base at build
    // time) and degrade slugs with no page to plain text.
    body = renderMdx.rewriteComponentLinksMarkdown(body);
    var out = buildFrontmatter(page) + body;
    fs.writeFileSync(path.join(OUT_DIR, page.slug + ".md"), out);
    console.log("sync-vendored-md: wrote src/content/docs/" + page.slug + ".md");
  });
}

if (require.main === module) main();

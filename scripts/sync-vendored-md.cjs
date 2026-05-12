"use strict";

/**
 * sync-vendored-md.cjs — Build-time copy of vendored prose MDs into the
 * Starlight docs collection so they render natively (right-rail TOC,
 * proper H2 styling, header-injected meta tags) instead of via marked +
 * set:html.
 *
 * Run by prebuild/predev.
 *
 * Outputs (all gitignored — regenerated each build):
 *   src/content/docs/accessibility.md
 *   src/content/docs/content.md
 */

var fs = require("fs");
var path = require("path");

var REPO_ROOT = path.resolve(__dirname, "..");
var OUT_DIR = path.join(REPO_ROOT, "src", "content", "docs");

// Resolve vendored.json once for version + timestamp metadata.
var vendored = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "vendored.json"), "utf8"));
var VERSION = vendored.knowledge_repo_resolved_version || "unknown";
var UPDATED = vendored.vendored_at || "";

// PAGES — { slug, source path, title, description, .md URL twin }
var PAGES = [
  {
    slug: "accessibility",
    source: "vendor/accessibility/accessibility.md",
    sourceKey: "accessibility/accessibility.md",
    title: "Accessibility",
    description: "WCAG 2.2 AA guidance for the Actian DS.",
  },
  {
    slug: "content",
    source: "vendor/content/dist/content.md",
    sourceKey: "content/dist/content.md",
    title: "Content guidelines",
    description: "Voice, terminology, UI copy patterns — Actian DS content.",
  },
];

function stripFirstH1(body) {
  // Strip the first '# Heading' line (Starlight renders the title from
  // frontmatter; keeping the source-level h1 would double up).
  return body.replace(/^\s*#[^\n#][^\n]*\n+/, "");
}

function convertJekyllFrontmatterToHeadings(body) {
  // vendor/content/dist/content.md is a concatenated bundle of source
  // files where each retains Jekyll-style frontmatter at the top:
  //
  //     ---
  //     title: "Buttons"
  //     nav_order: 4
  //     ---
  //
  // The source MDs use that title: as the de facto section header — there
  // is no '## Buttons' heading in the body. Naive stripping deletes the
  // structure entirely. Instead, convert each frontmatter block into a
  // proper '## Title' heading so the page hierarchy is preserved (and the
  // right-rail TOC + cross-link anchors get usable slugs).
  //
  // Strictness:
  //   - Opening '---' must be followed IMMEDIATELY by 'title:'; that
  //     prevents matching the gap between an earlier HR '---' and a
  //     later real frontmatter block.
  //   - Body is bounded to ≤10 lines before the closing '---'.
  return body.replace(
    /\n---\n[ \t]*title:[ \t]*"((?:[^"\\]|\\.)*)"[ \t]*\n(?:[^\n]*\n){0,10}---\n/g,
    function (_, title) {
      return "\n## " + title.replace(/\\(.)/g, "$1").trim() + "\n";
    },
  );
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

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  PAGES.forEach(function (page) {
    var srcPath = path.join(REPO_ROOT, page.source);
    if (!fs.existsSync(srcPath)) {
      process.stderr.write("[sync-vendored-md] WARNING: source missing: " + srcPath + "\n");
      return;
    }
    var raw = fs.readFileSync(srcPath, "utf8");
    var body = convertJekyllFrontmatterToHeadings(stripFirstH1(raw));
    var out = buildFrontmatter(page) + body;
    fs.writeFileSync(path.join(OUT_DIR, page.slug + ".md"), out);
    console.log("sync-vendored-md: wrote src/content/docs/" + page.slug + ".md");
  });
}

if (require.main === module) main();

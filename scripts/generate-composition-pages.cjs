"use strict";
var fs = require("fs");
var path = require("path");
var R = require("./lib/composition-resolve.cjs");
var escapeMdx = require("./lib/mdx-escape.cjs").escapeMarkdown;

var ROOT = path.resolve(__dirname, "..");
var FOUNDATIONS_DIST = path.join(ROOT, "vendor", "foundations", "dist");
var MANIFEST = path.join(ROOT, "src", "data", "composition", "foundations.json");
var OUT_DIR = path.join(ROOT, "src", "content", "docs", "foundations");

// Quote a YAML scalar so values with &, :, #, > etc. don't corrupt the frontmatter.
function yamlScalar(s) {
  return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

// list block → markdown (copied from generate-foundations-pages.cjs)
function renderListItem(item) {
  if (typeof item === "string") return "- " + escapeMdx(item);
  if (item.do) return "- **Do:** " + escapeMdx(item.do);
  if (item.dont) return "- **Don't:** " + escapeMdx(item.dont);
  if (item.term && item.rule) return "- **" + escapeMdx(item.term) + ":** " + escapeMdx(item.rule);
  return "- " + escapeMdx(JSON.stringify(item));
}

function renderBlock(block) {
  if (block.type === "list") return (block.items || []).map(renderListItem).join("\n");
  if (block.type === "table") {
    // JSX so TokenTable renders swatches + status, matching the hand-authored pages.
    return "<TokenTable\n  headers={" + JSON.stringify(block.headers || []) +
      "}\n  rows={" + JSON.stringify(block.rows || []) +
      "}\n  showSwatch={true}\n/>";
  }
  console.warn("generate-composition-pages: skipping unknown block type '" + block.type + "'");
  return "";
}

function renderSection(sec) {
  var parts = [];
  if (sec.heading) parts.push("## " + escapeMdx(sec.heading));   // static heading → TOC
  if (sec.intro) parts.push(escapeMdx(sec.intro));
  (sec.blocks || []).forEach(function (b) {
    var r = renderBlock(b);
    if (r) parts.push(r);
  });
  return parts.join("\n\n");
}

function renderPageMdx(page) {
  var fm = ["---", "title: " + yamlScalar(page.title)];
  if (page.description) fm.push("description: " + yamlScalar(page.description));
  fm.push("sidebar:", "  order: " + page.sidebarOrder, "---", "");
  fm.push('import TokenTable from "../../../components/TokenTable.astro";');
  fm.push('import PageMetadata from "../../../components/PageMetadata.astro";', "");
  fm.push("<PageMetadata", '  slug="foundations.' + page.slug + '"',
    '  source="composition/foundations.json"', "  schema={1}", "/>", "");
  var body = (page.resolved || []).map(renderSection).filter(Boolean).join("\n\n");
  return fm.join("\n") + body + "\n";
}

function generate() {
  var manifest = R.loadManifest(MANIFEST);
  var bundle = R.loadBundle(FOUNDATIONS_DIST);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  var written = [];
  manifest.pages.forEach(function (page, idx) {
    if (page.custom) return;                        // hand-authored; manifest only orders it
    var resolved = (page.sections || []).map(function (s) { return R.resolveSection(s, bundle); });
    var mdx = renderPageMdx({ slug: page.slug, title: page.title,
      description: page.description, sidebarOrder: idx, resolved: resolved });
    var out = path.join(OUT_DIR, page.slug + ".mdx");
    fs.writeFileSync(out, mdx, "utf8");
    written.push(page.slug);
  });
  console.log("generate-composition-pages: wrote " + written.length + " pages: " + written.join(", "));
}

if (require.main === module) {
  try { generate(); }
  catch (err) { console.error("generate-composition-pages FAILED:", err.message); process.exit(1); }
}

module.exports = { generate: generate, renderPageMdx: renderPageMdx, renderSection: renderSection };

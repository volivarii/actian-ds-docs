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

// Pure: stamp `sidebar.order` into an MDX frontmatter block. Operates ONLY
// within the region between the first `---` and the next `---`, preserving
// everything else byte-for-byte. Idempotent for the same order value.
function setSidebarOrder(mdxText, order) {
  var lines = mdxText.split("\n");
  if (lines[0] !== "---") return mdxText; // no frontmatter; leave untouched
  // Find the closing `---` of the frontmatter.
  var close = -1;
  for (var i = 1; i < lines.length; i++) {
    if (lines[i] === "---") { close = i; break; }
  }
  if (close === -1) return mdxText; // unterminated frontmatter; leave untouched

  var fm = lines.slice(1, close);          // frontmatter body lines
  var body = lines.slice(close);           // closing `---` + everything after
  var orderLine = "  order: " + order;

  // Locate a top-level `sidebar:` key (no leading whitespace).
  var sidebarIdx = -1;
  for (var j = 0; j < fm.length; j++) {
    if (/^sidebar:\s*$/.test(fm[j])) { sidebarIdx = j; break; }
  }

  if (sidebarIdx === -1) {
    // No sidebar block → append one at the end of the frontmatter.
    fm.push("sidebar:");
    fm.push(orderLine);
  } else {
    // Find the extent of the sidebar block's children (indented lines).
    var orderChildIdx = -1;
    for (var k = sidebarIdx + 1; k < fm.length; k++) {
      if (fm[k].trim() === "") continue;            // skip blank lines within the block
      if (!/^\s+/.test(fm[k])) break;               // dedented non-blank → end of sidebar block
      if (/^\s+order:\s/.test(fm[k])) { orderChildIdx = k; break; }
    }
    if (orderChildIdx !== -1) {
      fm[orderChildIdx] = orderLine; // replace existing order value
    } else {
      // Insert as the first child under `sidebar:`, keeping other children.
      fm.splice(sidebarIdx + 1, 0, orderLine);
    }
  }

  return [lines[0]].concat(fm).concat(body).join("\n");
}

function generate() {
  var manifest = R.loadManifest(MANIFEST);
  var bundle = R.loadBundle(FOUNDATIONS_DIST);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  var written = [];
  var ordered = [];
  manifest.pages.forEach(function (page, idx) {
    if (page.custom) {
      // Hand-authored page: the manifest only ORDERS it. Stamp sidebar.order
      // into the existing file's frontmatter without touching anything else.
      var customPath = path.join(OUT_DIR, page.custom);
      if (!fs.existsSync(customPath)) {
        throw new Error("composition: custom page file not found: " + customPath);
      }
      var text = fs.readFileSync(customPath, "utf8");
      var stamped = setSidebarOrder(text, idx);
      if (stamped !== text) {
        fs.writeFileSync(customPath, stamped, "utf8");
      }
      ordered.push(page.custom);
      return;
    }
    var resolved = (page.sections || []).map(function (s) { return R.resolveSection(s, bundle); });
    var mdx = renderPageMdx({ slug: page.slug, title: page.title,
      description: page.description, sidebarOrder: idx, resolved: resolved });
    var out = path.join(OUT_DIR, page.slug + ".mdx");
    fs.writeFileSync(out, mdx, "utf8");
    written.push(page.slug);
  });
  console.log("generate-composition-pages: wrote " + written.length + " pages, ordered " +
    ordered.length + " custom pages: " + written.concat(ordered).join(", "));
}

if (require.main === module) {
  try { generate(); }
  catch (err) { console.error("generate-composition-pages FAILED:", err.message); process.exit(1); }
}

module.exports = { generate: generate, renderPageMdx: renderPageMdx, renderSection: renderSection, setSidebarOrder: setSidebarOrder };

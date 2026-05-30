"use strict";
var fs = require("fs");
var path = require("path");
var R = require("./lib/composition-resolve.cjs");
var escapeMdx = require("./lib/mdx-escape.cjs").escapeMarkdown;

var ROOT = path.resolve(__dirname, "..");
var DOCS_DIR = path.join(ROOT, "src", "content", "docs");
var COMPOSITION_DIR = path.join(ROOT, "src", "data", "composition");

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

// A table is a token table (→ <TokenTable> with swatches) iff it carries a
// Token or Hex column. Foundations token tables do; generic data tables with a
// "Value" column do not. Keeps the one composed foundations table byte-identical:
// spacing headers are ["Token","Value","Usage","Status"] — still matches on "Token".
var SWATCH_HEADERS = { "Token": true, "Hex": true, "Hex (Figma)": true };
function isTokenTable(block) {
  return (block.headers || []).some(function (h) { return SWATCH_HEADERS[h]; });
}
// GFM cell: escape MDX-dangerous chars, escape the pipe delimiter, collapse newlines.
function cell(v) {
  return escapeMdx(v == null ? "" : String(v)).replace(/\|/g, "\\|").replace(/\n+/g, " ");
}
function renderMarkdownTable(block) {
  var headers = block.headers || [];
  if (headers.length === 0) return "";
  var head = "| " + headers.map(cell).join(" | ") + " |";
  var sep = "| " + headers.map(function () { return "---"; }).join(" | ") + " |";
  var rows = (block.rows || []).map(function (row) {
    return "| " + headers.map(function (h) { return cell(row[h]); }).join(" | ") + " |";
  });
  return [head, sep].concat(rows).join("\n");
}

function renderBlock(block) {
  if (block.type === "list") return (block.items || []).map(renderListItem).join("\n");
  if (block.type === "table") {
    if (isTokenTable(block)) {
      return "<TokenTable\n  headers={" + JSON.stringify(block.headers || []) +
        "}\n  rows={" + JSON.stringify(block.rows || []) +
        "}\n  showSwatch={true}\n/>";
    }
    return renderMarkdownTable(block);
  }
  console.warn("generate-composition-pages: skipping unknown block type '" + block.type + "'");
  return "";
}

function renderSection(sec, depth) {
  var level = Math.min(depth || 2, 5);
  var hashes = new Array(level + 1).join("#");
  var parts = [];
  if (sec.heading) parts.push(hashes + " " + escapeMdx(sec.heading));   // static heading → TOC
  if (sec.intro) parts.push(escapeMdx(sec.intro));
  if (sec.body) parts.push(escapeMdx(sec.body));
  (sec.blocks || []).forEach(function (b) {
    var r = renderBlock(b);
    if (r) parts.push(r);
  });
  (sec.children || []).forEach(function (child) {
    var r = renderSection(child, (depth || 2) + 1);
    if (r) parts.push(r);
  });
  return parts.join("\n\n");
}

function renderPageMdx(page, ctx) {
  ctx = ctx || {};
  var output = ctx.output || "directory";
  var chapterSlug = ctx.chapterSlug || "foundations";
  var manifestFile = ctx.manifestFile || "foundations.json";
  var schemaVersion = ctx.schemaVersion || 1;
  var importPrefix = output === "page" ? "../../" : "../../../";
  var metaSlug = output === "page" ? page.slug : chapterSlug + "." + page.slug;

  var body = (page.resolved || []).map(function (s) { return renderSection(s, 2); })
    .filter(Boolean).join("\n\n");

  var fm = ["---", "title: " + yamlScalar(page.title)];
  if (page.description) fm.push("description: " + yamlScalar(page.description));
  fm.push("sidebar:", "  order: " + page.sidebarOrder, "---", "");
  if (body.indexOf("<TokenTable") !== -1) {
    fm.push('import TokenTable from "' + importPrefix + 'components/TokenTable.astro";');
  }
  fm.push('import PageMetadata from "' + importPrefix + 'components/PageMetadata.astro";', "");
  fm.push("<PageMetadata", '  slug="' + metaSlug + '"',
    '  source="composition/' + manifestFile + '"', "  schema={" + schemaVersion + "}", "/>", "");
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

function generateChapter(file) {
  var manifest = R.loadManifest(path.join(COMPOSITION_DIR, file));
  var chapterSlug = manifest.chapter.slug;
  var output = manifest.chapter.output || "directory";
  var schemaVersion = manifest._schema_version;
  var distRoot = path.join(ROOT, "vendor", chapterSlug, "dist");
  if (!fs.existsSync(distRoot)) {
    throw new Error("composition: dist dir not found for chapter '" + chapterSlug + "': " + distRoot);
  }
  var bundle = R.loadBundle(distRoot);
  var outDir = output === "page" ? DOCS_DIR : path.join(DOCS_DIR, chapterSlug);
  fs.mkdirSync(outDir, { recursive: true });
  var ctx = { chapterSlug: chapterSlug, manifestFile: file, schemaVersion: schemaVersion, output: output };
  var written = [], ordered = [];
  manifest.pages.forEach(function (page, idx) {
    if (page.custom) {
      var customPath = path.join(outDir, page.custom);
      if (!fs.existsSync(customPath)) {
        throw new Error("composition: custom page file not found: " + customPath);
      }
      var text = fs.readFileSync(customPath, "utf8");
      var stamped = setSidebarOrder(text, idx);
      if (stamped !== text) fs.writeFileSync(customPath, stamped, "utf8");
      ordered.push(page.custom);
      return;
    }
    var resolved = (page.sections || []).map(function (s) { return R.resolveSection(s, bundle); });
    var mdx = renderPageMdx({ slug: page.slug, title: page.title, description: page.description,
      sidebarOrder: idx, resolved: resolved }, ctx);
    fs.writeFileSync(path.join(outDir, page.slug + ".mdx"), mdx, "utf8");
    written.push(page.slug);
  });
  console.log("generate-composition-pages [" + chapterSlug + "]: wrote " + written.length +
    " page(s), ordered " + ordered.length + " custom: " + written.concat(ordered).join(", "));
}

function generate() {
  fs.readdirSync(COMPOSITION_DIR)
    .filter(function (f) { return f.endsWith(".json") && f !== "composition.schema.json"; })
    .forEach(generateChapter);
}

if (require.main === module) {
  try { generate(); }
  catch (err) { console.error("generate-composition-pages FAILED:", err.message); process.exit(1); }
}

module.exports = { generate: generate, generateChapter: generateChapter,
  renderPageMdx: renderPageMdx, renderSection: renderSection, setSidebarOrder: setSidebarOrder };

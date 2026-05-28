"use strict";

// Generates foundation pages that need richer-than-single-table rendering.
// Today: just src/content/docs/foundations/overview.mdx (derived from the
// design-guidelines tree in the knowledge substrate; renamed from
// "Design guidelines" to "Overview" and placed at the top of the
// Foundations sidebar via `sidebar: { order: 0 }` frontmatter).
//
// Why a generator (vs. hand-authored MDX or runtime <DesignGuidelinesSection>):
// Starlight's right-rail TOC is built from the static MDX AST at compile
// time. Dynamic JSX headings (e.g. `<Heading id={...}>` computed at runtime)
// don't appear in the TOC. Emitting static markdown `## Heading` lines makes
// Starlight see them.
//
// Source: vendor/foundations/dist/design-guidelines/**/*.json (auto-derived
// from foundations/src/design-guidelines.md § Design Guidelines, knowledge v0.24+; was foundations.md pre-split, NN- prefix dropped in the _order.json migration).
//
// Run: node scripts/generate-foundations-pages.cjs (already wired into
// prebuild + predev).

const fs = require("fs");
const path = require("path");
const { escapeMarkdown: escapeMdx } = require("./lib/mdx-escape.cjs");

const ROOT = path.resolve(__dirname, "..");
const DG_DIR = path.join(
  ROOT,
  "vendor",
  "foundations",
  "dist",
  "design-guidelines",
);
const OUT_FILE = path.join(
  ROOT,
  "src",
  "content",
  "docs",
  "foundations",
  "overview.mdx",
);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Walk DG_DIR; return a Map keyed by section id (e.g. "design-guidelines",
// "design-guidelines/color-usage-rules"). Subdirectory _index.json files
// represent grouped sections with nested children.
function loadBundle() {
  const bundle = new Map();
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        const data = readJson(p);
        if (data && typeof data.id === "string") {
          bundle.set(data.id, data);
        }
      }
    }
  }
  walk(DG_DIR);
  return bundle;
}


function renderListItem(item) {
  if (typeof item === "string") return `- ${escapeMdx(item)}`;
  if (item.do) return `- **Do:** ${escapeMdx(item.do)}`;
  if (item.dont) return `- **Don't:** ${escapeMdx(item.dont)}`;
  if (item.term && item.rule)
    return `- **${escapeMdx(item.term)}:** ${escapeMdx(item.rule)}`;
  return `- ${escapeMdx(JSON.stringify(item))}`;
}

function renderMarkdownTable(block) {
  const headers = block.headers || [];
  const rows = block.rows || [];
  if (headers.length === 0) return "";
  const lines = [];
  lines.push("| " + headers.map((h) => escapeMdx(h)).join(" | ") + " |");
  lines.push("|" + headers.map(() => "---").join("|") + "|");
  for (const row of rows) {
    // Rows are objects keyed by header name (foundations-derive emits this
    // shape, not the [row, row] arrays used elsewhere). Look up by header.
    const cells = Array.isArray(row)
      ? row
      : headers.map((h) => (row && row[h] != null ? row[h] : ""));
    lines.push("| " + cells.map((c) => escapeMdx(c)).join(" | ") + " |");
  }
  return lines.join("\n");
}

function renderBlocks(blocks) {
  return (blocks || [])
    .map((block) => {
      if (block.type === "list") {
        return (block.items || []).map(renderListItem).join("\n");
      }
      if (block.type === "table") {
        return renderMarkdownTable(block);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

// Render a section with body + blocks. Heading is emitted by the caller so
// it ends up as a static markdown line (visible to Starlight's TOC parser).
function renderSectionBody(section) {
  const parts = [];
  if (section.body) parts.push(escapeMdx(section.body));
  const blocks = renderBlocks(section.blocks);
  if (blocks) parts.push(blocks);
  return parts.join("\n\n");
}

function orderedChildren(parent, bundle) {
  if (!parent || !Array.isArray(parent.children)) return [];
  return parent.children
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => bundle.get(c.id))
    .filter(Boolean);
}

// Render a section + its children recursively. `level` is the markdown
// heading level for the section heading (2 for top-level, 3 for grouped,
// etc.). Caps at h5 to avoid h6+.
function renderSectionRecursive(section, bundle, level) {
  const safeLevel = Math.min(level, 5);
  const heading = "#".repeat(safeLevel) + " " + escapeMdx(section.title);
  const body = renderSectionBody(section);
  const children = orderedChildren(section, bundle)
    .map((c) => renderSectionRecursive(c, bundle, safeLevel + 1))
    .filter(Boolean);
  return [heading, body, ...children].filter(Boolean).join("\n\n");
}

function generate() {
  const bundle = loadBundle();
  const root = bundle.get("design-guidelines");
  if (!root) {
    throw new Error(
      "design-guidelines root _index.json not found in " +
        path.relative(ROOT, DG_DIR),
    );
  }

  const topLevel = orderedChildren(root, bundle);
  if (topLevel.length === 0) {
    throw new Error(
      "design-guidelines root has no children — regenerate the knowledge dist tree",
    );
  }

  const body = topLevel
    .map((s) => renderSectionRecursive(s, bundle, 2))
    .join("\n\n");

  const frontmatter = [
    "---",
    "title: Overview",
    "description: Overview of the Actian DS foundations — usage rules, contrast pairings, spacing rhythm, elevation, and grid behavior. Section 3 of the Foundations master spec.",
    "sidebar:",
    "  order: 0",
    "---",
    "",
    'import PageMetadata from "../../../components/PageMetadata.astro";',
    "",
    "<PageMetadata",
    '  slug="foundations.overview"',
    '  source="foundations/dist/design-guidelines/"',
    "  schema={1}",
    "/>",
    "",
    "Overview of the Actian DS foundations — applied rules for color, typography, spacing, elevation, interactive states, breakpoints, focus rings, borders, and placeholder text. Generated from `foundations/src/design-guidelines.md`.",
    "",
  ].join("\n");

  const out = frontmatter + body + "\n";
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, out, "utf8");

  console.log(
    "generate-foundations-pages: wrote " +
      path.relative(ROOT, OUT_FILE) +
      " (" +
      out.length +
      " bytes, " +
      out.split("\n").length +
      " lines)",
  );
}

if (require.main === module) {
  try {
    generate();
  } catch (err) {
    console.error("generate-foundations-pages FAILED:", err.message);
    process.exit(1);
  }
}

module.exports = { generate };

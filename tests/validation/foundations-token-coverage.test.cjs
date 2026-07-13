"use strict";

/**
 * foundations-token-coverage.test.cjs — Coverage gate: every foundations
 * token JSON vendored to vendor/foundations/dist/tokens/ (recursively, at
 * any depth) must be genuinely CONSUMED — and therefore rendered — by the
 * foundations docs pages, not merely have a same-named page on disk.
 *
 * Why this exists: the knowledge substrate can add a new token section, or
 * a new sub-file inside an existing section directory, at any time via its
 * own sync — but the docs pages that render them are hand-authored.
 *
 * An earlier version of this gate only checked that a same-named .mdx FILE
 * existed (existence-by-name), and it only walked the TOP LEVEL of
 * dist/tokens/. Both were holes:
 *   - Existence-by-name doesn't prove consumption. color.mdx satisfied the
 *     old gate via the alias global-color -> color.mdx, while never
 *     actually importing global-color/theme-palettes.json — it rendered
 *     an unrelated JSON (vendor/tokens/tokens.json) instead. The section
 *     was vendored and "covered" on paper but never published.
 *   - Top-level-only missed sub-files. heights-and-trigger-areas and
 *     focus-rings were whole top-level sections that slipped through
 *     unpublished; the same blind spot would just as silently miss a new
 *     borders/outline.json or typography/font-stretch.json added inside an
 *     existing section directory.
 *
 * This repo has TWO legitimate ways a foundations token JSON ends up
 * rendered on a page, and this gate has to recognize both or it produces
 * a false failure, not just avoid false passes:
 *   1. A hand-authored ("custom") page under src/content/docs/foundations/
 *      imports the JSON directly (`import x from ".../tokens/....json"`) —
 *      e.g. borders.mdx, focus-rings.mdx, heights-and-trigger-areas.mdx.
 *   2. A page composed by scripts/generate-composition-pages.cjs from
 *      src/data/composition/foundations.json — that generator resolves a
 *      `sections[].ref` (an `id`, e.g. "tokens/spacing") against the SAME
 *      dist bundle via scripts/lib/composition-resolve.cjs, and inlines
 *      the resolved rows into the generated .mdx at build time. No literal
 *      `import` statement ever appears for that path, yet the tokens are
 *      genuinely published (confirmed: /foundations/spacing renders every
 *      --zen-spacing-* token). This is exactly the `spacing` page today.
 *      A gate that only looked for imports would wrongly flag spacing.json
 *      as unconsumed even though it demonstrably ships on the site.
 *
 * This test walks the REAL vendored directory RECURSIVELY, reads the REAL
 * foundations .mdx sources for imports, AND resolves the REAL composition
 * manifest the same way the generator does (reusing its resolver, not a
 * re-implementation that could drift) — so it catches drift — a missing
 * page OR a genuinely unconsumed JSON, at any depth, via either mechanism —
 * the moment it happens, and names the exact path that's missing.
 */

var fs = require("fs");
var path = require("path");
var test = require("node:test");
var assert = require("node:assert/strict");
var PATHS = require("../../scripts/lib/paths.cjs");
var compositionResolve = require("../../scripts/lib/composition-resolve.cjs");

var TOKENS_DIR = path.join(PATHS.foundations.distDir, "tokens");
var FOUNDATIONS_DOCS_DIR = path.join(
  PATHS.repoRoot,
  "src",
  "content",
  "docs",
  "foundations",
);
var COMPOSITION_DIR = path.join(PATHS.repoRoot, "src", "data", "composition");

// Matches `import <name> from "<path>";` (single or double quotes, optional
// trailing semicolon) — the exact form every hand-authored foundations page
// uses to pull in a vendored token JSON (see borders.mdx,
// heights-and-trigger-areas.mdx, focus-rings.mdx).
var IMPORT_RE = /import\s+[A-Za-z0-9_$]+\s+from\s+["']([^"']+\.json)["']\s*;?/g;

// Recursively collect every token JSON file path under dist/tokens/,
// EXCLUDING `_index.json` files. `_index.json` is a section MANIFEST
// (title, child list, anchors) generated to describe a section's
// children — it is not itself a token payload meant to be rendered as a
// page section, so it is intentionally exempt from the consumption check
// below. This is an explicit, commented skip — not a silent one: every
// other .json file found IS required to be consumed somewhere.
function listSubstrateTokenJsonFiles(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out = out.concat(listSubstrateTokenJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      if (entry.name === "_index.json") return; // section manifest, not a token payload — see comment above
      out.push(full);
    }
  });
  return out;
}

// Mechanism 1: the set of absolute JSON paths actually imported by ANY
// .mdx page under src/content/docs/foundations/, resolved relative to the
// importing file.
function collectImportedJsonPaths() {
  var imported = new Set();
  fs.readdirSync(FOUNDATIONS_DOCS_DIR, { withFileTypes: true }).forEach(function (entry) {
    if (!entry.isFile() || !entry.name.endsWith(".mdx")) return;
    var mdxPath = path.join(FOUNDATIONS_DOCS_DIR, entry.name);
    var body = fs.readFileSync(mdxPath, "utf8");
    var m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(body)) !== null) {
      imported.add(path.resolve(path.dirname(mdxPath), m[1]));
    }
  });
  return imported;
}

// Mechanism 2: the set of bundle `id`s reachable from any composition
// manifest whose chapter targets vendor/foundations/dist (today only
// src/data/composition/foundations.json). Mirrors resolveChildren() in
// composition-resolve.cjs exactly (a ref's node may list further children
// by id, resolved recursively against the same bundle) so this can never
// under-count what the real generator would resolve.
function collectComposedIds() {
  var composed = new Set();
  if (!fs.existsSync(COMPOSITION_DIR)) return composed;

  var bundle = compositionResolve.loadBundle(PATHS.foundations.distDir);

  function walk(id, seen) {
    if (seen.has(id)) return;
    seen.add(id);
    var node = bundle.get(id);
    if (node && Array.isArray(node.children)) {
      node.children.forEach(function (c) { walk(c.id, seen); });
    }
  }

  fs.readdirSync(COMPOSITION_DIR)
    .filter(function (f) { return f.endsWith(".json") && f !== "composition.schema.json"; })
    .forEach(function (f) {
      var manifest = compositionResolve.loadManifest(path.join(COMPOSITION_DIR, f));
      if (!manifest || !manifest.chapter || manifest.chapter.slug !== "foundations") return;
      (manifest.pages || []).forEach(function (page) {
        (page.sections || []).forEach(function (section) {
          if (!section.ref) return;
          var rootId = section.fragment
            ? section.ref + "/" + section.fragment.slice(1)
            : section.ref;
          walk(rootId, composed);
        });
      });
    });

  return composed;
}

test("every vendored foundations token JSON is consumed by a foundations docs page (coverage gate)", function () {
  var tokenFiles = listSubstrateTokenJsonFiles(TOKENS_DIR);
  assert.ok(
    tokenFiles.length > 0,
    "no substrate token JSON files found under " + TOKENS_DIR + " — check the vendor snapshot",
  );

  var imported = collectImportedJsonPaths();
  var composedIds = collectComposedIds();

  var missing = tokenFiles.filter(function (f) {
    if (imported.has(f)) return false;
    var data;
    try {
      data = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch (err) {
      return true; // unreadable/unparsable — definitely not consumed
    }
    return !(data && data.id && composedIds.has(data.id));
  });

  assert.deepEqual(
    missing,
    [],
    "The following foundations token JSON path(s) are vendored but NOT consumed by any " +
      "page under " +
      FOUNDATIONS_DOCS_DIR +
      " (checked both direct `import` statements and " +
      "src/data/composition/foundations.json section refs) — their tokens are vendored but " +
      "never actually rendered:\n" +
      missing
        .map(function (f) {
          return "  - " + path.relative(PATHS.repoRoot, f);
        })
        .join("\n"),
  );
});

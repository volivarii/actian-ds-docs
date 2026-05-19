"use strict";

/**
 * render-mdx.cjs — Pure MDX-string render helpers for generate-component-pages.
 *
 * Each exported function takes structured data (entry, defaults, guideline
 * domains, etc.) and returns an MDX string. No I/O; no side effects beyond
 * the module-level _slugToPath map populated by buildSlugToPathMap().
 *
 * Phase 4a split (2026-05-17): extracted from generate-component-pages.cjs.
 * renderContentItems body is preserved verbatim per Phase 4c deferral (spec §6).
 */

var { escapeMdxIdentifiers } = require("./mdx-escape.cjs");
var { KNOWLEDGE_REPO_URL } = require("./constants.cjs");
var loader = require("./category-defaults-loader.cjs");

// ---------------------------------------------------------------------------
// Private helpers shared across render functions
// ---------------------------------------------------------------------------

function jsLit(value) {
  // Safely embed a JS-object literal into MDX. JSON.stringify produces
  // a valid JS expression for the shapes we render (arrays of objects
  // with string values + nested string arrays).
  return JSON.stringify(value);
}

// Module-level slug-to-absolute-path map.
// Populated once in main() via buildSlugToPathMap() before any pages are written.
// Used by rewriteComponentLinks() to fix bare-slug markdown links that come
// from the knowledge-repo guideline JSONs (e.g. `[ghost buttons](button)`).
var _slugToPath = {};

// Slug aliases: knowledge-repo content uses legacy or shorthand names that
// differ from the canonical registry slugs. Map the knowledge alias → the
// canonical dskit.json slug so rewriteComponentLinks() can resolve the path.
// "forms" is intentionally absent: no standalone component page exists, so
// the link is removed entirely (see the REMOVE_LINK_SLUGS set below).
var SLUG_ALIASES = {
  "notification-toast": "notification",  // alert-banner.json references old name
  "tag": "tag-interactive",              // tag-default.json links to generic "tag"
};

// Slugs with no component page that should have their markdown link syntax
// removed entirely, leaving just the link text. This prevents both broken
// links and relative-link validator errors.
//
// `forms`, `validation-messages`, `wizards` are concept-level slugs in
// vendor/content/dist/global.md + pattern-fanout content that don't have
// dedicated component pages. The astro.config.mjs links-validator exclude
// covers the global /content.md page; this set covers per-component
// content.mdx files (e.g. components/form-input-selection/*/content.mdx)
// where pattern fanout injects the same cross-references.
var REMOVE_LINK_SLUGS = new Set(["forms", "validation-messages", "wizards"]);

/**
 * Rewrite bare-slug markdown links to absolute doc paths.
 * Converts `[label](slug)` to `[label](/components/category/slug/)`
 * when `slug` is a known component. Unknown slugs are left untouched
 * so the validator can still flag genuinely broken links.
 * @param {string} s - input markdown/MDX text
 * @returns {string}
 */
function rewriteComponentLinks(s) {
  if (typeof s !== "string") return s;
  // Match markdown link targets that look like a bare slug (no / prefix,
  // no http://, not a hash anchor). Must be followed by ) to close the link.
  return s.replace(/\[([^\]]+)\]\(([a-z][a-z0-9-]*)\)/g, function (match, label, slug) {
    // Remove link syntax entirely for slugs with no component page.
    if (REMOVE_LINK_SLUGS.has(slug)) return label;
    // Resolve via alias first, then direct slug lookup.
    var canonical = SLUG_ALIASES[slug] || slug;
    var abs = _slugToPath[canonical];
    return abs ? ("[" + label + "](" + abs + ")") : match;
  });
}

// ---------------------------------------------------------------------------
// Exported pure render helpers
// ---------------------------------------------------------------------------

// Wrap <placeholder> spans in code ticks so MDX doesn't try to parse them
// as JSX tags. Knowledge content uses '<assetNames>'-style placeholders in
// rule prose ("Search in <assetNames>"); without this, MDX bails on
// "Expected a closing tag for `<assetNames>`".
function escapeMdxPlaceholders(s) {
  if (typeof s !== "string") return s;
  // Step 1: link rewriting (component-specific — bare slug → absolute path).
  s = rewriteComponentLinks(s);
  // Step 2: angle-bracket escape (shared via lib/mdx-escape.cjs).
  return escapeMdxIdentifiers(s);
}

// Render a { headers, rows } table as a GitHub-flavored markdown table.
// All-empty rows are dropped: the upstream guideline-md-parser can leave a
// trailing ["", ""] artifact row when a source table is followed by a
// Jekyll `{: .do-dont-table}` annotation line — rendering it would produce
// a stray blank row in the docs table.
function renderMarkdownTable(headers, rows) {
  var esc = function (c) {
    return escapeMdxPlaceholders(String(c == null ? "" : c)).replace(/\|/g, "\\|");
  };
  var nonEmptyRows = (rows || []).filter(function (row) {
    return (row || []).some(function (c) {
      return c != null && String(c).trim() !== "";
    });
  });
  var lines = [];
  lines.push("| " + headers.map(esc).join(" | ") + " |");
  lines.push("|" + headers.map(function () { return "---"; }).join("|") + "|");
  nonEmptyRows.forEach(function (row) {
    lines.push("| " + (row || []).map(esc).join(" | ") + " |");
  });
  return lines.join("\n");
}

// content[] items come from the knowledge repo's guideline-md-parser in
// these shapes (current schema; see actian-ds-knowledge/schemas/guideline-
// component.json $defs.contentItem):
//
//   - { prose: string }                       ← standalone paragraph
//   - { bullets: [strings] }                  ← one markdown list
//   - { note: string }                        ← blockquote (opt-in callout)
//   - { do, dont } | { do } | { dont }        ← do/don't table rows or solos
//   - { term, rule|definition }               ← terminology table rows
//   - { table: { headers, rows } }            ← generic table
//   - { example } | { examples: [strings] }   ← code/example blocks
//   - string                                  ← LEGACY bullet (pre-prose
//                                               parser); kept for backwards
//                                               compatibility with old JSON
//
// Items appear in authored source order. We walk them once and emit in that
// same order. The only "bucketing" is collapsing CONSECUTIVE same-type runs
// into one compound component:
//   - consecutive {do,dont} pairs collapse into one <DoDont pairs={[...]}>
//   - consecutive terminology rows collapse into one <TermList items={[...]}>
//   - consecutive legacy strings (or solos like all dos, all donts) collapse
//     into one block
// Different types adjacent to each other emit as separate blocks, preserving
// authored order. This matches universal precedent (Primer, Polaris, Carbon,
// Starlight, Markdoc): the renderer never reorders blocks within a section.
function renderContentItems(items, headingForDiag, WARNINGS) {
  if (!items || !items.length) return "";

  function isPair(it) { return it && typeof it === "object" && it.do && it.dont; }
  function isSoloDo(it) {
    return it && typeof it === "object" && it.do && !it.dont;
  }
  function isSoloDont(it) {
    return it && typeof it === "object" && it.dont && !it.do;
  }
  function isTerm(it) { return it && typeof it === "object" && it.term; }
  function isLegacyBullet(it) { return typeof it === "string"; }

  // Greedy: from index `i`, collect a contiguous run for which predicate(it)
  // is true. Returns { items: [...], next: index-past-the-run }.
  function takeRun(arr, i, predicate) {
    var run = [];
    var j = i;
    while (j < arr.length && predicate(arr[j])) { run.push(arr[j]); j++; }
    return { items: run, next: j };
  }

  function renderDoDontPairs(pairs) {
    var pairsJsx = pairs.map(function (p) {
      return "{ do: " + JSON.stringify(escapeMdxPlaceholders(p.do))
        + ", dont: " + JSON.stringify(escapeMdxPlaceholders(p.dont)) + " }";
    }).join(", ");
    return "<DoDont pairs={[" + pairsJsx + "]} />";
  }

  function renderTermList(rows) {
    var jsx = rows.map(function (t) {
      var def = t.definition || t.rule;
      return "{ term: " + JSON.stringify(escapeMdxPlaceholders(t.term))
        + (def ? ", definition: " + JSON.stringify(escapeMdxPlaceholders(def)) : "")
        + " }";
    }).join(", ");
    return "<TermList items={[" + jsx + "]} />";
  }

  function renderBullets(strings) {
    return strings.map(function (s) {
      return "- " + escapeMdxPlaceholders(s);
    }).join("\n");
  }

  function renderCallout(text) {
    return "<Callout variant=\"note\">\n" + escapeMdxPlaceholders(text) + "\n</Callout>";
  }

  var parts = [];
  var unknown = [];
  var i = 0;
  while (i < items.length) {
    var it = items[i];

    // Consecutive runs that collapse into one compound component.
    if (isPair(it)) {
      var run = takeRun(items, i, isPair);
      parts.push(renderDoDontPairs(run.items));
      i = run.next; continue;
    }
    if (isTerm(it)) {
      var trun = takeRun(items, i, isTerm);
      parts.push(renderTermList(trun.items));
      i = trun.next; continue;
    }
    if (isLegacyBullet(it)) {
      // Collapse consecutive legacy bullet strings into one <ul>. Newer JSON
      // uses {bullets:[...]} so each list is already a unit.
      var brun = takeRun(items, i, isLegacyBullet);
      parts.push(renderBullets(brun.items));
      i = brun.next; continue;
    }
    if (isSoloDo(it)) {
      var drun = takeRun(items, i, isSoloDo);
      parts.push(drun.items.map(function (x) {
        return "<DoDont do={" + JSON.stringify(escapeMdxPlaceholders(x.do)) + "} />";
      }).join("\n\n"));
      i = drun.next; continue;
    }
    if (isSoloDont(it)) {
      var xrun = takeRun(items, i, isSoloDont);
      parts.push(xrun.items.map(function (x) {
        return "<DoDont dont={" + JSON.stringify(escapeMdxPlaceholders(x.dont)) + "} />";
      }).join("\n\n"));
      i = xrun.next; continue;
    }

    // Single-item shapes — emit in source order, no run collapsing.
    if (it && typeof it === "object") {
      if (Array.isArray(it.bullets)) {
        parts.push(renderBullets(it.bullets));
        i++; continue;
      }
      if (typeof it.prose === "string") {
        parts.push(escapeMdxPlaceholders(it.prose));
        i++; continue;
      }
      if (typeof it.note === "string") {
        parts.push(renderCallout(it.note));
        i++; continue;
      }
      if (it.table && Array.isArray(it.table.headers)) {
        parts.push(renderMarkdownTable(it.table.headers, it.table.rows));
        i++; continue;
      }
      if (Array.isArray(it.examples) || typeof it.examples === "string") {
        var ex = Array.isArray(it.examples) ? it.examples : [it.examples];
        parts.push("**Examples:** " + ex.map(function (e) { return "`" + e + "`"; }).join(", "));
        i++; continue;
      }
      if (typeof it.example === "string") {
        parts.push("**Example:** `" + it.example + "`");
        i++; continue;
      }
      if (typeof it.rule === "string") {
        // Bare {rule} (no do/dont/term sibling) — treat as prose.
        parts.push(escapeMdxPlaceholders(it.rule));
        i++; continue;
      }
      unknown.push(it);
    }
    i++;
  }

  if (unknown.length) {
    process.stderr.write("[generate] WARNING: unknown content item shape(s) in section '"
      + (headingForDiag || "") + "': " + JSON.stringify(unknown) + "\n");
    WARNINGS.unknownContentShapes += 1;
  }

  return parts.join("\n\n");
}

// Render one domains.content section: an H3 heading (skipped when empty —
// the parser emits an untitled lead section before the first heading) plus
// its content[], plus one reserved level of `subsections` (H4).
function renderContentSection(s, WARNINGS) {
  var parts = [];
  if (s.heading) parts.push("### " + s.heading);
  var body = renderContentItems(s.content, s.heading, WARNINGS);
  if (body) parts.push(body);
  (s.subsections || []).forEach(function (sub) {
    if (sub.subheading) parts.push("#### " + sub.subheading);
    var subBody = renderContentItems(sub.content, sub.subheading, WARNINGS);
    if (subBody) parts.push(subBody);
  });
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Named render helpers — extracted from the original buildPage body so that
// buildComponent can dispatch them individually by tab config.
// Each helper returns "" when its inputs are absent (stub case).
// ---------------------------------------------------------------------------

function renderOverview(entry) {
  var overviewText = (entry.description && entry.description.trim()) || "";
  if (!overviewText) return "";
  return "## Overview\n\n" + escapeMdxPlaceholders(overviewText);
}

function renderAnatomy(defaults) {
  if (!(defaults && defaults.card_anatomy && Array.isArray(defaults.card_anatomy.parts) && defaults.card_anatomy.parts.length)) return "";
  return '<h2 id="anatomy">Anatomy</h2>\n\n<Anatomy parts={' + jsLit(defaults.card_anatomy.parts) + '} />';
}

function renderVariantsMatrix(entry, defaults) {
  if (entry.variants && Object.keys(entry.variants).length) {
    var axes = Object.entries(entry.variants).map(function (pair) {
      return { axis: pair[0], values: pair[1] };
    });
    return '<h2 id="variants">Variants</h2>\n\n<VariantMatrix variantAxes={' + jsLit(axes) + '} />';
  }
  if (defaults && defaults.card_component && Array.isArray(defaults.card_component.variantAxes) && defaults.card_component.variantAxes.length) {
    return '<h2 id="variants">Variants</h2>\n\n<VariantMatrix variantAxes={' + jsLit(defaults.card_component.variantAxes) + '} />';
  }
  return "";
}

// Alias — used by the "code" tab's variantsTable renderer key.
function renderVariantsTable(entry, defaults) {
  return renderVariantsMatrix(entry, defaults);
}

function renderMotion(defaults) {
  if (!(defaults && defaults.card_motion && Array.isArray(defaults.card_motion.patternRefs))) return "";
  // Pre-resolve at build time — Astro component no longer needs to
  // load the loader at SSR (Phase 4b: ~360 redundant requires removed).
  var resolved = defaults.card_motion.patternRefs.map(function (r) {
    return { ref: r, pattern: loader.resolveMotionRef(r.ref) };
  });
  return '<h2 id="motion">Motion</h2>\n\n<MotionPattern resolvedPatterns={' + jsLit(resolved) + '} />';
}

function renderContentDomain(contentDomain, WARNINGS) {
  if (!contentDomain) return "";
  return "## Content guidelines\n\n" + contentDomain.sections.map(function (s) {
    return renderContentSection(s, WARNINGS);
  }).join("\n\n");
}

function renderA11yRefs(defaults) {
  if (!(defaults && defaults.card_accessibility && Array.isArray(defaults.card_accessibility.requirementRefs))) return "";
  var resolved = defaults.card_accessibility.requirementRefs.map(function (r) {
    return { ref: r, section: loader.resolveAccessibilityRef(r.ref) };
  });
  return "## Accessibility\n\n<AccessibilityRefs resolvedRefs={" + jsLit(resolved) + "} />";
}

function renderConfidenceChips(defaults, contentDomain) {
  if (!defaults || !defaults.confidence) return "";
  var contentConfidence = "low";
  if (contentDomain && contentDomain.status === "approved") contentConfidence = "high";
  else if (contentDomain && contentDomain.status === "draft") contentConfidence = "medium";
  // synthesized (knowledge v0.15.0+ pattern fan-out) = approved pattern source
  // but no per-component authored copy. Medium chip honestly reflects "we have
  // content, but not component-specific" — coverage gap stays visible via
  // tabStatus + dashboard, not via the chip alone.
  else if (contentDomain && contentDomain.status === "synthesized") contentConfidence = "medium";
  var merged = Object.assign({}, defaults.confidence, { content: contentConfidence });
  var chips = Object.entries(merged).map(function (kv) {
    return '<ConfidenceChip variant="' + kv[1] + '" field="' + kv[0] + '" value="' + kv[1] + '" />';
  }).join("\n  ");
  return '<div class="confidence-row">\n  <span class="confidence-row__label">Confidence</span>\n  ' + chips + '\n</div>';
}

function renderResources(slug, entry, registry, guideline) {
  var figmaUrl = (entry.nodeId && registry && registry.fileKey)
    ? "https://www.figma.com/file/" + registry.fileKey + "?node-id=" + String(entry.nodeId).replace(":", "-")
    : null;
  if (!figmaUrl && !guideline) return "";
  var resourceLines = [
    "## Resources",
    "",
  ];
  if (figmaUrl) resourceLines.push("- [Open in Figma](" + figmaUrl + ")");
  if (guideline) {
    var knowledgeUrl = KNOWLEDGE_REPO_URL + "/tree/main/components/src/" + slug;
    resourceLines.push("- [Knowledge source](" + knowledgeUrl + ")");
  }
  return resourceLines.join("\n");
}

function renderStubFooter(categorySlug) {
  if (!categorySlug) return "";
  return '<StubFooter category="' + categorySlug + '" />';
}

// ---------------------------------------------------------------------------
// buildSlugToPathMap — populates the module-level _slugToPath used by
// rewriteComponentLinks(). Must be called once in main() before any render.
// Exported so generate-component-pages.cjs can call it after registry load.
// ---------------------------------------------------------------------------

/**
 * Build the slug → absolute doc path map from the registry.
 * Called once in main() so all renderContentItems() calls can use it.
 * @param {Object} registry - dskit.json parsed object
 * @param {Object} groupCounts - { "catSlug::groupSlug": count } from main()
 * @param {Object} sectionDirs - { [sectionLabel]: dirName } mapping
 * @param {string} defaultSectionDir - fallback dir name
 * @param {Function} slugifyCategory - normalization function
 */
function buildSlugToPathMap(registry, groupCounts, sectionDirs, defaultSectionDir, slugifyCategory) {
  var map = {};
  Object.entries(registry.components).forEach(function (pair) {
    var slug = pair[0];
    var entry = pair[1];
    if (!entry.category) return;
    var sd = sectionDirs[entry.section] || defaultSectionDir;
    var catSlug = slugifyCategory(entry.category);
    var parts = [sd, catSlug];
    if (entry.group) {
      var groupSlug = slugifyCategory(entry.group);
      var key = catSlug + "::" + groupSlug;
      if (groupSlug && groupCounts[key] > 1) {
        parts.push(groupSlug);
      }
    }
    parts.push(slug);
    map[slug] = "/" + parts.join("/") + "/";
  });
  _slugToPath = map;
}

// Module-scoped media index — populated once at prebuild via setMediaIndex
// by generate-component-pages.cjs reading vendor/components/dist/media/
// _index.json (knowledge v0.17.0+ sidecar). Reading from this index instead
// of guideline.media decouples media availability from guideline coverage —
// components with media but no guideline doc (e.g. avatar) still surface.
// Falls back gracefully to "" (no <MediaAsset> emission) when the index
// hasn't been provided or doesn't contain the slug.
var _mediaIndex = null;

function setMediaIndex(idx) {
  _mediaIndex = idx;
}

function renderMediaPreview(slug) {
  if (!_mediaIndex || !_mediaIndex.media) return "";
  var entry = _mediaIndex.media[slug];
  if (!entry || !entry.preview) return "";
  // entry.preview = "components/dist/media/<slug>/preview.png" → strip the
  // vendor prefix; the vendor → public/ mirror in generate-component-pages.cjs
  // puts the file at public/media/<slug>/preview.png.
  var publicPath = "/" + String(entry.preview).replace(/^components\/dist\/media\//, "media/");
  return "<MediaAsset src=" + JSON.stringify(publicPath) + ' alt="" />';
}

module.exports = {
  escapeMdxPlaceholders: escapeMdxPlaceholders,
  renderMarkdownTable: renderMarkdownTable,
  renderOverview: renderOverview,
  renderAnatomy: renderAnatomy,
  renderVariantsTable: renderVariantsTable,
  renderMotion: renderMotion,
  renderContentDomain: renderContentDomain,
  renderA11yRefs: renderA11yRefs,
  renderConfidenceChips: renderConfidenceChips,
  renderMediaPreview: renderMediaPreview,
  setMediaIndex: setMediaIndex,
  renderResources: renderResources,
  renderStubFooter: renderStubFooter,
  buildSlugToPathMap: buildSlugToPathMap,
};

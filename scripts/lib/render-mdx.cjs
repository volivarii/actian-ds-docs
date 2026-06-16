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
//   - { media: { role, layout } }             ← Bucket C design-domain media
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
//
// opts.mediaRoleMap  — the component's role→path map from the media index;
//                      required to render { media } items. When absent, any
//                      { media } items in items[] are treated as unknown shapes.
// opts.seenMediaRoles — a Set<string> that this function MUTATES to record
//                       which roles were rendered via authored { media } items.
//                       Used by renderDesignSections for the auto-append pass.
function renderContentItems(items, headingForDiag, WARNINGS, opts) {
  if (!items || !items.length) return "";
  opts = opts || {};
  var mediaRoleMap = opts.mediaRoleMap || null;
  var seenMediaRoles = opts.seenMediaRoles || null;

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
      if (it.media && typeof it.media === "object" && typeof it.media.role === "string") {
        // Bucket C: design-domain media directive.
        // Requires a mediaRoleMap injected by renderDesignSections. If none is
        // available (item appears outside a design-domain render path), fall
        // through to the unknown bucket so the warning fires.
        if (mediaRoleMap) {
          var mRole = it.media.role;
          var mLayout = it.media.layout || "stack";
          parts.push(
            "<Media role=" + JSON.stringify(mRole) +
            " layout=" + JSON.stringify(mLayout) +
            " media={" + jsLit(mediaRoleMap) + "} />"
          );
          if (seenMediaRoles) seenMediaRoles.add(mRole);
          i++; continue;
        }
        // mediaRoleMap absent — record as unknown so the warning fires.
        unknown.push(it);
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
// opts — forwarded to renderContentItems (e.g. { mediaRoleMap, seenMediaRoles }).
function renderContentSection(s, WARNINGS, opts) {
  var parts = [];
  if (s.heading) parts.push("### " + s.heading);
  var body = renderContentItems(s.content, s.heading, WARNINGS, opts);
  if (body) parts.push(body);
  (s.subsections || []).forEach(function (sub) {
    if (sub.subheading) parts.push("#### " + sub.subheading);
    var subBody = renderContentItems(sub.content, sub.subheading, WARNINGS, opts);
    if (subBody) parts.push(subBody);
  });
  return parts.join("\n\n");
}

// Like renderContentSection but WITHOUT emitting the section's own heading.
// The canonical ## heading is owned by renderDesignSections; subsections
// render at ### level (not #### as in the full content domain).
function renderContentSectionBody(s, WARNINGS, opts) {
  var parts = [];
  var body = renderContentItems(s.content, s.heading, WARNINGS, opts);
  if (body) parts.push(body);
  (s.subsections || []).forEach(function (sub) {
    if (sub.subheading) parts.push("### " + sub.subheading);
    var subBody = renderContentItems(sub.content, sub.subheading, WARNINGS, opts);
    if (subBody) parts.push(subBody);
  });
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Canonical design-section table — one entry per design topic.
// Each entry owns its heading, its media role, the aliases that authored
// design.md sections may use for this topic, and an optional structured
// component factory.
// ---------------------------------------------------------------------------

var DESIGN_SECTIONS = [
  { key: "anatomy",  heading: "Anatomy",        mediaRole: "parts",
    aliases: ["anatomy", "parts"],
    placeholderStructured: true,
    structured: function (entry, defaults, slug) { return renderAnatomy(slug, defaults, entry && entry.name); } },
  { key: "variants", heading: "Variants",        mediaRole: "variations",
    aliases: ["variants", "variations"],
    placeholderStructured: true,
    structured: function (entry, defaults) { return renderVariantsMatrix(entry, defaults); } },
  { key: "spacing",  heading: "Spacing & size",  mediaRole: "spacing",
    aliases: ["spacing & size", "spacing", "spacing and size", "sizing"],
    structured: null },
  { key: "behavior", heading: "Behavior",         mediaRole: "behavior",
    aliases: ["behavior", "motion"],
    structured: function (entry, defaults) { return renderMotion(defaults); } },
  { key: "layout",   heading: "Layout",           mediaRole: "layout",
    aliases: ["layout"],
    structured: null },
];

function normHeading(h) { return String(h || "").trim().toLowerCase(); }

/**
 * Render ALL design-domain sections into a single cohesive output string.
 * For each canonical section: structured component first, then authored
 * prose, then auto-appended media for roles not already covered.
 * Unknown authored headings are appended after the five canonical sections.
 */
function renderDesignSections(entry, defaults, guideline, slug, WARNINGS) {
  var designDomain = guideline && guideline.domains && guideline.domains.design;
  var statusOk = designDomain && ["approved", "draft", "synthesized"].indexOf(designDomain.status) !== -1;
  var authoredSections = (statusOk && Array.isArray(designDomain.sections)) ? designDomain.sections : [];

  var byHeading = {};
  authoredSections.forEach(function (s) {
    if (s.heading) byHeading[normHeading(s.heading)] = s;
  });

  var mediaRoleMap = (_mediaIndex && _mediaIndex.media && _mediaIndex.media[slug]) || null;
  var usedHeadings = new Set();
  var out = [];

  DESIGN_SECTIONS.forEach(function (sec) {
    var matched = null;
    for (var i = 0; i < sec.aliases.length; i++) {
      var hit = byHeading[sec.aliases[i]];
      if (hit) { matched = hit; usedHeadings.add(normHeading(hit.heading)); break; }
    }

    var seenMediaRoles = new Set();
    var body = matched
      ? renderContentSectionBody(matched, WARNINGS, { mediaRoleMap: mediaRoleMap, seenMediaRoles: seenMediaRoles })
      : "";

    // The anatomy section renders the real image-led callout (default.webp +
    // legend) only when a usable capture exists AND no authored prose occupies
    // the section (authored prose wins — see the placeholderStructured gate
    // below). In exactly that case the callout supersedes the separate "parts"
    // media board, so suppress it to avoid two images. When authored prose
    // wins the callout is NOT rendered, so leave the parts board intact —
    // suppressing it then would drop content with nothing to replace it.
    if (sec.key === "anatomy" && !body) {
      var _a = getAnatomy(slug);
      if (_a && isAnatomyUsable(_a)) seenMediaRoles.add("parts");
    }

    var media = "";
    if (mediaRoleMap && (sec.mediaRole in mediaRoleMap) && !seenMediaRoles.has(sec.mediaRole)) {
      media = "<Media role=" + JSON.stringify(sec.mediaRole) +
        ' layout="stack" media={' + jsLit(mediaRoleMap) + "} />";
    }

    // Structured components (<Anatomy>, <VariantMatrix>) are placeholders:
    // emit only when the section has neither authored prose nor Figma media.
    // Once real content exists they are redundant and suppressed.
    var structured = "";
    if (sec.structured) {
      var isPlaceholder = sec.placeholderStructured === true;
      if (!isPlaceholder || (!body && !media)) {
        structured = sec.structured(entry, defaults, slug);
      }
    }

    var blocks = [structured, body, media].filter(Boolean);
    if (blocks.length === 0) return;
    out.push("## " + sec.heading + "\n\n" + blocks.join("\n\n"));
  });

  authoredSections.forEach(function (s) {
    if (!s.heading || usedHeadings.has(normHeading(s.heading))) return;
    WARNINGS.unknownContentShapes = (WARNINGS.unknownContentShapes || 0) + 1;
    process.stderr.write('render-mdx: design.md section "' + s.heading + '" matched no canonical section\n');
    var body = renderContentSectionBody(s, WARNINGS, { mediaRoleMap: mediaRoleMap });
    out.push("## " + s.heading + (body ? "\n\n" + body : ""));
  });

  return out.join("\n\n");
}

// ---------------------------------------------------------------------------
// Named render helpers — extracted from the original buildPage body so that
// buildComponent can dispatch them individually by tab config.
// Each helper returns "" when its inputs are absent (stub case).
// ---------------------------------------------------------------------------

function renderOverview(entry) {
  var raw = (entry.description && entry.description.trim()) || "";
  if (!raw) return "";
  // Figma descriptions carry paragraph breaks (blank lines) and single line
  // breaks; the REST sync preserves them as \n. Emit one <p> per paragraph
  // and a single \n as <br/>. Each <p> is a self-contained inline JSX element
  // on its own line — that parses in MDX; a blank line *inside* one <p> does
  // not, which is why intra-line runs are the only whitespace collapsed.
  return raw
    .split(/\n{2,}/)
    .map(function (para) {
      var lines = para
        .split(/\n/)
        .map(function (l) {
          return escapeMdxPlaceholders(l.replace(/[ \t]+/g, " ").trim());
        })
        .filter(Boolean);
      return lines.length
        ? '<p class="component-description">' + lines.join("<br />") + "</p>"
        : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function renderAnatomy(slug, defaults, name) {
  var anatomy = getAnatomy(slug);
  if (anatomy && isAnatomyUsable(anatomy)) {
    var callout = toCallout(anatomy);
    var props = "parts={" + jsLit(callout.parts) + "} layout={" + jsLit(callout.layout) + "}";
    var img = anatomyImageSrc(slug);
    if (img) props += " image=" + JSON.stringify(img);
    // Strip any leading status/confidence glyph (e.g. "⚠️ Tooltip") so it does
    // not leak into the diagram's screen-reader alt text.
    var cleanName = name ? String(name).replace(/^[^\p{L}\p{N}]+/u, "").trim() : "";
    if (cleanName) props += " name=" + JSON.stringify(cleanName);
    return "<Anatomy " + props + " />";
  }
  // Fallback: category-defaults placeholder (unchanged legacy behavior).
  if (!(defaults && defaults.anatomy && Array.isArray(defaults.anatomy.parts) && defaults.anatomy.parts.length)) return "";
  return "<Anatomy parts={" + jsLit(defaults.anatomy.parts) + "} />";
}

function renderVariantsMatrix(entry, defaults) {
  if (entry.variants && Object.keys(entry.variants).length) {
    var axes = Object.entries(entry.variants).map(function (pair) {
      return { axis: pair[0], values: pair[1] };
    });
    return '<VariantMatrix variantAxes={' + jsLit(axes) + '} />';
  }
  if (defaults && defaults.variants && Array.isArray(defaults.variants.variantAxes) && defaults.variants.variantAxes.length) {
    return '<VariantMatrix variantAxes={' + jsLit(defaults.variants.variantAxes) + '} />';
  }
  return "";
}

function renderMotion(defaults) {
  if (!(defaults && defaults.motion_refs && Array.isArray(defaults.motion_refs.patternRefs))) return "";
  // Pre-resolve at build time — Astro component no longer needs to
  // load the loader at SSR (Phase 4b: ~360 redundant requires removed).
  var resolved = defaults.motion_refs.patternRefs.map(function (r) {
    return { ref: r, pattern: loader.resolveMotionRef(r.ref) };
  });
  return '<MotionPattern resolvedPatterns={' + jsLit(resolved) + '} />';
}

// A section is fanned-in from a global content pattern iff it carries a
// `source: "pattern:<slug>"` marker. Authored (component-owned) sections have
// no `source`. See scripts/content/fanout-patterns.js in the knowledge repo.
function isPatternSection(s) {
  return typeof s.source === "string" && s.source.indexOf("pattern:") === 0;
}

// Render a compact "Related patterns" reference linking to the global /content
// page anchors, instead of inlining the patterns' full content. Used when a
// component HAS its own authored content (so the patterns would otherwise
// duplicate it). Mirrors renderGlobalA11yLink's BASE_URL link style.
function renderRelatedPatterns(slugs) {
  var base = "${import.meta.env.BASE_URL.replace(/\\/?$/, '/')}";
  var humanize = function (slug) {
    return slug.replace(/-/g, " ").replace(/^./, function (c) { return c.toUpperCase(); });
  };
  var links = slugs.map(function (slug) {
    return "- <a href={`" + base + "content/#" + slug + "`}>" + humanize(slug) + "</a>";
  }).join("\n");
  return "### Related patterns\n\nThis component follows shared content patterns. "
    + "See the full guidance on the Content guidelines page:\n\n" + links;
}

// Rule (applies the general "authored takes precedence" principle to the
// content domain): when a component has its OWN authored content, render only
// that and LINK to the related global patterns — inlining the patterns' full
// content alongside authored guidance just duplicates it. When there is no
// authored content (status "synthesized": pattern fan-out only), inline the
// patterns — they ARE the content. (Other domains already render
// authored-OR-fallback per section; this brings content in line.)
function renderContentDomain(contentDomain, WARNINGS) {
  if (!contentDomain) return "";
  var sections = contentDomain.sections || [];
  var authored = sections.filter(function (s) { return !isPatternSection(s); });
  var patternSections = sections.filter(isPatternSection);

  var rendered;
  if (authored.length && patternSections.length) {
    rendered = authored.map(function (s) { return renderContentSection(s, WARNINGS); });
    var seen = {};
    var slugs = [];
    patternSections.forEach(function (s) {
      var slug = s.source.slice("pattern:".length);
      if (slug && !seen[slug]) { seen[slug] = true; slugs.push(slug); }
    });
    if (slugs.length) rendered.push(renderRelatedPatterns(slugs));
  } else {
    rendered = sections.map(function (s) { return renderContentSection(s, WARNINGS); });
  }
  return "## Content guidelines\n\n" + rendered.join("\n\n");
}

function renderA11yRefs(defaults) {
  if (!(defaults && defaults.a11y_refs && Array.isArray(defaults.a11y_refs.requirementRefs))) return "";
  var resolved = defaults.a11y_refs.requirementRefs.map(function (r) {
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

// Module-level anatomy index — the components roll-up from
// vendor/components/dist/anatomy.bundle.json, injected by the generator via
// setAnatomyIndex() (mirrors the media-index pattern above).
var _anatomyIndex = null;
function setAnatomyIndex(idx) { _anatomyIndex = idx; }
function getAnatomy(slug) {
  if (!_anatomyIndex || !_anatomyIndex.components) return null;
  return _anatomyIndex.components[slug] || null;
}

// Resolve the anatomy callout image for a slug: the FIRST captured "parts"
// board — the labeled parts/anatomy diagram from Figma's "Anatomy" / "Parts &
// tokens" section (knowledge media `parts` role, capture:"all" → an array).
// Returns null when the component has no parts capture, so the callout renders
// legend-only rather than borrowing the unrelated default-variant screenshot
// (default.webp is a plain component shot, not an anatomy diagram).
function anatomyImageSrc(slug) {
  if (!_mediaIndex || !_mediaIndex.media) return null;
  var entry = _mediaIndex.media[slug];
  var parts = entry && entry.parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  return "/" + String(parts[0]).replace(/^components\/dist\/media\//, "media/");
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

// True when a captured anatomy is good enough to render as a real callout:
// the root has layout, has at least one named child, and the capture is not
// flagged degraded. NOTE: intentionally NOT gated on quality.ratio — a low
// ratio (e.g. button 0.5) just means deep instances weren't expanded, which
// is irrelevant to a top-level parts legend.
function isAnatomyUsable(anatomy) {
  if (!anatomy || !anatomy.root || !anatomy.root.layout) return false;
  var children = anatomy.root.children;
  if (!Array.isArray(children)) return false;
  var hasNamedChild = children.some(function (c) {
    return c && typeof c.name === "string" && c.name.trim() !== "";
  });
  if (!hasNamedChild) return false;
  var degraded = anatomy.quality && anatomy.quality.degraded;
  if (Array.isArray(degraded) && degraded.length > 0) return false;
  return true;
}

// Reduce a captured anatomy to the callout's render data: a flat list of the
// root's top-level named children (name + kind + optional text), plus the
// root layout for the one-line summary. Deep tree / unresolved flags are
// dropped — irrelevant to a parts legend.
function toCallout(anatomy) {
  var root = (anatomy && anatomy.root) || {};
  var parts = (root.children || [])
    .filter(function (c) { return c && typeof c.name === "string" && c.name.trim() !== ""; })
    .map(function (c) {
      var part = { name: c.name, kind: c.kind || "node" };
      if (typeof c.text === "string" && c.text !== "") part.text = c.text;
      return part;
    });
  return { parts: parts, layout: root.layout || null };
}

module.exports = {
  escapeMdxPlaceholders: escapeMdxPlaceholders,
  renderMarkdownTable: renderMarkdownTable,
  renderOverview: renderOverview,
  renderDesignSections: renderDesignSections,
  renderContentDomain: renderContentDomain,
  renderA11yRefs: renderA11yRefs,
  renderConfidenceChips: renderConfidenceChips,
  renderMediaPreview: renderMediaPreview,
  setMediaIndex: setMediaIndex,
  renderResources: renderResources,
  renderStubFooter: renderStubFooter,
  buildSlugToPathMap: buildSlugToPathMap,
  isAnatomyUsable: isAnatomyUsable,
  toCallout: toCallout,
  setAnatomyIndex: setAnatomyIndex,
  renderAnatomy: renderAnatomy,
};

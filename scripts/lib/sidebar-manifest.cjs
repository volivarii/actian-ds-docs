"use strict";

/**
 * sidebar-manifest.cjs — Pure sidebar JSON builders for generate-component-pages.
 *
 * buildSidebarManifest() produces the categories array consumed by
 * astro.config.mjs (components-sidebar.json / brand-sidebar.json).
 * buildSlugToPathMap() is re-exported here for convenience but lives in
 * render-mdx.cjs (it populates state used by rewriteComponentLinks()).
 *
 * Both functions are pure: no I/O, no side effects.
 *
 * Phase 4a split (2026-05-17): extracted from generate-component-pages.cjs.
 */

// ---------------------------------------------------------------------------
// buildSidebarManifest — generates the components-sidebar.json consumed by
// astro.config.mjs. Replaces autogenerate to avoid the directory+index.mdx
// duplication that occurs with the sub-route tabs architecture.
// ---------------------------------------------------------------------------

function stripEmojiPrefix(label) {
  if (typeof label !== "string") return label;
  // Drop leading Extended_Pictographic runs (incl. variation selectors U+FE0F)
  // plus trailing whitespace. Conservative: only affects characters at the
  // start of the string; embedded emoji mid-name are preserved.
  return label.replace(/^(?:[\p{Extended_Pictographic}️]+\s*)+/u, "");
}

/**
 * @param {Object} registry - dskit.json parsed object
 * @param {Object} opts
 * @param {Set}    opts.excludedCategories
 * @param {Set}    opts.collectionCategories
 * @param {string} opts.targetSection
 * @param {Object} opts.sectionDirs - { [sectionLabel]: dirName }
 * @param {string} opts.defaultSectionDir
 * @param {Function} opts.slugifyCategory
 * @returns {Array}
 */
function buildSidebarManifest(registry, opts) {
  opts = opts || {};
  var excludedCategories = opts.excludedCategories || new Set();
  var collectionCategories = opts.collectionCategories || new Set();
  var targetSection = opts.targetSection || "components";
  var sectionDirs = opts.sectionDirs || {
    Components: "components",
    "Brand Assets": "brand",
  };
  var defaultSectionDir = opts.defaultSectionDir || "components";
  var slugifyCategory = opts.slugifyCategory || function (label) {
    return String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  // Pre-compute groupCounts so we can reproduce the nesting logic.
  var groupCounts = {};
  Object.entries(registry.components).forEach(function (pair) {
    var e = pair[1];
    if (!e.category || !e.group) return;
    if (excludedCategories.has(e.category)) return;
    if (collectionCategories.has(e.category)) return;
    var sd = sectionDirs[e.section] || defaultSectionDir;
    if (sd !== targetSection) return;
    var cs = slugifyCategory(e.category);
    var gs = slugifyCategory(e.group);
    if (!cs || !gs) return;
    groupCounts[cs + "::" + gs] = (groupCounts[cs + "::" + gs] || 0) + 1;
  });

  // Flat sidebar (Kristina docs-feedback #1): components/groups are top-level,
  // categories are NOT rendered as wrapper nodes. URLs unchanged.
  var groupNodes = {}; // groupLabel → { label, items[] }
  var flatLeaves = [];

  Object.entries(registry.components).forEach(function (pair) {
    var slug = pair[0];
    var entry = pair[1];
    if (!entry.category) return;
    if (excludedCategories.has(entry.category)) return;
    if (collectionCategories.has(entry.category)) return;
    var sd = sectionDirs[entry.section] || defaultSectionDir;
    if (sd !== targetSection) return;

    var catSlug = slugifyCategory(entry.category);
    var parts = [targetSection, catSlug];
    var nested = false;
    var groupLabel = null;
    if (entry.group) {
      var groupSlug = slugifyCategory(entry.group);
      var key = catSlug + "::" + groupSlug;
      if (groupSlug && groupCounts[key] > 1) {
        parts.push(groupSlug);
        nested = true;
        groupLabel = stripEmojiPrefix(entry.group);
      }
    }
    parts.push(slug);
    var link = "/" + parts.join("/") + "/";
    var leaf = { label: stripEmojiPrefix(entry.name || slug), link: link };

    if (nested) {
      if (!groupNodes[groupLabel]) {
        groupNodes[groupLabel] = { label: groupLabel, items: [] };
      }
      groupNodes[groupLabel].items.push(leaf);
    } else {
      flatLeaves.push(leaf);
    }
  });

  var groupArr = Object.values(groupNodes).map(function (g) {
    g.items.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return { label: g.label, collapsed: true, items: g.items };
  });
  var merged = flatLeaves.concat(groupArr);
  merged.sort(function (a, b) { return a.label.localeCompare(b.label); });
  return merged;
}

module.exports = {
  buildSidebarManifest: buildSidebarManifest,
  stripEmojiPrefix: stripEmojiPrefix,
};

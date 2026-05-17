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
  var sectionDirs = opts.sectionDirs;
  var defaultSectionDir = opts.defaultSectionDir;
  var slugifyCategory = opts.slugifyCategory;

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

  // category label → { label, items[] }
  var catMap = {};

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
        groupLabel = entry.group;
      }
    }
    parts.push(slug);
    var link = "/" + parts.join("/") + "/";

    if (!catMap[entry.category]) {
      catMap[entry.category] = {
        label: entry.category,
        catSlug: catSlug,
        items: [],
        groups: {}, // groupLabel → { label, items[] }
      };
    }
    var leaf = { label: entry.name || slug, link: link };
    if (nested) {
      // Wrap into a group subnode so the sidebar mirrors the URL structure
      // (and the old Starlight-autogenerate filesystem-based nesting that
      // was lost when buildSidebarManifest replaced autogenerate).
      if (!catMap[entry.category].groups[groupLabel]) {
        catMap[entry.category].groups[groupLabel] = { label: groupLabel, items: [] };
      }
      catMap[entry.category].groups[groupLabel].items.push(leaf);
    } else {
      catMap[entry.category].items.push(leaf);
    }
  });

  // Sort categories alphabetically; within each category interleave group
  // subnodes and flat items A-Z by label, so the sidebar reads as one
  // consistent list whether an entry is a single component or a
  // collapsible group.
  var categories = Object.values(catMap);
  categories.sort(function (a, b) { return a.label.localeCompare(b.label); });
  return categories.map(function (cat) {
    var groupNodes = Object.values(cat.groups || {}).map(function (g) {
      g.items.sort(function (a, b) { return a.label.localeCompare(b.label); });
      return { label: g.label, collapsed: true, items: g.items };
    });
    var merged = cat.items.concat(groupNodes);
    merged.sort(function (a, b) { return a.label.localeCompare(b.label); });
    return { label: cat.label, collapsed: true, items: merged };
  });
}

module.exports = {
  buildSidebarManifest: buildSidebarManifest,
};

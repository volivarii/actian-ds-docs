"use strict";

/**
 * category-defaults-loader.cjs
 *
 * Phase 2c (knowledge v0.4.5+ / v0.5.0+): loads per-category structural
 * defaults for component briefs and resolves cross-domain refs (motion +
 * accessibility) against the vendored knowledge layer.
 *
 * The category-defaults artifacts (one JSON per category at
 * vendor/components/dist/categories/<slug>-defaults.json) carry coarse
 * anatomy + variants + motion_refs + accessibility refs that apply to
 * every component in the category. Stub components with no curated
 * guidelines lift these into the brief grounding payload via
 * brief-sourcing, giving downstream card-generators a baseline to adapt
 * rather than improvise from scratch.
 *
 * Refs are resolved by SLUG, not by object key. Upstream motion patterns
 * are keyed by short name (`drawer`) but carry a separate slug field
 * (`drawer-open-close`) — category MDs reference the slug, this loader
 * matches by slug. Unresolved refs return null gracefully so an upstream
 * slug rename doesn't crash brief generation.
 *
 * Module is pure (no MCP, no network). Reads vendor files via the PATHS
 * resolver from scripts/lib/paths.cjs (sibling file).
 */

var fs = require("fs");
var path = require("path");
var PATHS = require("./paths.cjs");

// Load the manifest once at module-top. _motionPath() reads the named
// leaf entry rather than constructing the path from PATHS.foundations.distDir,
// so upstream layout changes are absorbed by vendor refreshes alone.
var MANIFEST = (function () {
  var manifestPath = path.join(PATHS.vendor, "paths-manifest.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
})();

// In-process caches. Build/CLI processes are short-lived, so cache
// lifetime is the process. Tests call _resetCache.
var categoryCache = {};
var motionPatternsCache = null;
var a11yIndexCache = null;

function _resetCache() {
  categoryCache = {};
  motionPatternsCache = null;
  a11yIndexCache = null;
}

// Map a dskit registry `category` label like "Form (input & selection)"
// to its kebab-case slug "form-input-selection". Idempotent on
// already-slugged input. Returns null for null/empty.
function normalizeCategorySlug(input) {
  if (input == null) return null;
  var s = String(input).trim();
  if (s.length === 0) return null;
  s = s.toLowerCase();
  // Drop `&` entirely so "Form (input & selection)" → "form-input-selection"
  // (canonical mapping per dskit registry categories). The remaining
  // non-alphanumeric collapse handles parens and spaces.
  s = s.replace(/&/g, " ");
  // Replace runs of non-alphanumerics with single `-`
  s = s.replace(/[^a-z0-9]+/g, "-");
  // Trim leading/trailing `-`
  s = s.replace(/^-+|-+$/g, "");
  return s.length === 0 ? null : s;
}

function loadDefaultsForCategory(input) {
  var slug = normalizeCategorySlug(input);
  if (!slug) return null;
  if (Object.prototype.hasOwnProperty.call(categoryCache, slug)) {
    return categoryCache[slug];
  }
  // Modern path: PATHS.components.categoryDefaults.byKey is a (slug) => path function.
  // The pre-v0.5.1 alternative (PATHS.components.categoryDefaults as a flat collection)
  // is dropped — MIN_SUPPORTED_KNOWLEDGE (v0.14.0) guarantees the modern shape.
  var byKey = PATHS.components &&
              PATHS.components.categoryDefaults &&
              PATHS.components.categoryDefaults.byKey;
  if (typeof byKey !== "function") {
    throw new Error(
      "PATHS.components.categoryDefaults.byKey is not a function. " +
      "Vendor manifest may be malformed; refresh vendor."
    );
  }
  var distPath = byKey(slug);
  if (!fs.existsSync(distPath)) {
    categoryCache[slug] = null;
    return null;
  }
  try {
    var data = JSON.parse(fs.readFileSync(distPath, "utf8"));
    categoryCache[slug] = data;
    return data;
  } catch (err) {
    throw new Error(
      "category-defaults-loader: failed to parse " +
        distPath +
        ": " +
        err.message,
    );
  }
}

// Motion patterns live in vendor/foundations/dist/tokens/motion.json
// under `.patterns`. The exact relative path is declared in the manifest
// under `foundations.tokens.motion` so upstream layout changes are
// absorbed by vendor refreshes rather than requiring a docs-side edit.
function _motionPath() {
  var entry = MANIFEST.paths["foundations.tokens.motion"];
  if (!entry || !entry.path) {
    throw new Error(
      "category-defaults-loader: manifest is missing the " +
        "'foundations.tokens.motion' entry. " +
        "Refresh vendor to knowledge v0.14.0 or later by running " +
        "scripts/vendor/vendor-snapshot.cjs --range.",
    );
  }
  return path.join(PATHS.vendor, entry.path);
}

function _loadMotionPatterns() {
  if (motionPatternsCache !== null) return motionPatternsCache;
  var motionPath = _motionPath();
  if (!fs.existsSync(motionPath)) {
    motionPatternsCache = {};
    return motionPatternsCache;
  }
  var data;
  try {
    data = JSON.parse(fs.readFileSync(motionPath, "utf8"));
  } catch (err) {
    throw new Error(
      "category-defaults-loader: failed to parse " +
        motionPath +
        ": " +
        err.message,
    );
  }
  motionPatternsCache = data.patterns || {};
  return motionPatternsCache;
}

// Resolve a motion-pattern ref by slug (NOT by object key). Iterates
// the patterns object and matches on `.slug`. Upstream keys (e.g.
// `drawer`) can differ from slugs (e.g. `drawer-open-close`).
function resolveMotionRef(slug) {
  if (!slug || typeof slug !== "string") return null;
  var patterns = _loadMotionPatterns();
  for (var key in patterns) {
    if (Object.prototype.hasOwnProperty.call(patterns, key)) {
      var p = patterns[key];
      if (p && p.slug === slug) return p;
    }
  }
  return null;
}

function _loadA11yIndex() {
  if (a11yIndexCache !== null) return a11yIndexCache;
  // PATHS.accessibility.index is the slug-indexed JSON (a11y-index.json)
  var idxPath;
  if (PATHS.accessibility && typeof PATHS.accessibility.index === "string") {
    idxPath = PATHS.accessibility.index;
  } else {
    a11yIndexCache = { sections: [] };
    return a11yIndexCache;
  }
  if (!fs.existsSync(idxPath)) {
    a11yIndexCache = { sections: [] };
    return a11yIndexCache;
  }
  try {
    a11yIndexCache = JSON.parse(fs.readFileSync(idxPath, "utf8"));
  } catch (err) {
    throw new Error(
      "category-defaults-loader: failed to parse " +
        idxPath +
        ": " +
        err.message,
    );
  }
  return a11yIndexCache;
}

function resolveAccessibilityRef(slug) {
  if (!slug || typeof slug !== "string") return null;
  var idx = _loadA11yIndex();
  var sections = (idx && idx.sections) || [];
  for (var i = 0; i < sections.length; i++) {
    if (sections[i] && sections[i].slug === slug) return sections[i];
  }
  return null;
}

module.exports = {
  normalizeCategorySlug: normalizeCategorySlug,
  loadDefaultsForCategory: loadDefaultsForCategory,
  resolveMotionRef: resolveMotionRef,
  resolveAccessibilityRef: resolveAccessibilityRef,
  _resetCache: _resetCache,
  _motionPath: _motionPath,
};

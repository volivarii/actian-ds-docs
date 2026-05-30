"use strict";
var fs = require("fs");
var path = require("path");

// Walk a dist dir, return Map keyed by section `id`. Mirrors loadBundle in
// generate-foundations-pages.cjs but over the whole foundations/dist tree.
function loadBundle(distDir) {
  var bundle = new Map();
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
      var p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && ent.name.endsWith(".json")) {
        var data;
        try { data = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return; }
        if (data && typeof data.id === "string") bundle.set(data.id, data);
      }
    });
  })(distDir);
  return bundle;
}

// tokenLabels modes: "names" drops the literal-value column (header in VALUE_HEADERS),
// leaving just token names (Kristina #2). "values" and "both" intentionally pass the
// table through unchanged — the default render already shows token + value columns.
// These header names are how foundations color/token tables label the value column.
var VALUE_HEADERS = { Hex: true, "Hex (Figma)": true, Value: true };

function applyTokenLabels(block, mode) {
  if (mode !== "names" || block.type !== "table") return block;
  var keep = (block.headers || []).filter(function (h) { return !VALUE_HEADERS[h]; });
  var rows = (block.rows || []).map(function (row) {
    var out = {};
    keep.forEach(function (h) { if (row[h] != null) out[h] = row[h]; });
    return out;
  });
  return Object.assign({}, block, { headers: keep, rows: rows });
}

function loadManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    throw new Error("composition: failed to parse " + manifestPath + ": " + err.message);
  }
}

// Resolve a node's children (branch nodes) into rendered sub-section results,
// ordered by `order`. Recursive so deep trees render. Each child is looked up
// by its id in the same bundle.
function resolveChildren(node, bundle) {
  if (!Array.isArray(node.children) || node.children.length === 0) return [];
  return node.children
    .slice()
    .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
    .map(function (c) {
      var childNode = bundle.get(c.id);
      if (!childNode) {
        throw new Error("composition: child '" + c.id + "' of '" + node.id + "' not found in dist bundle");
      }
      return {
        heading: childNode.title,
        intro: null,
        body: childNode.body || null,
        blocks: childNode.blocks || [],
        children: resolveChildren(childNode, bundle),
      };
    });
}

// Resolve one manifest section to { heading, intro, body, blocks, children }.
function resolveSection(section, bundle) {
  if (!section.ref) {
    return { heading: null, intro: section.intro || null, body: null, blocks: [], children: [] };
  }
  var node = bundle.get(section.ref);
  if (!node) throw new Error("composition: ref '" + section.ref + "' not found in dist bundle");
  if (section.fragment) {
    var slug = section.fragment.slice(1);
    var childId = section.ref + "/" + slug;
    node = bundle.get(childId);
    if (!node) throw new Error("composition: fragment '" + section.fragment +
      "' of '" + section.ref + "' not found (tried id '" + childId + "')");
  }
  var blocks = (node.blocks || []).map(function (b) {
    return section.render ? applyTokenLabels(b, section.render.tokenLabels) : b;
  });
  return {
    heading: section.label || node.title,
    intro: section.intro || null,
    body: node.body || null,
    blocks: blocks,
    children: resolveChildren(node, bundle),
  };
}

module.exports = { loadBundle: loadBundle, loadManifest: loadManifest, resolveSection: resolveSection };

"use strict";

/**
 * paths.cjs — Manifest-driven vendor path resolver (docs site).
 *
 * Reads vendor/paths-manifest.json at module load and builds the PATHS
 * object via dot-notation walker + collection function builders. The
 * docs site consumes the same vendored knowledge snapshot as the
 * plugin, so the manifest contract is shared.
 *
 * Note on caching: PATHS is built once per Node process at module load.
 * Build/CLI processes are short-lived, so vendor changes between
 * processes are picked up on the next invocation.
 */

var fs = require("fs");
var path = require("path");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var VENDOR = path.join(REPO_ROOT, "vendor");
var MANIFEST_PATH = path.join(VENDOR, "paths-manifest.json");
var VENDORED_JSON_PATH = path.join(REPO_ROOT, "vendored.json");

var SUPPORTED_SCHEMA_VERSION = "v1";

// Strip leading "v" so git tag "v0.3.1" compares equal to
// package.json#version "0.3.1".
function normalizeVersion(v) {
  if (v == null) return null;
  return String(v).replace(/^v/, "");
}

// Vendor-integrity check — confirms the vendored manifest's
// knowledge_version matches what vendored.json says it pulled.
// Catches partial / corrupted / out-of-band-modified vendor snapshots.
// Skipped silently when:
//   - vendored.json is missing (legacy plugin layout pre-v1.79.5), OR
//   - resolved_version is null (snapshot done via --sha for incident
//     recovery, not via tag-range resolution)
function verifyVendorIntegrity(manifest, vendoredJsonPath) {
  if (!fs.existsSync(vendoredJsonPath)) return;
  var vendored;
  try {
    vendored = JSON.parse(fs.readFileSync(vendoredJsonPath, "utf8"));
  } catch (err) {
    // Don't compound errors — let downstream JSON validation surface this.
    return;
  }
  var resolved = vendored.knowledge_repo_resolved_version;
  if (!resolved) return;
  var manifestV = normalizeVersion(manifest.knowledge_version);
  var resolvedV = normalizeVersion(resolved);
  if (manifestV !== resolvedV) {
    throw new Error(
      "paths.cjs: vendor-integrity check failed — manifest says " +
        "knowledge_version='" +
        manifest.knowledge_version +
        "' but vendored.json says resolved_version='" +
        resolved +
        "'. Vendor snapshot may be partial, corrupted, or modified out " +
        "of band. Re-run scripts/vendor/vendor-snapshot.cjs --range.",
    );
  }
}

function setNested(obj, parts, value) {
  var cursor = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    var part = parts[i];
    if (cursor[part] !== undefined && typeof cursor[part] !== "object") {
      throw new Error(
        "paths.cjs: dot-notation key conflict — '" +
          parts.join(".") +
          "' cannot coexist with a leaf at '" +
          parts.slice(0, i + 1).join(".") +
          "'",
      );
    }
    cursor[part] = cursor[part] || {};
    cursor = cursor[part];
  }
  var leaf = parts[parts.length - 1];
  if (cursor[leaf] !== undefined) {
    throw new Error(
      "paths.cjs: dot-notation key conflict — '" +
        parts.join(".") +
        "' is already set",
    );
  }
  cursor[leaf] = value;
}

function buildPathsFromManifest(manifest, vendorRoot) {
  if (manifest.manifest_schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      "paths.cjs: expected manifest_schema_version '" +
        SUPPORTED_SCHEMA_VERSION +
        "', found '" +
        manifest.manifest_schema_version +
        "'. Docs site must be upgraded.",
    );
  }

  var out = {};
  var paths = manifest.paths || {};
  for (var name in paths) {
    var entry = paths[name];
    if (!entry.path) {
      throw new Error("paths.cjs: entry '" + name + "' missing 'path' field");
    }
    if (!entry.type) {
      throw new Error("paths.cjs: entry '" + name + "' missing 'type' field");
    }
    if (!entry.origin) {
      throw new Error("paths.cjs: entry '" + name + "' missing 'origin' field");
    }
    if (!entry.description) {
      throw new Error(
        "paths.cjs: entry '" + name + "' missing 'description' field",
      );
    }
    setNested(out, name.split("."), path.join(vendorRoot, entry.path));
  }

  var collections = manifest.collections || {};
  for (var collName in collections) {
    var coll = collections[collName];
    if (!coll.dir) {
      throw new Error(
        "paths.cjs: collection '" + collName + "' missing 'dir' field",
      );
    }
    if (!coll.pattern) {
      throw new Error(
        "paths.cjs: collection '" + collName + "' missing 'pattern' field",
      );
    }
    var dir = path.join(vendorRoot, coll.dir);
    setNested(
      out,
      collName.split("."),
      (function (collDir, pattern) {
        return function (slug) {
          return path.join(collDir, pattern.replace("{slug}", slug));
        };
      })(dir, coll.pattern),
    );
  }

  return out;
}

function loadAndBuildPaths() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      "paths.cjs: manifest not found at " +
        MANIFEST_PATH +
        ". Run vendor-snapshot.yml or pull the latest docs-site tree.",
    );
  }
  var raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  var manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      "paths.cjs: manifest at " +
        MANIFEST_PATH +
        " failed to parse: " +
        err.message,
    );
  }
  verifyVendorIntegrity(manifest, VENDORED_JSON_PATH);
  return buildPathsFromManifest(manifest, VENDOR);
}

var PATHS = loadAndBuildPaths();

// Docs-side convenience constants (not in manifest — direct access).
PATHS.repoRoot = REPO_ROOT;
PATHS.vendor = VENDOR;

// Foundations dist directory helper — used by motion-pattern lookup.
PATHS.foundations = PATHS.foundations || {};
PATHS.foundations.distDir = path.join(VENDOR, "foundations", "dist");

module.exports = PATHS;
module.exports.buildPathsFromManifest = buildPathsFromManifest;
module.exports.verifyVendorIntegrity = verifyVendorIntegrity;
module.exports.normalizeVersion = normalizeVersion;
module.exports.SUPPORTED_SCHEMA_VERSION = SUPPORTED_SCHEMA_VERSION;

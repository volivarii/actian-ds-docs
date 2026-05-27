"use strict";

/**
 * validate-build.cjs — Drift guards run at build time.
 *
 * Four checks adapted from the plugin's scripts/validation/validate-schema.js
 * for the docs-site context:
 *
 *   1. motion-ref resolution — every motion_refs[].ref in category
 *      defaults resolves against tokens/motion.json#patterns
 *   2. a11y-ref resolution — every accessibility[].ref in category
 *      defaults resolves against a11y-index.json#sections
 *   3. ASCII operator check — vendored MDs use ASCII only
 *      (=> not ⇒, -> not →, etc.)
 *   4. Schema-version match — paths-manifest._schema_version === 1
 *
 * Each function returns a result object; validateAll runs them all.
 */

var fs = require("fs");
var path = require("path");
var PATHS = require("../lib/paths.cjs");
var loader = require("../lib/category-defaults-loader.cjs");

var KNOWN_CATEGORY_SLUGS = [
  "action",
  "form-input-selection",
  "navigation",
  "data-display",
  "feedback",
  "overlays",
];

// `→` deliberately excluded — used as a narrative arrow in prose AND in
// code-block comments/checklists across the knowledge content. Math
// operators below are flagged only inside fenced code blocks (see
// validateAsciiOperators) where they'd indicate real ASCII-vs-Unicode drift.
var UNICODE_OPERATORS = ["⇒", "≤", "≥", "≠", "≡", "∈", "∉"];

function validateMotionRefs() {
  loader._resetCache();
  var unresolved = [];
  KNOWN_CATEGORY_SLUGS.forEach(function (slug) {
    var d = loader.loadDefaultsForCategory(slug);
    var refs = (d && d.motion_refs && d.motion_refs.patternRefs) || [];
    refs.forEach(function (r) {
      if (!loader.resolveMotionRef(r.ref)) {
        unresolved.push({ category: slug, ref: r.ref });
      }
    });
  });
  return { unresolved: unresolved, pass: unresolved.length === 0 };
}

function validateAccessibilityRefs() {
  loader._resetCache();
  var unresolved = [];
  KNOWN_CATEGORY_SLUGS.forEach(function (slug) {
    var d = loader.loadDefaultsForCategory(slug);
    var refs =
      (d && d.a11y_refs && d.a11y_refs.requirementRefs) || [];
    refs.forEach(function (r) {
      if (!loader.resolveAccessibilityRef(r.ref)) {
        unresolved.push({ category: slug, ref: r.ref });
      }
    });
  });
  return { unresolved: unresolved, pass: unresolved.length === 0 };
}

function walkMdFiles(dir, results) {
  results = results || [];
  if (!fs.existsSync(dir)) return results;
  fs.readdirSync(dir).forEach(function (entry) {
    var full = path.join(dir, entry);
    var stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walkMdFiles(full, results);
    } else if (entry.endsWith(".md")) {
      results.push(full);
    }
  });
  return results;
}

// Scoped to fenced code blocks (``` ... ```) per design memo: the guard
// catches drift in *code values*, not WCAG-style prose or descriptive
// arrows in tables. Iterating line-by-line with a `inCodeBlock` flag is
// enough for our content shapes (no nested fences in knowledge MDs).
function validateAsciiOperators() {
  var mdFiles = walkMdFiles(PATHS.vendor);
  var violations = [];
  mdFiles.forEach(function (file) {
    var content = fs.readFileSync(file, "utf8");
    var lines = content.split("\n");
    var inCodeBlock = false;
    lines.forEach(function (line, i) {
      if (/^\s*```/.test(line)) {
        inCodeBlock = !inCodeBlock;
        return;
      }
      if (!inCodeBlock) return;
      UNICODE_OPERATORS.forEach(function (op) {
        if (line.indexOf(op) !== -1) {
          violations.push({
            file: path.relative(PATHS.vendor, file),
            line: i + 1,
            char: op,
            snippet: line.trim().slice(0, 80),
          });
        }
      });
    });
  });
  return { violations: violations, pass: violations.length === 0 };
}

function validateSchemaVersion() {
  var manifestPath = path.join(PATHS.vendor, "paths-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { actual: null, expected: 1, pass: false, reason: "manifest missing" };
  }
  var manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  var actual = manifest._schema_version;
  return {
    actual: actual,
    expected: 1,
    pass: actual === 1,
  };
}

function validateAll() {
  var motion = validateMotionRefs();
  var a11y = validateAccessibilityRefs();
  var ascii = validateAsciiOperators();
  var schema = validateSchemaVersion();
  var failures = [];
  if (!motion.pass) failures.push({ guard: "motion-ref", result: motion });
  if (!a11y.pass) failures.push({ guard: "a11y-ref", result: a11y });
  if (!ascii.pass) failures.push({ guard: "ascii", result: ascii });
  if (!schema.pass) failures.push({ guard: "schema-version", result: schema });
  return {
    pass: failures.length === 0,
    motion: motion,
    a11y: a11y,
    ascii: ascii,
    schema: schema,
    failures: failures,
  };
}

if (require.main === module) {
  var result = validateAll();
  if (result.pass) {
    console.log("validate-build: all 4 drift guards pass");
    process.exit(0);
  } else {
    console.error(
      "validate-build: FAIL —\n" + JSON.stringify(result.failures, null, 2),
    );
    process.exit(1);
  }
}

module.exports = {
  validateMotionRefs: validateMotionRefs,
  validateAccessibilityRefs: validateAccessibilityRefs,
  validateAsciiOperators: validateAsciiOperators,
  validateSchemaVersion: validateSchemaVersion,
  validateAll: validateAll,
};

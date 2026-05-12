"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var validate = require("../../scripts/validation/validate-build.cjs");

test("validateMotionRefs — all category motion refs resolve", function () {
  var result = validate.validateMotionRefs();
  assert.deepEqual(
    result.unresolved,
    [],
    "Unresolved motion refs: " + JSON.stringify(result.unresolved),
  );
});

test("validateAccessibilityRefs — all category a11y refs resolve", function () {
  var result = validate.validateAccessibilityRefs();
  assert.deepEqual(
    result.unresolved,
    [],
    "Unresolved a11y refs: " + JSON.stringify(result.unresolved),
  );
});

test("validateAsciiOperators — vendored MDs contain only ASCII operators", function () {
  var result = validate.validateAsciiOperators();
  assert.deepEqual(
    result.violations,
    [],
    "Unicode operator violations: " + JSON.stringify(result.violations.slice(0, 5)),
  );
});

test("validateSchemaVersion — manifest schema version is 1", function () {
  var result = validate.validateSchemaVersion();
  assert.equal(result.actual, 1);
  assert.equal(result.expected, 1);
  assert.equal(result.pass, true);
});

test("validateAll — runs all four guards; reports pass when clean", function () {
  var result = validate.validateAll();
  assert.equal(result.pass, true, "expected pass: " + JSON.stringify(result.failures));
});

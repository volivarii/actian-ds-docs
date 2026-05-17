import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, autoKind } from "../../src/lib/token-scale-flatten.mjs";

test("flatten: shallow DTCG value object", () => {
  const data = {
    md: { $value: "8px", $type: "spacing" },
    lg: { $value: "16px", $type: "spacing" },
  };
  const rows = flatten(data, "spacing");
  assert.deepEqual(rows, [
    { Token: "--zen-spacing-md", Value: "8px" },
    { Token: "--zen-spacing-lg", Value: "16px" },
  ]);
});

test("flatten: nested DTCG value object", () => {
  const data = {
    primary: {
      bg: { $value: "#fff", $type: "color" },
      fg: { $value: "#000", $type: "color" },
    },
  };
  const rows = flatten(data, "color");
  assert.deepEqual(rows, [
    { Token: "--zen-color-primary-bg", Value: "#fff" },
    { Token: "--zen-color-primary-fg", Value: "#000" },
  ]);
});

test("flatten: skips keys starting with $ or _", () => {
  const data = {
    $type: "color",
    _comment: "skip me",
    md: { $value: "8px" },
  };
  const rows = flatten(data, "spacing");
  assert.deepEqual(rows, [{ Token: "--zen-spacing-md", Value: "8px" }]);
});

test("flatten: empty/null inputs", () => {
  assert.deepEqual(flatten(null, "spacing"), []);
  assert.deepEqual(flatten(undefined, "spacing"), []);
  assert.deepEqual(flatten({}, "spacing"), []);
});

test("autoKind: color prefixes", () => {
  assert.equal(autoKind("color"), "color");
  assert.equal(autoKind("color-primary"), "color");
  assert.equal(autoKind("focus-ring-error"), "color");
  assert.equal(autoKind("focus-ring-primary"), "color");
});

test("autoKind: radius / border-width", () => {
  assert.equal(autoKind("border-radius"), "radius");
  assert.equal(autoKind("border-radius-md"), "radius");
  assert.equal(autoKind("border-width"), "border-width");
});

test("autoKind: spacing/size/icon prefixes", () => {
  assert.equal(autoKind("spacing"), "spacing");
  assert.equal(autoKind("size-md"), "spacing");
  assert.equal(autoKind("icon-sm"), "spacing");
});

test("autoKind: returns 'none' for unknown", () => {
  assert.equal(autoKind("font-size"), "none");
  assert.equal(autoKind("typography"), "none");
});

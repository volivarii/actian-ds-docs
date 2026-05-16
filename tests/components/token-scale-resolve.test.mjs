import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveScale } from "../../src/lib/token-scale-resolve.mjs";

const tokens = {
  spacing: {
    "3xs": { $value: "2px", $type: "dimension" },
    "2xs": { $value: "4px", $type: "dimension" },
    xs:    { $value: "8px", $type: "dimension" },
  },
  color: {
    primary: { 500: { $value: "#0550DC", $type: "color" } },
  },
  border: {
    radius: { sm: { $value: "4px", $type: "dimension" } },
  },
};

test("scale='spacing' selects the spacing sub-tree + sets prefix", () => {
  const { effectiveData, effectivePrefix } = resolveScale(tokens, "spacing", "");
  assert.equal(effectivePrefix, "spacing");
  assert.equal(Object.keys(effectiveData).length, 3);
  assert.ok(effectiveData.xs);
});

test("scale='radius' descends two levels (border.radius)", () => {
  const { effectiveData, effectivePrefix } = resolveScale(tokens, "radius", "");
  assert.equal(effectivePrefix, "border-radius");
  assert.ok(effectiveData.sm);
});

test("no scale: passes data + prefix through unchanged (back-compat)", () => {
  const { effectiveData, effectivePrefix } = resolveScale(tokens, undefined, "custom");
  assert.equal(effectivePrefix, "custom");
  assert.equal(effectiveData, tokens);
});

test("unknown scale throws", () => {
  assert.throws(() => resolveScale(tokens, "nonsense", ""), /unknown scale 'nonsense'/);
});

test("missing sub-tree returns empty object (doesn't throw)", () => {
  const { effectiveData } = resolveScale({}, "spacing", "");
  assert.deepEqual(effectiveData, {});
});

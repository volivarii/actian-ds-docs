/**
 * Unit tests for VariantMatrix rendering logic.
 *
 * The core logic lives in src/lib/variant-matrix.mjs (a plain ES module),
 * which is imported by VariantMatrix.astro. Testing the helper directly
 * avoids the Astro/Vite compile pipeline while keeping identical assertions
 * (CSS class names, HTML structure, cell counts).
 *
 * To run: node --test tests/components/variant-matrix.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderVariantMatrix } from "../../src/lib/variant-matrix.mjs";

test("renders a 2D grid for two axes", () => {
  const html = renderVariantMatrix([
    { axis: "Type", values: ["Primary", "Secondary"] },
    { axis: "Size", values: ["Default", "Small"] },
  ]);
  // header row carries the 2 size labels
  assert.match(html, /Default/);
  assert.match(html, /Small/);
  // 2 type rows
  assert.match(html, /Primary/);
  assert.match(html, /Secondary/);
  // 2x2 = 4 cells body — count `variant-matrix__cell`
  const cellCount = (html.match(/variant-matrix__cell/g) || []).length;
  assert.equal(cellCount, 4);
});

test("renders a 1xN strip for one axis", () => {
  const html = renderVariantMatrix([
    { axis: "State", values: ["Default", "Hover", "Disabled"] },
  ]);
  assert.match(html, /Default/);
  assert.match(html, /Hover/);
  assert.match(html, /Disabled/);
});

test("renders empty-state when axes are empty", () => {
  const html = renderVariantMatrix([{ axis: "X", values: [] }]);
  assert.match(html, /No variants/i);
});

test("drops a third axis gracefully (renders first 2 as matrix)", () => {
  const html = renderVariantMatrix([
    { axis: "Type", values: ["Primary", "Secondary"] },
    { axis: "Size", values: ["Default", "Small"] },
    { axis: "State", values: ["Default", "Hover"] },
  ]);
  // Should render a 2D grid from the first two axes — 4 cells
  const cellCount = (html.match(/variant-matrix__cell/g) || []).length;
  assert.equal(cellCount, 4);
  // Third axis labels (Hover, etc.) should not appear as headers
  // (Default is shared so don't assert on it)
  assert.doesNotMatch(html, /Hover/);
});

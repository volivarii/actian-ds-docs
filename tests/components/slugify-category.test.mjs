import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { normalizeCategorySlug as esm } from "../../src/lib/slugify-category.mjs";

// Sync-check vs the CJS canonical. Node 22.12+ can require() ESM, but
// here we go the other direction (CJS-from-ESM) which is also supported.
const require = createRequire(import.meta.url);
const { normalizeCategorySlug: cjs } = require("../../scripts/lib/category-defaults-loader.cjs");

const FIXTURES = [
  ["Action", "action"],
  ["Form (input & selection)", "form-input-selection"],
  ["Data Display", "data-display"],
  ["Navigation", "navigation"],
  ["Overlays", "overlays"],
  ["Feedback", "feedback"],
  ["Icons", "icons"],
  ["  Padded  ", "padded"],
  ["Special!@#$%Chars", "special-chars"],
  ["", null],
  [null, null],
  [undefined, null],
  ["&&&", null],
];

test("normalizeCategorySlug: fixtures", () => {
  for (const [input, expected] of FIXTURES) {
    assert.equal(esm(input), expected, `ESM: ${JSON.stringify(input)}`);
  }
});

test("normalizeCategorySlug: ESM and CJS implementations agree on all fixtures", () => {
  for (const [input] of FIXTURES) {
    assert.equal(esm(input), cjs(input), `divergence on ${JSON.stringify(input)}`);
  }
});

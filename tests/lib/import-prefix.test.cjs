"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { computeImportPrefix } = require("../../scripts/lib/import-prefix.cjs");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const COMPONENTS_DIR = path.join(REPO_ROOT, "src", "components");

test("computeImportPrefix: flat buildPage emit (old 4+0 = 4 ups)", () => {
  // buildPage emits: src/content/docs/components/action/button.mdx
  // emit dir: src/content/docs/components/action/
  // Expected: ../../../../components (4 ups)
  const emit = path.join(REPO_ROOT, "src", "content", "docs", "components", "action", "button.mdx");
  const out = computeImportPrefix(emit, COMPONENTS_DIR);
  assert.equal(out, "../../../../components");
});

test("computeImportPrefix: buildComponent flat emit (old 5+0 = 5 ups)", () => {
  // buildComponent emits: src/content/docs/components/action/button/index.mdx
  // emit dir: src/content/docs/components/action/button/
  // Expected: ../../../../../components (5 ups)
  const emit = path.join(REPO_ROOT, "src", "content", "docs", "components", "action", "button", "index.mdx");
  const out = computeImportPrefix(emit, COMPONENTS_DIR);
  assert.equal(out, "../../../../../components");
});

test("computeImportPrefix: buildComponent nested emit nestDepth=1 (old 5+1 = 6 ups)", () => {
  // buildComponent emits: src/content/docs/components/data-display/card/perimeter-card/index.mdx
  // emit dir: src/content/docs/components/data-display/card/perimeter-card/
  // Expected: ../../../../../../components (6 ups)
  const emit = path.join(REPO_ROOT, "src", "content", "docs", "components", "data-display", "card", "perimeter-card", "index.mdx");
  const out = computeImportPrefix(emit, COMPONENTS_DIR);
  assert.equal(out, "../../../../../../components");
});

test("computeImportPrefix: returns POSIX separators on all platforms", () => {
  const emit = path.join(REPO_ROOT, "src", "content", "docs", "components", "action", "button", "index.mdx");
  const out = computeImportPrefix(emit, COMPONENTS_DIR);
  assert.ok(!out.includes("\\"), "must not contain backslashes (POSIX URLs in MDX)");
});

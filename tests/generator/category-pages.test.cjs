"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const OUT_DIR = path.join(__dirname, "..", "..", "src", "content", "docs", "categories");
const REGISTRY = path.join(__dirname, "..", "..", "vendor", "components", "dist", "registries", "dskit.json");
const normalize = require("../../scripts/lib/category-defaults-loader.cjs").normalizeCategorySlug;

function distinctCategorySlugs() {
  const dskit = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  const slugs = new Set();
  for (const key of Object.keys(dskit.components)) {
    const cat = dskit.components[key].category;
    if (!cat) continue;
    const slug = normalize(cat);
    if (slug) slugs.add(slug);
  }
  return Array.from(slugs);
}

test("generator emits one MDX per distinct dskit category", () => {
  const expected = distinctCategorySlugs();
  assert.ok(expected.length > 0, "fixture sanity: dskit has categorized components");

  for (const slug of expected) {
    const filePath = path.join(OUT_DIR, slug + ".mdx");
    assert.ok(fs.existsSync(filePath), "expected file: " + filePath);
  }
});

test("each category page contains H1, count, and at least one ComponentCard", () => {
  const slugs = distinctCategorySlugs();
  for (const slug of slugs) {
    const body = fs.readFileSync(path.join(OUT_DIR, slug + ".mdx"), "utf8");
    assert.match(body, /^---\s*\ntitle:\s*"[^"]+"\s*\n---/m, slug + ": has frontmatter title");
    assert.match(body, /\d+\s+components?/i, slug + ": has count line");
    assert.match(body, /<ComponentCard\s/, slug + ": has at least one ComponentCard");
  }
});

test("loud-fail: generator throws on empty category group", () => {
  // Synthetic check — invoke the generator with a stub registry that has
  // a category with zero components. Should throw.
  const tmp = path.join(__dirname, "..", "..", ".tmp-empty-category-test");
  fs.mkdirSync(tmp, { recursive: true });
  const stubRegistry = path.join(tmp, "dskit.json");
  fs.writeFileSync(stubRegistry, JSON.stringify({
    components: { "fake-slug": { name: "X", category: "" } }
  }));
  const generator = require("../../scripts/generate-category-pages.cjs");
  assert.throws(
    () => generator.main({ registryPath: stubRegistry, outDir: path.join(tmp, "out") }),
    /no components|empty/i,
    "should throw when a category has no components"
  );
  fs.rmSync(tmp, { recursive: true, force: true });
});

"use strict";

// tests/generator/code-tab-renders-the-component.test.cjs
//
// actian-ds-knowledge derives a canonical HTML render per component and ships
// it in the vendor snapshot at vendor/components/render/dist/fragments/, with
// the stylesheet that paints it. 56 of those fragments sat in this repo's own
// tree referenced by nothing, while every one of the Code tabs said
// "Per-component token documentation pending" and stopped there. The site
// shipped the pictures and drew none of them.
//
// The join this file guards is: a slug WITH a vendored fragment must carry a
// rendered example on its Code tab, and a slug WITHOUT one must carry nothing
// at all rather than an empty frame. Both halves matter. Asserting only the
// first would pass on a generator that emits the block unconditionally, which
// is the failure the old page already had, moved one step along.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const COMPONENTS_DIR = path.join(ROOT, "src", "content", "docs", "components");
const FRAGMENT_DIR = path.join(
  ROOT, "vendor", "components", "render", "dist", "fragments",
);
const RENDER_CSS = path.join(
  ROOT, "vendor", "components", "render", "dist", "render.css",
);

function codeTabs() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "code.mdx") {
        out.push({ slug: path.basename(path.dirname(p)), file: p });
      }
    }
  })(COMPONENTS_DIR);
  return out;
}

const hasFragment = (slug) =>
  fs.existsSync(path.join(FRAGMENT_DIR, slug + ".html"));

test("fixture sanity: the vendor snapshot carries fragments and the sheet", () => {
  assert.ok(
    fs.existsSync(FRAGMENT_DIR),
    "vendor render fragments directory is missing. Without it this whole file " +
      "would assert nothing and pass, so it fails loudly instead.",
  );
  assert.ok(
    fs.readdirSync(FRAGMENT_DIR).filter((f) => f.endsWith(".html")).length > 0,
    "no vendored render fragments found",
  );
  assert.ok(
    fs.existsSync(RENDER_CSS),
    "render.css is missing from the vendor snapshot. The fragments are unstyled " +
      "markup without it, so a rendered example would be worse than none.",
  );
});

test("every component whose render is vendored shows it on its Code tab", () => {
  const tabs = codeTabs();
  assert.ok(tabs.length > 0, "fixture sanity: generated Code tabs exist");

  const withFragment = tabs.filter((t) => hasFragment(t.slug));
  assert.ok(
    withFragment.length > 0,
    "fixture sanity: at least one generated Code tab has a vendored fragment",
  );

  const missing = withFragment
    .filter((t) => !fs.readFileSync(t.file, "utf8").includes("<CanonicalRender"))
    .map((t) => t.slug);
  assert.deepEqual(
    missing,
    [],
    "These slugs have a canonical render vendored in this repo and their Code " +
      "tab does not draw it. The render is already on disk; the page just has " +
      "to reference it.",
  );
});

test("a component with no vendored render shows no example frame", () => {
  const without = codeTabs().filter((t) => !hasFragment(t.slug));
  const claiming = without
    .filter((t) => fs.readFileSync(t.file, "utf8").includes("<CanonicalRender"))
    .map((t) => t.slug);
  assert.deepEqual(
    claiming,
    [],
    "These Code tabs reference a rendered example for a slug with no vendored " +
      "fragment. An empty frame, or a heading over nothing, is the promise the " +
      "old placeholder made and did not keep.",
  );
});

test("the Code tab's renderer order puts the render before the placeholders", () => {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src", "data", "component-tabs.config.json"), "utf8"),
  );
  const code = cfg.tabs.find((t) => t.slug === "code");
  assert.ok(code, "component-tabs.config.json has no 'code' tab");
  assert.ok(
    code.renderers.includes("canonicalRender"),
    "the Code tab no longer renders the canonical example",
  );
  assert.ok(
    code.renderers.indexOf("canonicalRender") <
      code.renderers.indexOf("tokensPlaceholder"),
    "the real content has to come before the two placeholders, or the tab still " +
      "opens on 'pending'.",
  );
});

// The three tests above read the generated MDX. That is necessary and not
// sufficient: the page can reference <CanonicalRender /> while the component
// resolves no fragment and renders nothing, which is exactly what happened
// when its path resolution was changed from process.cwd() to import.meta.url.
// The MDX was unchanged, every assertion above stayed green, and the built
// site lost all 56 examples. So the last word has to be on the BUILT html.
//
// CI runs `npm test` after `npm run build` for this reason (see build.yml), so
// dist is present there. A missing dist is reported as a failure rather than
// skipped: a check that passes when its subject is absent is the failure it
// was written to prevent.
const DIST = path.join(ROOT, "dist");

test("the built site actually ships the rendered examples", () => {
  assert.ok(
    fs.existsSync(DIST),
    "dist/ is missing, so this assertion cannot be made. Run `npm run build` " +
      "first; CI runs the suite after the build for exactly this reason. This " +
      "is a failure and not a skip on purpose.",
  );

  const built = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "index.html" && path.basename(path.dirname(p)) === "code") {
        built.push(p);
      }
    }
  })(path.join(DIST, "components"));

  assert.ok(built.length > 0, "fixture sanity: the build produced Code tab pages");

  const drawn = built.filter((f) =>
    fs.readFileSync(f, "utf8").includes('id="fidelity-root"'),
  ).length;
  const expected = codeTabs().filter((t) => hasFragment(t.slug)).length;

  assert.equal(
    drawn,
    expected,
    "Every Code tab whose slug has a vendored fragment must carry the render in " +
      "the shipped HTML. " + drawn + " of an expected " + expected + " do. A " +
      "count of 0 with the MDX assertions green means the component resolved no " +
      "fragment and failed silently.",
  );
});

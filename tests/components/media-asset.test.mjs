import test from "node:test";
import assert from "node:assert/strict";

// MediaAsset.astro is .astro — the Astro template is a presentational wrapper.
// The actual path resolution is a pure helper that converts the
// (mediaIndex, slug, role) triple into a public-served URL.

import { resolveMediaPathFromIndex } from "../../src/components/media-asset-resolver.mjs";

const FIXTURE_INDEX = {
  _schema_version: 1,
  media: {
    button: { preview: "components/dist/media/button/preview.png" },
    avatar: { preview: "components/dist/media/avatar/preview.png" },
    "loader-with-logo": {
      preview: "components/dist/media/loader-with-logo/preview.png",
    },
  },
};

test("resolves preview path for a slug present in the index", () => {
  assert.equal(
    resolveMediaPathFromIndex(FIXTURE_INDEX, "button", "preview"),
    "/media/button/preview.png",
  );
});

test("resolves the media-only canary (avatar) — decoupled from guideline coverage", () => {
  // The whole reason this layer exists. Even when no guideline doc would
  // surface a media field for avatar, the index does.
  assert.equal(
    resolveMediaPathFromIndex(FIXTURE_INDEX, "avatar", "preview"),
    "/media/avatar/preview.png",
  );
});

test("returns null when the slug is absent from the index", () => {
  assert.equal(
    resolveMediaPathFromIndex(FIXTURE_INDEX, "nonexistent", "preview"),
    null,
  );
});

test("returns null when the role is absent for an indexed slug", () => {
  const idx = { media: { button: { anatomy: "x.png" } } };
  assert.equal(resolveMediaPathFromIndex(idx, "button", "preview"), null);
});

test("returns null on missing/empty index", () => {
  assert.equal(resolveMediaPathFromIndex(null, "button", "preview"), null);
  assert.equal(resolveMediaPathFromIndex(undefined, "button", "preview"), null);
  assert.equal(resolveMediaPathFromIndex({}, "button", "preview"), null);
});

test("returns null when the media value is non-string or empty", () => {
  const idx = { media: { button: { preview: 42 } } };
  assert.equal(resolveMediaPathFromIndex(idx, "button", "preview"), null);
  const idx2 = { media: { button: { preview: "" } } };
  assert.equal(resolveMediaPathFromIndex(idx2, "button", "preview"), null);
});

test("preserves slug with hyphens (loader-with-logo)", () => {
  assert.equal(
    resolveMediaPathFromIndex(FIXTURE_INDEX, "loader-with-logo", "preview"),
    "/media/loader-with-logo/preview.png",
  );
});

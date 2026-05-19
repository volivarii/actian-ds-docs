import test from "node:test";
import assert from "node:assert/strict";

// MediaAsset.astro is .astro — the Astro template is a thin wrapper around a
// pure JS resolver. Unit-test the resolver directly.

import { resolveMediaPath } from "../../src/components/media-asset-resolver.mjs";

test("resolves preview path from guideline.media", () => {
  const guideline = { media: { preview: "components/dist/media/button/preview.png" } };
  assert.equal(
    resolveMediaPath(guideline, "preview"),
    "/media/button/preview.png"
  );
});

test("returns null when guideline.media is absent", () => {
  assert.equal(resolveMediaPath({}, "preview"), null);
  assert.equal(resolveMediaPath(null, "preview"), null);
  assert.equal(resolveMediaPath(undefined, "preview"), null);
});

test("returns null when the role is absent from guideline.media", () => {
  const guideline = { media: { anatomy: "x.png" } };
  assert.equal(resolveMediaPath(guideline, "preview"), null);
});

test("returns null when the media value is non-string", () => {
  assert.equal(resolveMediaPath({ media: { preview: 42 } }, "preview"), null);
  assert.equal(resolveMediaPath({ media: { preview: "" } }, "preview"), null);
});

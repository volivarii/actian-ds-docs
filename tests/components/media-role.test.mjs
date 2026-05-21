import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMediaPaths } from "../../src/lib/resolve-media-paths.mjs";

test("resolveMediaPaths: multi-image role resolves to public paths", () => {
  assert.deepEqual(
    resolveMediaPaths(
      { parts: ["components/dist/media/button/parts-0.png"] },
      "parts",
    ),
    ["/media/button/parts-0.png"],
  );
});

test("resolveMediaPaths: string role (preview) resolves to a public path", () => {
  assert.deepEqual(
    resolveMediaPaths(
      { preview: "components/dist/media/button/preview.png" },
      "preview",
    ),
    ["/media/button/preview.png"],
  );
});

test("resolveMediaPaths: mixed array keeps only string entries", () => {
  assert.deepEqual(
    resolveMediaPaths(
      { parts: ["components/dist/media/x/a.png", 42, null] },
      "parts",
    ),
    ["/media/x/a.png"],
  );
});

test("resolveMediaPaths: missing role returns []", () => {
  assert.deepEqual(resolveMediaPaths({}, "spacing"), []);
  assert.deepEqual(resolveMediaPaths(null, "spacing"), []);
});

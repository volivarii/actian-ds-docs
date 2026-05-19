"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// renderMediaPreview reads from a module-scoped media index (set via
// setMediaIndex). The generator loads vendor/components/dist/media/_index.json
// once at prebuild and calls setMediaIndex(idx). These tests exercise the
// renderer directly by injecting fixture indexes.

function resetIndex() {
  renderMdx.setMediaIndex(null);
}

test("emits <MediaAsset src=... /> when index contains the slug", function () {
  renderMdx.setMediaIndex({
    media: {
      button: { preview: "components/dist/media/button/preview.png" },
    },
  });
  var out = renderMdx.renderMediaPreview("button");
  assert.match(out, /<MediaAsset\s/);
  assert.match(out, /src="\/media\/button\/preview\.png"/);
  assert.match(out, /alt=""/);
  // No `guideline=` prop on the emitted tag (post-refactor; index is the SoT)
  assert.doesNotMatch(out, /guideline=/);
  resetIndex();
});

test("emits empty string when index is null (graceful fallback)", function () {
  renderMdx.setMediaIndex(null);
  assert.equal(renderMdx.renderMediaPreview("button"), "");
});

test("emits empty string when slug is absent from index", function () {
  renderMdx.setMediaIndex({
    media: {
      button: { preview: "components/dist/media/button/preview.png" },
    },
  });
  assert.equal(renderMdx.renderMediaPreview("nonexistent"), "");
  resetIndex();
});

test("emits empty string when slug entry has no preview role", function () {
  renderMdx.setMediaIndex({
    media: {
      button: { anatomy: "components/dist/media/button/anatomy.png" },
    },
  });
  assert.equal(renderMdx.renderMediaPreview("button"), "");
  resetIndex();
});

test("media-only canary: avatar resolves even though it has no guideline doc", function () {
  // The whole reason for the index sidecar. The renderer doesn't care
  // whether a guideline doc exists — only whether the index has the slug.
  renderMdx.setMediaIndex({
    media: {
      avatar: { preview: "components/dist/media/avatar/preview.png" },
    },
  });
  var out = renderMdx.renderMediaPreview("avatar");
  assert.match(out, /<MediaAsset\s/);
  assert.match(out, /src="\/media\/avatar\/preview\.png"/);
  resetIndex();
});

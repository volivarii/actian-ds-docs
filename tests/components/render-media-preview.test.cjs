"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

test("renderMediaPreview emits <MediaAsset role=preview ... /> when media is present", function () {
  var guideline = {
    media: { preview: "components/dist/media/button/preview.png" },
  };
  var out = renderMdx.renderMediaPreview(guideline);
  assert.match(out, /<MediaAsset\s/);
  assert.match(out, /role="preview"/);
  // The inlined guideline JSON must carry the same media.preview value the
  // resolver expects to strip.
  assert.match(out, /components\/dist\/media\/button\/preview\.png/);
});

test("renderMediaPreview emits empty string when guideline.media absent", function () {
  assert.equal(renderMdx.renderMediaPreview(null), "");
  assert.equal(renderMdx.renderMediaPreview({}), "");
  assert.equal(renderMdx.renderMediaPreview({ media: {} }), "");
  assert.equal(renderMdx.renderMediaPreview({ media: { preview: "" } }), "");
});

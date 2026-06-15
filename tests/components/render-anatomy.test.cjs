"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// Clean button capture: usable (ratio 0.5 only because icons are unexpanded,
// but degraded is empty and the legend "Leading icon / Button / Trailing icon"
// is fine). Mirrors vendor/components/dist/anatomy/button.json.
var BUTTON_ANATOMY = {
  slug: "button", kit: "dskit",
  quality: { nodesTotal: 4, nodesNormalized: 2, ratio: 0.5, degraded: [] },
  root: {
    name: "Type=Primary, Size=Default, State=Default", kind: "container",
    layout: {
      axis: "row", gap: "8px",
      padding: { top: "0px", right: "12px", bottom: "0px", left: "12px" },
      align: { main: "center", cross: "center" }, sizing: { h: "hug", v: "fixed" },
    },
    children: [
      { name: "Leading icon", kind: "instance", unresolved: true },
      { name: "Button", kind: "text", text: "Button" },
      { name: "Trailing icon", kind: "instance", unresolved: true },
    ],
  },
};
function withDegraded() {
  var a = JSON.parse(JSON.stringify(BUTTON_ANATOMY));
  a.quality.degraded = [{ name: "Property 1=Default", reason: "layoutMode:NONE" }];
  return a;
}

test("isAnatomyUsable: true for a clean capture with layout + named children", function () {
  assert.equal(renderMdx.isAnatomyUsable(BUTTON_ANATOMY), true);
});
test("isAnatomyUsable: false when quality.degraded is non-empty", function () {
  assert.equal(renderMdx.isAnatomyUsable(withDegraded()), false);
});
test("isAnatomyUsable: false when root has no layout", function () {
  assert.equal(renderMdx.isAnatomyUsable({ root: { children: [{ name: "x" }] } }), false);
});
test("isAnatomyUsable: false when there are no named children", function () {
  assert.equal(renderMdx.isAnatomyUsable({ root: { layout: {}, children: [{ name: "" }] } }), false);
});
test("isAnatomyUsable: false for null / missing", function () {
  assert.equal(renderMdx.isAnatomyUsable(null), false);
  assert.equal(renderMdx.isAnatomyUsable({}), false);
});

test("toCallout: extracts named parts (name + kind + optional text), drops flags", function () {
  var c = renderMdx.toCallout(BUTTON_ANATOMY);
  assert.deepEqual(c.parts, [
    { name: "Leading icon", kind: "instance" },
    { name: "Button", kind: "text", text: "Button" },
    { name: "Trailing icon", kind: "instance" },
  ]);
  assert.equal(c.layout.axis, "row");
  assert.equal(c.layout.gap, "8px");
});
test("toCallout: skips unnamed children", function () {
  var c = renderMdx.toCallout({ root: { layout: {}, children: [{ name: "" }, { name: "Label", kind: "text" }] } });
  assert.deepEqual(c.parts, [{ name: "Label", kind: "text" }]);
});

function reset() { renderMdx.setAnatomyIndex(null); renderMdx.setMediaIndex(null); }

test("renderAnatomy: image-led callout when capture usable + default.webp present", function () {
  renderMdx.setAnatomyIndex({ components: { button: BUTTON_ANATOMY } });
  renderMdx.setMediaIndex({ media: { button: { default: "components/dist/media/button/default.webp" } } });
  var out = renderMdx.renderAnatomy("button", null);
  assert.match(out, /<Anatomy\s/);
  assert.match(out, /image="\/media\/button\/default\.webp"/);
  assert.match(out, /parts=\{/);
  assert.match(out, /layout=\{/);
  reset();
});
test("renderAnatomy: callout without image when no default.webp in media index", function () {
  renderMdx.setAnatomyIndex({ components: { button: BUTTON_ANATOMY } });
  renderMdx.setMediaIndex(null);
  var out = renderMdx.renderAnatomy("button", null);
  assert.match(out, /<Anatomy\s/);
  assert.match(out, /layout=\{/);
  assert.doesNotMatch(out, /image=/);
  reset();
});
test("renderAnatomy: falls back to category-defaults placeholder when capture not usable", function () {
  renderMdx.setAnatomyIndex({ components: { button: withDegraded() } });
  var out = renderMdx.renderAnatomy("button", { anatomy: { parts: [{ name: "Container", description: "wrapper" }] } });
  assert.match(out, /<Anatomy parts=\{/);
  assert.doesNotMatch(out, /layout=\{/);
  reset();
});
test("renderAnatomy: emits name= prop (drives the diagram alt) when a display name is given", function () {
  renderMdx.setAnatomyIndex({ components: { button: BUTTON_ANATOMY } });
  renderMdx.setMediaIndex({ media: { button: { default: "components/dist/media/button/default.webp" } } });
  assert.match(renderMdx.renderAnatomy("button", null, "Button"), /name="Button"/);
  assert.doesNotMatch(renderMdx.renderAnatomy("button", null), /name=/);
  reset();
});
test("renderAnatomy: empty string when no usable anatomy and no defaults", function () {
  renderMdx.setAnatomyIndex(null);
  assert.equal(renderMdx.renderAnatomy("button", null), "");
  reset();
});
test("renderDesignSections: anatomy renders real callout and suppresses the parts media board", function () {
  renderMdx.setAnatomyIndex({ components: { button: BUTTON_ANATOMY } });
  renderMdx.setMediaIndex({
    media: { button: {
      default: "components/dist/media/button/default.webp",
      parts: ["components/dist/media/button/parts-0.webp"],
    } },
  });
  var out = renderMdx.renderDesignSections({}, null, null, "button", {});
  assert.match(out, /## Anatomy/);
  assert.match(out, /<Anatomy[^>]*image="\/media\/button\/default\.webp"/);
  assert.doesNotMatch(out, /<Media role="parts"/);
  renderMdx.setAnatomyIndex(null); renderMdx.setMediaIndex(null);
});

module.exports = { BUTTON_ANATOMY: BUTTON_ANATOMY, withDegraded: withDegraded };

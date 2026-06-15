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

module.exports = { BUTTON_ANATOMY: BUTTON_ANATOMY, withDegraded: withDegraded };

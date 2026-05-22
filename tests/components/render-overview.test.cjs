"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// ---------------------------------------------------------------------------
// Tests for renderOverview: the component description renderer.
// Figma descriptions carry paragraph breaks (\n\n) and line breaks (\n);
// renderOverview preserves them as separate <p> elements and <br/> while
// staying MDX-parseable (no blank line inside a single <p>).
// ---------------------------------------------------------------------------

test("renderOverview: single-line description → exactly one <p>", function () {
  var out = renderMdx.renderOverview({ description: "A small status indicator." });
  assert.equal(
    out,
    '<p class="component-description">A small status indicator.</p>',
  );
});

test("renderOverview: blank-line breaks become separate <p> elements", function () {
  var out = renderMdx.renderOverview({
    description: "Intro paragraph.\n\nSecond paragraph.",
  });
  var paras = out.match(/<p class="component-description">/g) || [];
  assert.equal(paras.length, 2, "two paragraphs → two <p> elements");
  assert.match(out, /<p class="component-description">Intro paragraph\.<\/p>/);
  assert.match(out, /<p class="component-description">Second paragraph\.<\/p>/);
  // Separated by a blank line so each <p> is a standalone MDX element.
  assert.ok(out.indexOf("</p>\n\n<p") !== -1, "<p> blocks separated by blank line");
});

test("renderOverview: a single \\n within a paragraph becomes <br />", function () {
  var out = renderMdx.renderOverview({
    description: "Primary: main task.\nSecondary: supporting.\nTertiary: low priority.",
  });
  var paras = out.match(/<p class="component-description">/g) || [];
  assert.equal(paras.length, 1, "single-newline lines stay in one paragraph");
  assert.equal((out.match(/<br \/>/g) || []).length, 2, "two line breaks");
  assert.match(out, /Primary: main task\.<br \/>Secondary: supporting\./);
});

test("renderOverview: mixed paragraph + line breaks (Button-shaped)", function () {
  var out = renderMdx.renderOverview({
    description: "Primary trigger for an action.\n\nPrimary: most important.\nCritical: data loss.",
  });
  var paras = out.match(/<p class="component-description">/g) || [];
  assert.equal(paras.length, 2);
  assert.equal((out.match(/<br \/>/g) || []).length, 1);
});

test("renderOverview: intra-line whitespace runs collapse to one space", function () {
  var out = renderMdx.renderOverview({ description: "A    padded\t\tdescription." });
  assert.equal(
    out,
    '<p class="component-description">A padded description.</p>',
  );
});

test("renderOverview: empty / whitespace-only description → empty string", function () {
  assert.equal(renderMdx.renderOverview({ description: "" }), "");
  assert.equal(renderMdx.renderOverview({ description: "   \n  \n " }), "");
  assert.equal(renderMdx.renderOverview({}), "");
});

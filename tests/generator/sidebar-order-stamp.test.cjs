"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var G = require("../../scripts/generate-composition-pages.cjs");

var NO_SIDEBAR = "---\ntitle: Borders\ndescription: Border tokens.\n---\n\nimport X from \"y\";\n\n<X/>\n";
var WITH_ORDER = "---\ntitle: Overview\ndescription: O.\nsidebar:\n  order: 0\n---\n\nbody\n";
var WITH_SIDEBAR_NO_ORDER = "---\ntitle: T\ndescription: D\nsidebar:\n  label: Custom Label\n---\n\nbody\n";

test("setSidebarOrder inserts a sidebar.order block when absent", function () {
  var out = G.setSidebarOrder(NO_SIDEBAR, 3);
  assert.match(out, /sidebar:\n  order: 3/);
  assert.match(out, /title: Borders/);              // title preserved
  assert.match(out, /description: Border tokens\./); // description preserved
  assert.match(out, /<X\/>/);                         // body preserved
});
test("setSidebarOrder replaces an existing order value", function () {
  var out = G.setSidebarOrder(WITH_ORDER, 5);
  assert.match(out, /sidebar:\n  order: 5/);
  assert.doesNotMatch(out, /order: 0/);
  assert.match(out, /title: Overview/);
});
test("setSidebarOrder adds order under an existing sidebar block, keeping siblings", function () {
  var out = G.setSidebarOrder(WITH_SIDEBAR_NO_ORDER, 2);
  assert.match(out, /label: Custom Label/);          // sibling kept
  assert.match(out, /order: 2/);
});
test("setSidebarOrder is idempotent", function () {
  var once = G.setSidebarOrder(NO_SIDEBAR, 4);
  var twice = G.setSidebarOrder(once, 4);
  assert.equal(twice, once);
});
test("setSidebarOrder is idempotent when sidebar has sibling children", function () {
  var once = G.setSidebarOrder(WITH_SIDEBAR_NO_ORDER, 7);
  var twice = G.setSidebarOrder(once, 7);
  assert.equal(twice, once);
  assert.match(twice, /label: Custom Label/);  // sibling still present
});
test("setSidebarOrder handles a blank line inside the sidebar block idempotently", function () {
  var input = "---\ntitle: T\nsidebar:\n\n  order: 1\n---\n\nbody\n";
  var once = G.setSidebarOrder(input, 5);
  var twice = G.setSidebarOrder(once, 5);
  assert.equal(twice, once);                      // idempotent
  assert.equal((once.match(/order:/g) || []).length, 1);  // no duplicate order key
  assert.match(once, /order: 5/);
});

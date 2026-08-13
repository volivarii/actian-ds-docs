"use strict";

// The knowledge layer publishes `status: "deprecated"` for a component whose
// Figma page carries the deprecated status emoji, and the sidebar ignored it.
// So `⛔️ WIP data visualization` (bar-graph, line-graph) and `⛔️ Popover`
// solicited use from the public navigation, WIP charts included.
//
// The page itself is kept: a reader arriving from an existing link should still
// find it, and the deprecation is information. It is the navigation that must
// stop advertising it.

var test = require("node:test");
var assert = require("node:assert/strict");
var path = require("path");

var buildSidebarManifest = require(
  path.join(__dirname, "..", "..", "scripts", "lib", "sidebar-manifest.cjs"),
).buildSidebarManifest;

function registry(components) {
  return { components: components };
}

var OPTS = {
  excludedCategories: new Set(),
  collectionCategories: new Set(),
  targetSection: "components",
  sectionDirs: { Components: "components", "Brand Assets": "brand" },
  defaultSectionDir: "components",
};

function labels(nodes) {
  var out = [];
  nodes.forEach(function (n) {
    if (n.items) n.items.forEach(function (i) { out.push(i.label); });
    else out.push(n.label);
  });
  return out;
}

test("a deprecated component is kept out of the sidebar", function () {
  var sidebar = buildSidebarManifest(
    registry({
      tooltip: { name: "Tooltip", category: "Overlays", section: "Components" },
      popover: {
        name: "Popover",
        category: "Overlays",
        section: "Components",
        status: "deprecated",
      },
    }),
    OPTS,
  );
  var l = labels(sidebar);
  assert.ok(l.indexOf("Tooltip") !== -1, "a live component still appears");
  assert.equal(
    l.indexOf("Popover"),
    -1,
    "a deprecated component must not solicit use from the nav",
  );
});

test("deprecated components do not create a group node of their own", function () {
  // bar-graph + line-graph are the only members of their group, so if they were
  // counted the nav would grow a "WIP data visualization" section.
  var sidebar = buildSidebarManifest(
    registry({
      "bar-graph": {
        name: "Bar graph",
        category: "Data Display",
        group: "WIP data visualization",
        section: "Components",
        status: "deprecated",
      },
      "line-graph": {
        name: "Line graph",
        category: "Data Display",
        group: "WIP data visualization",
        section: "Components",
        status: "deprecated",
      },
      avatar: {
        name: "Avatar",
        category: "Data Display",
        group: "Avatar",
        section: "Components",
      },
    }),
    OPTS,
  );
  assert.deepEqual(labels(sidebar), ["Avatar"]);
  assert.equal(
    sidebar.filter(function (n) { return n.label === "WIP data visualization"; }).length,
    0,
    "no group node may be created from deprecated-only members",
  );
});

test("in-progress and unstatused components are unaffected", function () {
  var sidebar = buildSidebarManifest(
    registry({
      button: { name: "Button", category: "Action", section: "Components" },
      link: {
        name: "Link",
        category: "Action",
        section: "Components",
        status: "in-progress",
      },
    }),
    OPTS,
  );
  assert.deepEqual(labels(sidebar).sort(), ["Button", "Link"]);
});

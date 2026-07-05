import { test } from "node:test";
import assert from "node:assert/strict";
import remarkBaseLinks from "../../scripts/remark-base-links.mjs";

const BASE = "/actian-ds-docs";

function run(tree, base = BASE) {
  remarkBaseLinks({ base })(tree);
  return tree;
}

test("remarkBaseLinks: prefixes root-absolute link urls", () => {
  const tree = {
    type: "root",
    children: [
      { type: "link", url: "/foundations/color/", children: [] },
      { type: "image", url: "/media/button/preview.webp" },
      { type: "definition", url: "/components/overlays/tooltip/#when-to-use" },
    ],
  };
  run(tree);
  assert.equal(tree.children[0].url, "/actian-ds-docs/foundations/color/");
  assert.equal(tree.children[1].url, "/actian-ds-docs/media/button/preview.webp");
  assert.equal(tree.children[2].url, "/actian-ds-docs/components/overlays/tooltip/#when-to-use");
});

test("remarkBaseLinks: recurses into nested children", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "link", url: "/content/", children: [{ type: "text", value: "x" }] }],
      },
    ],
  };
  run(tree);
  assert.equal(tree.children[0].children[0].url, "/actian-ds-docs/content/");
});

test("remarkBaseLinks: leaves already-prefixed, relative, external, protocol-relative, and anchor urls alone", () => {
  const urls = [
    "/actian-ds-docs/foundations/color/", // already prefixed
    "/actian-ds-docs", // exactly the base
    "https://example.com/x", // external
    "//example.com/x", // protocol-relative
    "../sibling/", // relative
    "sibling", // bare slug
    "#anchor", // in-page anchor
    "mailto:x@example.com",
  ];
  const tree = {
    type: "root",
    children: urls.map((url) => ({ type: "link", url, children: [] })),
  };
  run(tree);
  tree.children.forEach((node, i) => assert.equal(node.url, urls[i]));
});

test("remarkBaseLinks: does not prefix a longer path that merely shares the base as a string prefix", () => {
  const tree = {
    type: "root",
    children: [{ type: "link", url: "/actian-ds-docs-other/page/", children: [] }],
  };
  run(tree);
  assert.equal(tree.children[0].url, "/actian-ds-docs/actian-ds-docs-other/page/");
});

test("remarkBaseLinks: no-op when base is / (links-validator build)", () => {
  const tree = {
    type: "root",
    children: [{ type: "link", url: "/foundations/color/", children: [] }],
  };
  run(tree, "/");
  assert.equal(tree.children[0].url, "/foundations/color/");
});

test("remarkBaseLinks: trailing slash on base is normalized", () => {
  const tree = {
    type: "root",
    children: [{ type: "link", url: "/content/", children: [] }],
  };
  run(tree, "/actian-ds-docs/");
  assert.equal(tree.children[0].url, "/actian-ds-docs/content/");
});

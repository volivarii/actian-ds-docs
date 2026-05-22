import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDocsPageSidebar } from "../../scripts/lib/docs-page-sidebar.mjs";

test("buildDocsPageSidebar groups entries by navGroup, sorted by title", () => {
  const groups = buildDocsPageSidebar([
    { slug: "migrations", data: { title: "Migrations", navGroup: "Reference" } },
    { slug: "about", data: { title: "About", navGroup: "Reference" } },
    { slug: "voice", data: { title: "Voice", navGroup: "Guides" } },
  ]);
  assert.deepEqual(groups, [
    { label: "Guides", items: [{ label: "Voice", link: "/voice" }] },
    {
      label: "Reference",
      items: [
        { label: "About", link: "/about" },
        { label: "Migrations", link: "/migrations" },
      ],
    },
  ]);
});

test("buildDocsPageSidebar returns [] for no entries", () => {
  assert.deepEqual(buildDocsPageSidebar([]), []);
});

test("buildDocsPageSidebar defaults a missing navGroup to 'Reference'", () => {
  const groups = buildDocsPageSidebar([{ slug: "x", data: { title: "X" } }]);
  assert.equal(groups[0].label, "Reference");
});

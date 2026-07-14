"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");

// ---------------------------------------------------------------------------
// Recurrence gate for the class of failure that took docs main red on
// 2026-07-10 and blocked deploy for two days.
//
// src/content/docs/content/{index,writing,patterns,product}.md are generated
// at prebuild from the vendored knowledge content (vendor/content/dist/
// {global,writing,patterns,product}.md — the /content page split broke the single
// /content page into one page per content family). That content cross-links
// components by BARE SLUG, as in `[tabs](tabs)`. Copied verbatim, those are
// relative links: starlight-links-validator rejects them and the build dies.
// Every time a content author added one, docs broke, and the only fix was
// hand-adding the slug to an allowlist in astro.config.mjs.
//
// sync-vendored-md.cjs resolves them through the same link policy the
// component pages use (scripts/lib/render-mdx.cjs): known slugs and aliases
// become real page links, slugs with no page lose their link syntax. This test
// asserts the OUTPUT holds that invariant on ALL FOUR pages, so a new
// unresolvable slug in knowledge fails here (naming the slug + the page) instead
// of inside an Astro build hook.
//
// Runs against the generated files, so it needs a build first: `npm run build`
// (CI runs the suite after the build step for exactly this reason). Skips when
// a file is absent rather than failing a bare checkout.
// ---------------------------------------------------------------------------

var DOCS_CONTENT_DIR = path.resolve(__dirname, "..", "..", "src", "content", "docs", "content");
var PAGES = {
  index: path.join(DOCS_CONTENT_DIR, "index.md"),
  writing: path.join(DOCS_CONTENT_DIR, "writing.md"),
  patterns: path.join(DOCS_CONTENT_DIR, "patterns.md"),
  product: path.join(DOCS_CONTENT_DIR, "product.md"),
};

// Same shape as render-mdx's BARE_SLUG_LINK: `[label](slug)` with no leading
// slash, no scheme, no hash anchor.
var BARE_SLUG_LINK = /\[([^\]]+)\]\(([a-z][a-z0-9-]*)\)/g;

test("generated content pages have no unresolved bare-slug links", function (t) {
  var present = Object.entries(PAGES).filter(function (e) { return fs.existsSync(e[1]); });
  if (!present.length) {
    t.skip("content pages not generated yet; run `npm run build` first");
    return;
  }
  var offenders = [];
  present.forEach(function (entry) {
    var name = entry[0];
    var body = fs.readFileSync(entry[1], "utf8");
    var m;
    BARE_SLUG_LINK.lastIndex = 0;
    while ((m = BARE_SLUG_LINK.exec(body)) !== null) offenders.push(name + ":" + m[2]);
  });

  assert.deepEqual(
    offenders,
    [],
    "Unresolved bare-slug link(s) in the generated content pages (page:slug): " +
      offenders.join(", ") +
      ".\nThe knowledge content cross-references a component this site cannot resolve. Fix in scripts/lib/render-mdx.cjs:\n" +
      "  - the component exists under a different registry slug → add a SLUG_ALIASES entry\n" +
      "  - the component does not exist in the DS Kit → add it to REMOVE_LINK_SLUGS (link syntax dropped, label kept)\n" +
      "Do NOT re-add an allowlist to astro.config.mjs: that ships a dead link to readers.",
  );
});

test("generated content pages' component links point at real component pages", function (t) {
  var present = Object.entries(PAGES).filter(function (e) { return fs.existsSync(e[1]); });
  if (!present.length) {
    t.skip("content pages not generated yet; run `npm run build` first");
    return;
  }
  var docsRoot = path.resolve(__dirname, "..", "..", "src", "content", "docs");
  var re = /\[[^\]]+\]\((\/components\/[a-z0-9/-]+)\)/g;
  var totalLinks = 0;

  present.forEach(function (entry) {
    var name = entry[0];
    var body = fs.readFileSync(entry[1], "utf8");
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(body)) !== null) {
      totalLinks++;
      var href = m[1];
      // Components use the sub-route layout: <slug>/index.mdx plus a tab MDX
      // per domain. Accept the flat <slug>.mdx form too, for any page that
      // predates it.
      var base = path.join(docsRoot, href.replace(/^\//, "").replace(/\/$/, ""));
      assert.ok(
        fs.existsSync(path.join(base, "index.mdx")) || fs.existsSync(base + ".mdx"),
        "content/" + name + ".md links " + href + " but no page was generated at " +
          base + "/index.mdx (nor " + base + ".mdx)",
      );
    }
  });

  // The vendored content is expected to cross-link components; a zero here
  // means the rewrite silently stopped running (e.g. prebuild order regressed).
  assert.ok(totalLinks > 0, "expected the content pages to link at least one component page");
});

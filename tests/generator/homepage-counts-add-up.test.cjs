"use strict";

// tests/generator/homepage-counts-add-up.test.cjs
//
// The homepage's first figure said "333 DS Kit components". It counted every
// registry entry, while the category grid immediately below it summed to 74,
// so the page contradicted itself within one screen, on the first number a
// reader sees.
//
// The first attempt at the fix repeated the same mistake one field along: it
// took the icon figure from the "Foundations" SECTION, which holds 153 icons
// AND the 5 grid components. A label that does not match what it counts is the
// whole defect, so a guard that only checked the component figure would have
// passed on it.
//
// What this file asserts is therefore arithmetic, not a set of literals: the
// four figures the page prints must partition the registry exactly. A figure
// that starts counting the wrong set breaks the sum, whichever one it is, and
// the remainder is derived in the page so it can never be hand-maintained into
// agreeing with a wrong part.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const INDEX = path.join(ROOT, "src", "content", "docs", "index.mdx");
const REGISTRY = path.join(
  ROOT, "vendor", "components", "dist", "registries", "dskit.json",
);

const entries = () =>
  Object.values(JSON.parse(fs.readFileSync(REGISTRY, "utf8")).components);

test("the four homepage figures partition the registry exactly", () => {
  const all = entries();
  const components = all.filter((c) => c.section === "Components").length;
  const icons = all.filter((c) => c.category === "Icons").length;
  const brand = all.filter((c) => c.section === "Brand Assets").length;
  const other = all.length - components - icons - brand;

  assert.ok(components > 0, "fixture sanity: the registry has components");
  assert.ok(icons > 0, "fixture sanity: the registry has icons");
  assert.equal(
    components + icons + brand + other,
    all.length,
    "the four figures must account for every registry entry",
  );
  assert.ok(
    other >= 0,
    "a negative remainder means two of the named figures overlap, so at least " +
      "one entry is being counted twice on the homepage.",
  );
});

test("icons are counted by category, not by the Foundations section", () => {
  const all = entries();
  const bySection = all.filter((c) => c.section === "Foundations").length;
  const byCategory = all.filter((c) => c.category === "Icons").length;
  assert.notEqual(
    bySection,
    byCategory,
    "fixture sanity: this guard exists because the two differ (the Foundations " +
      "section carries the grid components as well as the icons). If they have " +
      "become equal upstream, the distinction stopped mattering and this test " +
      "should be revisited rather than deleted blind.",
  );

  const src = fs.readFileSync(INDEX, "utf8");
  assert.match(
    src,
    /iconCount\s*=\s*kitEntries\.filter\(\(c\) => c\.category === "Icons"\)/,
    "the icon figure must come from the Icons category. Taking it from the " +
      "Foundations section counts the grid components as icons.",
  );
  assert.equal(
    /iconCount\s*=\s*bySection\("Foundations"\)/.test(src),
    false,
    "iconCount is reading the Foundations section again",
  );
});

test("the component figure counts components, and the remainder is derived", () => {
  const src = fs.readFileSync(INDEX, "utf8");
  assert.match(
    src,
    /componentCount\s*=\s*bySection\("Components"\)/,
    "the headline figure must count the Components section",
  );
  assert.match(
    src,
    /otherKitCount\s*=\s*\n?\s*totalDsKit - componentCount - iconCount - brandAssetCount/,
    "the remainder must be derived from the other three, so the printed " +
      "figures cannot be edited into summing to something other than the total.",
  );
  assert.equal(
    /stat-card__number">\{totalDsKit\}/.test(src),
    false,
    "the headline number is showing every registry entry again, under a label " +
      "that says components.",
  );
});

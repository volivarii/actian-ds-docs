/**
 * Unit tests for ComponentTabs URL-derivation logic.
 *
 * The core logic lives in src/lib/component-tab-href.mjs (a plain ES module),
 * imported by ComponentTabs.astro. Testing the helper directly avoids the
 * Astro/Vite compile pipeline. Five fixtures cover the URL shapes we ship.
 *
 * Regression target: the lastIndexOf bug (PR #33) where nested-group
 * components with slug === group name (e.g. stepper, global-header)
 * produced 404 tab links because indexOf matched the group segment.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { derivePrefix, buildTabs } from "../../src/lib/component-tab-href.mjs";

const TABS_CONFIG = [
  { slug: "overview", label: "Overview", isIndex: true },
  { slug: "design", label: "Design" },
  { slug: "usage", label: "Usage" },
];

test("derivePrefix: flat slug, base path with trailing slash", () => {
  const prefix = derivePrefix({
    pathname: "/actian-ds-docs/components/action/button/usage/",
    component: "button",
    base: "/actian-ds-docs/",
  });
  assert.equal(prefix, "/actian-ds-docs/components/action/button/");
});

test("derivePrefix: flat slug, base path WITHOUT trailing slash (normalized)", () => {
  const prefix = derivePrefix({
    pathname: "/actian-ds-docs/components/action/button/",
    component: "button",
    base: "/actian-ds-docs",
  });
  assert.equal(prefix, "/actian-ds-docs/components/action/button/");
});

test("derivePrefix: nested-group slug=group regression (stepper)", () => {
  const prefix = derivePrefix({
    pathname: "/actian-ds-docs/components/navigation/stepper/stepper/usage/",
    component: "stepper",
    base: "/actian-ds-docs/",
  });
  // Must match the LAST occurrence, not the group segment.
  assert.equal(prefix, "/actian-ds-docs/components/navigation/stepper/stepper/");
});

test("derivePrefix: nested-group, slug different from group", () => {
  const prefix = derivePrefix({
    pathname: "/actian-ds-docs/components/data-display/card/perimeter-card/design/",
    component: "perimeter-card",
    base: "/actian-ds-docs/",
  });
  assert.equal(prefix, "/actian-ds-docs/components/data-display/card/perimeter-card/");
});

test("derivePrefix: fallback when component not found in pathname", () => {
  const prefix = derivePrefix({
    pathname: "/actian-ds-docs/some/other/path/",
    component: "button",
    base: "/actian-ds-docs/",
  });
  // Fallback: base + components/ + component + /
  assert.equal(prefix, "/actian-ds-docs/components/button/");
});

test("buildTabs: marks the active tab, builds isIndex correctly", () => {
  const tabs = buildTabs({
    config: TABS_CONFIG,
    prefix: "/actian-ds-docs/components/action/button/",
    activeTab: "usage",
  });
  assert.equal(tabs.length, 3);
  assert.deepEqual(tabs[0], {
    slug: "overview", label: "Overview",
    href: "/actian-ds-docs/components/action/button/",
    isActive: false,
  });
  assert.deepEqual(tabs[1], {
    slug: "design", label: "Design",
    href: "/actian-ds-docs/components/action/button/design/",
    isActive: false,
  });
  assert.deepEqual(tabs[2], {
    slug: "usage", label: "Usage",
    href: "/actian-ds-docs/components/action/button/usage/",
    isActive: true,
  });
});

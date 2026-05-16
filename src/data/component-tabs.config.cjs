"use strict";

/**
 * component-tabs.config.cjs — Tab inventory + domain-to-tab routing.
 *
 * Consumed by scripts/generate-component-pages.cjs. Edit this file (not
 * the generator) to add/remove tabs, rename URLs, or re-route domains.
 *
 * Each tab specifies which guideline `domains.<key>` it sources from
 * AND which generator render-helpers fire ('overview' | 'variants' |
 * 'anatomy' | 'motion' | 'a11yRefs' | 'tokens' | 'resources').
 *
 * `isIndex: true` marks the bare-URL tab (filename = index.mdx,
 * sidebar entry visible). All other tabs emit <slug>.mdx and set
 * `sidebar: { hidden: true }`.
 */

module.exports = {
  tabs: [
    {
      slug: "overview",
      label: "Overview",
      isIndex: true,
      domains: [],
      renderers: ["overview", "variantsSummary", "resources"],
    },
    {
      slug: "usage",
      label: "Usage",
      domains: ["usage"],
      renderers: ["categoryUsageBaseline"],
    },
    {
      slug: "content",
      label: "Content",
      domains: ["content"],
      renderers: ["contentDomain"],
    },
    {
      slug: "design",
      label: "Design",
      domains: ["design", "behavior"],
      renderers: ["anatomy", "motion"],
    },
    {
      slug: "accessibility",
      label: "Accessibility",
      domains: [],
      renderers: ["a11yRefs", "globalA11yLink"],
    },
    {
      slug: "code",
      label: "Code",
      domains: ["tokens"],
      renderers: ["variantsTable", "tokensPlaceholder", "apiPlaceholder"],
    },
  ],
};

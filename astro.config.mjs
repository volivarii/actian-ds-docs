import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import remarkCustomHeaderId from "remark-custom-header-id";

const SITE = process.env.SITE_URL || "https://volivarii.github.io/actian-ds-docs";
const BASE = process.env.SITE_BASE || "/actian-ds-docs";

export default defineConfig({
  site: SITE,
  base: BASE,
  markdown: {
    // Parse `## Title {#slug}` anchor syntax used by vendored MDs
    // (accessibility.md, content.md). Plugin emits proper id attributes
    // so Starlight's right-rail TOC and cross-link anchors work.
    remarkPlugins: [remarkCustomHeaderId],
  },
  integrations: [
    starlight({
      title: "Actian Design System",
      description: "Foundations, components, accessibility, content — federated via actian-ds-knowledge.",
      logo: {
        src: "./src/assets/actian-logo.svg",
        alt: "Actian",
      },
      customCss: [
        "./src/styles/tokens.css",
        "./src/styles/typography.css",
        "./src/styles/starlight-overrides.css",
        "./src/styles/docs-chrome.css",
      ],
      pagefind: true,
      components: {
        ThemeSelect: "./src/components/empty.astro",
      },
      sidebar: [
        { label: "Foundations", items: [{ autogenerate: { directory: "foundations" } }] },
        { label: "Content guidelines", link: "/content" },
        { label: "Accessibility", link: "/accessibility" },
        { label: "Categories", items: [{ autogenerate: { directory: "categories" } }] },
        {
          label: "Components",
          items: [{ autogenerate: { directory: "components" } }],
        },
        { label: "Patterns", link: "/patterns" },
        {
          label: "Reference",
          collapsed: true,
          items: [
            { label: "Inventory", link: "/inventory" },
            { label: "State", link: "/state" },
            { label: "Migrations", link: "/migrations" },
          ],
        },
      ],
    }),
  ],
});

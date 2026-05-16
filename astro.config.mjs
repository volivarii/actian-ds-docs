import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import remarkCustomHeaderId from "remark-custom-header-id";
import componentsSidebar from "./src/data/components-sidebar.json";

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
      // Sidebar mirrors Figma's section organization:
      // - Foundations ← Figma 💎 FOUNDATIONS
      // - Components ← Figma 🧱 COMPONENTS (each category has an index.mdx overview)
      // - Brand assets ← Figma 🎨 BRAND ASSETS
      // Content guidelines + Accessibility + Patterns + Reference are
      // docs-only top-level entries (no Figma equivalent).
      sidebar: [
        { label: "Foundations", items: [{ autogenerate: { directory: "foundations" } }] },
        { label: "Content guidelines", link: "/content" },
        { label: "Accessibility", link: "/accessibility" },
        {
          label: "Components",
          // Sidebar items are emitted by scripts/generate-component-pages.cjs to
          // src/data/components-sidebar.json (pre-build). Manual config replaces
          // autogenerate because autogenerate doesn't merge directory + index.mdx
          // into a single entry — which would double each component with the
          // sub-route tabs architecture (autogenerate produces a <details> group
          // AND a child link for the same component, so users see it twice).
          items: componentsSidebar,
        },
        { label: "Brand assets", items: [{ autogenerate: { directory: "brand" } }] },
        { label: "Patterns", link: "/patterns" },
        {
          label: "Reference",
          collapsed: true,
          items: [
            { label: "Inventory", link: "/inventory" },
            { label: "State", link: "/state" },
            { label: "Migrations", link: "/migrations" },
            { label: "Confidence scores", link: "/confidence" },
          ],
        },
      ],
    }),
  ],
});

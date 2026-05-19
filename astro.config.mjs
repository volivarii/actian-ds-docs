import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import remarkCustomHeaderId from "remark-custom-header-id";
import starlightLinksValidator from "starlight-links-validator";
import componentsSidebar from "./src/data/components-sidebar.json";
import brandSidebar from "./src/data/brand-sidebar.json";
import redirectsManifest from "./src/data/redirects-manifest.json";
import { createRequire } from "node:module";

const { SITE_URL: SITE } = createRequire(import.meta.url)("./scripts/lib/site-url.cjs");
const BASE = process.env.SITE_BASE || "/actian-ds-docs";

export default defineConfig({
  site: SITE,
  base: BASE,
  redirects: redirectsManifest,
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
          // autogenerate because autogenerate doesn't merge a directory + its
          // index.mdx into a single entry — which would double each component
          // with the sub-route tabs architecture.
          items: componentsSidebar,
        },
        {
          label: "Brand assets",
          // Same reasoning as Components — autogenerate would duplicate each
          // entry (directory node + index.mdx leaf) under the sub-route tabs
          // architecture. Manifest is emitted by generate-component-pages.cjs.
          items: brandSidebar,
        },
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
      // Links validation is opt-in via env var so the production build (run
      // with SITE_BASE=/actian-ds-docs) stays green. The validator's strict
      // link matching doesn't account for the base prefix; we run it under
      // `npm run build:check` (SITE_BASE=/) in a dedicated CI job instead.
      plugins: process.env.CHECK_LINKS
        ? [
            starlightLinksValidator({
              // Default behavior: fail build on any broken internal link.
              // Triage exclusions live below; only add an entry with a brief
              // comment explaining why the link is intentionally unresolved.
              errorOnRelativeLinks: true,
              errorOnInvalidHashes: true,
              // Per-link excludes (replaces broader per-file excludes). Each
              // entry has a comment explaining why the link cannot be validated.
              // exclude(context) receives {file, link, slug} per the
              // starlight-links-validator 0.24 API.
              exclude: ({ file, link }) => {
                // content.md is auto-generated from vendor/content/dist/global.md
                // by scripts/sync-vendored-md.cjs on every build. The 3 slugs
                // below reference concepts (forms, validation-messages, wizards)
                // that don't have dedicated component pages in the DS Kit —
                // the bare-slug links are intentional cross-section references,
                // not component links. All other content.md links are validated.
                //
                // 5 previously-excluded slugs (alert-banner, popover, stepper,
                // checkbox, filters) were converted to absolute paths upstream
                // in knowledge#76 (knowledge v0.14.1+). They're now validated
                // normally.
                if (file.endsWith("/content.md") || file.endsWith("\\content.md")) {
                  const unfixableSlugs = [
                    "forms",
                    "validation-messages",
                    "wizards",
                  ];
                  if (unfixableSlugs.some((s) => link === s || link.endsWith("/" + s))) return true;
                }
                // confidence.mdx links to /migrations and /state, which are real
                // pages served from src/pages/ (custom Astro pages, not Starlight
                // content-collection pages). starlight-links-validator 0.24 flags
                // them as "invalid link to custom page" — they resolve fine at
                // runtime. Suppressed specifically by link value.
                if (
                  (file.endsWith("/confidence.mdx") || file.endsWith("\\confidence.mdx")) &&
                  (link === "/migrations" || link === "/state")
                ) return true;
                return false;
              },
            }),
          ]
        : [],
    }),
  ],
});

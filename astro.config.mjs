import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import remarkCustomHeaderId from "remark-custom-header-id";
import starlightLinksValidator from "starlight-links-validator";

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
          // autogenerate respects per-page `sidebar: { hidden: true }`. Each
          // component now lives in its own subdir with six MDX tabs; only the
          // index.mdx is sidebar-visible (other tabs set hidden:true via the
          // generator). See scripts/generate-component-pages.cjs +
          // src/data/component-tabs.config.json.
          items: [{ autogenerate: { directory: "components" } }],
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
      plugins: [
        starlightLinksValidator({
          // Default behavior: fail build on any broken internal link.
          // Triage exclusions live below; only add an entry with a brief
          // comment explaining why the link is intentionally unresolved.
          errorOnRelativeLinks: true,
          errorOnInvalidHashes: true,
          // exclude(context) receives {file, link, slug} for each link under
          // validation. Return true to skip that link check.
          // `file` is the absolute path to the source file.
          exclude: ({ file }) => {
            // content is auto-generated from vendor/content/dist/global.md
            // by scripts/sync-vendored-md.cjs on every build. The upstream
            // document uses bare component slugs (e.g. `filters`, `stepper`)
            // as relative links — several reference components without pages
            // yet (validation-messages, wizards) and others that would need
            // upstream global.md edits. Fixing the generated output would be
            // clobbered on next sync; suppress until knowledge-repo links are
            // updated to absolute paths.
            if (file.endsWith("/content.md") || file.endsWith("\\content.md")) return true;
            // confidence.mdx links to /migrations and /state, which are real
            // pages served from src/pages/ (custom Astro pages, not Starlight
            // content-collection pages). Validator flags them as
            // "invalid link to custom page" — they resolve fine at runtime.
            if (file.endsWith("/confidence.mdx") || file.endsWith("\\confidence.mdx")) return true;
            return false;
          },
        }),
      ],
    }),
  ],
});

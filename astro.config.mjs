import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import remarkCustomHeaderId from "remark-custom-header-id";
import remarkBaseLinks from "./scripts/remark-base-links.mjs";
import starlightLinksValidator from "starlight-links-validator";
import componentsSidebar from "./src/data/components-sidebar.json";
import brandSidebar from "./src/data/brand-sidebar.json";
import redirectsManifest from "./src/data/redirects-manifest.json";
import { createRequire } from "node:module";

const { SITE_URL: SITE } = createRequire(import.meta.url)("./scripts/lib/site-url.cjs");
const BASE = process.env.SITE_BASE || "/actian-ds-docs";

// Astro base-prefixes each redirect's FROM route but NOT its destination, so
// a root-absolute destination in the manifest 404s under the deployed
// /actian-ds-docs base (and poisons the stub's rel=canonical, which Astro
// builds from the destination). The manifest stays base-agnostic data
// (generate-component-pages.cjs emits unprefixed paths); we prefix at this
// consumption point so even a stale manifest is corrected. `prefixDestination`
// is a no-op when the base is "/" (links-validator and a11y builds) and never
// double-prefixes an already-prefixed destination.
const BASE_NO_SLASH = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
const prefixDestination = (dest) => {
  // Only root-absolute string destinations get the base. Everything else
  // passes through untouched: external https:// urls, protocol-relative
  // //host paths, and Astro's object-form { status, destination } redirect
  // values (prefixing must never mangle them or TypeError at config load).
  if (typeof dest !== "string" || !dest.startsWith("/") || dest.startsWith("//")) return dest;
  if (!BASE_NO_SLASH || dest === BASE_NO_SLASH || dest.startsWith(BASE_NO_SLASH + "/")) return dest;
  return BASE_NO_SLASH + dest;
};
const redirects = Object.fromEntries(
  Object.entries(redirectsManifest).map(([from, to]) => [from, prefixDestination(to)]),
);

export default defineConfig({
  site: SITE,
  base: BASE,
  redirects,
  markdown: {
    // Parse `## Title {#slug}` anchor syntax used by vendored MDs
    // (content/{index,writing,patterns,product}.md). Plugin emits proper id
    // attributes so Starlight's right-rail TOC and cross-link anchors work.
    // Note: accessibility is now a composed .mdx page (no {#slug} anchors).
    //
    // remarkBaseLinks base-prefixes root-absolute markdown links (Astro does
    // not apply `base` to md link hrefs). No-op when BASE is "/", so the
    // links-validator build (SITE_BASE=/) validates the unprefixed paths.
    // MDX pages inherit this via @astrojs/mdx's extendMarkdownConfig default.
    remarkPlugins: [remarkCustomHeaderId, [remarkBaseLinks, { base: BASE }]],
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
        // Product tokens — kept global ONLY for showcase surfaces (TokenTable /
        // TokenScale) that must reflect the live design system. The chrome does
        // NOT consume these; it uses the docs-owned palette below. A CI guard
        // (tests/styles/chrome-no-product-tokens.test.cjs) enforces that.
        "./src/styles/tokens.css",
        // Docs-owned palette — the chrome's --docs-* vars (snapshot of product
        // values, decoupled). Must load before the chrome stylesheets.
        "./src/styles/docs-theme.css",
        "./src/styles/typography.css",
        "./src/styles/starlight-overrides.css",
        "./src/styles/docs-chrome.css",
      ],
      pagefind: true,
      // Renders Starlight's native footer "Last updated" line. Tracked pages
      // (foundations, category indexes) get the date from git; generated
      // component tab pages are untracked, so generate-component-pages.cjs
      // writes an explicit `lastUpdated` frontmatter date from the knowledge
      // guideline's updated_at — Starlight uses that instead of git.
      lastUpdated: true,
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
        {
          label: "Content guidelines",
          // Split from a single /content page into one page per content
          // family (the /content page split), sourced from vendor/content/dist/
          // {global,writing,patterns,product}.md via scripts/sync-vendored-md.cjs.
          // The index keeps the /content URL alive (carries the "Global
          // guidelines" section, which has no home on the three family pages).
          items: [
            { label: "Overview", link: "/content" },
            { label: "Writing", link: "/content/writing" },
            { label: "Patterns", link: "/content/patterns" },
            { label: "Product", link: "/content/product" },
          ],
        },
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
                // NOTE: the vendored content pages (content/index.md,
                // content/writing.md, content/patterns.md, content/product.md)
                // used to need a hand-maintained allowlist of bare slugs here.
                // They no longer do. scripts/sync-vendored-md.cjs runs the same
                // link policy the component pages use over each vendored
                // content page: known slugs (and their aliases) become real
                // page links, slugs with no page lose their link syntax.
                // Nothing reaches the validator unresolved, so every content/*
                // link is validated for real. Do NOT reintroduce an allowlist
                // here: a new unresolvable slug belongs in REMOVE_LINK_SLUGS
                // (scripts/lib/render-mdx.cjs), where it degrades to plain text
                // instead of shipping a dead link. Related-patterns links
                // (`content/<family>/#<slug>`) are resolved separately, by
                // scripts/lib/content-anchors.cjs — see renderRelatedPatterns
                // in scripts/lib/render-mdx.cjs.
                //
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

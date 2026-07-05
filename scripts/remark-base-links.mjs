// Remark plugin: base-prefix root-absolute internal links in Markdown/MDX.
//
// Astro/Starlight do NOT apply the configured `base` to plain markdown links
// like `[Color](/foundations/color/)` — the href reaches the rendered HTML
// verbatim and 404s under the deployed /actian-ds-docs base. This plugin
// rewrites `link`, `definition`, and `image` node urls at build time, so
// authored and vendored/generated markdown (content.md and friends) stays
// base-agnostic on disk.
//
// Wired in astro.config.mjs under markdown.remarkPlugins with the configured
// base as an option. MDX pages (e.g. src/pages/confidence.mdx) get it too:
// Starlight registers @astrojs/mdx with `extendMarkdownConfig` at its default
// of true, so the mdx pipeline inherits markdown.remarkPlugins.
//
// Rules:
//   - only urls starting with "/" are touched
//   - "//host/..." (protocol-relative) is left alone
//   - urls already starting with the base are left alone (no double-prefix)
//   - a base of "/" (links-validator and a11y builds run with SITE_BASE=/)
//     makes the plugin a no-op
//
// Dependency-free on purpose (no unist-util-visit): the walk is a dozen
// lines and this file is also imported by unit tests outside the Astro
// toolchain.

const NODE_TYPES_WITH_URL = new Set(["link", "definition", "image"]);

export default function remarkBaseLinks(options = {}) {
  const raw = typeof options.base === "string" ? options.base : "/";
  const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;

  return function transform(tree) {
    if (!base) return; // base "/" → site served at root, nothing to prefix

    (function walk(node) {
      if (
        NODE_TYPES_WITH_URL.has(node.type) &&
        typeof node.url === "string" &&
        node.url.startsWith("/") &&
        !node.url.startsWith("//") &&
        node.url !== base &&
        !node.url.startsWith(base + "/")
      ) {
        node.url = base + node.url;
      }
      if (Array.isArray(node.children)) node.children.forEach(walk);
    })(tree);
  };
}

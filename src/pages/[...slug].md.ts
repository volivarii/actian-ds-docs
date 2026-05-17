import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";

// Build-time enumeration of every page that needs a .md twin.
// All content collection entries live under the `docs` collection
// (Starlight v0.39 convention); their entry.id is the relative path
// from src/content/docs/, e.g. "foundations/spacing", "categories/action".
export const getStaticPaths: GetStaticPaths = async () => {
  const paths: Array<{ params: { slug: string }; props: { body: string } }> =
    [];

  const docs = await getCollection("docs");
  for (const entry of docs) {
    const id = entry.id.replace(/\.mdx?$/, ""); // strip extension if present
    const title = entry.data.title || id;
    const description = entry.data.description || "";
    const body = entry.body || "";
    paths.push({
      params: { slug: id },
      props: { body: `# ${title}\n\n${description}\n\n${body}` },
    });
  }

  // Standalone src/pages/*.mdx routes (not in content collection).
  // We don't have access to their MDX body at build time without rendering;
  // emit a stub pointing back to the HTML page + brief context for agents.
  // Note: accessibility + content used to live here but moved into the
  // docs collection (synced from vendor at prebuild). They're now picked
  // up automatically by the getCollection("docs") loop above.

  // Richer titles/descriptions for .astro pages that lack frontmatter.
  const OVERRIDES: Record<string, { title: string; desc: string }> = {
    inventory: {
      title: "Inventory",
      desc: "All 322 DS Kit components, browseable.",
    },
    state: {
      title: "Ecosystem state",
      desc: "Live state of the three-repo ecosystem.",
    },
  };

  // Discover standalone pages under src/pages/ that aren't part of the
  // docs collection or a templated route. Each gets a .md twin for AI agents.
  const pageModules = import.meta.glob<{
    frontmatter?: { title?: string; description?: string };
  }>("/src/pages/*.{mdx,astro}", { eager: true });

  const standalone = Object.entries(pageModules)
    .map(([filePath, mod]) => {
      const slug = filePath
        .replace(/^.*\/pages\//, "")
        .replace(/\.(mdx|astro)$/, "");
      // Skip templated routes and this file itself
      if (slug.startsWith("[")) return null;
      const fm = (mod as any).frontmatter || {};
      const override = OVERRIDES[slug];
      return {
        slug,
        title:
          override?.title ??
          fm.title ??
          slug.charAt(0).toUpperCase() + slug.slice(1),
        desc: override?.desc ?? fm.description ?? `Standalone page: ${slug}`,
      };
    })
    .filter(Boolean) as Array<{ slug: string; title: string; desc: string }>;
  for (const page of standalone) {
    paths.push({
      params: { slug: page.slug },
      props: {
        body: `# ${page.title}\n\n${page.desc}\n\nFull rendered content at the HTML page \`/${page.slug}\`. This stub exists for AI-agent ingestion of the page identity; richer prose lives in actian-ds-knowledge.\n`,
      },
    });
  }

  return paths;
};

export const GET: APIRoute = ({ props }) => {
  return new Response(props?.body || "", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
};

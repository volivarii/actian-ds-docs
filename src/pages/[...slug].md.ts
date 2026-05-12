import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";

// Build-time enumeration of every page that needs a .md twin.
// All content collection entries live under the `docs` collection
// (Starlight v0.39 convention); their entry.id is the relative path
// from src/content/docs/, e.g. "foundations/spacing", "categories/action".
export const getStaticPaths: GetStaticPaths = async () => {
  const paths: Array<{ params: { slug: string }; props: { body: string } }> = [];

  const docs = await getCollection("docs");
  for (const entry of docs) {
    const id = entry.id.replace(/\.mdx?$/, "");   // strip extension if present
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
  const standalone = [
    { slug: "about", title: "About", desc: "How the three-repo ecosystem works." },
    { slug: "accessibility", title: "Accessibility", desc: "WCAG 2.2 AA guidance — full content in HTML page." },
    { slug: "content", title: "Content guidelines", desc: "Voice, terminology, UI copy — full content in HTML page." },
    { slug: "inventory", title: "Inventory", desc: "All 322 DS Kit components, browseable." },
    { slug: "migrations", title: "Migrations", desc: "Schema transitions, parallel-change discipline." },
    { slug: "state", title: "Ecosystem state", desc: "Live state of the three-repo ecosystem." },
  ];
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

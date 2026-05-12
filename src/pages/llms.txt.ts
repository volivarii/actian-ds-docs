import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

const SITE = process.env.SITE_URL || "https://volivarii.github.io/actian-ds-docs";

export const GET: APIRoute = async () => {
  const docs = await getCollection("docs");

  // Partition by collection prefix (entry.id = "foundations/spacing", etc.)
  const foundations = docs.filter((e) => e.id.startsWith("foundations/"));
  const categories = docs.filter((e) => e.id.startsWith("categories/"));
  const components = docs.filter((e) => e.id.startsWith("components/"));

  const lines: string[] = [
    "# Actian Design System",
    "",
    "> AI-native design system. Foundations, components, accessibility, content guidelines. Federated knowledge consumed by Figma plugin + docs.",
    "",
    "## Foundations",
    "",
  ];

  for (const entry of foundations) {
    const slug = entry.id.replace(/^foundations\//, "").replace(/\.mdx?$/, "");
    lines.push(`- [${entry.data.title}](${SITE}/foundations/${slug}.md): ${entry.data.description || ""}`);
  }

  lines.push("", "## Accessibility", "", `- [WCAG 2.2 AA guidance](${SITE}/accessibility.md): WCAG criteria, contrast, keyboard nav, ARIA patterns`);
  lines.push("", "## Content guidelines", "", `- [Content](${SITE}/content.md): voice, terminology, UI copy patterns`);

  lines.push("", "## Categories", "");
  for (const entry of categories) {
    const slug = entry.id.replace(/^categories\//, "").replace(/\.mdx?$/, "");
    lines.push(`- [${entry.data.title}](${SITE}/categories/${slug}.md): ${entry.data.description || ""}`);
  }

  lines.push("", "## Components (categorized DS Kit)", "");
  for (const entry of components) {
    const slug = entry.id.replace(/^components\//, "").replace(/\.mdx?$/, "");
    lines.push(`- [${entry.data.title}](${SITE}/components/${slug}.md): ${entry.data.description || ""}`);
  }

  lines.push("", "## Other", "");
  lines.push(`- [Inventory (all 322 DS Kit)](${SITE}/inventory.md)`);
  lines.push(`- [Ecosystem state](${SITE}/state.md)`);
  lines.push(`- [Migrations](${SITE}/migrations.md)`);
  lines.push(`- [About — ecosystem overview](${SITE}/about.md)`);

  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};

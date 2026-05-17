import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import tabsConfig from "../data/component-tabs.config.json";
import { createRequire } from "node:module";
import path from "node:path";

const { SITE_URL: SITE } = createRequire(import.meta.url)(
  path.resolve(process.cwd(), "scripts/lib/site-url.cjs"),
);

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
    lines.push(
      `- [${entry.data.title}](${SITE}/foundations/${slug}.md): ${entry.data.description || ""}`,
    );
  }

  lines.push(
    "",
    "## Accessibility",
    "",
    `- [WCAG 2.2 AA guidance](${SITE}/accessibility.md): WCAG criteria, contrast, keyboard nav, ARIA patterns`,
  );
  lines.push(
    "",
    "## Content guidelines",
    "",
    `- [Content](${SITE}/content.md): voice, tone, terminology, and UX-pattern copy guidance`,
  );

  lines.push("", "## Categories", "");
  for (const entry of categories) {
    const slug = entry.id.replace(/^categories\//, "").replace(/\.mdx?$/, "");
    lines.push(
      `- [${entry.data.title}](${SITE}/categories/${slug}.md): ${entry.data.description || ""}`,
    );
  }

  lines.push("", "## Components (categorized DS Kit)", "");

  // Group sub-route tab IDs under their parent component slug.
  // Detect "is tab" by checking if the last path segment matches a known non-index tab slug
  // (e.g. "usage", "content", "design", "accessibility", "code"). This is more robust than
  // checking parts.length === 4 because nested category paths like
  // "components/data-display/tag-identification-key/tag-stage" have 4 segments yet are
  // NOT tabs — their last segment is the component slug, not a tab slug.
  const TAB_SLUGS = new Set(
    tabsConfig.tabs.filter((t) => !t.isIndex).map((t) => t.slug),
  );

  type Entry = (typeof components)[number];
  type Bucket = { parent: Entry; tabs: Entry[] };
  const byComponent = new Map<string, Bucket>();

  for (const entry of components) {
    const idNoExt = entry.id.replace(/\.mdx?$/, "");
    const parts = idNoExt.split("/"); // ["components","action","button"] or [...,"usage"]
    const lastSeg = parts[parts.length - 1];
    const isTab = TAB_SLUGS.has(lastSeg);
    // For tabs, the component key is everything except the trailing tab segment.
    const compKey = isTab ? parts.slice(0, -1).join("/") : parts.join("/");

    if (!byComponent.has(compKey)) {
      byComponent.set(compKey, { parent: entry, tabs: [] });
    }
    const bucket = byComponent.get(compKey)!;
    if (isTab) {
      bucket.tabs.push(entry);
    } else {
      bucket.parent = entry;
    }
  }

  for (const [, { parent, tabs }] of byComponent) {
    const slug = parent.id.replace(/^components\//, "").replace(/\.mdx?$/, "");
    lines.push(
      `- [${parent.data.title}](${SITE}/components/${slug}.md): ${parent.data.description || ""}`,
    );
    for (const t of tabs) {
      const tabSlug = t.id.replace(/^components\//, "").replace(/\.mdx?$/, "");
      const tabLabel = tabSlug.split("/").pop() || "";
      lines.push(`  - [${tabLabel}](${SITE}/components/${tabSlug}.md)`);
    }
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

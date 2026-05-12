import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import fs from "node:fs";
import path from "node:path";

export const GET: APIRoute = async () => {
  const docs = await getCollection("docs");
  const foundations = docs.filter((e) => e.id.startsWith("foundations/"));
  const categories = docs.filter((e) => e.id.startsWith("categories/"));
  const components = docs.filter((e) => e.id.startsWith("components/"));

  const sections: string[] = [
    "# Actian Design System — Full Knowledge Dump",
    "",
    "Generated at build time. Single-file ingestion target for AI agents.",
    "",
  ];

  sections.push("## Foundations", "");
  for (const entry of foundations) {
    sections.push(`### ${entry.data.title}`, "", entry.data.description || "", "", entry.body || "");
  }

  sections.push("## Categories", "");
  for (const entry of categories) {
    sections.push(`### ${entry.data.title}`, "", entry.data.description || "", "", entry.body || "");
  }

  sections.push("## Components (categorized DS Kit)", "");
  for (const entry of components) {
    sections.push(`### ${entry.data.title}`, "", entry.data.description || "", "", entry.body || "");
  }

  // Accessibility + Content — read MD from vendor directly
  try {
    const a11y = fs.readFileSync(path.resolve("./vendor/accessibility/accessibility.md"), "utf8");
    sections.push("## Accessibility", "", a11y);
  } catch (e) { /* skip */ }
  try {
    const content = fs.readFileSync(path.resolve("./vendor/content/dist/content.md"), "utf8");
    sections.push("## Content guidelines", "", content);
  } catch (e) { /* skip */ }

  return new Response(sections.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};

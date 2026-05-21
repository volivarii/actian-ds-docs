import { defineCollection } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";

// Starlight's `autogenerate: { directory: <name> }` sidebar entries read from
// `src/content/docs/<name>/` — the docs collection. We keep `foundations`,
// `categories`, and `components` collection declarations for future use
// (direct collection queries / typed access from custom routes), but the
// authored MDX lives under `src/content/docs/` so Starlight's sidebar
// autogeneration picks it up.
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // UI-string overrides — src/content/i18n/en.json renames the right-rail
  // ToC top-link from "Overview" (Starlight default) to "Top".
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};

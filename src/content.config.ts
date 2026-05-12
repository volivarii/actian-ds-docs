import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// Starlight's `autogenerate: { directory: <name> }` sidebar entries read from
// `src/content/docs/<name>/` — the docs collection. We keep `foundations`,
// `categories`, and `components` collection declarations for future use
// (direct collection queries / typed access from custom routes), but the
// authored MDX lives under `src/content/docs/` so Starlight's sidebar
// autogeneration picks it up.
export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};

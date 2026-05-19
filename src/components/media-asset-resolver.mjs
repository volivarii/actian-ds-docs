// Pure path resolvers for the media layer.
//
// Primary entry point (post-knowledge-v0.17.0): resolveMediaPathFromIndex.
// Reads the slug-keyed sidecar at vendor/components/dist/media/_index.json
// — the SoT for "which components have which media." Decoupled from guideline
// coverage so components with media but no guideline doc (e.g. avatar) still
// resolve to a renderable URL.
//
// Vendor → public mapping: the prebuild step in generate-component-pages.cjs
// mirrors vendor/components/dist/media/<slug>/<file> → public/media/<slug>/<file>,
// so each resolver strips the "components/dist/media/" prefix to land at
// /media/<slug>/<file>.

export function resolveMediaPathFromIndex(mediaIndex, slug, role) {
  if (!mediaIndex || !mediaIndex.media) return null;
  const slugEntry = mediaIndex.media[slug];
  if (!slugEntry) return null;
  const rel = slugEntry[role];
  if (typeof rel !== "string" || rel.length === 0) return null;
  const stripped = rel.replace(/^components\/dist\/media\//, "");
  return "/media/" + stripped;
}

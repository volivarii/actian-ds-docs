// Normalises a media-index role value (string | string[]) into an ordered
// list of public "/media/…" paths. Returns [] when the role is absent.
//
// The vendor-prefix strip+prefix transform below is also duplicated in
// media-asset-resolver.mjs and render-mdx.cjs (renderMediaPreview) —
// pre-existing; a full 3-way consolidation is out of scope here.
const VENDOR_PREFIX = /^components\/dist\/media\//;
const toPublic = (p) => "/" + String(p).replace(VENDOR_PREFIX, "media/");

export function resolveMediaPaths(mediaMap, role) {
  if (!mediaMap || !(role in mediaMap)) return [];
  const v = mediaMap[role];
  if (typeof v === "string") return [toPublic(v)];
  if (Array.isArray(v)) return v.filter((s) => typeof s === "string").map(toPublic);
  return [];
}

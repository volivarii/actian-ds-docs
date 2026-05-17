/**
 * token-scale-flatten.mjs — Pure DTCG walker + visual-kind detector
 * for TokenScale.astro.
 */

/**
 * Walk a DTCG-shaped object, producing { Token, Value } rows. Each leaf
 * is identified by having a `$value` property. Keys starting with `$` or `_`
 * are skipped (DTCG metadata + comments).
 */
export function flatten(obj, pfx, parts = []) {
  const rows = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (k.startsWith("$") || k.startsWith("_")) continue;
    if (v && typeof v === "object" && "$value" in v) {
      const name = "--zen-" + [pfx, ...parts, k].filter(Boolean).join("-");
      rows.push({ Token: name, Value: String(v.$value) });
    } else if (v && typeof v === "object") {
      rows.push(...flatten(v, pfx, [...parts, k]));
    }
  }
  return rows;
}

/**
 * Map a prefix slug to its visual kind for the swatch column.
 */
export function autoKind(p) {
  if (p.startsWith("color") || p === "focus-ring-error" || p === "focus-ring-primary") return "color";
  if (p === "border-radius" || p.startsWith("border-radius")) return "radius";
  if (p === "border-width" || p.startsWith("border-width")) return "border-width";
  if (p.startsWith("spacing") || p.startsWith("size") || p.startsWith("icon")) return "spacing";
  return "none";
}

/**
 * slugify-category.mjs — Astro-side category slugifier.
 *
 * Mirrors scripts/lib/category-defaults-loader.cjs#normalizeCategorySlug.
 * Two copies exist because Astro SSR cannot require() a .cjs file
 * cleanly ("Cannot determine intended module format because both require()
 * and top-level await are present"). The duplication is intentional and
 * guarded by tests/components/slugify-category.test.mjs which asserts
 * both implementations agree on a fixture set — divergence becomes a
 * loud test failure rather than a silent URL drift.
 *
 * If a future Node/Astro combo makes cross-format imports painless,
 * collapse to a single source. Until then: edit both, rely on the test.
 *
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function normalizeCategorySlug(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (s.length === 0) return null;
  s = s.toLowerCase();
  // Drop `&` so "Form (input & selection)" → "form-input-selection".
  s = s.replace(/&/g, " ");
  // Collapse non-alphanumeric runs to a single dash.
  s = s.replace(/[^a-z0-9]+/g, "-");
  // Trim leading/trailing dashes.
  s = s.replace(/^-+|-+$/g, "");
  return s.length === 0 ? null : s;
}

/**
 * base-url.mjs — Astro-side base URL normalization.
 *
 * `import.meta.env.BASE_URL` can be `/` or `/actian-ds-docs` depending on
 * deploy target (`SITE_BASE` env var). Consumers need a guaranteed
 * trailing slash for path concatenation. Six call sites previously did
 * `import.meta.env.BASE_URL.replace(/\/?$/, "/")` inline — this collapses
 * them into one shared helper.
 */

/**
 * @param {string} [base] - usually `import.meta.env.BASE_URL`; pass explicitly
 *                          to make the function testable.
 * @returns {string} base URL with exactly one trailing slash.
 */
export function getBase(base) {
  return String(base ?? "/").replace(/\/?$/, "/");
}

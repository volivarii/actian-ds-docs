/**
 * component-tab-href.mjs — Pure URL derivation for ComponentTabs.astro.
 *
 * Two pure functions:
 *   - derivePrefix({pathname, component, base}) — walks up from the
 *     current page URL to find the segment matching `component`, returns
 *     the URL up to and including that segment. Uses lastIndexOf to
 *     handle nested-group components whose slug === group name
 *     (regression target — PR #33 root cause).
 *   - buildTabs({config, prefix, activeTab}) — composes the tabs array.
 *
 * Extracted from ComponentTabs.astro frontmatter for unit testing without
 * the Astro/Vite compile pipeline.
 */

/**
 * Normalize a base path to always end with exactly one trailing slash.
 */
function normalizeBase(base) {
  return String(base || "/").replace(/\/?$/, "/");
}

/**
 * @param {{pathname: string, component: string, base: string}} args
 * @returns {string} prefix URL ending with trailing slash
 */
export function derivePrefix({ pathname, component, base }) {
  const normalizedBase = normalizeBase(base);
  const needle = "/" + component + "/";
  const compIdx = pathname.lastIndexOf(needle);
  if (compIdx >= 0) {
    return pathname.slice(0, compIdx + component.length + 2);
  }
  return normalizedBase + "components/" + component + "/";
}

/**
 * @param {{config: Array<{slug: string, label: string, isIndex?: boolean}>,
 *          prefix: string,
 *          activeTab: string}} args
 * @returns {Array<{slug: string, label: string, href: string, isActive: boolean}>}
 */
export function buildTabs({ config, prefix, activeTab }) {
  return config.map((t) => ({
    slug: t.slug,
    label: t.label,
    href: t.isIndex ? prefix : prefix + t.slug + "/",
    isActive: t.slug === activeTab,
  }));
}

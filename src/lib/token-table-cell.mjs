/**
 * token-table-cell.mjs — Pure cell-rendering helpers for TokenTable.astro.
 *
 * Extracted from TokenTable.astro frontmatter for unit testing without
 * the Astro/Vite compile pipeline.
 */

export const STATUS_EMOJI = {
  shipped: "🟢",
  proposed: "🟡",
  "in-review": "🔵",
  deprecated: "⛔",
};

/**
 * Render a cell value with minimal inline markdown: backticks → <code>,
 * asterisks → <em>. All other content passes through as-is.
 */
export function renderCell(value) {
  return String(value ?? "")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/**
 * Compose a status cell from a row. Back-compat: if `row.Status` exists,
 * it wins (returned as-is; legacy data already contains the rendered HTML
 * or plain text the author intended — don't double-process it). Otherwise
 * compose from `row.status` (emoji key) + `row.status_note`.
 */
export function renderStatus(row) {
  if (row.Status) return row.Status;
  const emoji = STATUS_EMOJI[row.status] || "";
  const text = row.status_note || row.status || "";
  if (!text && !emoji) return "";
  return renderCell((emoji ? emoji + " " : "") + text);
}

/**
 * Detect token visual type from name. Returns { kind, value } or null.
 */
export function tokenVisual(name) {
  if (!name || !name.startsWith("--")) return null;
  if (name.startsWith("--zen-color-")) return { kind: "color", value: `var(${name})` };
  if (/^--zen-spacing-/.test(name)) return { kind: "spacing", value: `var(${name})` };
  if (/^--zen-(border-radius|radius)-/.test(name)) return { kind: "radius", value: `var(${name})` };
  if (/^--zen-border-width-/.test(name)) return { kind: "border-width", value: `var(${name})` };
  return null;
}

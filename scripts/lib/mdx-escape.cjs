"use strict";

/**
 * mdx-escape.cjs — Two escape profiles for build-time MDX emission.
 *
 * `escapeMarkdown`  — neutralizes characters that have meaning in MDX/JSX
 *                     when emitted inside markdown headings or paragraph
 *                     text. Replaces `\`, `{`, `}`, `<` so they render
 *                     literally. Used by generators that emit user prose
 *                     into markdown bodies (foundations).
 *
 * `escapeMdxIdentifiers` — converts bare `<foo>`-shaped tokens (which MDX
 *                          would parse as JSX) into backticked literals
 *                          `\`<foo>\``. Used when emitting MDX whose text
 *                          may contain literal angle-bracket tokens (e.g.
 *                          API parameter names like `<assetNames>` in
 *                          component guideline prose).
 *
 * Both functions are pure and accept null/undefined safely.
 */

function escapeMarkdown(text) {
  if (text == null) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/</g, "&lt;");
}

function escapeMdxIdentifiers(s) {
  if (typeof s !== "string") return s;
  return s.replace(/<([a-zA-Z][\w.-]*)>/g, "`<$1>`");
}

module.exports = {
  escapeMarkdown: escapeMarkdown,
  escapeMdxIdentifiers: escapeMdxIdentifiers,
};

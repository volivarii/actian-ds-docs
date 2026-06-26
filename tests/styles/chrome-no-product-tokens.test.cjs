"use strict";

// Decoupling guard: the docs CHROME must be styled from the docs-owned palette
// (--docs-*, src/styles/docs-theme.css), NEVER from product --zen-* tokens.
// This is what keeps the docs' appearance independent from the design system —
// without it, the chrome silently re-couples on the next edit and a vendor
// token refresh can re-skin the docs (the v0.34.29 text-primary→blue regression
// fixed in #140). Showcase surfaces (TokenTable/TokenScale) legitimately read
// the live product tokens and are NOT chrome — they're excluded here.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

const CHROME = [
  "src/styles/typography.css",
  "src/styles/starlight-overrides.css",
  "src/styles/docs-chrome.css",
  "src/styles/homepage.css",
  "src/components/EcosystemDiagram.astro",
  "src/components/MotionPattern.astro",
  "src/pages/state.astro",
];

test("docs chrome consumes the docs-owned palette, not product --zen-* tokens", function () {
  const offenders = [];
  for (const rel of CHROME) {
    const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
    // Strip block comments so doc-comments that mention --zen-* (history,
    // rationale) don't trip the guard — only real CSS usages count.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    const hits = code.match(/var\(\s*--zen-[a-z0-9-]+/g) || [];
    if (hits.length) {
      offenders.push(rel + " → " + [...new Set(hits)].join(", "));
    }
  }
  assert.equal(
    offenders.length,
    0,
    "Chrome references product --zen-* tokens — use the docs-owned --docs-* " +
      "palette (src/styles/docs-theme.css) instead:\n  " +
      offenders.join("\n  "),
  );
});

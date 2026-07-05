"use strict";

/**
 * check-base-prefix.cjs — Production-artifact guard: every root-absolute URL
 * in the built HTML must carry the deploy base path.
 *
 * The site deploys to GitHub Pages under /actian-ds-docs. Any
 * href="/...", src="/...", or <meta http-equiv="refresh"> url=/... in the
 * rendered HTML that does not start with that base is a guaranteed 404 in
 * production (the ~160-link regression this guard was written for: markdown
 * links and redirect destinations that Astro does not base-prefix).
 *
 * Scope and allowlist:
 *   - Only dist HTML files are scanned. The raw .md dumps and llms*.txt at
 *     the dist root intentionally carry unprefixed pre-render source paths
 *     and are excluded by the *.html scope.
 *   - Protocol-relative (//host/...), external (https:...), data:, mailto:,
 *     and fragment-only URLs never match the root-absolute pattern.
 *   - ALLOWED_PREFIXES lists path prefixes that are legitimately served
 *     root-absolute in production. As of 2026-07 the production dist has
 *     zero such paths; add an entry here (with a comment saying why) before
 *     introducing one.
 *
 * Usage:
 *   node scripts/validation/check-base-prefix.cjs [distDir]
 *   BASE defaults to SITE_BASE or /actian-ds-docs. A base of "/" makes the
 *   check a no-op (root-served builds have nothing to prefix).
 *
 * CI: called by .github/workflows/build.yml right after the production
 * build; locally via `npm run check:base-prefix`.
 */

var fs = require("fs");
var path = require("path");

var DIST = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "dist"));
var RAW_BASE = process.env.SITE_BASE || "/actian-ds-docs";
var BASE = RAW_BASE.endsWith("/") ? RAW_BASE.slice(0, -1) : RAW_BASE;

// Path prefixes allowed to appear root-absolute (unprefixed) in built HTML.
// Empty on purpose — see header comment before adding anything.
var ALLOWED_PREFIXES = [];

// Root-absolute URLs in attributes that the browser resolves against the
// deployed origin: href/src attributes plus Astro's redirect meta refresh.
var ATTR_RE = /(?:href|src)\s*=\s*(?:"(\/[^"]*)"|'(\/[^']*)')/g;
var META_REFRESH_RE = /content\s*=\s*(?:"\d+;\s*url=(\/[^"]*)"|'\d+;\s*url=(\/[^']*)')/gi;

function isOffender(url) {
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false; // protocol-relative
  if (url === BASE || url.startsWith(BASE + "/")) return false; // prefixed
  return !ALLOWED_PREFIXES.some(function (p) {
    return url === p || url.startsWith(p);
  });
}

function htmlFiles(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(htmlFiles(full));
    else if (e.isFile() && e.name.endsWith(".html")) out.push(full);
  });
  return out;
}

function main() {
  if (!BASE) {
    console.log("check-base-prefix: base is '/', nothing to check (root-served build).");
    return 0;
  }
  if (!fs.existsSync(DIST)) {
    console.error("check-base-prefix: dist directory not found: " + DIST);
    console.error("Run the production build first (SITE_BASE=" + RAW_BASE + " npm run build).");
    return 1;
  }

  var offenders = [];
  htmlFiles(DIST).forEach(function (file) {
    var html = fs.readFileSync(file, "utf8");
    var rel = path.relative(DIST, file);
    [ATTR_RE, META_REFRESH_RE].forEach(function (re) {
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(html)) !== null) {
        var url = m[1] || m[2];
        if (isOffender(url)) offenders.push(rel + ": " + url);
      }
    });
  });

  if (offenders.length > 0) {
    offenders.forEach(function (o) {
      console.error(o);
    });
    console.error(
      "\ncheck-base-prefix: " +
        offenders.length +
        " root-absolute URL(s) missing the " +
        BASE +
        " base — they 404 on the deployed site. Route markdown links through" +
        " remark-base-links, images through MediaAsset.astro, and redirect" +
        " destinations through the astro.config.mjs prefix wrapper.",
    );
    return 1;
  }
  console.log("check-base-prefix: OK — all root-absolute URLs in dist HTML carry the " + BASE + " base.");
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { isOffender: isOffender, main: main };

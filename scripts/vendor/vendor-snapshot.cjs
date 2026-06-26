#!/usr/bin/env node
"use strict";

// Pull a snapshot of the actian-ds-knowledge repo into vendor/ for static-site
// rendering by Astro.
//
// THIN ENTRY over the substrate's shared snapshot core. The generic mechanics
// (range-resolve → fetch tarball → include-select → copy → write vendored.json)
// live in the canonical vendor/clients/vendor-snapshot.js, COPIED here as
// vendor-snapshot-core.cjs (docs is `type: module`, so the copy uses .cjs while
// the canonical is .js — CONTENT identical, byte-identity-guarded by
// tests/vendor/vendor-snapshot-core-drift.test.cjs). A build tool must not
// import the bundle it produces (bootstrap + safety). This entry owns only the
// docs-specific bits: the vendor target/dir, the legacy exclude-set, the
// "[vendor] tree refreshed" log (postVendorHook), the GITHUB_ENV RESOLVED_VERSION
// hand-off, and the require.main / FATAL CLI shell.
//
// Usage:
//   node scripts/vendor/vendor-snapshot.cjs                 (range from vendored.json)
//   node scripts/vendor/vendor-snapshot.cjs --sha <sha>     (override SHA)
//   node scripts/vendor/vendor-snapshot.cjs --range <r>     (override the range)
//   node scripts/vendor/vendor-snapshot.cjs --resolve-only
//
// The vendor-snapshot.yml workflow runs this nightly + on knowledge-repo
// dispatch and opens an auto-mergeable PR on any diff. Adopting the shared core
// also gives docs include-mode: at knowledge ≥ v0.26.0 the snapshot ships
// vendor-include.json, so the core copies only the declared surface (tooling
// drops out on the next refresh).

var fs = require("fs");
var path = require("path");
var { KNOWLEDGE_REPO } = require("../lib/constants.cjs");
var core = require("./vendor-snapshot-core.cjs");

var REPO_ROOT = path.resolve(__dirname, "..", "..");
var VENDORED_JSON_PATH = path.join(REPO_ROOT, "vendored.json");
var VENDOR_DIR = path.join(REPO_ROOT, "vendor");

// Legacy exclude-set — top-level entries in the knowledge repo NOT to vendor.
// Only consulted when a pinned snapshot predates vendor-include.json (the core
// prefers the substrate's declared include-set). Still passed because it also
// populates vendored.json#excluded_entries (the core stamps it verbatim).
var EXCLUDE_TOP_LEVEL = new Set([
  ".git",
  ".github",
  ".gitignore",
  "node_modules",
  "scripts",
  "tests",
  "package.json",
  "package-lock.json",
  ".figma-keys.json.example",
  "SMOKE_LOG.md",
  "LICENSE.txt",
  "README.md",
  // Contributor-facing AI surface files (Move B). The plugin doesn't read
  // these — they're for humans / agents authoring INSIDE the knowledge repo.
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  // Repo-governance file — only meaningful at the knowledge repo's own
  // root; inert and noise inside the docs-site vendor tree.
  "CODEOWNERS",
  "llms.txt",
]);

if (require.main === module) {
  try {
    var result = core.runSnapshot({
      knowledgeRepo: KNOWLEDGE_REPO,
      vendorDir: VENDOR_DIR,
      vendoredJsonPath: VENDORED_JSON_PATH,
      excludeTopLevel: EXCLUDE_TOP_LEVEL,
      // Runs after vendored.json is written, before "[vendor] OK" — the slot
      // the docs "tree refreshed" line occupied in the pre-shared-client main().
      postVendorHook: function () {
        process.stdout.write("[vendor] tree refreshed at " + VENDOR_DIR + "\n");
        // Re-sync the byte-identity-guarded build core from the freshly
        // vendored canonical. docs is `type: module`, so the build needs a
        // CommonJS copy it can require() without importing the bundle it
        // produces; the canonical ships as .js inside the snapshot. Keeping the
        // copy in lockstep here means a refresh that changes the client never
        // leaves scripts/vendor/vendor-snapshot-core.cjs stale — the failure
        // mode that red-lit the build at v0.34.29 (manual cp was missed).
        // Guarded by tests/vendor/vendor-snapshot-core-drift.test.cjs.
        var canonicalClient = path.join(
          VENDOR_DIR,
          "clients",
          "vendor-snapshot.js",
        );
        var buildCore = path.join(__dirname, "vendor-snapshot-core.cjs");
        if (fs.existsSync(canonicalClient)) {
          fs.copyFileSync(canonicalClient, buildCore);
          process.stdout.write(
            "[vendor] re-synced build core ← " + canonicalClient + "\n",
          );
        }
      },
    });
    // Hand the resolved version to the workflow (used by vendor-snapshot.yml).
    // runSnapshot returns it, so we no longer re-read vendored.json.
    if (process.env.GITHUB_ENV && result && result.resolvedVersion) {
      fs.appendFileSync(
        process.env.GITHUB_ENV,
        "RESOLVED_VERSION=" + result.resolvedVersion + "\n",
      );
    }
  } catch (err) {
    process.stderr.write("[vendor] FATAL: " + err.message + "\n");
    process.exit(2);
  }
}

// Public API preserved for tests: the pure range-resolution + include-selection
// helpers, re-exported from the copied core (single source).
module.exports = {
  runSnapshot: core.runSnapshot,
  matchesRange: core.matchesRange,
  compareSemver: core.compareSemver,
  resolveTargetTag: core.resolveTargetTag,
  notifyIfNewerAvailable: core.notifyIfNewerAvailable,
  selectEntries: core.selectEntries,
  readVendorInclude: core.readVendorInclude,
};

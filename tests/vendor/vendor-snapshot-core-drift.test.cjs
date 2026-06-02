"use strict";

// Drift-guard: the docs vendor-snapshot is a thin entry over a COPIED core
// (scripts/vendor/vendor-snapshot-core.cjs). A build tool must not import the
// bundle it produces (bootstrap + safety), so instead of importing the vendored
// canonical we copy it and assert byte-identity here. Docs is `type: module`,
// so the copy uses the .cjs extension while the canonical is .js — the CONTENT
// must match exactly. If a vendor refresh changes the canonical, this fails
// until the copy is re-synced:
//   cp vendor/clients/vendor-snapshot.js scripts/vendor/vendor-snapshot-core.cjs
// See vendor/clients/README.md (shared consumption client).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const COPIED = path.join(REPO_ROOT, "scripts", "vendor", "vendor-snapshot-core.cjs");
const CANONICAL = path.join(REPO_ROOT, "vendor", "clients", "vendor-snapshot.js");

test("vendor-snapshot-core.cjs content is byte-identical to the vendored canonical", function () {
  assert.equal(
    fs.readFileSync(COPIED, "utf8"),
    fs.readFileSync(CANONICAL, "utf8"),
    "scripts/vendor/vendor-snapshot-core.cjs drifted from vendor/clients/vendor-snapshot.js — re-copy it.",
  );
});

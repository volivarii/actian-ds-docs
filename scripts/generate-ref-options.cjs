"use strict";
// SPIKE helper: emit the list of valid foundations section ids for a
// constrained `ref` widget in the Sveltia admin (Q4, path (a)).
// Reuses the real resolver's loadBundle so the option list matches what the
// composition CI guard resolves against.
var fs = require("fs");
var path = require("path");
var R = require("./lib/composition-resolve.cjs");

var ROOT = path.resolve(__dirname, "..");
var bundle = R.loadBundle(path.join(ROOT, "vendor", "foundations", "dist"));
var opts = Array.from(bundle.values())
  .filter(function (n) {
    return Array.isArray(n.blocks) && n.blocks.length > 0;
  })
  .map(function (n) {
    return { id: n.id, title: n.title };
  })
  .sort(function (a, b) {
    return a.id.localeCompare(b.id);
  });

var out = path.join(ROOT, "public", "admin", "_ref-options.json");
fs.writeFileSync(out, JSON.stringify(opts, null, 2) + "\n", "utf8");
console.log("generate-ref-options: wrote " + opts.length + " ref options to " + path.relative(ROOT, out));

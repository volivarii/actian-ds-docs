"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var Ajv = require("ajv/dist/2020");

var ROOT = path.resolve(__dirname, "..", "..");
var schema = JSON.parse(fs.readFileSync(
  path.join(ROOT, "src", "data", "composition", "composition.schema.json"), "utf8"));
var ajv = new Ajv({ allErrors: true });
var validate = ajv.compile(schema);

function base(pages) {
  return { _schema_version: 1, _owner: "actian-ds-docs",
    chapter: { slug: "foundations", title: "Foundations" }, pages: pages };
}

test("accepts a composed page with a ref section", function () {
  var ok = validate(base([{ slug: "spacing", title: "Spacing",
    sections: [{ ref: "tokens/spacing" }] }]));
  assert.ok(ok, JSON.stringify(validate.errors));
});
test("accepts a section with label + render + intro + fragment", function () {
  var ok = validate(base([{ slug: "color", title: "Brand & feedback colors",
    sections: [{ ref: "color-primitives", label: "Brand & status scales",
      render: { tokenLabels: "names" }, intro: "x", fragment: "#background" }] }]));
  assert.ok(ok, JSON.stringify(validate.errors));
});
test("accepts a custom page (custom xor sections)", function () {
  var ok = validate(base([{ slug: "getting-started", title: "Getting started",
    custom: "getting-started.mdx" }]));
  assert.ok(ok, JSON.stringify(validate.errors));
});
test("rejects a page with BOTH sections and custom", function () {
  var ok = validate(base([{ slug: "x", title: "X",
    sections: [{ ref: "a" }], custom: "x.mdx" }]));
  assert.ok(!ok);
});
test("rejects a bad slug pattern", function () {
  var ok = validate(base([{ slug: "Bad Slug", title: "X", sections: [{ ref: "a" }] }]));
  assert.ok(!ok);
});
test("accepts an intro-only section (no ref)", function () {
  var ok = validate(base([{ slug: "intro", title: "Intro",
    sections: [{ intro: "This chapter covers the token system." }] }]));
  assert.ok(ok, JSON.stringify(validate.errors));
});
test("rejects a page with NEITHER sections nor custom", function () {
  var ok = validate(base([{ slug: "x", title: "X" }]));
  assert.ok(!ok);
});

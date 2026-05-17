"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { escapeMarkdown, escapeMdxIdentifiers } = require("../../scripts/lib/mdx-escape.cjs");

test("escapeMarkdown: neutralizes braces, backslashes, angle brackets", () => {
  assert.equal(escapeMarkdown(null), "");
  assert.equal(escapeMarkdown(undefined), "");
  assert.equal(escapeMarkdown("plain text"), "plain text");
  assert.equal(escapeMarkdown("foo {x} bar"), "foo \\{x\\} bar");
  assert.equal(escapeMarkdown("backslash: \\"), "backslash: \\\\");
  assert.equal(escapeMarkdown("< 5"), "&lt; 5");
  assert.equal(escapeMarkdown("a \\b {c} <d>"), "a \\\\b \\{c\\} &lt;d>");
});

test("escapeMdxIdentifiers: wraps <foo> tokens in backticks", () => {
  assert.equal(escapeMdxIdentifiers("plain"), "plain");
  assert.equal(escapeMdxIdentifiers("the <foo> tag"), "the `<foo>` tag");
  assert.equal(escapeMdxIdentifiers("<a-b> and <FooBar>"), "`<a-b>` and `<FooBar>`");
  assert.equal(escapeMdxIdentifiers("preserve <a.b.c>"), "preserve `<a.b.c>`");
});

test("escapeMdxIdentifiers: passes through non-string input", () => {
  assert.equal(escapeMdxIdentifiers(undefined), undefined);
  assert.equal(escapeMdxIdentifiers(null), null);
  assert.equal(escapeMdxIdentifiers(42), 42);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { getBase } from "../../src/lib/base-url.mjs";

test("getBase: ensures trailing slash", () => {
  assert.equal(getBase("/actian-ds-docs"), "/actian-ds-docs/");
  assert.equal(getBase("/actian-ds-docs/"), "/actian-ds-docs/");
  assert.equal(getBase("/"), "/");
  assert.equal(getBase(""), "/");
  assert.equal(getBase(undefined), "/");
  assert.equal(getBase(null), "/");
});

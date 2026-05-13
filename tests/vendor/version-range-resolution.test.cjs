"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  matchesRange,
  resolveTargetTag,
  compareSemver,
  notifyIfNewerAvailable,
} = require("../../scripts/vendor/vendor-snapshot.cjs");

test("vendor-snapshot range resolution", async (t) => {
  await t.test("~ range matches same minor, any patch >=", () => {
    assert.equal(matchesRange("0.1.0", "~0.1.0"), true);
    assert.equal(matchesRange("0.1.5", "~0.1.0"), true);
    assert.equal(matchesRange("0.2.0", "~0.1.0"), false);
    assert.equal(matchesRange("0.0.9", "~0.1.0"), false);
  });

  await t.test("^ range on pre-1.0 behaves like ~ (patches only)", () => {
    assert.equal(matchesRange("0.1.5", "^0.1.0"), true);
    assert.equal(matchesRange("0.2.0", "^0.1.0"), false);
  });

  await t.test("^ range on >=1.0 allows minor + patch", () => {
    assert.equal(matchesRange("1.5.3", "^1.0.0"), true);
    assert.equal(matchesRange("2.0.0", "^1.0.0"), false);
  });

  await t.test("exact version range matches only that version", () => {
    assert.equal(matchesRange("0.1.1", "0.1.1"), true);
    assert.equal(matchesRange("0.1.2", "0.1.1"), false);
  });

  await t.test("compareSemver orders correctly", () => {
    assert.equal(compareSemver("0.1.0", "0.1.1"), -1);
    assert.equal(compareSemver("0.1.1", "0.1.0"), 1);
    assert.equal(compareSemver("0.2.0", "0.1.99"), 1);
    assert.equal(compareSemver("1.0.0", "0.99.99"), 1);
  });

  await t.test("resolveTargetTag returns highest matching", () => {
    const tags = ["v0.1.0", "v0.1.1", "v0.1.2", "v0.2.0"];
    assert.equal(resolveTargetTag(tags, "~0.1.0"), "v0.1.2");
  });

  await t.test("resolveTargetTag returns null when no tag matches", () => {
    assert.equal(resolveTargetTag(["v0.1.0", "v0.1.1"], "~0.2.0"), null);
  });

  await t.test("resolveTargetTag ignores invalid + pre-release tags", () => {
    const tags = ["v0.1.0", "garbage", "v0.1.1-beta", "v0.1.2"];
    assert.equal(resolveTargetTag(tags, "~0.1.0"), "v0.1.2");
  });

  // ---- Less-than operator (2026-05-13) ----
  // Added so consumers can express "anything up to the next major" without
  // per-minor re-pinning. Mirrors plugin's vendor-snapshot.js.

  await t.test("< range matches anything strictly less", () => {
    assert.equal(matchesRange("0.0.1", "<1.0.0"), true);
    assert.equal(matchesRange("0.5.0", "<1.0.0"), true);
    assert.equal(matchesRange("0.99.99", "<1.0.0"), true);
    assert.equal(matchesRange("1.0.0", "<1.0.0"), false);
    assert.equal(matchesRange("2.0.0", "<1.0.0"), false);
  });

  await t.test("<= range matches everything up to and including bound", () => {
    assert.equal(matchesRange("0.5.0", "<=0.5.0"), true);
    assert.equal(matchesRange("0.5.1", "<=0.5.0"), false);
  });

  await t.test("< range tolerates whitespace", () => {
    assert.equal(matchesRange("0.5.0", "< 1.0.0"), true);
    assert.equal(matchesRange("0.5.0", "  <1.0.0  "), true);
  });

  await t.test(
    "resolveTargetTag with < range picks highest below bound",
    () => {
      const tags = ["v0.5.0", "v0.6.0", "v0.6.1", "v1.0.0", "v1.1.0"];
      assert.equal(resolveTargetTag(tags, "<1.0.0"), "v0.6.1");
    },
  );

  // ---- notifyIfNewerAvailable (Design E) ----

  function captureStdout(fn) {
    const original = process.stdout.write.bind(process.stdout);
    const captured = [];
    process.stdout.write = (chunk) => {
      captured.push(String(chunk));
      return true;
    };
    try {
      fn();
    } finally {
      process.stdout.write = original;
    }
    return captured.join("");
  }

  await t.test(
    "notifyIfNewerAvailable warns when newer tag exists outside range",
    () => {
      const tags = ["v0.6.0", "v0.6.1", "v0.7.0", "v1.0.0"];
      const captured = captureStdout(() => {
        const warned = notifyIfNewerAvailable(tags, "~0.6.0", "v0.6.1");
        assert.equal(warned, true);
      });
      assert.match(captured, /^::warning::/);
      assert.match(captured, /v1\.0\.0/);
      assert.match(captured, /resolves to v0\.6\.1/);
    },
  );

  await t.test(
    "notifyIfNewerAvailable is silent when resolved is already highest",
    () => {
      const tags = ["v0.5.0", "v0.6.0", "v0.6.1"];
      const captured = captureStdout(() => {
        const warned = notifyIfNewerAvailable(tags, "<1.0.0", "v0.6.1");
        assert.equal(warned, false);
      });
      assert.equal(captured, "");
    },
  );
});

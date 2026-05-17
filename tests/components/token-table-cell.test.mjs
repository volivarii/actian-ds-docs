import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderCell,
  renderStatus,
  tokenVisual,
  STATUS_EMOJI,
} from "../../src/lib/token-table-cell.mjs";

test("renderCell: backtick code spans → <code>", () => {
  assert.equal(renderCell("plain"), "plain");
  assert.equal(renderCell("use `--zen-color-bg` here"), "use <code>--zen-color-bg</code> here");
  assert.equal(renderCell(null), "");
  assert.equal(renderCell(undefined), "");
});

test("renderCell: asterisks → <em>", () => {
  assert.equal(renderCell("foo *bar* baz"), "foo <em>bar</em> baz");
});

test("renderStatus: row.Status wins (legacy back-compat)", () => {
  assert.equal(renderStatus({ Status: "Custom **bold**" }), "Custom **bold**");
});

test("renderStatus: lowercase status + status_note composed with emoji", () => {
  const out = renderStatus({ status: "shipped", status_note: "Shipped *(v1.0)*" });
  assert.equal(out, STATUS_EMOJI.shipped + " Shipped <em>(v1.0)</em>");
});

test("renderStatus: empty when no status data", () => {
  assert.equal(renderStatus({}), "");
});

test("tokenVisual: color tokens", () => {
  assert.deepEqual(tokenVisual("--zen-color-bg-primary"), { kind: "color", value: "var(--zen-color-bg-primary)" });
});

test("tokenVisual: spacing tokens", () => {
  assert.deepEqual(tokenVisual("--zen-spacing-md"), { kind: "spacing", value: "var(--zen-spacing-md)" });
});

test("tokenVisual: radius tokens (both forms)", () => {
  assert.deepEqual(tokenVisual("--zen-border-radius-md"), { kind: "radius", value: "var(--zen-border-radius-md)" });
  assert.deepEqual(tokenVisual("--zen-radius-md"), { kind: "radius", value: "var(--zen-radius-md)" });
});

test("tokenVisual: border-width tokens", () => {
  assert.deepEqual(tokenVisual("--zen-border-width-thin"), { kind: "border-width", value: "var(--zen-border-width-thin)" });
});

test("tokenVisual: returns null for non-token names", () => {
  assert.equal(tokenVisual(undefined), null);
  assert.equal(tokenVisual("font-size"), null);
  assert.equal(tokenVisual("--zen-font-size-md"), null);
});

test("STATUS_EMOJI: known statuses", () => {
  assert.equal(STATUS_EMOJI.shipped, "🟢");
  assert.equal(STATUS_EMOJI.proposed, "🟡");
  assert.equal(STATUS_EMOJI["in-review"], "🔵");
  assert.equal(STATUS_EMOJI.deprecated, "⛔");
});

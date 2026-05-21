"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// ---------------------------------------------------------------------------
// Tests for renderDesignSections: canonical design-section renderer.
// One merged section per topic (Anatomy / Variants / Spacing & size /
// Behavior / Layout). Structured component markup precedes authored prose;
// auto-appended media closes each section.
// ---------------------------------------------------------------------------

var BUTTON_MEDIA = {
  parts: "components/dist/media/button/parts.png",
  variations: "components/dist/media/button/variations.png",
  spacing: "components/dist/media/button/spacing.png",
  behavior: "components/dist/media/button/behavior.png",
};

// Minimal entry with both entry.variants and card_anatomy so both structured
// renderers fire.
var BUTTON_ENTRY = {
  name: "Button",
  description: "Primary trigger.",
  variants: { Type: ["Primary", "Secondary"], Size: ["Default", "Small"] },
};

function makeDefaults(overrides) {
  return Object.assign({
    card_anatomy: { parts: [{ label: "Label" }, { label: "Icon" }] },
    card_component: null,
    card_motion: null,
  }, overrides || {});
}

function resetIndex() {
  renderMdx.setMediaIndex(null);
}

// ---------------------------------------------------------------------------
// 1. No duplicate headings when design domain AND structured data both present
// ---------------------------------------------------------------------------

test("renderDesignSections: emits exactly one ## Anatomy and one ## Variants (no duplicates)", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          {
            heading: "Anatomy",
            content: [{ prose: "A button has a label and optional icon." }],
          },
          {
            heading: "Variants",
            content: [{ prose: "Buttons come in Primary and Secondary." }],
          },
        ],
      },
    },
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  var anatomyMatches = (out.match(/^## Anatomy$/gm) || []).length;
  var variantsMatches = (out.match(/^## Variants$/gm) || []).length;
  assert.equal(anatomyMatches, 1, "## Anatomy must appear exactly once");
  assert.equal(variantsMatches, 1, "## Variants must appear exactly once");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 2. Section order: Anatomy → Variants → Spacing & size → Behavior → Layout
// ---------------------------------------------------------------------------

test("renderDesignSections: canonical section order is Anatomy → Variants → Spacing & size → Behavior → Layout", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          { heading: "Behavior", content: [{ prose: "Hover changes color." }] },
          { heading: "Anatomy",  content: [{ prose: "Has a label." }] },
          { heading: "Variants", content: [{ prose: "Primary, secondary." }] },
          { heading: "Layout",   content: [{ prose: "Full-width mode." }] },
        ],
      },
    },
  };
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  var anatomyIdx  = out.indexOf("## Anatomy");
  var variantsIdx = out.indexOf("## Variants");
  var behaviorIdx = out.indexOf("## Behavior");
  var layoutIdx   = out.indexOf("## Layout");

  assert.ok(anatomyIdx  < variantsIdx,  "Anatomy must come before Variants");
  assert.ok(variantsIdx < behaviorIdx,  "Variants must come before Behavior");
  assert.ok(behaviorIdx < layoutIdx,    "Behavior must come before Layout");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 3. Within a section, structured component markup precedes authored prose
// ---------------------------------------------------------------------------

test("renderDesignSections: structured component markup precedes authored prose within a section", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          {
            heading: "Anatomy",
            content: [{ prose: "A button has a label." }],
          },
        ],
      },
    },
  };
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  var anatomyHeadingIdx = out.indexOf("## Anatomy");
  var anatomyComponentIdx = out.indexOf("<Anatomy ", anatomyHeadingIdx);
  var anatomyProseIdx = out.indexOf("A button has a label.", anatomyHeadingIdx);

  assert.ok(anatomyComponentIdx !== -1, "<Anatomy> component must be present");
  assert.ok(anatomyProseIdx !== -1, "authored prose must be present");
  assert.ok(anatomyComponentIdx < anatomyProseIdx,
    "<Anatomy> component must appear before authored prose in the section");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 4. Component with NO design domain still gets ## Anatomy / ## Variants
// ---------------------------------------------------------------------------

test("renderDesignSections: no design domain → still emits ## Anatomy and ## Variants from structured data", function () {
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), null, "button", WARNINGS);

  assert.match(out, /^## Anatomy$/m, "## Anatomy must be present even without design domain");
  assert.match(out, /^## Variants$/m, "## Variants must be present even without design domain");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 5. Empty section (no structured, no authored body, no media) → omitted
// ---------------------------------------------------------------------------

test("renderDesignSections: section with no structured, no authored body, no media is omitted", function () {
  // No guideline, no motion, no layout media — Spacing & size / Behavior / Layout
  // should be absent when there's nothing to fill them.
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), null, "button", WARNINGS);

  assert.doesNotMatch(out, /^## Spacing & size$/m, "Empty Spacing & size must be omitted");
  assert.doesNotMatch(out, /^## Behavior$/m, "Empty Behavior must be omitted (no motion data, no authored sections)");
  assert.doesNotMatch(out, /^## Layout$/m, "Empty Layout must be omitted");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 6a. Authored Anatomy body already contains <Media role="parts"> → no double-render
// ---------------------------------------------------------------------------

test("renderDesignSections: authored Anatomy body with <Media role='parts'> is not double-rendered", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          {
            heading: "Anatomy",
            content: [
              { prose: "Label and icon." },
              { media: { role: "parts", layout: "grid" } },
            ],
          },
        ],
      },
    },
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  var partsCount = (out.match(/role="parts"/g) || []).length;
  assert.equal(partsCount, 1, "parts role must appear exactly once — authored, not also auto-appended");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 6b. Authored section omitting <Media role="parts"> → auto-appended
// ---------------------------------------------------------------------------

test("renderDesignSections: authored Anatomy body WITHOUT <Media role='parts'> gets it auto-appended", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          {
            heading: "Anatomy",
            content: [{ prose: "Label and icon." }],
          },
        ],
      },
    },
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  assert.match(out, /role="parts"/, "parts role must be auto-appended when not in authored content");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 7. Motion (card_motion) renders inside ## Behavior — no separate ## Motion
// ---------------------------------------------------------------------------

test("renderDesignSections: card_motion renders inside ## Behavior, no separate ## Motion heading", function () {
  var defaultsWithMotion = makeDefaults({
    card_motion: {
      patternRefs: [{ ref: "fade-in" }],
    },
  });
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, defaultsWithMotion, null, "button", WARNINGS);

  assert.match(out, /^## Behavior$/m, "## Behavior must be present when motion data exists");
  assert.doesNotMatch(out, /^## Motion$/m, "There must be no separate ## Motion heading");
  assert.match(out, /<MotionPattern /, "<MotionPattern> must appear under ## Behavior");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 7b. Authored "Motion" heading (legacy alias for Behavior) merges into
//     ## Behavior — no separate ## Motion section
// ---------------------------------------------------------------------------

test("renderDesignSections: authored 'Motion' heading merges into ## Behavior via the behavior alias", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          {
            heading: "Motion",
            content: [{ prose: "Buttons fade in over 200ms." }],
          },
        ],
      },
    },
  };
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  assert.match(out, /^## Behavior$/m, "## Behavior must be present");
  assert.doesNotMatch(out, /^## Motion$/m, "there must be no separate ## Motion section");

  var behaviorIdx = out.indexOf("## Behavior");
  var proseIdx = out.indexOf("Buttons fade in over 200ms.");
  assert.ok(proseIdx !== -1, "authored 'Motion' prose must be rendered");
  assert.ok(behaviorIdx !== -1 && behaviorIdx < proseIdx,
    "authored 'Motion' prose must appear under the ## Behavior heading");
  assert.equal(WARNINGS.unknownContentShapes, 0,
    "a recognized alias must not increment the unknown-shape counter");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 8. Unknown authored section heading → rendered after canonical sections,
//    WARNINGS.unknownContentShapes incremented
// ---------------------------------------------------------------------------

test("renderDesignSections: unknown authored section rendered after canonical sections and increments WARNINGS.unknownContentShapes", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          {
            heading: "Iconography guidance",
            content: [{ prose: "Only use outlined icons." }],
          },
        ],
      },
    },
  };
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  // The unknown section must be present
  assert.match(out, /^## Iconography guidance$/m,
    "unknown section must be emitted as ## <heading>");
  // It must appear AFTER the known canonical sections
  var anatomyIdx = out.indexOf("## Anatomy");
  var unknownIdx = out.indexOf("## Iconography guidance");
  assert.ok(anatomyIdx < unknownIdx,
    "unknown section must appear after canonical sections");
  // WARNINGS counter must have been incremented
  assert.equal(WARNINGS.unknownContentShapes, 1,
    "WARNINGS.unknownContentShapes must be 1 for one unknown section");
  resetIndex();
});

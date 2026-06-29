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

// Minimal entry with both entry.variants and anatomy so both structured
// renderers fire.
var BUTTON_ENTRY = {
  name: "Button",
  description: "Primary trigger.",
  variants: { Type: ["Primary", "Secondary"], Size: ["Default", "Small"] },
};

function makeDefaults(overrides) {
  return Object.assign({
    anatomy: { parts: [{ label: "Label" }, { label: "Icon" }] },
    variants: null,
    motion_refs: null,
  }, overrides || {});
}

function resetIndex() {
  renderMdx.setMediaIndex(null);
  renderMdx.setAnatomyIndex(null);
}

// A usable captured anatomy (root.layout + named children + no degraded nodes),
// shaped like vendor/components/dist/anatomy.bundle.json entries.
var USABLE_ANATOMY = {
  root: {
    name: "Button", kind: "container",
    layout: { axis: "row", gap: "8px", padding: {}, align: {}, sizing: {} },
    children: [
      { name: "Leading icon", kind: "instance" },
      { name: "Button", kind: "text", text: "Button" },
    ],
  },
  quality: { degraded: [] },
};

// Anatomy index is module-level state shared across test files; isolate it.
renderMdx.setAnatomyIndex(null);

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
// 3. <Anatomy> is a conditional placeholder (real capture only) — emitted only
//    when the section has neither Figma media nor authored design.md prose.
//    <VariantMatrix> is never emitted: the Variants section is media/authored-
//    only (registry axes do not trigger it).
// ---------------------------------------------------------------------------

test("renderDesignSections: <Anatomy>/<VariantMatrix> suppressed when media is present", function () {
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), null, "button", WARNINGS);

  assert.doesNotMatch(out, /<Anatomy /, "<Anatomy> must be suppressed when parts media exists");
  assert.doesNotMatch(out, /<VariantMatrix /, "<VariantMatrix> must be suppressed when variations media exists");
  assert.match(out, /role="parts"/, "the parts media must still render");
  assert.match(out, /role="variations"/, "the variations media must still render");
  resetIndex();
});

test("renderDesignSections: <Anatomy>/<VariantMatrix> suppressed when design.md prose is present (no media)", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          { heading: "Anatomy",  content: [{ prose: "A button has a label." }] },
          { heading: "Variants", content: [{ prose: "Primary and Secondary." }] },
        ],
      },
    },
  };
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  assert.doesNotMatch(out, /<Anatomy /, "<Anatomy> must be suppressed when authored Anatomy prose exists");
  assert.doesNotMatch(out, /<VariantMatrix /, "<VariantMatrix> must be suppressed when authored Variants prose exists");
  assert.match(out, /A button has a label\./, "authored Anatomy prose must still render");
  assert.match(out, /Primary and Secondary\./, "authored Variants prose must still render");
  resetIndex();
});

test("renderDesignSections: no real Anatomy/Variants data → sections omitted (category-default placeholders removed)", function () {
  // Entry with no registry variants; no capture, no media, no authored prose.
  // The category-default Anatomy/Variants placeholders were removed
  // (2026-06-29) so both sections — heading included — disappear entirely.
  var entry = { name: "Spinner", description: "Loading indicator." };
  renderMdx.setMediaIndex(null);
  renderMdx.setAnatomyIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(entry, makeDefaults(), null, "spinner", WARNINGS);

  assert.doesNotMatch(out, /^## Anatomy$/m, "Anatomy section must be omitted when there is no capture, media, or prose");
  assert.doesNotMatch(out, /^## Variants$/m, "Variants section must be omitted when there are no registry axes, media, or prose");
  assert.doesNotMatch(out, /<Anatomy /, "no category-default <Anatomy> placeholder");
  assert.doesNotMatch(out, /<VariantMatrix /, "no category-default <VariantMatrix> placeholder");
  resetIndex();
});

test("renderDesignSections: registry variants alone do NOT produce a Variants section", function () {
  // entry.variants is present but there's no variations media and no authored
  // Variants prose — the section (and any VariantMatrix) must be omitted.
  renderMdx.setMediaIndex(null);
  renderMdx.setAnatomyIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), null, "button", WARNINGS);

  assert.doesNotMatch(out, /^## Variants$/m, "Variants must be omitted without media or authored prose");
  assert.doesNotMatch(out, /<VariantMatrix /, "registry variant axes must not render a VariantMatrix");
  resetIndex();
});

test("renderDesignSections: Variants section renders from variations media", function () {
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  renderMdx.setAnatomyIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), null, "button", WARNINGS);

  assert.match(out, /^## Variants$/m, "Variants section renders when variations media exists");
  assert.match(out, /role="variations"/, "the variations media board renders");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 3b. Real anatomy callout vs. the "parts" media board — the suppression must
//     fire ONLY when the callout actually renders, never when prose wins.
// ---------------------------------------------------------------------------

test("renderDesignSections: usable anatomy + no prose → image-led callout renders and the parts board is suppressed", function () {
  renderMdx.setAnatomyIndex({ components: { button: USABLE_ANATOMY } });
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), null, "button", WARNINGS);

  assert.match(out, /<Anatomy [^>]*layout=\{/, "the image-led callout must render from the usable capture");
  assert.doesNotMatch(out, /role="parts"/, "the redundant parts board must be suppressed when the callout renders");
  resetIndex();
});

test("renderDesignSections: usable anatomy + authored prose → callout suppressed but parts board NOT dropped", function () {
  // Regression guard: the parts-suppression must be conditional on the callout
  // actually rendering. When authored Anatomy prose wins, the callout is gone,
  // so the parts media board must survive (suppressing it would drop content
  // with no replacement).
  renderMdx.setAnatomyIndex({ components: { button: USABLE_ANATOMY } });
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          { heading: "Anatomy", content: [{ prose: "A button has a label." }] },
        ],
      },
    },
  };
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), guideline, "button", WARNINGS);

  assert.doesNotMatch(out, /<Anatomy /, "the callout must be suppressed when authored Anatomy prose exists");
  assert.match(out, /A button has a label\./, "authored prose must render");
  assert.match(out, /role="parts"/, "the parts media board must NOT be dropped when prose wins");
  resetIndex();
});

test("renderDesignSections: <MotionPattern> is NOT conditional — renders even with Behavior media + prose", function () {
  var guideline = {
    domains: {
      design: {
        status: "draft",
        sections: [
          { heading: "Behavior", content: [{ prose: "Hover changes color." }] },
        ],
      },
    },
  };
  var defaultsWithMotion = makeDefaults({ motion_refs: { patternRefs: [{ ref: "fade-in" }] } });
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, defaultsWithMotion, guideline, "button", WARNINGS);

  assert.match(out, /<MotionPattern /, "<MotionPattern> must render regardless of Behavior media or prose");
  resetIndex();
});

// ---------------------------------------------------------------------------
// 4. Component with NO design domain: ## Anatomy from a usable capture only;
//    ## Variants is NOT produced by registry axes alone.
// ---------------------------------------------------------------------------

test("renderDesignSections: no design domain → ## Anatomy from a usable capture; ## Variants omitted (registry axes don't trigger it)", function () {
  renderMdx.setAnatomyIndex({ components: { button: USABLE_ANATOMY } });
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignSections(BUTTON_ENTRY, makeDefaults(), null, "button", WARNINGS);

  assert.match(out, /^## Anatomy$/m, "## Anatomy renders from the usable capture");
  assert.doesNotMatch(out, /^## Variants$/m, "## Variants must be omitted — registry axes alone don't trigger it");
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
// 7. Motion (motion) renders inside ## Behavior — no separate ## Motion
// ---------------------------------------------------------------------------

test("renderDesignSections: motion renders inside ## Behavior, no separate ## Motion heading", function () {
  var defaultsWithMotion = makeDefaults({
    motion_refs: {
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

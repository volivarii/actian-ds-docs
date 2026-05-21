"use strict";
var test = require("node:test");
var assert = require("node:assert/strict");
var renderMdx = require("../../scripts/lib/render-mdx.cjs");

// ---------------------------------------------------------------------------
// Tests for renderDesignDomain: the design-domain renderer introduced in
// Bucket C Task B2. It must:
//   (a) Handle { media: { role, layout } } content items by emitting
//       <Media role="..." layout="..." media={...} /> with the component's
//       media role-map as the media prop.
//   (b) Auto-append <Media> for any design-domain role present in the
//       component's media index but NOT covered by an authored { media } item.
// ---------------------------------------------------------------------------

// Minimal media role-map fixture (role → vendor path string).
var BUTTON_MEDIA = {
  parts: "components/dist/media/button/parts.png",
  spacing: "components/dist/media/button/spacing.png",
};

// Reset module-level state between tests.
function resetIndex() {
  renderMdx.setMediaIndex(null);
}

// ---------------------------------------------------------------------------
// (a) Authored { media } items → emit <Media role="..." layout="..." media={...}>
// ---------------------------------------------------------------------------

test("renderDesignDomain: authored { media } item emits <Media role= layout= media= />", function () {
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Anatomy",
        content: [
          { prose: "Buttons have a label." },
          { media: { role: "parts", layout: "grid" } },
        ],
      },
    ],
  };
  // Set up media index so the renderer can resolve the role map.
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  // Must contain a <Media> tag with correct role and layout props.
  assert.match(out, /<Media\s/);
  assert.match(out, /role="parts"/);
  assert.match(out, /layout="grid"/);
  // Must pass media prop as an object literal (JSON-serialised).
  assert.match(out, /media=\{/);
  // Must NOT fall through to unknownContentShapes.
  assert.equal(WARNINGS.unknownContentShapes, 0);
  resetIndex();
});

test("renderDesignDomain: authored { media } item with null layout defaults to 'stack'", function () {
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Spacing",
        content: [
          { media: { role: "spacing", layout: null } },
        ],
      },
    ],
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  assert.match(out, /role="spacing"/);
  assert.match(out, /layout="stack"/);
  resetIndex();
});

test("renderDesignDomain: authored { media } item with explicit null layout defaults to 'stack'", function () {
  // Schema marks `layout` required (nullable) — `layout: null` is the
  // schema-valid form for "no layout chosen"; the renderer defaults it to 'stack'.
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Spacing",
        content: [
          { media: { role: "spacing", layout: null } },
        ],
      },
    ],
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  assert.match(out, /role="spacing"/);
  assert.match(out, /layout="stack"/);
  resetIndex();
});

// ---------------------------------------------------------------------------
// (b) Auto-append fallback — design-domain role present in media index but
//     NOT covered by any authored { media } item in the domain.
// ---------------------------------------------------------------------------

test("renderDesignDomain: auto-appends <Media> for roles in media index not covered by authored items", function () {
  // `spacing` is in BUTTON_MEDIA but this design domain has no { media } item for it.
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Anatomy",
        content: [
          { prose: "Buttons have a label." },
          { media: { role: "parts", layout: "grid" } },
        ],
      },
    ],
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  // `parts` is covered → only ONE Media tag for parts in the authored section.
  // `spacing` is NOT covered → must be auto-appended.
  var partsMatches = (out.match(/role="parts"/g) || []).length;
  assert.equal(partsMatches, 1, "parts should appear exactly once (authored)");
  assert.match(out, /role="spacing"/, "spacing must be auto-appended");
  resetIndex();
});

test("renderDesignDomain: does NOT auto-append roles already covered by authored items", function () {
  // Both `parts` and `spacing` are covered by authored { media } items.
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Anatomy",
        content: [{ media: { role: "parts", layout: "grid" } }],
      },
      {
        heading: "Spacing",
        content: [{ media: { role: "spacing", layout: null } }],
      },
    ],
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  // Each role should appear exactly once.
  var partsCount = (out.match(/role="parts"/g) || []).length;
  var spacingCount = (out.match(/role="spacing"/g) || []).length;
  assert.equal(partsCount, 1, "parts authored: must not be duplicated");
  assert.equal(spacingCount, 1, "spacing authored: must not be duplicated");
  resetIndex();
});

test("renderDesignDomain: auto-append is skipped when component has no media index entry", function () {
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Anatomy",
        content: [{ prose: "No media here." }],
      },
    ],
  };
  // No entry for `button` in the index.
  renderMdx.setMediaIndex({ media: { avatar: { preview: "components/dist/media/avatar/preview.png" } } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  assert.doesNotMatch(out, /<Media\s/, "no <Media> when no media index entry");
  resetIndex();
});

test("renderDesignDomain: auto-append is skipped when media index is null", function () {
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Anatomy",
        content: [{ prose: "No media here." }],
      },
    ],
  };
  renderMdx.setMediaIndex(null);
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  assert.doesNotMatch(out, /<Media\s/, "no <Media> when media index is null");
});

test("renderDesignDomain: returns empty string when designDomain is null", function () {
  var WARNINGS = { unknownContentShapes: 0 };
  assert.equal(renderMdx.renderDesignDomain(null, "button", WARNINGS), "");
});

test("renderDesignDomain: authored { media } item for a slug with no media index entry falls through to unknown bucket", function () {
  // The component has no media-index entry → mediaRoleMap resolves to null,
  // so the authored { media } item cannot be rendered and falls through to
  // the `unknown` bucket, incrementing WARNINGS.unknownContentShapes.
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Anatomy",
        content: [
          { media: { role: "parts", layout: "grid" } },
        ],
      },
    ],
  };
  // Media index has an entry for `avatar` but NOT for the test slug `button`.
  renderMdx.setMediaIndex({ media: { avatar: { preview: "components/dist/media/avatar/preview.png" } } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  // No role map → no <Media> tag emitted.
  assert.doesNotMatch(out, /<Media\s/, "no <Media> when slug has no media index entry");
  // The { media } item is recorded as an unknown content shape → warning fires.
  assert.equal(WARNINGS.unknownContentShapes, 1,
    "{media} item with no role map must increment unknownContentShapes");
  resetIndex();
});

test("renderDesignDomain: { media } item inside a subsection is tracked in seenMediaRoles (no duplicate auto-append)", function () {
  // `spacing` is authored inside subsections[].content[] — not top-level
  // content[]. It must still be tracked in seenMediaRoles so the auto-append
  // pass does NOT also emit it.
  var designDomain = {
    status: "draft",
    sections: [
      {
        heading: "Anatomy",
        content: [{ media: { role: "parts", layout: "grid" } }],
        subsections: [
          {
            subheading: "Spacing detail",
            content: [{ media: { role: "spacing", layout: null } }],
          },
        ],
      },
    ],
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var WARNINGS = { unknownContentShapes: 0 };
  var out = renderMdx.renderDesignDomain(designDomain, "button", WARNINGS);
  // `spacing` authored in a subsection → must appear exactly once (not auto-appended too).
  var spacingCount = (out.match(/role="spacing"/g) || []).length;
  assert.equal(spacingCount, 1, "subsection-authored spacing role must appear exactly once");
  resetIndex();
});

// ---------------------------------------------------------------------------
// Integration: buildComponent (generator) wires design domain
// ---------------------------------------------------------------------------

test("buildComponent: index.mdx contains Media import when design domain is present", function () {
  // This test verifies that the generator adds 'Media' to the MDX imports.
  // We require generate-component-pages lazily to avoid boot-time schema
  // validation errors from missing fixtures (schema loads at require-time).
  var path = require("path");
  var gen = require("../../scripts/generate-component-pages.cjs");
  var fs = require("fs");
  var REG = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "fixtures", "registries", "dskit-mini.json"), "utf8"));

  var designGuide = {
    _schema_version: 1,
    slug: "button",
    component: "Buttons",
    meta: { category: "action" },
    domains: {
      design: {
        status: "draft",
        sections: [
          {
            heading: "Anatomy",
            content: [
              { prose: "A button has a label." },
              { media: { role: "parts", layout: "grid" } },
            ],
          },
        ],
      },
    },
  };
  renderMdx.setMediaIndex({ media: { button: BUTTON_MEDIA } });
  var out = gen.buildComponent("button", REG.components.button, designGuide, null, REG);
  // Every generated page must import Media (so <Media> tags resolve at build time).
  assert.match(out.files["index.mdx"], /import Media from /,
    "index.mdx must import Media component");
  // The overview body must contain a <Media> tag.
  assert.match(out.files["index.mdx"], /<Media\s/,
    "index.mdx must render the authored <Media> directive");
  resetIndex();
});

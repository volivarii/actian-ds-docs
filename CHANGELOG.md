# Changelog

All notable changes to the Actian DS Docs site are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file records **notable** changes: new pages or sections, navigation or structural changes,
build and vendor pipeline changes, anything a reader or contributor should know. Routine automated
`vendor(knowledge): refresh to vX.Y.Z` snapshots are not listed individually unless they change the
site's content or behavior.

## [Unreleased]

### Changed

- **The Patterns page says where patterns live instead of promising them.** It read "this section is a
  roadmap placeholder, patterns will be added once the component layer stabilizes", and listed generic
  candidates (empty states, pagination, bulk actions). Meanwhile the design system has 31 authored UX
  patterns and 4 page recipes captured from Studio and Explorer, and this site already vendors every one
  of them into its own build tree without reading them. So the page told a reader the opposite of the
  truth about the thing sitting in the build.

  They are not coming here. A pattern describes how Actian's own products behave, which is working
  material the design team reviews and corrects, not a public reference a reader looks something up in;
  the surface for them is the knowledge editor, where seeing one and fixing one are the same screen. The
  page now says what a pattern is, that they live with the team, and what this site publishes instead.
  The two em dashes it carried are gone with it.


- **Correct an overstated claim shipped in #212.** The confidence page said usage "reads high on every
  page". It reads high on every page that HAS usage guidance; a component page generated from a registry
  entry with no usage domain still reads low, which the very next bullet on that page says. Caught
  reviewing the merged change rather than before merging it.

- **The Usage sections lose their "pending design lead review" note, and usage confidence reads high
  everywhere.** ([#212](https://github.com/volivarii/actian-ds-docs/pull/212)) Knowledge promoted all 54 usage domains from `draft` to `approved` as a baseline to be
  reviewed against rather than a sign-off. **No code changed here**: `renderUsageDomain` keys the note on
  `status === "draft"` and the chip mapping already reads `approved`, so the generated component pages
  drop the note and move from medium to high on the next vendor refresh and build. The page count is
  deliberately not restated here, because it follows the substrate and a hand-copied count is the bug
  in #210.

  `src/pages/confidence.mdx` is the correction that was needed. It stated that medium "is the level
  you'll see on every page today" and that "all authored usage guidance is `draft`", which the promotion
  makes false. It now says no component sits at medium today, and keeps the level documented because a
  newly authored domain still starts at `draft`. The "Improving a chip" step also stopped calling the
  `draft` to `approved` move a design-lead sign-off, because in this instance it was not one.

### Fixed

- **A component link resolves to the slug's own page before any alias, and the site deploys again on
  knowledge v0.34.150.** ([#222](https://github.com/volivarii/actian-ds-docs/pull/222)) Knowledge
  [#588](https://github.com/volivarii/actian-ds-knowledge/pull/588) publishes a base `card` component
  and retires `card-for-items` in the same refresh. The link rewriter in `scripts/lib/render-mdx.cjs`
  carried a hand-written alias `card → card-for-items` from the time `card` was only a family name,
  and applied it before asking whether the slug had a page of its own. So the real `card` page was
  generated, yet every `[card](card)` cross-reference on Badge, Table, Search result card, Checkbox
  and Radio was sent to the retired target, fell through as a bare relative link, and the links
  validator failed the build: five invalid links, `deploy` skipped, the site frozen on v0.34.145.

  One predicate answers "does this slug have a page": an own entry in the slug-to-path map, which
  `buildSlugToPathMap` fills only with the slugs `generate-component-pages.cjs` writes a page for
  (the generator passes its own `writesPage` rule, so icons, grids and the private categories, which
  are registry entries with no page, stay out of the map). A slug with a page links to it first,
  before any alias and before the concept-slug removals; an alias is a fallback for a name with no
  page of its own; a link whose name or alias target is stranded guidance degrades to its label; a
  slug that is a JavaScript property name (`constructor`) is prose, not a page. Both emitters, the
  stranded-guideline derive and the redirects manifest read that one map, so none of them holds a
  second copy of the precedence.

  The two dead aliases are removed. `card → card-for-items` pointed at a retired target.
  `text-input → input` sent the 16 `[label](text-input)` links on Rich text, Input date, Search,
  Alert banner and Error state to `/foundations/icons/input/`, an icon with no page, as a JSX href
  the links validator cannot see; those 16 links resolve to the Text input page.
  `tests/validation/slug-aliases.test.cjs` joins the alias table and the removal set against the
  generator's emitted map and the page files: an alias key or a removal-set slug that has a page, or
  a map entry with no page file, fails `npm test` naming the entry. An alias whose target has no
  page is a prebuild warning next to the stranded list, with the remedy per entry (repoint, or
  remove when the key has authored guidance of its own), because the resolver already degrades or
  flags those links and a hard failure there would freeze the site on every target retirement.
  `npm test` runs every `tests/**/*.test.{cjs,mjs}` file instead of a hand-kept list, which picks up
  three files the list left out. No slug is special-cased by name.

- **Deprecated components no longer solicit use from the sidebar.**
  ([#200](https://github.com/volivarii/actian-ds-docs/pull/200)) The knowledge layer marks a component `status: "deprecated"` when
  its Figma page carries the deprecated status emoji, and the sidebar ignored the field, so
  `Popover` and the two `WIP data visualization` charts (`bar-graph`, `line-graph`) were advertised
  in the public navigation, work-in-progress charts included. `buildSidebarManifest()` now skips
  them, both as leaves and when counting group members, so no `WIP data visualization` group node is
  created either. **Their pages are still generated**: an existing link still resolves and the
  deprecation stays readable, it is only the navigation that stops promoting them. Driven off the
  published status rather than a list of slugs, so a component retiring in Figma leaves the nav
  without a code change here.

### Added
- **Component pages now render the substrate's authored Usage guidance.** The knowledge repo's
  Usage domain (when to use / when not to use / variant selection / do-don't) renders on the
  Overview tab via a new `renderUsageDomain()` in `scripts/lib/render-mdx.cjs`. Of the 56 authored
  usage docs, **47 render today**; the other 9 (`card`, `combo-box`, `dropdown-select`,
  `global-toast`, `inline-toast`, `multi-select`, `success-state`, `tag`, `upload-file`) have no
  page because their guideline filename has no matching registry slug, so no component picks them
  up — not a rendering gap. All 56 authored docs are `status: draft` (finished writing, not yet
  reviewed by a design lead), so every rendered Usage section carries a visible
  "Authored, pending design lead review." disclosure rather than withholding the guidance or
  publishing it as if settled. This also restores the long-dangling `/usage/` → `#when-to-use`
  redirect target: those legacy tab URLs have pointed at an anchor with nothing under it since the
  redirects were added, and now land on real content.
- **A sixth confidence facet: `usage`.** `renderConfidenceChips()` now emits a `usage` chip
  alongside anatomy/variants/motion/a11y/content, mapped the same way as `content`: `approved` →
  high, `draft`/`synthesized` → medium, absent → low. `src/pages/confidence.mdx` documents the new
  facet (table row, example chip, "Where the values come from" entry).
- **Two foundations token sections that were vendored but never published: Heights and Trigger
  Areas, and Focus Rings.** The knowledge substrate derives and vendors all foundations token
  sections to `vendor/foundations/dist/tokens/`, but the docs page list under
  `src/content/docs/foundations/` is composed from a hand-maintained manifest
  (`src/data/composition/foundations.json`), and two sections never got an entry, so their tokens
  (`--zen-size-height-*`, `--zen-size-trigger-*`, `--zen-focus-ring-*`) were correct in the vendor
  snapshot but invisible on the site. Added `focus-rings.mdx` and
  `heights-and-trigger-areas.mdx`, registered both in the composition manifest (alphabetical
  position: after Elevation, before Icons), and renumbered the later pages' sidebar order.
- A coverage gate (`tests/validation/foundations-token-coverage.test.cjs`) that fails, naming the
  exact JSON path, if a vendored foundations token JSON under `vendor/foundations/dist/tokens/`
  (walked recursively, any depth) is not genuinely consumed by a foundations docs page. An initial
  version of this gate only checked that a same-named `.mdx` file existed at the top level, which
  does not prove consumption: `color.mdx` satisfied it via a name alias while never actually
  importing `global-color/theme-palettes.json` (see the Fixed entry below). The gate now asserts
  real consumption through either of this repo's two legitimate mechanisms: a direct `import` of
  the JSON in a hand-authored page, or resolution through
  `src/data/composition/foundations.json` (reusing the same resolver the page generator uses, so
  the check can't drift from what actually gets published). This is now the exact gap that let
  the two sections above go unpublished silently, closed for real, at any depth.
- **`/content` split into one page per content family.** The docs site used to publish all 22
  content-guidance sections as one 39KB page generated from `vendor/content/dist/global.md`. The
  knowledge substrate already ships the same guidance pre-split by family
  (`vendor/content/dist/{writing,patterns,product}.md`); the site now mirrors that split instead
  of ignoring it. `/content/` is now an index page carrying only "Global guidelines" (the one
  section with no family — extracted at build time from `global.md`, not hand-copied) plus links
  to the three family pages: `/content/writing/`, `/content/patterns/`, `/content/product/`. The
  sidebar's flat "Content guidelines" link is now a group with all four entries.
  `scripts/sync-vendored-md.cjs`'s `PAGES` table drives all four; the index is emitted to
  `content/index.md` (never a sibling `content.md` alongside the `content/` directory — Starlight
  renders both if they coexist).
  - **New `scripts/lib/content-anchors.cjs`** derives a section-heading → family-page map from the
    three split files' H2 headings (never hardcoded), so `renderRelatedPatterns`
    (`scripts/lib/render-mdx.cjs`) can resolve each component's "Related patterns" link to the
    correct page. This mattered because a naive "patterns fan out to `/content/patterns`" mapping
    would have been wrong: `object-preview-panels` and `related-content-panels` (used by
    drawer-side-panel, popover) actually live on `product.md`, not `patterns.md`. An unresolvable
    pattern slug now throws by name at build time instead of shipping a dead anchor.
  - Follow-up opportunity (not done here): `forms`, `validation-messages`, `wizards` in
    `REMOVE_LINK_SLUGS` (`scripts/lib/render-mdx.cjs`) currently degrade bare-slug links to plain
    text because no standalone component page exists for them. Now that they have a real anchor at
    `/content/patterns/#<slug>`, they could become real links instead — left for a follow-up PR.

### Changed
- **Knowledge v0.34.89: the `checkbox` alias is retired (upstream slug rename).**
  Figma renamed two published components, so the knowledge registry now says
  `checkbox` (was `checkbox-with-label`) and `breadcrumb` (was `breadcrumbs`)
  ([knowledge #410]). The `SLUG_ALIASES` entry `checkbox → checkbox-with-label`
  existed only to bridge that mismatch, and the rename **inverts** it: it would
  now redirect all 24 authored `[checkbox](checkbox)` links to a page that no
  longer exists, which the bare-slug link gate would catch as a red build. The
  alias is deleted, and both slugs resolve straight to their pages with no hop.
  Vendor snapshot bumped v0.34.87 → v0.34.89 in the same PR: the bump and the
  alias deletion are only correct together.

### Fixed
- **The site deploys again, and the class of drift that stopped it can no longer stop it.** `main`
  had been red since 2026-07-25, and `deploy` is gated on `links`, so nothing shipped for 17
  consecutive nights and the live site served 2026-07-24 content. Cause: the 2026-07-23 breaking
  Figma sync removed `search-filters` from every registry, so no page is generated for it, while 13
  sibling guidelines (`search`, `segmented-control`, `empty-state`, `search-result-card`, the
  `tag-*` family) still cross-reference it. That produced 15 invalid relative links and
  `starlight-links-validator` failed the build, correctly.
  The knowledge repo had already recorded the removal in its own `UNREACHABLE` allowlist
  (`tests/guideline-reachability.test.js`); the docs side kept the same fact a second time, by hand,
  in `REMOVE_LINK_SLUGS`, and nobody mirrored it. That list had already drifted the same way for
  `upload-file` on 2026-07-13. So rather than adding a seventh entry, the component cases are now
  **derived** from the vendored data at build time: a slug with authored guidance in
  `vendor/components/dist/guidelines/` that resolves to no page (after aliases) is stranded, and its
  inbound links degrade to plain text. The derive reproduces the previous hand-list exactly and adds
  the missing `search-filters`. `REMOVE_LINK_SLUGS` keeps only the three concept-level slugs
  (`forms`, `validation-messages`, `wizards`), which name no component and so cannot be derived.
  The alarm is deliberately preserved: the stranded check runs only **after** alias and map
  resolution fail, so an unaliased rename or a typo'd slug still reaches the links validator and
  still fails the build. A derive that swallowed those too would have traded a loud 17-day outage
  for a quiet permanent one. `generate-component-pages.cjs` logs the stranded slugs by name (they
  are guidance going unread, which is a knowledge-repo decision, not a docs detail) and emits
  `src/data/stranded-guideline-slugs.json` for `sync-vendored-md.cjs`, mirroring the existing
  `slug-paths.json` handoff.
- **`foundations/color` contradicted the substrate's theme list.** The page never imported
  `global-color/theme-palettes.json` and instead rendered an unrelated JSON
  (`vendor/tokens/tokens.json`) plus hand-written prose claiming "three theme rails (Actian, FM,
  DS Kit)". FM and DS Kit are Figma kits, not themes, and the actual substrate-defined themes
  (Actian, Studio, Explorer) were not published anywhere. The page now imports
  `theme-palettes.json` and renders its own body and table as a new "Themes" section, so the
  page states what the substrate states rather than a stale hand-written claim; existing
  brand/feedback scale content is unchanged. `PageMetadata`'s `source` is corrected from the
  no-longer-existent `foundations/dist/tokens/global-color.json` (a file that is now a
  directory) to `foundations/dist/tokens/global-color/`.
- **The site deploys again.** `main` had been red since 2026-07-09 and `deploy` is gated on
  `build + links + a11y`, so nothing shipped to production for three days. Two unrelated causes:
  - **a11y**: the runner image moved to Chrome 150 while `package-lock.json` pins ChromeDriver
    148, and axe died with a version-mismatch error before testing a single page. The a11y job
    now installs the driver matching the runner's actual Chrome
    (`DETECT_CHROMEDRIVER_VERSION=true`), so a future Chrome bump cannot break it again. (Pinning
    Chrome instead would move the breakage to the next bump and test an ever-staler browser.) No
    real a11y debt was hiding behind the error: all four target pages report 0 violations.
  - **links**: `sync-vendored-md.cjs` copied the vendored content guidelines verbatim, so its
    bare-slug cross-references (`[tabs](tabs)`) reached the HTML as relative links that resolved
    to nothing. A hand-maintained slug allowlist in `astro.config.mjs` was all that kept the links
    validator green, so every new cross-reference in knowledge broke this build. Knowledge #369
    added four, and it did.
- Cross-component links on the content-guidelines page now work. `sync-vendored-md.cjs` runs the
  same link policy the component pages use (`scripts/lib/render-mdx.cjs`, now with a
  plain-Markdown emitter alongside the MDX one): known slugs and aliases resolve to real page
  paths, slugs with no component page degrade to plain text. Four links that had never resolved
  now do (`tabs`, `input-date`, `dropdown-select`, `checkbox`); `multi-select` degrades. The
  `astro.config.mjs` allowlist is deleted, and a test asserts the generated page has no
  unresolved bare-slug links, so the next unknown slug fails by name in the test suite instead of
  in an Astro build hook. The slug→path map is emitted once by `generate-component-pages.cjs`
  (`src/data/slug-paths.json`) and read by `sync-vendored-md.cjs`, which now runs after it in the
  prebuild chain, so there is a single owner of the category/group nesting rules.
- Cross-component links in the Usage-guideline wave (knowledge #403) now have a resolution
  story before any usage content renders here: `checkbox`, `global-toast`, and the family slug
  `card` map to their registry-named pages (checkbox-with-label, notification, card-for-items),
  and the four guideline slugs with no registry component yet (inline-toast, multi-select,
  combo-box, success-state) degrade to plain text. The site does not render the usage domain
  yet (that renderer is upcoming work); this pre-clears the link validator for when it does,
  and already covers usage links that surface through today's rendered domains.
- Redirect stub pages (the legacy `/design/` and `/usage/` tab URLs, about 154 of them) sent
  visitors to root-absolute destinations that returned 404 on the deployed site, because Astro
  prefixes a redirect's source route with the base path but not its destination. Destinations are
  now prefixed where `astro.config.mjs` consumes the manifest, which also corrects the stubs'
  canonical URLs. The generated manifest itself stays base-agnostic.
- Plain markdown links written as absolute paths (for example `[Color](/foundations/color/)` on
  the icons page, and several links on the Content and Confidence pages) rendered without the base
  path and returned 404 in production. A new local remark plugin (`scripts/remark-base-links.mjs`)
  rewrites absolute internal link, image, and definition URLs at build time for both markdown and
  MDX pages, so source files stay base-agnostic on disk.
- A stray token in `src/styles/docs-chrome.css` corrupted the component-tab transition
  declaration: esbuild warned about a CSS syntax error on every build and the tab hover
  transition was silently dropped. The declaration is restored.

### Added
- A production-artifact guard (`npm run check:base-prefix`, wired into the build workflow) that
  fails the build if any `href`, `src`, or redirect meta-refresh URL in the built HTML is
  root-absolute without the deploy base path. It replaces the earlier guard that only checked
  `/media/` asset paths and therefore missed roughly 160 broken links per build.
- Root `CHANGELOG.md` and a `CLAUDE.md` PR doc-hygiene rule, aligning the docs repo with the
  ecosystem-wide changelog convention.

### Changed
- The deploy job now waits for all three verification jobs (build, links, accessibility) before
  publishing; previously a failing links or accessibility job did not block deployment. The Pages
  deploy step also retries once on transient failures.
- The nightly vendor-snapshot workflow no longer falls back to an instant squash merge when
  auto-merge is unavailable (this repo's main branch has no required checks, so auto-merge always
  failed and the fallback merged vendor PRs before their checks ran). It now waits for the pull
  request's checks to finish and merges only when they pass; on failure the workflow fails and the
  pull request stays open for review.

## Earlier

Releases before this changelog (the Astro Starlight site, the vendor-snapshot pipeline, the chrome
styling decouple, and cross-link base-prefixing) are recorded in the git history and pull-request
record.

[knowledge #410]: https://github.com/volivarii/actian-ds-knowledge/pull/410

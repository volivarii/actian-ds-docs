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

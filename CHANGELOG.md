# Changelog

All notable changes to the Actian DS Docs site are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file records **notable** changes: new pages or sections, navigation or structural changes,
build and vendor pipeline changes, anything a reader or contributor should know. Routine automated
`vendor(knowledge): refresh to vX.Y.Z` snapshots are not listed individually unless they change the
site's content or behavior.

## [Unreleased]

### Fixed
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

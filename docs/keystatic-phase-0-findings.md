# Keystatic Editing Platform — Phase 0 Spike Findings

**Date:** 2026-05-22
**Branch:** `feat/keystatic-phase-0-spike` (actian-ds-docs)
**Spec:** `2026-05-22-knowledge-editing-platform-design`
**Scope run:** Tasks 1–6 (the GitHub-mode test in Task 5 was run interactively).

The spike proved Keystatic can edit `actian-ds-docs` prose pages end-to-end —
local mode and GitHub mode — but only after working around **three**
unsupported-but-stable incompatibilities. None touch the production build.

---

## 1. Admin hosting on a static site

The docs site is `output: 'static'` on GitHub Pages. Keystatic's `/keystatic`
admin route is server-rendered and `astro build` refuses *any* server route
without an adapter.

**What worked:** the `keystatic()` + `react()` integrations are gated behind a
`KEYSTATIC_ADMIN` env var, set only by the `dev`/`start` npm scripts. The
production `astro build` omits the admin entirely and stays fully static and
adapter-free. The admin runs **only in `npm run dev`**. Collection *content*
still renders in the static build — `createReader` reads it at build time,
independent of the integration.

**Recommendation:** keep the admin dev-only for now. A deployed/hosted admin
would need a Node adapter + a non-static host — a Phase 2 question, not a
Phase 1 blocker. For Phase 1 the spec already puts the admin in `actian-ds-docs`
operating on the knowledge repo over the GitHub API, so a dev-only admin is
viable: an author runs it locally to produce a PR.

## 2. Existing-page reconciliation

The Task 3 thin-wrapper pattern worked cleanly. `src/pages/migrations.astro`
is a `.astro` route wrapper that reads the `docsPage` collection entry via
`@keystatic/core/reader` `createReader` (build-time, local filesystem) and
renders the Markdoc body with `@markdoc/markdoc`. The page builds identically
to the original.

- **Reader API used:** `createReader` — NOT Astro's `getEntry`/`render`
  (`docsPage` is a Keystatic collection, not a registered Astro content
  collection).
- **Repeatable** for `about`, `confidence`, `patterns` — same recipe.
- **Caveat:** the original `migrations.mdx` interpolated a dynamic value
  (`{vendored.knowledge_repo_resolved_version}`). Markdoc bodies are static —
  that value was hardcoded for the spike. Dynamic interpolation in collection
  bodies needs a Phase 1 decision (move to the wrapper, or a Markdoc tag).
- **Caveat:** `set:html` of the rendered Markdoc bypasses Starlight's heading
  anchor/TOC processing — the right-rail TOC will not populate. Acceptable for
  the spike; a Phase 1 consideration.

## 3. GitHub App

A **self-hosted GitHub App** was created via Keystatic's guided manifest flow
(`/keystatic` first-run, GitHub mode), in the personal `volivarii` account
(the repo is not in an org). Keystatic auto-wrote `KEYSTATIC_GITHUB_CLIENT_ID`,
`_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` into a
gitignored `.env`.

**Friction:** Vite's soft restart on `.env` change did not re-inject the new
env vars into already-compiled modules — the OAuth callback 404'd until a
**hard** dev-server restart. Document this in the Phase 1 author setup guide.

## 4. Constrained editing

The `docsPage` collection uses a Markdoc body with `heading: [2, 3]` and
`image: false`. The collection form renders in the admin. The heading-level
constraint should be spot-checked in the UI (the editor's heading menu should
offer only H2/H3).

---

## The three incompatibilities

1. **Astro 6 unsupported.** `@keystatic/astro` latest (5.0.6) peer-requires
   `astro 2|3|4|5`; the docs repo is on Astro 6. Installed with
   `--legacy-peer-deps`. Works — dev + static build both green — but officially
   unsupported. Risk: a future Keystatic or Astro release could break it.

2. **Astro `base` option unsupported.** `@keystatic/core`'s API handler strips
   a hard-coded root-anchored `^/api/keystatic/` prefix, so under
   `base: "/actian-ds-docs"` every `/api/keystatic/*` call 404s. Worked around:
   the admin dev session runs at `base: "/"` (gated by `KEYSTATIC_ADMIN`).
   Harmless because the admin only edits content, never browses the site.

3. **Branch protection is mandatory for the PR model.** Keystatic GitHub-mode
   commits **directly to the default branch** when it can. The spec's core
   model — "one PR per editing session" — only holds if the target repo's
   default branch has branch protection with **`enforce_admins: true`**. With
   protection off (or `enforce_admins: false`), Keystatic — committing as the
   signed-in repo owner — bypasses review entirely. Verified: protected `main`
   with `enforce_admins: true` forced Keystatic to auto-create a branch; the
   PR itself is a separate follow-up action.

---

## Go / No-Go for Phase 1

**Recommendation: CONDITIONAL GO — proceed to Phase 1 planning, but spike the
component-directory model first.**

The platform mechanics work. However, **Phase 0 did not de-risk the central
Phase 1 unknown.** Phase 0 used a flat, single-file collection (`docsPage`,
one `.mdoc` per entry). The knowledge repo's component is a *directory* —
`_meta.yml` + 5 domain `.md` files — and §6.1 of the spec flagged the
"one entry = one file" mismatch as the central technical risk. The spike
proved Keystatic-on-our-stack works for the *easy* shape; the *hard* shape
remains unproven.

**Phase 1 must therefore start with a collection-per-domain spike** against a
real knowledge component before committing to the full build.

**Hard requirements carried into Phase 1:**

1. The knowledge repo's `main` must have branch protection with
   `enforce_admins: true` — non-negotiable, or authors silently bypass review.
2. The Astro 6 / `base` / static-hosting workarounds must be re-validated in
   the Phase 1 setup (admin in `actian-ds-docs`, content in the knowledge repo
   over the GitHub API).
3. The collection-per-domain directory model must be spiked and confirmed.

**Open Phase 2 questions (not Phase 1 blockers):** deployed/hosted admin,
dynamic interpolation in collection bodies, Starlight TOC for collection-
rendered pages, rendered-docs PR preview.

---

# Addendum — Collection-per-domain spike (2026-05-22)

The go/no-go above said Phase 1 must open with a collection-per-domain spike.
Ran it the same session. **Result: the spec's collection-per-domain model is
the right Keystatic shape, but the knowledge repo's CURRENT directory layout
cannot feed it — a restructure is a hard Phase 1 prerequisite.**

## What was tested

The knowledge component is `components/src/<component>/` containing
`_meta.yml` + per-domain `.md` files (`content.md`, `design.md`, …). Tested
three Keystatic models with `createReader` against the real repo / fixtures.

## Findings

1. **`.md` extension is fine.** `fields.markdoc({ extension: "md" })` —
   Keystatic reads/writes `.md`, not just `.mdoc`. The knowledge `.md`
   convention is preserved, and existing files (incl. their `title` /
   `nav_order` frontmatter) read cleanly.

2. **Keystatic supports exactly ONE content file per entry.**
   `format.contentField` is a single field path, not a list — passing an
   array throws `does not point to a content field`. A collection entry
   cannot own 5 separate domain markdown files.

3. **`path: "components/src/*/<domain>"` is NOT supported.** Keystatic's
   collection lister globs flat files at the collection base (or, for
   directory entries, looks for `<dir>/index.<ext>`). It never descends to
   pick `components/src/<slug>/content.md`. Probe: 0 entries. The
   slug-in-middle path the obvious collection-per-domain model needs does not
   work — the lister and reader disagree.

4. **Flat per-domain layout works.** `path: "content/*"` against a fixture
   laid out as `content/<component>.md` listed all components and read each
   entry (title, nav_order, Markdoc body) correctly.

## Conclusion — Phase 1 prerequisite

To adopt Keystatic, the knowledge repo's component guidelines must be
**restructured from `components/src/<component>/<domain>.md` to a flat
per-domain layout** — e.g. `components/<domain>/<component>.md` plus
`components/meta/<component>.yaml`. Then each domain is a clean flat Keystatic
collection.

This restructure is **bigger than the spec anticipated**. It inverts the
component-directory hierarchy and ripples through `guideline-md-parser.js`,
every `derive-*.js`, the docs renderer, `_meta.yml` resolution, the plugin's
guideline reader, and `AUTHORING.md` / `EDITING-GUIDE.md`.

**Revised Phase 1 shape:** Phase 1 must START with the knowledge-repo layout
migration (its own spec + plan + parallel-change rollout), and only then build
the Keystatic collections on top. The editing platform is gated on that
migration.

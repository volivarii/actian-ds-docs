# Composition Editor — Authoring Guide

The composition editor lets you reorder and compose the **Foundations** docs
pages without touching code. It edits `src/data/composition/foundations.json`;
your changes land as a pull request that's checked by CI and reviewed before
going live.

## Open the editor
Visit **https://volivarii.github.io/actian-ds-docs/admin/** and **Sign in with
GitHub** (you need write access to the `actian-ds-docs` repo). The sign-in is
brokered by the shared Actian DS auth service — the consent screen reads
"Actian DS Knowledge Editor"; that's expected.

## Edit
Open **Composition → Foundations chapter**. You can:
- **Reorder pages** — drag the page rows. Top-to-bottom = sidebar order.
- **Edit a page** — change its Title / Description.
- **Compose a page from substrate** — add **Composed sections**, each pointing
  at a foundations section `ref` (e.g. `tokens/spacing`), with an optional
  heading override (`label`), `intro` prose, a `fragment` (e.g. `#background`),
  and render directives.
- **Custom page** — leave **Composed sections** empty and set **Custom page
  .mdx** (the page's body is hand-authored in the repo; the editor only orders it).
  A page is *either* composed sections *or* a custom page, not both.

## Publish
Click **Save**. Your edit is committed to the `docs-edits` branch and a pull
request `docs-edits → main` is opened automatically. CI runs **on that PR** (not
on the `docs-edits` push itself): it validates the schema and that every
`ref`/`fragment` resolves. A maintainer reviews and merges; the site rebuilds.

## Notes
- A bad `ref` (typo) won't break the site — CI rejects the PR with the offending id.
- The editor never writes to `main` directly.

## Maintainer setup (one-time)
- The admin ships with the static site (`public/admin/`), live at `…/admin/`.
- Auth: the existing `actian-ds-knowledge-auth` Cloudflare worker (Sveltia
  OAuth broker) — no change; its `ALLOWED_DOMAINS` already covers `volivarii.github.io`.
- The `docs-edits` branch + `composition-editor-pr.yml` Actions run the PR/sync loop.
- Personal-access-token sign-in also works (paste a `repo`-scoped PAT) for local/testing.

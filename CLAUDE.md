# CLAUDE.md — actian-ds-docs

Static documentation site for the Actian Product Design System (Astro Starlight + GitHub Pages). It
consumes `actian-ds-knowledge` through a pinned vendor snapshot. For local dev, build, and vendor
commands, read `README.md`. This file carries the cross-repo documentation rule that applies here.

## Changelog & PR doc hygiene (ecosystem-wide ground rule)

On every **notable** PR (new page or section, navigation or structural change, build or vendor
pipeline change, anything a reader or contributor must know; not routine automated
`vendor(knowledge)` refresh bumps), update the docs the change touches, in the same PR:

1. root [`CHANGELOG.md`](CHANGELOG.md) ([Keep a Changelog](https://keepachangelog.com) + SemVer): add
   the entry under `## [Unreleased]`, link the PR.
2. [`README.md`](README.md) if the change alters what it states (commands, architecture, structure).
3. any other relevant docs the change touches.
4. a plain-language summary into `actian-ds-ecosystem` (its bundle and `confluence/`), per the
   standing ecosystem-sync rule.

Astro gotcha: Astro does not base-prefix Markdown links written as `[x](/path)`; emit `BASE_URL` JSX
`<a>` for internal links so they resolve under the GitHub Pages base path.

This is an **ecosystem-wide** rule shared by all four DS repos (`actian-ds-knowledge`,
`actian-design-system-plugin`, `actian-ds-docs`, `actian-ds-ecosystem`). The global cross-repo copy
of this rule lives in the shared-brain memory `feedback_changelog_discipline` (it auto-loads in every
repo's Claude context); this section is the authoritative checked-in copy for this repo.

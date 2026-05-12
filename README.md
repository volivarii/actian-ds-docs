# Actian DS Docs

Static documentation site for the [Actian Design System](https://github.com/volivarii/actian-ds-knowledge).

Consumes `actian-ds-knowledge` via vendor-snapshot (pinned tag, App-authored PRs on knowledge releases). Astro Starlight + GitHub Pages.

## Local development

```
npm ci
npm run dev
```

Open http://localhost:4321/actian-ds-docs/.

## Build

```
npm run build
```

Outputs to `dist/`.

## Vendor pull

```
node scripts/vendor/vendor-snapshot.js --range
```

Resolves `knowledge_repo_version_range` from `vendored.json` and refreshes `vendor/`.

## Architecture

See [state page](https://volivarii.github.io/actian-ds-docs/state) for live ecosystem state. See [`docs/superpowers/specs/2026-05-12-docs-site-tier-1-design.md`](https://github.com/volivarii/Actian-DS-Claude-plugin/blob/main/plugins/actian-design-system/docs/superpowers/specs/2026-05-12-docs-site-tier-1-design.md) for the design memo (in plugin repo).

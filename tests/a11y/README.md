# a11y CI gate

Run locally:
```
npm run build
npx http-server dist -p 4321 -s &
npx axe http://localhost:4321/actian-ds-docs/ \
    --rules "color-contrast,landmark-one-main,page-has-heading-one,region,duplicate-id-aria" \
    --exclude "[data-astro-source-file]" \
    --exit
```

Note: `@axe-core/cli` does not support a `--config` file flag; the rules
and excludes from `.axe-config.json` are passed explicitly as CLI flags
both here and in the CI job. `.axe-config.json` serves as the documented
source of truth for which rules are enabled and why.

The rules set enables the high-signal subset that Starlight defaults are
known to satisfy. Add new rules cautiously — a new rule that fires false
positives on Starlight components requires a corresponding `--exclude`
entry before being enabled.

Target pages are listed in `pages.json` and consumed by the CI job in
`.github/workflows/build.yml`.

# a11y CI gate

Run locally:
```
npm run build
npx http-server dist -p 4321 -s &
npx axe http://localhost:4321/actian-ds-docs/ \
    --config ../../.axe-config.json --exit
```

The `.axe-config.json` rules array enables the high-signal subset that
Starlight defaults are known to satisfy. Add new rules cautiously — a
new rule that fires false positives on Starlight components requires a
corresponding `exclude` entry before being enabled.

Target pages are listed in `pages.json` and consumed by the CI job in
`.github/workflows/build.yml`.

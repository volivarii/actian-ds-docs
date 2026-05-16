# component-tabs.config.json

Tab inventory + domain-to-tab routing for component pages.

Consumed by:
- `scripts/generate-component-pages.cjs` (Node CJS, via `require()`)
- `src/components/ComponentTabs.astro` (Vite ESM, via `import`)

Edit this file (not the generator) to add/remove tabs, rename URLs, or re-route domains.

## Schema

Each tab specifies which guideline `domains.<key>` it sources from AND which
generator render-helpers fire. Renderer keys are defined in
`scripts/generate-component-pages.cjs` — see the `RENDERERS` map inside
`buildComponent()` for the full list.

`isIndex: true` marks the bare-URL tab (filename = `index.mdx`, sidebar entry
visible). All other tabs emit `<slug>.mdx` and set `sidebar: { hidden: true }`.

Stub bodies (tabs with no content for any of their domains) render a
`<StubFooter>` callout + a `status` field on the frontmatter.

Empty `domains: []` means the tab is synthesized from non-domain sources
(registry + global a11y MD), not component-specific guideline prose.

## Format choice

JSON (not `.cjs` or `.mjs`) so both Node CJS `require()` and Vite ESM `import`
resolve it natively, no interop tricks needed.

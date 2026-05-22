import { config, collection, fields } from "@keystatic/core";

export default config({
  storage: {
    kind: "github",
    repo: { owner: "volivarii", name: "actian-ds-docs" },
  },
  collections: {
    docsPage: collection({
      label: "Docs pages",
      slugField: "title",
      path: "src/content/docs-pages/*",
      format: { contentField: "body" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        description: fields.text({
          label: "Description",
          description:
            "One-line summary — used as the page <meta> description.",
          multiline: false,
        }),
        navGroup: fields.text({
          label: "Nav group",
          description:
            "Sidebar group this page appears under (e.g. Reference).",
          defaultValue: "Reference",
        }),
        body: fields.markdoc({
          label: "Body",
          options: {
            // Constrained formatting — locked heading levels, no raw HTML.
            heading: [2, 3],
            image: false,
          },
        }),
      },
    }),
  },
});

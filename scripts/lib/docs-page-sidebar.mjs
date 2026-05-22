// Pure: docsPage collection entries -> Starlight sidebar groups.
// Groups by navGroup (default "Reference"); groups and items both
// sorted alphabetically so output is deterministic / byte-stable.
export function buildDocsPageSidebar(entries) {
  const byGroup = new Map();
  for (const entry of entries || []) {
    const group = (entry.data && entry.data.navGroup) || "Reference";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push({
      label: entry.data.title,
      link: "/" + entry.slug,
    });
  }
  return [...byGroup.keys()].sort().map((label) => ({
    label,
    items: byGroup.get(label).sort((a, b) => a.label.localeCompare(b.label)),
  }));
}

/**
 * variant-matrix.mjs — Pure rendering helper for VariantMatrix.astro.
 *
 * Extracted as a plain ES module so it can be unit-tested with `node --test`
 * without requiring the Astro/Vite compile pipeline.
 *
 * @param {Array<{axis: string, values: string[]}>} variantAxes
 * @returns {string} HTML string
 */
export function renderVariantMatrix(variantAxes) {
  const valid = (variantAxes || []).filter((a) => a && a.values && a.values.length);
  const rowsAxis = valid[0] || null;
  const colsAxis = valid[1] || null;

  const noAxes = valid.length === 0;
  const isStrip = valid.length === 1;

  if (noAxes) {
    return `<p class="variant-matrix variant-matrix--empty">No variants documented for this component.</p>`;
  }

  if (isStrip) {
    const rows = rowsAxis.values
      .map((v) => `<tr><td class="variant-matrix__cell"><code>${v}</code></td></tr>`)
      .join("");
    return `<table class="variant-matrix variant-matrix--strip">
  <thead>
    <tr><th scope="col">${rowsAxis.axis}</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
  }

  // 2D grid — first 2 axes only (third+ are silently dropped)
  const headerCells = colsAxis.values
    .map((c) => `<th scope="col"><code>${c}</code></th>`)
    .join("");

  const bodyRows = rowsAxis.values
    .map((r) => {
      const cells = colsAxis.values
        .map(
          (c) =>
            `<td class="variant-matrix__cell" aria-label="${rowsAxis.axis}=${r}, ${colsAxis.axis}=${c}"><span class="variant-matrix__dot" aria-hidden="true">—</span></td>`
        )
        .join("");
      return `<tr><th scope="row"><code>${r}</code></th>${cells}</tr>`;
    })
    .join("");

  return `<table class="variant-matrix variant-matrix--grid">
  <thead>
    <tr>
      <th scope="col" class="variant-matrix__corner"><span aria-hidden="true">${rowsAxis.axis} \\ ${colsAxis.axis}</span></th>
      ${headerCells}
    </tr>
  </thead>
  <tbody>${bodyRows}</tbody>
</table>`;
}

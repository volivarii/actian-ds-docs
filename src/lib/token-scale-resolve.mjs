/**
 * resolveScale — back-compat convenience for the TokenScale `scale` prop.
 *
 * `scale` selects a known sub-tree of the DTCG `data` object + sets the
 * matching `prefix`. Existing call sites that pass `data` + `prefix`
 * directly are unaffected (helper returns the inputs unchanged).
 *
 * Throws on unknown scale values so typos surface loudly.
 */
const SCALE_MAP = {
  spacing: { sub: ["spacing"],          prefix: "spacing" },
  color:   { sub: ["color"],            prefix: "color" },
  radius:  { sub: ["border", "radius"], prefix: "border-radius" },
  type:    { sub: ["font", "size"],     prefix: "font-size" },
};

export function resolveScale(data, scale, prefixIn) {
  if (!scale) {
    return { effectiveData: data, effectivePrefix: prefixIn || "" };
  }
  const map = SCALE_MAP[scale];
  if (!map) throw new Error(`TokenScale: unknown scale '${scale}'`);
  const effectiveData = map.sub.reduce(
    (acc, key) => (acc && acc[key]) || {},
    data,
  );
  return { effectiveData, effectivePrefix: map.prefix };
}

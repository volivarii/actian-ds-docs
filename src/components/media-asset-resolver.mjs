// Pure path resolver — converts a guideline.media entry (repo-relative path
// under components/dist/media/<slug>/<file>) into the public/-served URL the
// site emits at runtime. The vendor → public/ mirror step (Task 18) puts
// these assets at /public/media/<slug>/<file>, so the resolver strips the
// "components/dist/media/" prefix to land at /media/<slug>/<file>.

export function resolveMediaPath(guideline, role) {
  if (!guideline || !guideline.media) return null;
  const rel = guideline.media[role];
  if (typeof rel !== "string" || rel.length === 0) return null;
  const stripped = rel.replace(/^components\/dist\/media\//, "");
  return "/media/" + stripped;
}

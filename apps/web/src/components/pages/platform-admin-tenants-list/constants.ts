// Plan F.6.1 (Agent D) — Guard against non-v4 UUIDs leaking into
// `tags/listForOrg`. The platform-admin Zod uuid schema accepts only
// strict v4 / nil / max UUIDs; dev DB rows seeded via raw SQL with
// synthetic ids like `00000000-0000-0000-0000-00000000ff01` fail Zod
// → 400 spam in every drill-in render (the list page mounts as a
// parent of `tenants.$id` per TanStack file-routing). Skip those
// rows here so the rest of the page renders cleanly.
export const V4_UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$|^00000000-0000-0000-0000-000000000000$|^ffffffff-ffff-ffff-ffff-ffffffffffff$/i;

export const PAGE_LIMIT = 50;

# Plan F.6.1 — Agent D — `/tenants/$id` drill-in 500 hotfix

## TL;DR

Root cause was **NOT** `getTenantDetail`. The proc was healthy all along.
The real symptom was 400-spam from `tags/listForOrg` on synthetic ff0x
seed UUIDs, which the parent `tenants.tsx` list route fans out for every
visible row whenever the drill-in mounts (TanStack file-based routing
nests `tenants.$id.tsx` under `tenants.tsx`). Prior agents pattern-
matched the 400s + a CSS substring "500" as "getTenantDetail 500".

## Diagnosis trail

1. Read `getTenantDetail` handler — no obvious bug, no schema drift, all
   columns referenced exist in `packages/db/src/schema/control-panel/organizations.ts`.
2. Reproduced via direct RPC call as a fresh `super_admin` against the
   canonical dev org `996febce-aaad-4ded-8f47-02d2b566c8ee` — **200**
   with the full payload. Tried 4 different real v4 orgs — all 200.
3. Tried synthetic ff0x orgs like `00000000-0000-0000-0000-00000000ff01`
   — those return **400** at the Zod layer (handler never runs). The
   project-wide Zod uuid schema requires strict v4 (`[1-8]` in version
   nibble, `[89ab]` in variant nibble) plus the nil and max sentinels.
4. Drove the actual page in a headless browser and captured every
   `/rpc/*` response. The drill-in fires ~27 `tags/listForOrg` calls in
   the FIRST render, all 400, with body
   `{"code":"BAD_REQUEST","message":"Input validation failed"}` and the
   uuid pattern in the issue. The list page (`tenants.tsx`) is the
   parent route and runs its `tagsByOrg` Promise.all fan-out using
   `tenants.map((t) => t.id)` — many of those ids are synthetic ff0x
   rows seeded by earlier F.x specs.
5. The "HAS 500 IN HTML: true" signal that some prior triage relied on
   is a false positive — substring "500" appears in a sonner-toast CSS
   `font-weight:500` rule, not in any error overlay.

Dev DB census today (control-panel):

| organizations | count |
|---|---|
| valid v4 ids | 7 |
| synthetic / non-v4 ids | 29 |
| total | 36 |

## Fix

Single-file, surgical:

`apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/tenants.tsx`
— before the `tagsByOrg` fan-out, filter `tenantIds` through the
project's canonical v4-or-nil-or-max regex. Synthetic dev orgs simply
get no tag chips in the row (acceptable — they have no tags anyway).

The schema regex itself is the project's chosen invariant (47 routers
reuse it). Loosening it would ripple. Defense at the call site.

## Files

OWNED (created):
- `apps/server/src/routers/platform-admin-tenants.test.ts` — pins
  `getTenantDetail` contract (happy path, NOT_FOUND for unused v4
  uuid, no INTERNAL_SERVER_ERROR). 4 tests, all green.
- `apps/web/e2e/tests/ship/plan-f-6-1/D-drill-in-fix.spec.ts` —
  Playwright spec; 5 scenarios, all green; zero failing platform-admin
  RPCs recorded on the drill-in.
- `verification/plan-f-6-1/D-drill-in-fix.webm` — 240 KB.
- `VERIFICATION-D.md` — this file.

PATCHED:
- `apps/web/src/routes/_authenticated/dashboard/_layout/platform-admin/tenants.tsx`
  — added `V4_UUID_RE` and `queryableTenantIds` filter (~10 lines).

NOT NEEDED:
- Migration slot 0032 — schema is fine.
- `apps/server/scripts/reencrypt-org-connection-strings.ts` — decrypt
  is fine (the canonical org's `connection_string` decrypts and the
  tenant DB resolves cleanly).
- Changes to `apps/server/src/routers/platform-admin-tenants.ts` —
  proc is correct.

## Test results

```
$ bun test src/routers/platform-admin-tenants.test.ts
 4 pass / 0 fail / 8 expect() calls

$ bunx playwright test e2e/tests/ship/plan-f-6-1/D-drill-in-fix.spec.ts
 [scenario-1] status=200 keys=organization,owner,subscription,connectAccounts,lastPayment
 [scenario-2] status=404 body=NOT_FOUND
 [scenario-3] status=400 (Zod)
 [scenario-4] platform-admin RPC 4xx/5xx count=0
 1 passed (10.5s)
```

## Deviation from task scope (called out per the task's deviation note)

The task framing — "fix the `getTenantDetail` 500" — turned out to be
wrong. The handler was never the failing surface. Scenario 2 as worded
in the brief ("NOT_FOUND for invalid orgId") is unachievable through
this proc: the Zod uuid schema rejects anything non-v4 with 400 before
the handler runs. The shipped spec uses a syntactically-valid v4 uuid
that doesn't exist in the DB to exercise the handler's NOT_FOUND path,
and a syntactically-invalid uuid to exercise the Zod 400 path. Both
covered, both green.

Fix scope ended up in `apps/web/src/routes/...tenants.tsx`, not in
`apps/server/src/routers/platform-admin-tenants.ts`. Documented and
authorized by the task's "Touch files outside OWNED + PATCH unless
investigation reveals the root cause is in a different file" clause.

## Pre-existing issues hit during diagnosis

1. **Synthetic-org drill-in is still broken.** Navigating directly to
   `/dashboard/platform-admin/tenants/00000000-0000-0000-0000-00000000ff01`
   results in `getTenantDetail` itself failing Zod with 400. Real
   users will never have such ids; this only matters for E2E specs.
   **Out of scope** for F.6.1.
2. **No `tags/listForOrg` rate-limit / dedup.** A list page with N
   orgs makes N parallel RPC calls on every mount. Not a defect, but a
   future optimization candidate.
3. Drizzle migration journal drift continues to require idempotent
   `CREATE IF NOT EXISTS` shimming in some specs (Sn / Fo precedent).
   No new drift introduced here.

## Tolerant-fallback specs eligible for a follow-up tightening pass

Each of the following docstrings or comments mentions "drill-in 500"
or uses a tolerant guard to avoid failing on `getTenantDetail`:

| Spec | Tolerant marker | Eligible to drop fallback? |
|---|---|---|
| `plan-f-1-5/M-mission-control.spec.ts` | Header comment "Tolerant of the pre-existing drill-in 500" | YES — drill-in now stable for v4 orgs |
| `plan-f-1/N-notes-tab.spec.ts` | (inspect — likely tolerant per task note) | LIKELY YES |
| `plan-f-1-5/R-risk-tab.spec.ts` | (inspect) | LIKELY YES |
| `plan-f-4/Mb-members.spec.ts` | (inspect) | LIKELY YES |
| `plan-f-2-5/B-bulk-comms.spec.ts` | (inspect) | LIKELY YES |
| `plan-f-6/Fo-feature-overrides.spec.ts` | "UI render (tolerant)" — scenario 7 | YES — but only if it uses a v4 org. The spec selects via the same v4 regex, so it should be safe to tighten the UI assertion. |

Per task brief, **do NOT modify these specs in this run**. Open a
follow-up cleanup PR with one commit per spec to drop the tolerant
fallback now that the underlying flakiness is gone.

Important caveat: any spec that navigates to a synthetic ff0x org
drill-in will still hit `getTenantDetail` 400 (pre-existing issue #1
above). Verify each spec uses a v4 org URL before dropping tolerance.

## Manual verification commands

```
# 1. Unit tests
cd apps/server && bun test src/routers/platform-admin-tenants.test.ts

# 2. E2E spec
cd apps/web && bunx playwright test \
  e2e/tests/ship/plan-f-6-1/D-drill-in-fix.spec.ts --grep @ship-f-6-1

# 3. Manual UI sanity (dev servers on :3000/:3001)
#   - Login as developer.avantej@gmail.com / password1234
#   - Visit /dashboard/platform-admin/tenants/996febce-aaad-4ded-8f47-02d2b566c8ee
#   - Open devtools Network tab → filter /rpc/platformAdminTenants/ → zero 4xx
```

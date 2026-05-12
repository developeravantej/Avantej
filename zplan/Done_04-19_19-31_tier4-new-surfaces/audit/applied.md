# Audit Applied: 04-19_19-31_tier4-new-surfaces

**Applied:** 2026-04-20 (second pass)
**Source report:** audit/report.md
**Plan modified:** plan/plan.md

---

## Summary

| Finding | Count | Action |
|---------|-------|--------|
| Broken ref fixed (listForClient → listAll) | 3 occurrences | Auto-fixed |
| date-fns inconsistency fixed | 2 occurrences | Auto-fixed |
| TODOs injected | 0 (new ones) | Prior pass already covered all BLOCKED items |
| Deferred | 0 | — |

---

## Changes Applied

### Finding 1 — `packageInstances.listForClient` → `listAll` (3 refs fixed)

Confirmed by reading `packages/api/src/routers/package-instances.ts`:
- `listForClient` input: `{ organizationId, status?, source?, limit? }` — no `clientId`
- `listAll` input: `{ organizationId, clientId?, status?, source?, limit? }` — has `clientId`

The plan used `listForClient` with `clientId` in 3 places for the Customer 360 Packages tab. All fixed to `listAll`.

| Location | Old | New |
|----------|-----|-----|
| §3G component tree (line 293) | `listForClient({ organizationId, clientId: id })` | `listAll({ organizationId, clientId: id })` |
| §3G API calls list (line 308) | `listForClient({ organizationId, clientId })` | `listAll({ organizationId, clientId })` with inline audit note |
| Phase 4F task 4F.6 (line 643) | `listForClient({ organizationId, clientId: params.id })` | `listAll({ organizationId, clientId: params.id })` |

### Finding 2 — date-fns inconsistency (2 fixes)

`date-fns` is confirmed NOT installed in `apps/web`. Phase 4D header already noted this, but task 4D.1 and §7 still said "check if installed."

| Location | Old | New |
|----------|-----|-----|
| Phase 4D task 4D.1 | "use `formatDistanceToNow` from `date-fns` (check if installed; if not, use `Intl.RelativeTimeFormat`...)" | "use `Intl.RelativeTimeFormat` (date-fns is NOT installed in apps/web — confirmed by audit)" |
| §7 Cross-Cutting Concerns | "check if `date-fns` is in `apps/web/package.json` before adding" | "`date-fns` is NOT installed in `apps/web` (confirmed by audit; do not add unless deliberately chosen as new dep)" |

---

## Already-Handled Findings (not duplicated from prior pass)

- `command.tsx` / `cmdk` absent — expected-absent; BLOCKED prereq already annotated
- `appointments.list` clientId — BLOCKED TODO already in §3G, Phase 4F, and Q4/Q8
- `packageInstances.listAll staffId` — Phase 4E BLOCKED in execution table; Q4 TODO injected
- `app-layout.tsx` missing from impact — note added to §6 in prior pass

---

## Deferred

None.

# Cross-Cutting Concerns

---

## Error Handling Strategy

Per workstream:

- **Ticket A (GHL guard):** non-admin access → redirect with `?unauthorized=ghl` search param. The landing page should read this param and toast "You don't have access to that page" on arrival. Keep the toast copy neutral — avoid revealing the feature name to unauthorized users beyond what's already implicit.
- **Ticket B (invitation scope):** `requirePermission` may throw inside the `list` handler — wrap in try/catch and downgrade to "own only" rather than returning a hard 403. Preserves backward compatibility for staff users.
- **Rooms UI:** SHIPPED — mutation errors toast via sonner; form follows stock-requests/suppliers pattern. See `zdone/17-04_rooms-management.md`.
- **Audits:** not applicable (discovery only).
- **Docs:** not applicable.

---

## Testing Approach

### Unit

- Ticket B: add `invitations-scope.test.ts` under `apps/server/src/tests/unit/` (or wherever invitation unit tests live) — cover permitted and unpermitted cases with mocked tenant DB.
- Rooms UI: component tests for the form + data table if the team has that pattern. Otherwise defer.

### Integration

- Ticket B: at `apps/server/src/tests/integration/` — seed two admins + one staff, verify each sees correct set.

### E2E / Manual

- Ticket A: log in as admin → reach GHL page. Log in as staff → verify redirect. Use two browser tabs to verify.
- Rooms UI (SHIPPED — verification still recommended): golden path — create, edit, deactivate/reactivate, confirm Appointment Modal still shows the room. Verify empty-rooms inline "Create one →" link + `?returnTo=` banner.
- Invitations: log in as Admin A → send invitation. Log in as Admin B → verify Admin A's invitation visible.

### Type-check / lint

- All changes must pass `bun check-types` and `bun check` before merge.

---

## Migration Plan

No schema migrations from the Rooms UI (shipped — existing schema was sufficient).

Adjacent out-of-plan work **did** add a migration: `0017_installment_plans` (embedded in `migrate-tenant.ts`). Applied on branch `Customer-app`. Seeds 3 rows (`full`, `half`, `quarterly`) idempotently via `ON CONFLICT DO NOTHING`. Safe to re-run.

---

## Rollback Strategy

| Change | Rollback | Data impact |
|--------|----------|-------------|
| Ticket A | Revert single file | None |
| Ticket B | Revert single file | None |
| Rooms UI (SHIPPED) | Remove new files + sidebar entry + appointment-modal diff + seed Step 7, regenerate `routeTree.gen.ts` | None — rooms data remains, just no UI |
| Docs patches | Revert PR | None |
| Audit docs | Delete new files | None |

All changes are independently revertable. No runtime flags required.

---

## Performance Considerations

- **Ticket B:** broader invitation list for admins — typical orgs have tens to hundreds of invitations; even 10,000 rows fit in a single query. No pagination needed for v1.
- **Rooms UI:** room count per org is expected to be small (< 100). No pagination needed.
- **Audits:** no runtime impact.
- **Docs:** no runtime impact.

---

## Observability

No new metrics or logs required. Standard oRPC error logging catches anything unexpected.

---

## Security

- **Ticket A:** defense-in-depth — `beforeLoad` guard + in-component check. Server-side endpoints called by the page should also verify permission (out of scope here but flag as follow-up if any endpoint is unauthenticated).
- **Ticket B:** permission check in the procedure is the only enforcement layer for this filter — server is authoritative.
- **Rooms UI:** new oRPC calls use existing `rooms` router procedures which already check permissions server-side. Frontend button gating is presentation-only.

---

## Documentation Commit Discipline

- Each workstream should land its doc patch in the SAME PR as the code change, not a follow-up. Docs drift fast when separated.
- Rooms UI PR → doc patch #12 in the same PR
- Ticket B PR → note in Section 14d of the doc about the scope change in the same PR

---

## Deployment Sequence (Recommended)

1. Audits merge first (doc-only, low risk) — still pending.
2. Ticket A + Ticket B merge in any order (two small PRs) — still pending.
3. ~~Rooms UI merges~~ — DONE on `Customer-app` (2026-04-17), ahead of the original sequence.
4. Doc patches merge last, referencing the shipped state (Rooms + Installment Plans both need capture).

If time pressure is low and reviewers are available, remaining items can happen in parallel PRs.

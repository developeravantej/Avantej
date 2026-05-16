# ADR 0026 — Tenant Deletion & GDPR Workflow

Date: 2026-05-16
Status: Accepted

## Context

Plan E E.8 wraps up the tenant-management surface with the operationally
hardest action: **deleting a tenant**. Two pressures collide.

1. **GDPR / contractual obligation.** When a tenant terminates the
   relationship, we must (a) hand over their data on request and
   (b) erase it within a defined window. "Forever-soft-delete" is not
   compliant.
2. **Operational safety.** Hard delete on the same click as the button
   press is a foot-cannon. A misclick by ops should be recoverable.

We also need the deletion record itself to be auditable — who
requested, when, when does the timer expire, was it restored, was it
ultimately hard-deleted.

## Decision

A **two-stage delete**:

1. **Soft delete** (immediate): write a `tenant_deletions` row with
   `hard_delete_after = now + 30d`, set
   `organizations.payment_status = 'cancelled'`. Tenant DB data stays
   on disk; org is blocked from billing + app login (the existing
   suspend middleware treats `cancelled` as a hard block). The deletion
   is reversible — see "Restore" below.
2. **Hard delete** (deferred, automated): a daily cron sweeper at
   `0 3 * * *` UTC selects rows where
   `hard_delete_after <= now AND restored_at IS NULL AND hard_deleted_at IS NULL`,
   drops the Neon project for the org, deletes the `organizations`
   row, stamps `hard_deleted_at`.

A partial index on `(hard_delete_after) WHERE hard_deleted_at IS NULL AND restored_at IS NULL`
gives the sweeper an O(open-rows) scan instead of a full-table scan.

### Restore

Any super-admin can restore inside the 30-day window. Restore stamps
`restored_at` on the deletion row and flips
`payment_status` back to `active`. The row drops out of the sweeper's
partial index, so the timer effectively stops.

### Export format

JSON dump per tenant table, base64-encoded for v1. Plan E specified
"ZIP" — we deliberately downgraded to single-JSON for v1 because
Cloudflare Workers don't have a built-in ZIP encoder in the standard
runtime and the auditor-friendly CSV-per-table is heavier. The schema
of the dump is:

```json
{
  "exportedAt": "ISO8601",
  "organizationId": "uuid",
  "requestedByUserId": "user-id",
  "tables": {
    "members": [...rows],
    "customer_profiles": [...rows]
  }
}
```

Tables are enumerated from `tenantDb.query.*` at runtime — new tenant
tables added later flow into the dump automatically.

The dump is returned as a `data:application/json;base64,…` URL stashed
on `tenant_deletions.export_url`. This is a **stop-gap**; production
upgrade is to push the blob to R2 and replace the column with a signed
URL emailed to the requesting admin.

### Neon project drop semantics

`deleteTenantProject` in `neon.service.ts` already calls
`DELETE https://console.neon.tech/api/v2/projects/{id}`. The sweeper
re-uses the same endpoint inline (without going through that helper)
because the helper resolves env via `cloudflare:workers`, which is
runtime-bound and breaks the testability of the service. The sweeper
accepts an injectable `deleteNeonProject` for tests.

Neon's project DELETE is **synchronous and irreversible** — once the
HTTP call returns 200 the data is gone. We rely on the 30-day grace
window plus the audit row in `admin_session_actions` for compliance
evidence.

If the Neon delete fails for any reason (network, missing API key,
already-deleted project), the org-level error is logged and pushed
into `errors[]`; the sweeper continues to the next overdue row. The
admin can re-run the sweeper manually via
`platformAdminTenants.runHardDeleteSweeperNow` once the root cause is
fixed.

## Consequences

- Recovery window is fixed at 30 days. Changing it requires touching
  `SOFT_DELETE_GRACE_DAYS` and the operational SLA we publish to
  tenants. Both should change together.
- Deleting an org cascades to `tenant_deletions` (FK is
  ON DELETE CASCADE). The audit history therefore lives in
  `admin_session_actions` (whose target_organization_id is
  ON DELETE SET NULL) — those rows survive the hard delete and remain
  the legal record of what happened.
- The base64 export URL embedded in `tenant_deletions.export_url` will
  bloat the row beyond comfortable inline size on big tenants. The R2
  upgrade is **required** before this scales.

## NOT in v1 (deferred)

- **Slack alerts** when the sweeper finds errors. Logs only for now.
- **CSV-per-table export.** JSON-only.
- **R2 upload + email delivery of the export.** Returned via RPC for
  now; admin captures locally.
- **Self-serve tenant-initiated deletion.** Admin-mediated only.
- **Deletion of impersonation-action audit rows.** These survive the
  hard delete intentionally (compliance).
- **GHL sub-account cleanup.** GHL provisioning records survive in
  the control panel; manual cleanup until GHL E.7 lands.

## Related

- ADR-0021 — Cloudflare Cron as scheduled-job infra (sweeper lives there).
- ADR-0024 — Tenant lifecycle state machine (`cancelled` flow).
- Plan E E.8 — implementation reference.

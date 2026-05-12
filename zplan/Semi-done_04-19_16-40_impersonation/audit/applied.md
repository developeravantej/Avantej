# Audit Applied: 04-19_16-40_impersonation

**Applied:** 2026-04-20
**Audit report:** `audit/report.md` (mtime 2026-04-20)
**Plan modified:** `plan/plan.md` (mtime before edits: 2026-04-20, pre-audit)

Freshness check: audit report (`1776656697`) is newer than plan (`1776650407`) — no staleness warning needed.

---

## Summary

| Type | Count |
|---|---|
| Broken refs auto-fixed | 1 |
| Stale prose auto-fixed | 3 (same correction in 3 locations: Phase 6.3, Phase 6 files list, Appendix A) |
| TODOs injected | 2 (P1 banner tenant-stop routing, P2 seed script credential gap) |

All edits annotated inline with `<!-- AUDIT-FIX 2026-04-20 ... -->` HTML comments so future readers can trace provenance without diff archaeology.

---

## Changes

### 1. Phantom file path — Phase 6 files list (auto-fix)

- **Was:** `packages/api/src/routers/platform-admin.ts (modify — classify type in status)`
- **Now:** `apps/server/src/routers/admin.ts (modify — classify type in getImpersonationStatus; see lines ~508–550 of the implementation)`
- **Verification:** Grepped for `getImpersonationStatus` in `apps/server/src/routers/admin.ts` — confirmed at line 508. The phantom path was never created; the type-classification handler lives in the existing admin router (consistent with §3 architecture which already extends `adminRouter` rather than creating a new namespace).

### 2. Stale migration insertion point — three locations (auto-fix)

The plan repeatedly stated the new migration constant should be added "after `MIGRATION_0019_AUDIT_LOGS`". As-built grep of `packages/db/src/migrate-tenant.ts` shows constants 0022 (`CHECK_INS`), 0023 (`REFUNDS`), 0024 (`COMMISSION_SPLITS_STATUS`), and 0025 (`MEMBER_SESSIONS`) — i.e. 0022–0024 already existed before this feature, and the new migration was correctly appended after 0024.

Corrected at:
- **Phase 6.3 task body** (line ~520): replaced "the latest migration in this file is `MIGRATION_0019_AUDIT_LOGS`" with the as-built note that the latest pre-feature migration was 0024 and the new constant shipped as 0025.
- **Phase 6 files list** (line ~545): "after `MIGRATION_0019_AUDIT_LOGS`" → "after `MIGRATION_0024_COMMISSION_SPLITS_STATUS`".
- **Appendix A** (line ~727): same correction.

### 3. P1 TODO — `ImpersonationBanner` tenant-stop routing not wired (TODO injection)

Phase 3.2 originally specified routing the Stop button between `admin.stopImpersonating` and `tenantAdmin.stopImpersonating` based on `type`. As-built, the banner always calls `admin.stopImpersonating` (a `// TODO Phase 6/7` comment marks the unwired branch in `apps/web/src/components/impersonation-banner.tsx` at ~lines 18–21). Functional consequence: `member_sessions.endedAt` is never set when a tenant admin clicks Stop — audit row remains open until the deferred nightly cron (Phase 5.3).

Injected an inline TODO under Phase 3.2 marked **P1, audit 2026-04-20** with a "resolve before production ship" instruction.

### 4. P2 TODO — Seed script credential gap (TODO injection)

Appendix D Bug 1.0 documented that `apps/server/scripts/seed-platform-admin.ts` only seeds the `platform_admins` row — it assumes a credential `account` row already exists. In a fresh environment, the seed succeeds but login silently fails because Better-Auth has no scrypt credential to verify against. The fix was applied to the dev DB during the chrome run but never landed in code.

Injected an inline TODO under Phase 1.5 marked **P2, audit 2026-04-20** instructing future implementers to extend the script to upsert a scrypt-hashed credential `account` row using Better-Auth's own `hashPassword` (with `account.account_id = user.id`).

---

## Deferred / Not Actioned

The audit listed two **P4** items the user did not include in this apply pass:

1. **Add `apps/web/src/routes/_authenticated/user/view.tsx` and `app-layout.tsx` to §6 impact table.** — Already partially mitigated by Appendix A's audit-finding note on the consumer route; the §6 impact table is incomplete but the actual code-level mitigation (button suppression via dual gate) is documented elsewhere. Skipped per task scope.
2. **Update `chrome-test/plan.md`: `/sign-in` → `/login`.** — Out of scope for this apply pass (only `plan/plan.md` is in scope per task instructions).

Three open questions (OQ4–OQ6) remain explicitly deferred with rationale, as accepted by the audit.

P3 item "comment in `tenant-admin.ts` around the `user.role` elevation block" was already marked DONE by the audit (comment present at lines 113–116 of that file).

---

## Next Steps

To move this session from `needs-attention` → `clean`:

1. Implement the **P1** banner fix: route Stop to `tenantAdmin.stopImpersonating` when `getImpersonationStatus.type === 'tenant'`.
2. Implement the **P2** seed-script credential upsert.
3. Optionally backfill the §6 impact table with `user/view.tsx` and `app-layout.tsx` rows (P4).
4. Optionally fix `chrome-test/plan.md` URL (P4).

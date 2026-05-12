# Type Safety Audit — Pass 2
**Lens:** type-safety-auditor
**Date:** 2026-05-07

## Summary

Re-auditing after Pass 1 fixes. Async handler pattern, optional prop, and branch name lookup strategy were all addressed. New issues found.

---

## Findings

### [INFO] Async handler pattern now documented ✓
- Plan shows `onValueChange={(id) => { void handleServiceSelect(id); }}` which is the correct TypeScript-safe pattern

### [INFO] `selectedCustomer?` now optional ✓

### [INFO] Branch name lookup strategy now specified ✓

### [HIGH] `onUpdate({ refId: svc.id, description: svc.name, unitPriceCents: 0 })` followed by `onUpdate({ unitPriceCents: priceCents ?? 0 })` — the second call patches only `unitPriceCents`. This is fine if `onUpdateItem` in the parent merges patches (using `{...item, ...patch}`). The `pos-workflow.tsx` must use spread-merge in `handleUpdateItem`. This is the existing pattern — verify it's maintained.
- Risk: If `onUpdateItem` replaces the full item rather than merging, the second `onUpdate` would clear `refId` and `description`
- **Low implementation risk since the existing `ItemRow` already calls `onUpdate` with partial patches and the parent is expected to merge**

### [HIGH] `expireServicePrice` service function spec: `(db, priceId, until?: Date)` — the plan says the router passes `input.effectiveUntil ? new Date(input.effectiveUntil) : undefined`. However `z.string().datetime()` accepts ISO strings. `new Date(isoString)` is safe. The service function then does `until ?? new Date()`. **Type chain is safe.**

### [MEDIUM] `deleteServicePrice` — plan says it's a "hard delete" and the router verifies the priceId belongs to the caller's tenant. The verification step requires a JOIN: `servicePrices → services` (to get `serviceId`), then check if `service.branchId` is in `accessibleNodeIds`. However, some services have `branchId = null` (org-wide services) — for such services, any admin can access them. The plan's tenant isolation check must handle the `branchId = null` case:
- If `service.branchId IS NULL` → org-wide service, any org member with delete permission can delete its price rows
- If `service.branchId IS NOT NULL` → check `accessibleNodeIds.includes(service.branchId)`
- **This nuance is not specified in the plan. Add it.**

### [MEDIUM] Phase 3 dialog: Customer Type selector has values "All", "Member", "Walk-in" mapping to `null`, `"member"`, `"walk_in"`. But the updated `services.setBranchPrice` Zod schema now uses `z.enum(["member", "walk_in"]).nullable().optional()`. When "All" is selected, `customerType` should be `null`. The `nullable()` allows this. **The Zod change is correct and consistent with the UI values.**

### [MEDIUM] Phase 2: The plan's `handleServiceSelect` calls `onUpdate` twice — once to set `refId/description/unitPriceCents:0`, and once to update `unitPriceCents` after resolution. If the user switches service mid-flight (selects service A, then quickly selects service B before A resolves), two concurrent async calls will be in-flight. The second call's result may arrive after the first, leaving the item in an inconsistent state (service A shown, price from service B).
- **Race condition in rapid service switching.** Pattern: use a ref or abort controller to cancel in-flight requests, or debounce.
- **Not specified in the plan. Add a note about this race condition and recommended mitigation (track `lastRequestedServiceId`, discard results where `serviceId !== lastRequestedServiceId`).**

### [LOW] Phase 3 dialog `Effective From` uses `new Date().toISOString().slice(0,16)` — this produces UTC time in `datetime-local` format but `datetime-local` inputs show local time. The pre-fill should use local time: `new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0,16)`.
- **Minor bug in the plan's pre-fill formula — it will show UTC time as the default, which may confuse users in non-UTC timezones.**
- **Fix: Update pre-fill formula to use local time offset**

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| `deleteServicePrice` tenant check must handle `service.branchId = null` case | MEDIUM | Yes — add to plan |
| Rapid service switching race condition in `handleServiceSelect` | MEDIUM | Yes — add note + mitigation |
| `datetime-local` pre-fill formula uses UTC not local time | LOW | Yes — fix formula in plan |
| `onUpdate` merge pattern — implementation must use spread-merge | HIGH | Yes — add verification note |

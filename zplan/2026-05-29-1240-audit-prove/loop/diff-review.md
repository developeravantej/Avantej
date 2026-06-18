# Remediation Diff — Code Review (read-only)

Scope: only the changes listed in the review brief. Reviewed via `git diff -- <file>` for each.
Focus: correctness & safety.

Branch note: working branch is `Checkpoint_May_29` (not `audit-prove/remediation-...`), but all listed files carry the described modifications, so the diff under review is present.

---

## HIGH

### H1 — Product-scoped promotions are unconditionally rejected at the POS (the only real caller)
`packages/services/src/promotions.service.ts:156-181` (new block 7b) + `packages/services/src/pos.service.ts:330-348`

The new scope check is:
```
if (isProductScoped || isServiceScoped) {
  productMatch = isProductScoped && orderProductIds.some(...)
  serviceMatch = isServiceScoped && orderServiceIds.some(...)
  if (!productMatch && !serviceMatch) throw "does not apply to any item"
}
```
This logic is internally correct (null/empty list = applies to everything; non-empty = require intersection). The problem is the **caller contract**: the only production caller, `pos.service.ts`, builds and passes `serviceIds` but **never builds or passes `productIds`** (it only collects refIds for `type === "service" | "package"`). So `params.productIds` is always `undefined` → `orderProductIds = []` → `productMatch` is always `false`.

Consequence: a promotion scoped **only** to products (`applicableProductIds` non-empty, `applicableServiceIds` empty) can never be redeemed through POS — it always throws "Promotion does not apply to any item in this order," even when the cart contains exactly those products. A promotion scoped to both products and services still works if a matching service is present, masking the bug in mixed carts.

Fix direction: have `pos.service.ts` also collect product refIds (it already distinguishes product items at line ~477 with `isProductItem`) and pass them as `productIds`.

---

## MED

### M1 — Best-effort `notifyWaitlistPromotion` runs inside the transaction; a failure poisons the whole tx (rollback), defeating "best-effort"
`packages/services/src/waitlist.service.ts:300-319`

`notifyWaitlistPromotion(tx, ...)` is invoked with the **active transaction** and wrapped in `try { } catch { /* swallow */ }`, and it is the **last statement** before the tx commits. In PostgreSQL, any statement error inside a transaction (without a SAVEPOINT) puts the transaction into the *aborted* state; the JS `catch` swallows the error object, but the subsequent `COMMIT` is converted to `ROLLBACK`. So a failed notification INSERT would silently roll back the **entire promotion** — and, via `cancelClassSlot`, potentially the entire slot cancellation + cascade — which is the opposite of the stated "must not roll back the promotion" intent.

Likelihood is currently low: `notifications` requires only `userId/type/title/message` (all provided) and `relatedId` is a uuid (both candidate values are uuids), so the INSERT rarely fails today. But the try/catch gives a false guarantee. Correct approaches: run the notification **after** the transaction commits (pass `tenantDb`, not `tx`, outside the tx block), or wrap it in a real SAVEPOINT. As written, the catch does not make it best-effort.

### M2 — Member-removal invitation revoke is best-effort with a silent `.catch(() => 0)`, leaving the security hole it was meant to close
`packages/api/src/routers/members/removal.procedures.ts:108-116`

The revoke exists to close F-AUTH-04 (a stale, still-valid invitation token letting a removed member rejoin). It is wrapped in `.catch(() => 0)` with no logging/audit. If the revoke query fails for any reason, the removal still reports success while the pending invitation remains usable — i.e. the security gap stays open with zero signal. Removal and invitation-revoke are both tenant-DB writes; consider doing them in one tenant-DB transaction (or at least audit-logging the failure) rather than swallowing. Severity is bounded because the happy path works; flagged because the swallow specifically hides a security-relevant failure.

---

## LOW

### L1 — `cancelClassSlot` waitlist-promotion loop is effectively dead code in its primary path (not a bug)
`packages/services/src/class-slots.service.ts:284-300`

The slot row is set `isCancelled: true` at line 238, before the promotion loop. `promoteFromWaitlistInsideTx` requires `isCancelled = false`, so it returns `"full"` on the first iteration and the loop breaks immediately. This is **correct** (no members are stranded in a dead slot) and matches the in-code comment, but the loop never promotes anyone in the only caller. Harmless; noting so it isn't mistaken for working promotion-on-cancel behavior. If the intent was to re-home members into *other* live slots, that is not what this does.

### L2 — `incrementBooking` fallback diagnostic read is non-atomic relative to the conditional UPDATE (cosmetic only)
`packages/services/src/class-slots.service.ts:332-345`

When the atomic UPDATE affects 0 rows, a follow-up `findFirst` runs (outside any tx) to choose the error message ("not found" vs "cancelled" vs "full"). A concurrent mutation between the UPDATE and the read could yield a slightly wrong *message*. No state-correctness impact (the UPDATE already did the right thing); only the thrown string can be misleading under race. Low.

### L3 — `service-category-config` buffer refine cannot see per-service duration overrides (documented limitation)
`packages/api/src/routers/service-category-config.ts:38-60`

The `bufferTimeMinutes <= defaultDuration` refine only fires when `defaultDuration` is set, and only validates against the *category* default. Services that override the category with a **shorter** duration are not validated (and a category with no default falls back to the absolute `.max(480)`). The code comments this honestly. Correct as far as it goes; just not full coverage of the invariant. Low.

---

## Items verified OK (no finding)

- **Walk-in ownership check (security, F-CRM-09)** — `walk-in.service.ts:99-112`. Compares `pkg.clientId` against `[walkIn.customerId, walkIn.userId]`. Confirmed columns: `package_instances.client_id` is the CP user id (`appointment.service.ts:324` compares it to `params.userId`; `customer-directory.service.ts:408` queries it by userId); `payments.customer_id` = members.userId, `payments.user_id` = CP user.id. Including both candidates covers both id conventions; no obvious bypass. Sound.
- **Promo branch scope (F-CRM-06)** — `promotions.service.ts:153`. `promotion.branchId !== null && params.branchId !== promotion.branchId`. Drizzle returns `null` (not `undefined`) for nullable text, so null = org-wide is handled; POS passes `input.branchId`. Correct.
- **Promo atomic usage-limit guard (F-CRM-04)** — `promotions.service.ts:236-262`. Conditional UPDATE (`usageLimit IS NULL OR usageCount < usageLimit`) + `if (!updated) throw`, then insert usage — all inside `applyPromotion`'s tx. Concurrency-safe; correct ordering (claim before record).
- **`incrementBooking` atomic conditional UPDATE (F-SVC-09)** — `class-slots.service.ts:312-345`. WHERE gates `isCancelled = false AND spotsBooked < capacity`; dropping `&& !isCancelled` from `isAvailable` is safe because the row updated is never cancelled. Correct.
- **`addToWaitlist` FOR UPDATE + re-check (F-CRM-10)** — `waitlist.service.ts:52-110`. Lock, re-check, position-count, insert all inside one tx on `tx`. Correct.
- **`removeFromWaitlist` position compaction (F-CRM-05)** — `waitlist.service.ts`. Compaction runs in the same tx after the cancel; contiguous renumber 1..N. Correct.
- **`promoteFromWaitlistInsideTx` reorder** — capacity-claim now precedes the entry promotion (previously promoted then rolled back on full); `"full"` sentinel preserves the throwing contract via the public wrapper. Correct.
- **Import cycle check** — `class-slots → waitlist → notification`; `notification.service` imports neither waitlist nor class-slots; `waitlist → notification` is one-directional. **No cycle.**
- **`customerProfiles` upsert (F-CRM-07)** — `onConflictDoUpdate({ target: userId, targetWhere: isNotNull(userId), set })`. `undefined` fields are spread-skipped from `setObj`; explicit `null` clears. Targets the partial unique index correctly. Sound.
- **`appointment.service` package-lock recheck (F-SVC-05)** — `appointment.service.ts:576-606`. Gates only forward transitions (`confirmed/completed/rescheduled`) when `packageInstanceId` set; terminal `cancelled/no-show` exempt (frees credits); honors `allowCreditOverdraft`; reads under `.for("update")` inside the tx. Mirrors createAppointment. Correct; does not break legitimate cancels.
- **`goods-receipt.cancelReceipt` audit** — `poUpdate` and `poBefore` in scope; `writeAudit(tx, …)` signature matches (`db: TenantDb | TenantTx`); runs in the same tx. Router passes actor `{userId, memberId: member.id, role, branchId: hierarchyScopeId}`. Correct.
- **`suppliers.deactivateSupplier`** — blocks on open POs `IN (approved, ordered, partially_received)`. Reasonable enum values; correct.
- **`tax-rates` window validation** — create checks `effectiveUntil !== undefined && <= effectiveFrom`; update recomputes from existing row and guards `effectiveUntil != null` before compare. `effectiveUntil?: Date` (optional, not nullable) so undefined-check is right. Correct.
- **`invitation.resendInvitation` cooldown** — derives last-send from `expiresAt - TTL`; only enforces for `pending`; rejects within 5min via `InvitationResendCooldownError`. Router maps `error.name === "InvitationResendCooldownError"` → `TOO_MANY_REQUESTS`. Emails lowercased consistently at create and in revoke. `"declined"` is a valid status. Correct.
- **`liabilityByStaff` shape change (F-COM-07)** — now returns `{rows,totalCount,hasMore}`; fetches LIMIT+1 to detect truncation, trims to 500. Analytics procedure passes it through with **no `.output()` schema**, so the new shape is not rejected. **No other consumer references `liabilityByStaff`** (grep of apps/web, packages, apps/server found only the service + procedure). Contract change is safe.
- **`hierarchy/read.listNodes` permission** — `requirePermissionOrpc(tenantDb, member, "hierarchy_management", "read")`; both args null-checked above; `"hierarchy_management"` is a valid Resource. Signature matches guards.ts:117. Correct.
- **`members/status` GHL sync** — mirrors archive.procedures.ts pattern; `controlPanelDb` guarded non-null earlier (lines 73/205); dispatcher soft-fails via `.catch`. `DispatchStaffSyncFn`/`GhlSyncResult` exported from `./shared`. Correct.
- **`partner-stripe.createOnboardingUrl` RBAC (F-COM-09)** — adds `accessibleNodeIds.includes(member.hierarchyScopeId)` FORBIDDEN guard after the active-member check. Mirrors read-path branch guard. Correct.
- **`recurrence.endsOn >= fromDate` refine (F-SVC-06)** — builds `fromDate` from `YYYY-MM-DD` at UTC midnight, compares to `endsOn` datetime; `>=` allows same-day. `fromDate` field confirmed present. Correct.

---

## Summary
- HIGH: 1 (H1 — product-scoped promos unredeemable at POS)
- MED: 2 (M1 — tx-poisoning notify; M2 — silent invitation-revoke swallow)
- LOW: 3 (L1 dead promotion loop on cancel; L2 non-atomic error-message read; L3 buffer refine coverage gap)

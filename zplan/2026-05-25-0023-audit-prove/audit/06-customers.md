# Domain Customers

Audit of the Customers domain (gym members/clients — `customer_profiles`, `households`, walk-in flow, plus the staff-facing `member_profiles`). READ-ONLY audit. Repo root: `C:\Project\Avantej`.

Files audited:
- `packages/api/src/routers/customer-profiles.ts`
- `packages/api/src/routers/customer-directory.ts`
- `packages/api/src/routers/households.ts`
- `packages/api/src/routers/member-profiles.ts`
- `packages/services/src/customer-profile.service.ts`
- `packages/services/src/customer-directory.service.ts`
- `packages/services/src/member-profile.service.ts`
- `packages/services/src/walk-in.service.ts`
- (cross-ref) `apps/server/src/routers/customer-profiles.ts` (server overrides), `packages/api/src/routers/walk-in-customers.ts` (consumer of walk-in.service)

Key runtime fact: the shared `customerProfilesRouter` (base) is merged with `serverCustomerProfilesRouter` at runtime in both `packages/api/src/routers/index.ts:19-22` and `apps/server/src/index.ts:80-83`. The server spread is **last**, so `upsert` and `upsertForCustomer` are REPLACED by the GHL-sync-enabled server versions; `get`, `listLeadSources`, and the server-only `softDelete`/`restore`/`retryGhlSync`/`addEmailAndDispatchMagicLink`/`resendMagicLink` coexist.

## Endpoints / Procedures

### customer-profiles (`packages/api/src/routers/customer-profiles.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `get` | tenantProcedure | Get the session user's own customer profile | `getCustomerProfile` |
| `upsert` | tenantProcedure | Self-scoped profile upsert (partial; undefined=skip, null=clear). **Overridden at runtime by server `upsert`** | `upsertCustomerProfile` |
| `upsertForCustomer` | tenantProcedure + `customer_management:update` + scope check | Admin-scoped upsert of any client's profile. **Overridden at runtime by server `upsertForCustomer`** | `upsertCustomerProfile` |
| `listLeadSources` | tenantProcedure | Lookup of acquisition channels for pickers (inline query on `leadSources`) | inline (no service) |

Server overrides (`apps/server/src/routers/customer-profiles.ts`, wins at runtime):
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `upsert` | protectedProcedure | Self upsert + best-effort GHL `update` sync | `upsertCustomerProfile` + `fireCustomerSync` |
| `upsertForCustomer` | protectedProcedure + `customer_management:update` + scope | Admin upsert + GHL sync | `upsertCustomerProfile` + `fireCustomerSync` |
| `softDelete` | protectedProcedure + `customer_management:delete` + scope | Soft-delete client (`is_deleted=true`, `deletedSource='avantej'`) + GHL `delete` | inline update |
| `restore` | protectedProcedure + `customer_management:update` + scope | Restore soft-deleted client + GHL `update` | inline update |
| `retryGhlSync` | protectedProcedure + `customer_management:update` + scope | Manual GHL re-sync for a profile | `fireCustomerSync` |
| `addEmailAndDispatchMagicLink` | protectedProcedure + `customer_management:update` | Replace placeholder email on lead's user + magic-link | inline + better-auth |
| `resendMagicLink` | protectedProcedure + `customer_management:update` | Resend sign-in link to existing customer | better-auth |

### customer-directory (`packages/api/src/routers/customer-directory.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure + `customer_management:read` + branch guard | Paginated client directory with aggregated metrics + lifecycle status | `listCustomerDirectory` |
| `getStats` | tenantProcedure + `customer_management:read` + branch guard | KPI tile aggregates (total/active/lapsed/lead/avg LTV) | `getCustomerStats` |
| `getById` | tenantProcedure + `customer_management:read` + row-level scope | Full customer-360 detail for drawer | `getCustomerDetail` |

### households (`packages/api/src/routers/households.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `create` | tenantProcedure + `customer_management:update` | Create household, optionally bind primary contact (tx, deferrable FK) | inline (no service) |
| `addMember` | tenantProcedure + `customer_management:update` | Set `customer_profiles.householdId` for a profile | inline (no service) |
| `removeMember` | tenantProcedure + `customer_management:update` | Clear `householdId`; clears household primary-contact pointer if it was this profile | inline (no service) |
| `get` | tenantProcedure + `customer_management:read` | Fetch one household + its member profile rows | inline (no service) |
| `list` | tenantProcedure + `customer_management:read` + branch guard | List households scoped by branch/accessibleNodeIds (admin=all) | inline (no service) |

### member-profiles (`packages/api/src/routers/member-profiles.ts`)
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `get` | tenantProcedure + `user_management:read` | Get a staff member's profile (NOT a customer) | `getMemberProfile` |
| `upsert` | tenantProcedure + `user_management:update` | Upsert a staff member's profile | `upsertMemberProfile` |

### walk-in-customers (`packages/api/src/routers/walk-in-customers.ts`) — consumer of walk-in.service
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenantProcedure | **STUB** — returns hardcoded `{ items: [], total: 0 }` | none |
| `getById` | tenantProcedure | Deprecated — always throws BAD_REQUEST | none |
| `create` | tenantProcedure | Deprecated — always throws | none |
| `update` | tenantProcedure | Deprecated — always throws | none |
| `deactivate` | tenantProcedure | Deprecated — always throws | none |
| `convertToPackage` | tenantProcedure + `walk_in_customer_management:update` | Convert succeeded walk-in payment → package payment | `convertWalkInPaymentToPackage` |

## Logic Functions

### packages/services/src/customer-profile.service.ts
- `getCustomerProfile(tenantDb, userId)` — fetch one `customer_profiles` row by `user_id`. Called by base `get` and (cross-ref) used inside `upsertCustomerProfile`.
- `upsertCustomerProfile(tenantDb, params)` — partial upsert by `user_id`; undefined=skip column, null=clear. Called by base + server `upsert`/`upsertForCustomer`.

### packages/services/src/customer-directory.service.ts
- `listCustomerDirectory(controlPanelDb, tenantDb, orgId, params)` — raw-SQL aggregation of clients with lifecycle status + cross-DB name/email enrichment. Called by `customerDirectory.list`.
- `getCustomerStats(tenantDb, params)` — KPI aggregates. Called by `customerDirectory.getStats`.
- `getCustomerDetail(controlPanelDb, tenantDb, orgId, memberId)` — full detail bundle for drawer. Called by `customerDirectory.getById`.

### packages/services/src/member-profile.service.ts
- `getMemberProfile(tenantDb, memberId)` — fetch staff member profile. Called by `memberProfiles.get`.
- `upsertMemberProfile(tenantDb, memberId, data)` — `onConflictDoUpdate` upsert. Called by `memberProfiles.upsert`.

### packages/services/src/walk-in.service.ts
- `convertWalkInPaymentToPackage(tenantDb, params)` — atomic tx: validate succeeded+not-converted walk-in payment, insert linked package payment, mark original `converted`, append status history. Called only by `walkInCustomers.convertToPackage`. (No frontend caller — see P2 below.)

No orphan logic functions found — every exported service fn has at least one router caller.

## Gaps (prioritized)

### P1 — Walk-in customer directory is a hardcoded empty stub (`packages/api/src/routers/walk-in-customers.ts:16-18`) [status: missing | testable: false]
`list` returns a literal `{ items: [], total: 0 }` with no DB read; `getById`/`create`/`update`/`deactivate` are `deprecated()` throwers. The page **Walk-in Customers (`/dashboard/customers/walk-in/view`)** therefore renders permanently empty and has no path to create/list/edit walk-in records. This is the entire walk-in CRUD surface declared dead. `walk_in_customers` table exists (per MEMORY Phase 2S) but nothing in this domain reads/writes it.
persistence: none (stub returns constant; never queries `walk_in_customers`). Expected if implemented: `{ tenant, table: walk_in_customers, where: org+scope, expect: rows }`.

### P1 — Walk-in → package conversion has NO caller / no UI entry point (`packages/api/src/routers/walk-in-customers.ts:32-51`; service `walk-in.service.ts:54`) [status: partial | testable: true]
`convertToPackage` and `convertWalkInPaymentToPackage` are fully implemented (atomic, idempotent, status-history-aware) but grep across `apps/web/src` finds **zero** callers of `walkInCustomers.convertToPackage`. The "walk-in pays drop-in then upgrades to a pack" journey described in the service header is unreachable from the UI — a dead-end feature. The conversion is testable directly at the API boundary.
persistence: `{ tenant, table: payments, where: id=walkInPaymentId, expect: status='converted', metadata.convertedToPaymentId set }` + new row `{ table: payments, where: convertedFromPaymentId=walkInPaymentId, expect: status='succeeded' }` + `{ table: payment_status_history (via appendPaymentStatusHistory), where: paymentId=walkInPaymentId, expect: succeeded→converted }`.

### P1 — `customerDirectory.getStats` not documented in api-overview, plus `listLeadSources`/`getStats`/`convertToPackage` missing from doc (`zhub/shared/api-overview.md:161-172,565-569`) [status: implemented | testable: true]
Discrepancies vs `api-overview.md`:
- `customer-directory` section lists only `getById` + `list`; **`getStats` is missing** (router line 70).
- `customer-profiles` section lists `get`/`upsert`/`upsertForCustomer` but **omits `listLeadSources`** (router line 200) and all server-only procedures (`softDelete`, `restore`, `retryGhlSync`, `addEmailAndDispatchMagicLink`, `resendMagicLink`).
- `walk-in-customers` section lists only `list`; **omits `convertToPackage`, `getById`, `create`, `update`, `deactivate`**. It also implies `list` is functional when it is a stub.
- `households` and `member-profiles` routers **do not appear in api-overview at all**.
persistence: n/a (doc drift).

### P2 — `creditPoints` is write-only; no debit/spend path (`customer-profile.service.ts:72,106`; router `customer-profiles.ts:55,100-102`) [status: partial | testable: true]
`creditPoints` can be set/incremented via base `upsert` (and defaults to 0 on insert) but no procedure in this domain (or any frontend caller found) ever decrements/redeems it. The only frontend `creditPoints` references (`useAppointmentFormState.ts:604,761,779`) are placeholder `client` objects, not the persisted column. Note: the server-side `upsertForCustomer` schema (and base `upsertForCustomer`) deliberately omit `creditPoints`, so admins cannot adjust it for a customer — only the customer's own self `upsert` can. This is a lifecycle dead-end: a balance that fills but never drains.
persistence: `{ tenant, table: customer_profiles, where: user_id, expect: creditPoints monotonically non-decreasing — no spend op exists }`.

### P2 — Household membership has no branch/scope validation; cross-branch leakage on write (`households.ts:98-137,53-95`) [status: partial | testable: true]
`addMember` and `create` (with `primaryContactProfileId`) only check that the household and profile rows exist — they do NOT verify the target `customer_profiles` row belongs to a user within the caller's `accessibleNodeIds`. A staff member scoped to branch A can `addMember` a profile that belongs to branch B (or move a branch-B customer into their household) because the gate is just `customer_management:update` with no row-level scope check. Contrast: `customerDirectory.getById` and `upsertForCustomer` both enforce `accessibleNodeIds.includes(target.hierarchyScopeId)`. `list` IS scoped (line 256-312) but the mutations are not.
persistence: `{ tenant, table: customer_profiles, where: id=customerProfileId, expect: householdId set regardless of caller scope — should be FORBIDDEN if profile's member.hierarchyScopeId ∉ accessibleNodeIds }`.

### P2 — Household link change does not propagate to billing / dependents (`households.ts:97-187`) [status: partial | testable: true]
The router header says households exist "so a parent-payer can cover dependents," but `addMember`/`removeMember` only flip `customer_profiles.householdId`. There is no side-effect that re-points billing, outstanding installments, or payment ownership to the household primary contact, and no propagation when a member is added/removed. `getCustomerDetail` and `listCustomerDirectory` compute outstanding balance per-`user_id` (`customer-directory.service.ts:151-152,424-433`), ignoring household grouping entirely. So the "billing unit" semantics are declared but not implemented — household membership is a cosmetic tag.
persistence: `{ tenant, table: customer_profiles.householdId only; no write to payments/installments/household billing aggregation }`.

### P2 — Lifecycle status is derived-only with no `churned`/`lapsed` automation or transition record (`customer-directory.service.ts:97-147,318-327`) [status: partial | testable: true]
`lifecycleStatus` (lead/active/lapsed/churned) is computed on-read from visit recency + active packages. There is no stored status column, no scheduled job to flag churn, and nothing a customer "transitions through" — a churned customer silently flips back to active on a single visit with no event/audit. The directory `total` count is also approximate when `search` is used (only phone is matched in SQL; name/email filtered post-pagination in JS at lines 250-258), so paginated search results can under-report. Documented as a "known v1 limitation" (line 56-57) — intentional but a correctness gap for the directory page.
persistence: read-only derivation; no `customer_profiles` lifecycle column written.

### P3 — `member-profiles` upsert ignores partial-null semantics / no delete (`member-profile.service.ts:45-60`; router `member-profiles.ts:29-58`) [status: partial | testable: true]
Unlike `customer-profile.service`, `upsertMemberProfile` spreads `data` directly into both insert and `onConflictDoUpdate.set`; the router passes all six fields as plain `optional()` (not nullable). Fields the caller omits become `undefined` in the set object (Drizzle skips them on update — OK) but there is no way to CLEAR a field to null, and there is no `delete`/`deactivate` for a member profile. This is the staff-profile surface (`user_management` gated), included here only because the file is in the Customers domain bundle; minor.
persistence: `{ tenant, table: member_profiles, where: member_id, expect: upserted row; no clear-to-null, no delete }`.

### P3 — `customer-profiles.upsert` exposes `creditPoints` to self-service customers (`customer-profiles.ts:55`, base router) [status: implemented | testable: true]
The base self-scoped `upsert` accepts `creditPoints: z.number().int().min(0)`, letting a logged-in customer set their own loyalty/credit balance to any non-negative value. Combined with P2 (no debit path), this is an integrity concern: a client could self-grant credit. Note the server override of `upsert` keeps the same `creditPoints` field (`apps/server/.../customer-profiles.ts:41`). Likely unintended exposure rather than broken code.
persistence: `{ tenant, table: customer_profiles, where: user_id=self, expect: creditPoints settable by the customer themselves }`.

### P3 — No hard-delete / no household delete; households accumulate (`households.ts`) [status: missing | testable: false]
There is no `households.delete` or archive procedure. Once `removeMember` empties a household, the (now memberless) `households` row persists with no cleanup path and `list` will still surface it (admin path returns all). Minor data-hygiene gap.
persistence: `{ tenant, table: households, expect: orphan rows never removed }`.

---

## Summary (5 lines)
1. Walk-in customer CRUD is entirely stubbed/deprecated: `walkInCustomers.list` returns a hardcoded empty array and the page can never show or create walk-ins (P1, `walk-in-customers.ts:16-18`).
2. The only real walk-in logic — `convertWalkInPaymentToPackage` — is implemented and atomic but has zero UI callers, making the drop-in→package upgrade journey unreachable (P1).
3. `creditPoints` fills (settable even by the customer themselves) but no procedure ever debits it; households tag profiles but never propagate billing — both are declared-but-unimplemented lifecycle dead-ends (P2).
4. Household `addMember`/`create` lack the row-level `accessibleNodeIds` scope check that the directory and `upsertForCustomer` enforce, allowing cross-branch profile linking (P2).
5. api-overview.md is stale: missing `getStats`, `listLeadSources`, `convertToPackage`, all server-only customer-profile procedures, and the entire `households` + `member-profiles` routers (P1 doc drift).

Findings with `testable: true`: **7** (P1 walk-in conversion, P1 doc drift, P2 creditPoints no-debit, P2 household scope leak, P2 household no-propagation, P2 lifecycle/search approximation, P3 member-profile upsert, P3 self creditPoints exposure) — counting strictly: 8 testable:true / 2 testable:false. **8 findings are `testable: true`.**

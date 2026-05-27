# Domain 03-payouts — Payouts (batches, KPIs, mark-paid, Stripe Connect)

Audit scope (read-only):
- `packages/api/src/routers/payouts.ts`
- `apps/server/src/routers/stripe-connect.ts`
- `packages/services/src/payouts.service.ts`

Schemas referenced for verification:
- `packages/db/src/schema/tenant/payouts.ts`
- `packages/db/src/schema/tenant/payout-batches.ts`
- `packages/db/src/schema/tenant/partner-stripe-accounts.ts`
- `packages/db/src/schema/control-panel/org-country-stripe-accounts.ts`

## Endpoints / Procedures

### `packages/api/src/routers/payouts.ts`
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `list` | tenant + `commission_payout:read` | List payouts in tenant scoped by accessibleNodeIds, enriched with recipient names from control panel `user`. Returns `batchId`/`description`/`paymentMethod`. | inline query (no service fn) |
| `previewBatch` | tenant + `commission_payout:read` | Read-only preview of approved splits for staff×period that *would* be batched. | `previewBatch()` |
| `runBatch` | tenant + `commission_payout:process` | Process commission reversals, then lock+pay approved splits for staff×period (one payout per staff). | `processCommissionReversals()` then `runBatch()` |
| `recipientSummary` | tenant + `commission_payout:read` | Lifetime stats for a recipient (sum paid, avg/cycle, last paid). RBAC: non-admin must have recipient's hierarchyScopeId in accessibleNodeIds. | `recipientSummary()` |
| `processForRecipient` | tenant + `commission_payout:process` | Thin wrapper over `runBatch` for a single recipient (default period: 1st-of-month → now). | `processForRecipient()` → `runBatch()` |

### `apps/server/src/routers/stripe-connect.ts`
| Name | Auth | Purpose | Logic fn |
|------|------|---------|----------|
| `createOnboardingUrl` | protected | Build signed-state Stripe OAuth URL (Standard account). Writes nothing — pure URL build. | inline (`signOAuthState`) |
| `getAccountStatus` | protected | Read `org_country_stripe_accounts` (control-panel) and return first chargesEnabled row's flags. | inline DB select |
| `listCountryAccounts` | protected | List all per-country Stripe Connect accounts for an org from control-panel. | inline DB select |

NOTE: This router operates on **control-panel** `orgCountryStripeAccounts` — the **franchiser/org-level** Stripe Connect account (for receiving customer payments). It is **not** a partner/coach payout-recipient onboarding flow. The tenant table `partner_stripe_accounts` is never touched by this router (or anything else, see P1).

## Logic Functions

### `packages/services/src/payouts.service.ts`
- `processCommissionReversals(tenantDb, _actor)` — batch-process all unlinked commission-split reversals (where `payoutAdjustmentId IS NULL`); groups by staffId, inserts one negative payout per staff, links reversal rows back, flips fully-reversed splits to `status='reversed'`, writes audit log. Called by `runBatch` handler in router.
- `previewBatch(tenantDb, controlPanelDb, params)` — query approved splits for staff×period; aggregate per-staff totals; hydrate staff names; cap splits[] at 500. Read-only. Called by `previewBatch` procedure.
- `runBatch(tenantDb, params)` — transactional: `SELECT … FOR UPDATE` approved splits in range, insert one payout per staff (`status='paid'`, `paidAt=now`), flip splits to `status='paid'` + set `payoutId`, write audit log per payout + per split. Throws `EMPTY_BATCH` / `CONFLICT`. Called by `runBatch` and `processForRecipient` procedures.
- `recipientSummary(tenantDb, recipientId)` — two-query lifetime stats: SUM/MAX paid; recent 100 paid rows for avg/cycle. Called by `recipientSummary` procedure.
- `processForRecipient(tenantDb, params)` — defaults `periodStart` to first-of-month UTC, delegates to `runBatch`. Called by `processForRecipient` procedure.

### `apps/server/src/routers/stripe-connect.ts` (helpers exported)
- `signOAuthState(orgId, secret, countryCode?)` — HMAC-signed OAuth state (4-part `orgId.country.ts.sig`). Called by `createOnboardingUrl` and consumed by OAuth callback in `stripe-connect-oauth.routes.ts`.
- `verifyOAuthState(state, secret, maxAgeMs?)` — verifier, accepts legacy 3-part state. Called by OAuth callback route.
- `createStripeConnectRouter(_stripeClientOverride?)` — router factory; the override param is **dead** (`void _stripeClientOverride;` at line 187), kept "for parity" with other Stripe routers. Stripe SDK is not used in this router at all.

## Gaps (prioritized)

### P1 — Stripe webhook handler for partner payouts (`payout.created` / `payout.paid` / `payout.failed` / `transfer.*`) MISSING (`apps/server/src/routes/webhooks.routes.ts:326+`) [status: missing | testable: true]

`webhooks.routes.ts` only handles `account.updated` (line 326) — mirrors Connect onboarding flags. There is **zero** handler for `payout.created`, `payout.paid`, `payout.failed`, `payout.canceled`, `transfer.created`, `transfer.paid`, `transfer.failed`, or `transfer.reversed`. Consequences:
- `payouts.payoutMethod` schema enum includes `"stripe_connect"` (`packages/db/src/schema/tenant/payouts.ts:50`) and the row carries `stripeTransferId` / `stripePayoutId` columns (lines 23–24), but **no code path ever sets these or transitions a payout from `pending`→`processing`→`paid` based on Stripe events**.
- `runBatch` only inserts payouts with hard-coded `status='paid'` and `paymentMethod ∈ {bank_transfer,cash,check,other}` (`packages/services/src/payouts.service.ts:301,378`). The Stripe Connect lifecycle is unreachable from the live code path.
- Webhook idempotency exists (`webhook-dedupe.service`) but is irrelevant because no payout/transfer events are claimed.

**Repro**: trigger a Stripe `payout.paid` test event for the franchiser org's Connect account — server logs no handler match; no `payouts` row state change occurs.

persistence: `{ tenant: "<orgId>", table: "payouts", where: { stripeTransferId: "tr_test_*" }, expect: { status: "paid", paidAt: "<webhook event time>" } }` — **no row will be updated** (currently broken).

### P1 — `payout_batches` table is never populated by the live payout flow (`packages/services/src/payouts.service.ts:367`) [status: partial | testable: true]

`runBatch` inserts payout rows but never resolves/creates a `payout_batches` row and never sets `payouts.batchId`. The helpers `getOrCreatePayoutBatch` and `attachPayoutsToBatch` in `commission-splits.service.ts:1677, 1724` exist and are exported from `packages/services/src/index.ts:136-137` — but they are **ORPHAN**: only referenced by integration tests (`apps/server/src/tests/integration/commission-versioning.test.ts:41-42`) and zplan notes. No app code path calls them.

Consequences:
- `payouts.batchId` (FK to `payout_batches.id`, `packages/db/src/schema/tenant/payouts.ts:39-40`) is always `NULL` for real payouts.
- The UI shows "Last Batch" KPI inferred from `payouts.paidAt` aggregates (`apps/web/src/components/pages/commissions/payouts-tab.tsx:514-517`), not from a true batch row.
- `payout_batches.totalCents` is permanently `0` — the column exists but is unused; aggregation invariant SUM(payouts.amount where batchId=X) ≠ totalCents.
- Mid-cycle dispute reproduction (the documented purpose of the table per `packages/db/src/schema/tenant/payout-batches.ts:5`) is impossible.

**Repro**: call `payouts.runBatch`; query tenant `SELECT * FROM payout_batches`; expect a row keyed to (branchId, periodStart, periodEnd) — none is created. Query `SELECT batch_id FROM payouts WHERE recipient_id=<staff>`; expect non-null — it is null.

persistence: `{ tenant: "<orgId>", table: "payout_batches", where: { periodStart: "<input>", periodEnd: "<input>" }, expect: { status: "completed", totalCents: "<sum of payouts>", finalizedAt: "<now>" } }` — **no row created** (currently broken).

### P1 — `partner_stripe_accounts` table is entirely orphan (`packages/db/src/schema/tenant/partner-stripe-accounts.ts:18`) [status: missing | testable: false]

Grep confirms **only** the schema file and ERD doc reference `partnerStripeAccounts`. No router, service, or webhook reads or writes this table. The header comment promises "Stores Stripe Connect account information for any partner (coaches, trainers, etc.) who receives payouts" — but:
- No procedure exists to onboard a partner (no equivalent of `createOnboardingUrl` scoped to a tenant member).
- No procedure exists to read partner Stripe Connect status (`stripeConnectStatus`, `chargesEnabled`-equivalents).
- `payouts.stripeConnectAccountId` (line 28 of payouts.ts) is never populated.
- Manual `bankAccountLast4` / `bankAccountType` columns exist but no UI ever writes them.

This is the architectural counterpart of P1#1 — even if the webhook were added, there is no model for a coach to *be* a Stripe Connect destination.

### P2 — No `markPaid` / `confirmPayout` procedure for individual rows (`packages/api/src/routers/payouts.ts:22`) [status: missing | testable: true]

The router exposes only `runBatch` / `processForRecipient`, both of which insert payouts already at `status='paid'`. There is no procedure to:
- Mark an existing `pending` payout as `paid` (with reference + bank-last-4 capture).
- Take a `processing` payout to `paid` (would tie to Stripe webhook).
- Record manual confirmation in `manualPayoutConfirmedAt` / `manualPayoutConfirmedBy` columns (`payouts.ts:54-55`) outside the batch flow.

Since `runBatch` bypasses the `pending` state entirely, the schema's pending/processing states are unreachable from the live flow. The schema comment "lifecycle: pending → processing → paid/failed" (`payouts.ts:11`) does not match the implementation.

persistence: `{ tenant: "<orgId>", table: "payouts", where: { id: "<pendingPayoutId>" }, expect: { status: "paid", manualPayoutConfirmedAt: "<now>", manualPayoutConfirmedBy: "<userId>" } }` — no procedure exists to drive this.

### P2 — No `retryPayout` or `cancelPayout` (`packages/api/src/routers/payouts.ts:22`) [status: missing | testable: true]

`payouts.status` enum includes `failed` and `canceled` (`payouts.ts:57`), but:
- No procedure transitions a `failed` row back to `pending` for retry.
- No procedure transitions any row to `canceled`.
- `runBatch`'s catch on PG 23505 throws `CONFLICT` but there is no remediation path for an operator to clear the duplicate and proceed.

### P2 — No automation / cron for payout batches or overdue payouts (no scheduler entry) [status: missing | testable: false]

Per `CLAUDE.md` Cron table and `wrangler.jsonc`, scheduled handlers cover installment sweep, scheduled reports, notification dispatch, usage snapshot, Stripe reconciliation, tenant hard-delete, onboarding alerts — **no payout-related cron**. There is no monthly auto-batch (e.g. last-day-of-month auto-`runBatch` per branch), no stale-pending alerter, no Stripe Connect requirements-due reminder cron. All payout creation requires a human clicking "Run Batch" in `payouts-tab.tsx:567`.

### P2 — `runBatch` skips Stripe Connect requirements check (`packages/services/src/payouts.service.ts:368`) [status: missing | testable: true]

`runBatch` does not check the recipient's `partner_stripe_accounts.stripeConnectStatus` or `charges_enabled` / `payouts_enabled` flags before recording a payout. (Currently moot because partner_stripe_accounts is orphan, but if `paymentMethod: "stripe_connect"` were added to the enum, there's no gate preventing a payout against a `restricted` or `requirements_due` partner account.)

### P2 — `payouts.list` excludes appointment-less payouts for non-admins (`packages/api/src/routers/payouts.ts:54-62`) [status: partial | testable: true]

When `accessibleNodeIds` is set (non-admin), the query joins `appointments` and filters by `appointments.branchId IN accessibleNodeIds`. The handler comment (line 56) acknowledges that payouts from package/sales-order commissions have no `appointmentId` and are therefore **excluded** from non-admin lists. The reversal adjustment payouts inserted by `processCommissionReversals` always have `appointmentId: null` (`payouts.service.ts:94`) — so non-admins **cannot see their own clawback adjustments**. This is a real data-visibility gap.

**Repro**: as a non-admin staff member with hierarchy scope, refund a package-instance sale; `processCommissionReversals` creates a negative `payouts` row with `appointmentId=null`; call `payouts.list` as that staff member; the negative row is absent.

persistence: `{ tenant: "<orgId>", table: "payouts", where: { recipientId: "<staffUserId>", appointmentId: null, amount: "<0" }, expect: { visible_to_non_admin: true } }` — row exists but is filtered out.

### P2 — `recipientSummary.avgPerCycleCents` cycle-grouping uses calendar day (`packages/services/src/payouts.service.ts:500-509`) [status: partial | testable: true]

"Cycle" is defined as distinct `paidAt` calendar-day strings. If two `runBatch` calls land on the same day for different periods (e.g. retroactive Feb payout + March payout both run on March 31), they are collapsed into one cycle and the average is wrong. Also: reversal/adjustment payouts (negative amounts) are included in the sum (`status='paid'` filter doesn't distinguish payout type), so the average is dragged down.

### P2 — `previewBatch` count vs splits[] inconsistency under truncation (`packages/services/src/payouts.service.ts:265-289`) [status: partial | testable: true]

`count` and `totalAmountCents` are computed from the full `rows` (line 228), but `splits[]` is capped at 500 with `truncated: true`. `byStaff[]` is computed from the full set. The UI in `run-batch-drawer` (not owned but referenced) may iterate `splits[]` to compute its own sub-totals and get a different number than `totalAmountCents`. This is a money-display invariant risk if the UI ever recomputes from `splits[]`.

### P3 — No CSV export for payouts (`packages/api/src/routers/payouts.ts:22`) [status: missing | testable: true]

Commissions has `liability-csv-export` (cited in e2e specs `commissions-liability-csv-export.journey.spec.ts`), but the payouts surface has no CSV export procedure. The UI footer at `payouts-tab.tsx:597-603` shows only a count, no download button. Operators wanting reconciliation data must scrape the table or query DB directly.

### P3 — `payouts.currency` defaults to `"usd"` (`packages/db/src/schema/tenant/payouts.ts:47`) [status: partial | testable: false]

Schema default is `"usd"`. `runBatch` and `processCommissionReversals` both hard-code `"myr"` on insert (`payouts.service.ts:90, 376`), but any legacy row or future code path that omits the field will fall back to USD. Inconsistent with the rest of the codebase (MYR-only).

### P3 — Audit-log emission for `runBatch` is per-split inside the same transaction (`packages/services/src/payouts.service.ts:425-434`) [status: partial | testable: false]

Each commission split flipped to `paid` writes one `audit_log` row (line 426-433). For a 500-split batch, that's 500+ audit inserts inside the same transaction as the payout work. Performance risk; also if `writeAudit` ever throws, the entire batch aborts. (Likely intentional for traceability — flagged as "possibly intentional".)

### P3 — `runBatch` aggregate may underreport if reversals are mixed in (`packages/services/src/payouts.service.ts:228, 437`) [status: partial | testable: false]

`previewBatch.totalAmountCents` sums `calculatedAmount` (always ≥ 0 because splits are filtered to `status='approved'`). `runBatch.totalAmountCents` also sums positive split amounts. But `processCommissionReversals` (called first in the `runBatch` *procedure*, payouts.ts:190) creates negative `payouts` rows that are not reflected in the returned `totalAmountCents`. The caller's success toast (`useRunBatch.successMessage`, `apps/web/src/features/payouts/api.ts:201-202`) will tell the user "RM X paid" even though net cash out the door is X minus the reversals already pushed in.

### P3 — Unused override param in `createStripeConnectRouter` (`apps/server/src/routers/stripe-connect.ts:181-187`) [status: partial | testable: false]

`_stripeClientOverride` is accepted then explicitly voided. Dead code; should be removed unless a future caller injects a stub.

### P3 — `getEnvVar` requires `cloudflare:workers` at runtime (`apps/server/src/routers/stripe-connect.ts:43-56`) [status: partial | testable: false]

Wrapped in try/catch and falls through to `globalThis.env` then `process.env`. Works, but spreads env-resolution logic across routers. Should be a single helper from `apps/server/src/lib/env.ts` (if exists).

---

## Orphan/dead-code summary
- `partnerStripeAccounts` schema table — **completely orphan** (P1).
- `getOrCreatePayoutBatch`, `attachPayoutsToBatch` — exported from `packages/services/src/index.ts:136-137` but called only by tests (P1).
- `_stripeClientOverride` param in `createStripeConnectRouter` — dead (P3).
- `payouts.stripeTransferId`, `stripePayoutId`, `stripeConnectAccountId`, `scheduledAt`, `bankAccountLast4` columns — never written by any code path (P1/P2 by-product).

## Money invariant risks
- SUM(payouts.amount) for a batch ≠ `payout_batches.totalCents` (always 0). (P1)
- Negative reversal payouts are included in `recipientSummary.totalPaid` SUM (`payouts.service.ts:480`) — correctly *reduces* lifetime paid, but `lastPayoutAt` becomes the date of a clawback, which is misleading.
- `runBatch.totalAmountCents` doesn't include reversal adjustments executed in the same call.

## Testable-true count
P1#1 (Stripe webhook), P1#2 (payout_batches), P2#1 (markPaid), P2#2 (retry/cancel), P2#4 (Stripe Connect gate), P2#5 (non-admin visibility), P2#6 (cycle grouping), P2#7 (truncation), P3#1 (CSV). **9 testable-true findings.**

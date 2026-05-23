# Phase 8 — Runtime Perimeter Hardening

Date drafted: 2026-05-23
Context: Phases 1–7 + deferred A/B/C/D hardened visible code quality (forms, route guards, dead code, tests, taxonomy, PDF in cron). A gap audit on the post-hardening state revealed that the **runtime perimeter** was never in scope: rate limiting, audit log, observability, cron correctness, health endpoints, and several stub TODOs in production paths.

This plan is scoped to those gaps only. It is **not** a feature plan.

---

## Goal

Close the launch-blocking runtime gaps so the system can survive first contact with real traffic and a real on-call rotation.

## Out of scope

- New product features
- Schema redesigns beyond the two flagged numeric→integer conversions
- The previously-flagged-then-corrected `hierarchy.ts` "admin bypass" (re-classified as a design choice, not a bug)
- Cosmetic `invitations.ts` dynamic-import refactor (deferred indefinitely; cosmetic only)

## Revision history

- 2026-05-23 drafted (8.1–8.7 from sweep 1)
- 2026-05-23 expanded (8.8–8.12 + tightened internal gaps from sweep 2)
- 2026-05-23 **verification pass**: read the actual code for every high-severity sweep-2 finding. Three were false alarms or overstated. See "Verified findings" section below.

## Verified findings (post-sweep-2 reality check)

| Sweep-2 claim | Verified status | Notes |
|---|---|---|
| 8.8.1 OAuth state has no HMAC | ✅ **Real** | `google-calendar.ts:32-34, 57-64` — `btoa(JSON.stringify(...))` + `JSON.parse(atob(...))`. No signature. Exploit requires victim's userId+orgId; not remote-unauth, but standard OAuth-state CSRF gap. Severity: **High** (downgraded from Critical). |
| 8.8.2 Plaintext OAuth tokens at rest | ✅ **Real** | `google-calendar.ts:89-112` — `tokens.access_token` + `refreshToken` inserted directly into `googleCalendarConnections`. No encryption layer. Threat model: DB compromise → live tokens leak. Severity: **High**. |
| 8.9.1 `processRefund` no idempotency | ❌ **False alarm** | `refunds.service.ts:765-781` — function IS in a `tenantDb.transaction(...)`, uses `for("update")` row lock, and the status-machine guard (`status !== "approved"` throws BAD_REQUEST) makes it idempotent. A second call after status='processed' returns an error, not a second refund. **Removed from plan.** |
| 8.9.2 `cancelPurchaseOrder` not in transaction | ⚠️ **Real but currently harmless** | `purchase-orders.service.ts:263-290` — does SELECT then UPDATE outside a transaction. Concurrent execution sets `status='cancelled'` from both calls → idempotent outcome. Becomes a real bug only when audit-log / stock-reversal side effects are added (which 8.4 will do). **Keep, demoted to defense-in-depth.** |
| 8.10 Unbounded list reads | ⚠️ **Partially real** | Verified per-service: `sales-orders`, `expenses`, `announcements`, `purchase-orders`, `promotions`, `commission-splits`, `class-slots` all default `limit=50`. **Actually unbounded**: `customers-v2`, `appointments`, `walk-in-customers`, `tax-rates` (last is bounded by domain, OK). **`payouts` hard-codes `.limit(100)`** with no input control. Scope narrowed to 4 services. |
| 8.1.3 Scheduled-reports infinite re-fire | ⚠️ **Real edge case** | `scheduled-reports.service.ts:116-131` — on the happy path, `markScheduledReportFailed` works. The "infinite loop" only occurs if BOTH the send AND the failure-mark fail (rare). Demoted from High → Low. |
| 8.12 No Resend bounce webhook | ✅ **Real** | `grep -rn "resend\|bounce\|complaint" apps/server/src/routes/` returns zero. Confirmed. |

---

## Phases

### Phase 8.1 — Cron correctness  (blocking)

| # | Where | What |
|---|---|---|
| 1 | `apps/server/src/index.ts:382-383` | Replace the daily-02:00 `console.log("...stub")` with a real call into the installment-sweep service. If the service doesn't yet exist, write one + a unit test. |
| 2 | `apps/server/src/services/scheduled-reports.cron.test.ts` | Add a PDF-branch test (mock `jspdf` dynamic import; assert `attachments[0]` is built; assert CSV branch still works). |
| 3 | `apps/server/src/services/scheduled-reports.service.ts:116-131` | Edge case (verified rare): only occurs when BOTH `sendSingleReport` AND `markScheduledReportFailed` fail in the same tick. Add a simple `failureCount` column + skip-row guard so a permanently-broken row stops looping after N attempts. Low priority. |

**Verification:** `bun test apps/server/src/services/scheduled-reports.cron.test.ts` passes; new installment-sweep test passes; manual trigger of `scheduled()` with cron `0 2 * * *` runs the sweep against test data.

---

### Phase 8.2 — Auth perimeter  (blocking)

| # | Where | What |
|---|---|---|
| 1 | Decide: `@upstash/ratelimit` vs Cloudflare native rate-limiting binding. Pre-commit to Cloudflare native. | Document decision in `docs/RATE_LIMITING.md`. |
| 2 | `apps/server/src/index.ts` middleware | Add a rate-limit middleware that gates these procedure paths: `auth.login`, `auth.acceptWithSignup`, `invitations.accept`, `onboarding.redeemInvite`, password-reset endpoints. |
| 3 | `apps/server/src/index.ts` | Add `GET /health` (200 always) and `GET /ready` (200 only if control-panel DB pings). Both unauthenticated. |

**Rate-limit spec (tightened from sweep 2):**
- Key shape: `${route}:${clientIp}` for pre-auth endpoints, `${route}:${userId}` once a session exists.
- Client IP from `CF-Connecting-IP` header (Cloudflare-native, IPv6-safe, immune to `X-Forwarded-For` spoofing).
- Limits: `auth.login` = 10 req / IP / 60s, `invitations.accept` = 5 req / IP / 60s, password-reset = 3 req / IP / 5min.
- Storage: Cloudflare native rate-limit binding (Workers KV is too slow for this).

**`/ready` semantics (tightened from sweep 2):**
- `/ready` checks **control-panel DB only** — returns 200 if CP pings, 503 otherwise.
- Tenant DBs are NOT in `/ready`: a single bad Neon branch must not turn into a global outage. Tenant health is reported per-request.
- Add separate `/ready/tenant/:orgId` (authenticated) for tenant-specific probing if needed later.

**Verification:** Loop a script that hits `auth.login` 100× from one IP — should 429 by request ~10. `/health` and `/ready` return 200 in dev.

---

### Phase 8.3 — Observability + log hygiene  (high)

| # | Where | What |
|---|---|---|
| 1 | New file `apps/server/src/lib/logger.ts` | Thin wrapper (`log.info`, `log.warn`, `log.error` with structured payload). Initially backs to `console.*`; later swap to Sentry/Logpush by changing one file. |
| 2 | `apps/server/src/services/auth.service.ts:87,213,272` | Replace password-reset `console.log` calls with `log.info` and **strip token values from the payload**. |
| 3 | `apps/server/src/services/dispute.service.ts` (10 sites) | Replace `console.*` with `log.*`. |
| 4 | `apps/server/src/services/gohighlevel.service.ts:871,1195,1205` | Same. Errors should carry `{ orgId, customerId, error }` payload. |
| 5 | `packages/api/src/routers/hierarchy.ts` (12 sites) | Same. |
| 6 | `apps/server/src/services/scheduled-reports.service.ts` | Same — currently uses `console.error` on PDF failure; structured log is more useful for the cron rotation. |
| 7 | `apps/web/src/routes/subscribe.tsx:134,138,143` | Remove `[checkout] click` etc. debug logs. |
| 8 | `apps/web/src/routes/_authenticated/dashboard/_layout/reports/view.tsx:764` | Surface PDF-export errors as a toast (currently swallowed by `console.error`). |
| 9 | `apps/server/src/routes/google-calendar.ts:116` | Replace `console.error` in OAuth catch (also covered by 8.8 logger spec). |
| 10 | `apps/server/src/routes/stripe-connect-oauth.routes.ts:59,69,74,109,115,121,132,172` | 8 sites — replace with `log.*`. |
| 11 | `apps/server/src/routes/webhooks.routes.ts:188,194,202,257` | 4 sites — replace with `log.*`. Webhook handlers are exactly where structured logs matter most. |

**Logger destination (tightened from sweep 2):**
- Initial backend: `console.*` calls. Cloudflare tails picks them up.
- **Decision pre-committed**: target binding is Cloudflare Logpush → Logflare (or Sentry if a Cloudflare→Sentry binding is added later).
- JSON-serialisation contract: every `log.error(message, err, payload)` MUST call `err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err` — raw `Error` objects stringify to `{}`.
- Payload must be plain-object-serialisable. No circular refs, no functions, no BigInt without `.toString()`.

**Verification:** `grep -rn "console.log\|console.warn\|console.error" apps/server/src/ packages/ --include="*.ts" | grep -v test | grep -v ".d.ts"` should drop to near zero.

---

### Phase 8.4 — Audit log  (high)

| # | Where | What |
|---|---|---|
| 1 | `packages/db/src/schema/tenant/audit-log.ts` | New table: `id, actorMemberId, actorUserId, resource, resourceId, action, payload (jsonb), ipAddress, userAgent, createdAt`. Idempotent migration via the tenant-migrations workflow. |
| 2 | `packages/services/src/audit.service.ts` | `writeAuditEntry(tenantDb, params)` helper. |
| 3 | `apps/server/src/routers/admin.ts:1008` | Wire the helper into admin mutations. Remove the TODO. |
| 4 | Mutation handlers: `refunds.*`, `purchase-orders.cancel`, `purchase-orders.approve`, `members.deactivate`, `roles.update`, `permissions.update` | Wrap each with an `audit` write. Use a small `withAudit(...)` higher-order helper to avoid copy-paste. |

**`withAudit` ordering (tightened from sweep 2):**
- Audit write runs **inside the same `tenantDb.transaction(...)`** as the mutation. If audit-log insert fails, the mutation rolls back.
- Trade-off accepted: this forces every wired handler to expose `tx` to the helper. We'd rather error loudly than silently lose audit rows.
- Alternative considered (post-commit via `ctx.waitUntil`) rejected: silent loss + harder debugging.
- Signature: `withAudit(tx, { resource, resourceId, action, actor, payload }, mutationFn) → Promise<T>`.

**Audit schema constraints (tightened from sweep 2):**
- `actorMemberId` FK → `members.id` with `onDelete: "set null"` (preserve history if a member is deleted; we still have `actorUserId` as a text snapshot).
- Confirm `members.id` has a unique CONSTRAINT (not just an INDEX) before migration — per the codebase rule.
- `actorUserId text` (cross-DB ref, no FK).
- `payload jsonb NOT NULL DEFAULT '{}'::jsonb` — never null.

**Verification:** Issue a refund in dev → row appears in `audit_log` with the correct payload. Type-check passes. Fault-injection: a mock audit-write failure rolls back the refund.

---

### Phase 8.5 — Money + destructive UX  (medium)

| # | Where | What |
|---|---|---|
| 1 | `packages/db/src/schema/tenant/products.ts:19` | Convert `conversionFactor` from `numeric(12,4)` to integer (basis points × 10000). Migration must backfill existing rows. **Rounding rule: half-away-from-zero** (matches `Math.round` semantics in TypeScript). Document in the migration comment. |
| 2 | `packages/db/src/schema/tenant/units-of-measure.ts:10` | Same conversion + same rounding rule. |
| 3 | `apps/web/src/routes/_authenticated/dashboard/_layout/refunds/view.tsx` | Wrap refund-issue action in `AlertDialog`. |
| 4 | `apps/web/src/routes/_authenticated/dashboard/_layout/purchase-orders/view.tsx` | Wrap cancel + approve actions in `AlertDialog`. |
| 5 | `apps/server/src/services/auth.service.test.ts:328` | Replace `expect(true).toBe(true)` placeholder with a real assertion for the email-enumeration negative case. |

**Verification:** Existing tests pass; new AlertDialog renders in browser; bun test for auth service shows the placeholder test now exercises a real path.

---

### Phase 8.6 — Tenant lifecycle  (medium)

| # | Where | What |
|---|---|---|
| 1 | `apps/server/src/routes/organizations.routes.ts:501` | Replace `// TODO: Delete Neon project via API` with a real Neon API call (or a Cloudflare Queue job that handles it asynchronously). |
| 2 | Document in `docs/TENANT_DELETION_RUNBOOK.md` | What happens on org delete: branch fate, billing fate, audit-log fate. |

**Verification:** Delete a test org → Neon branch disappears within X minutes; audit log row written first.

---

### Phase 8.7 — Dead-code + doc sweep  (low)

| # | Where | What |
|---|---|---|
| 1 | `apps/server/src/services/permission.service.ts` (92 lines) | **Delete.** Unused stub; the real one is `packages/services/src/permission.service.ts`. Survived Phase 1 because it isn't imported anywhere — Phase 1 grep only found in-component dead code. |
| 2 | `README.md` (project root) | Update to (a) drop the implication that `bun db:push` is safe for tenant DBs, (b) mention `bun verify:migrations`, (c) document the Phase 5 cron triggers and `bun test` / `bunx playwright test` commands. CLAUDE.md and README currently disagree. |
| 3 | `docs/SCHEMA_CHANGE_WORKFLOW.md` | Confirm it mentions the Phase 2S additions (`purchase_orders`, `promotions`, `walk_in_customers`, `tax_rates`). If not, append. |

**Verification:** Type-check + tests still pass after removal. README → CLAUDE.md → docs/ chain is consistent.

---

### Phase 8.8 — OAuth integrity + token-at-rest  (blocking — sweep 2 finding)

| # | Where | What |
|---|---|---|
| 1 | `apps/server/src/routes/google-calendar.ts:32,57-59` | **Security bug.** `state` is `btoa(JSON.stringify({orgId, userId, returnUrl}))` with no HMAC, no nonce. A forged state lets an attacker bind their Google account to a victim's org. Fix: HMAC-sign state with a server secret + include a random nonce stored against the user's session. Match the pattern from `stripe-connect-oauth.routes.ts`. |
| 2 | `apps/server/src/routes/google-calendar.ts:89-112` | **Security bug.** `accessToken` and `refreshToken` are persisted to `googleCalendarConnections` in plaintext. Any DB read leaks live tokens. Fix: wrap with `AES-GCM` encryption using a Worker secret as the key; expose `getDecryptedToken(connectionId)` helper. |
| 3 | New `docs/SECRETS_ROTATION.md` | Document the GOOGLE_CAL_STATE_SECRET + GOOGLE_CAL_TOKEN_KEY env vars and how to rotate them. |

**Verification:** Unit-test: forging a state token without the HMAC is rejected. Manual: existing connections re-encrypted via a one-shot migration script (or re-OAuth-on-first-use fallback). Tokens at rest are not parseable as JWT.

---

### Phase 8.9 — Transaction-boundary hygiene  (low — defense-in-depth, sweep 2 finding revised)

Original draft included refund idempotency. Verification showed `processRefund` is already safe (transaction + row lock + status-machine guard). Scope reduced.

| # | Where | What |
|---|---|---|
| 1 | `packages/services/src/purchase-orders.service.ts:263-290` | Wrap `cancelPurchaseOrder` SELECT + UPDATE in `tenantDb.transaction(...)`. Required before 8.4 adds audit + stock-reversal side effects (without a transaction, audit might write while the mutation rolls back). |
| 2 | Phase-3 destructive flows scan | Audit `expenses.approve`, `walk-in-customers.merge`, `promotions.applyCode`, `commission-splits.recompute`. Wrap any multi-step mutation that 8.4 will hook audit into. |

**Verification:** Fault-injection test for `cancelPurchaseOrder` after 8.4 wiring — fail mid-call, assert no audit-orphan and no half-cancelled row.

---

### Phase 8.10 — Pagination on the four genuinely-unbounded services  (medium — sweep 2 finding, scope verified)

Verification scoped this down. Confirmed paginated already (no work): `sales-orders`, `expenses`, `announcements`, `purchase-orders`, `promotions`, `commission-splits`, `class-slots`. Bounded-by-domain (no work): `tax-rates`.

| # | Where | What |
|---|---|---|
| 1 | `packages/services/src/customers-v2.service.ts` | Add `limit` (default 50, max 200) + `offset` to `listCustomers`. Update router input schema. |
| 2 | `packages/services/src/appointments.service.ts` | Same — `listAppointments` returns all rows for a window. |
| 3 | `packages/services/src/walk-in-customers.service.ts` | Same — no pagination at all today. |
| 4 | `packages/services/src/payouts.service.ts` | Currently hard-codes `.limit(100)`. Promote to caller-controlled (default 50, max 200). |
| 5 | Web pages calling the above 4 | Switch to `useInfiniteQuery` only if the list can realistically exceed 200 rows in the visible window. For most pages a 50-row default with "load more" is fine. |

**Verification:** Seed a dev tenant with 10,000 customer rows; load customers page; only 50 rows fetched on initial load.

---

### Phase 8.11 — Test gaps (security + multi-tenancy)  (medium — sweep 2 finding)

| # | Where | What |
|---|---|---|
| 1 | New `apps/server/src/tests/integration/multi-tenant-isolation.test.ts` | Assert: a session for org A's member cannot read/write org B's data via any of the Phase-3 routers. At least 1 test per data-bearing router. |
| 2 | `apps/server/src/tests/unit/routers/` — add negative-permission tests for: `expenses`, `announcements`, `class-slots`, `walk-in-customers`, `tax-rates`, `promotions`, `purchase-orders`, `commission-splits`, `waitlist`, `member-profile` | Each: staff role *without* the relevant permission gets FORBIDDEN. |
| 3 | `apps/server/src/services/scheduled-reports.cron.test.ts` | Add a "Resend bounce" branch — if a recipient's email bounces, the row should be marked + alerted, not silently retried forever. Pairs with Phase 8.12 below if we add bounce handling. |

**Verification:** `bun test` green. Coverage delta visible.

---

### Phase 8.12 — Email bounce/complaint handling  (medium — sweep 2 finding)

| # | Where | What |
|---|---|---|
| 1 | `apps/server/src/routes/webhooks.routes.ts` or new `apps/server/src/routes/resend-webhook.routes.ts` | Add a Resend webhook endpoint (`POST /webhooks/resend`). Verify the `Resend-Webhook-Signature` per Resend docs. |
| 2 | Tenant schema: new table `email_suppression_list` | `id, email (unique), reason (bounce|complaint|unsubscribe), suppressedAt`. |
| 3 | `apps/server/src/lib/email.ts` | Before sending, check the suppression list. If any recipient is suppressed, drop them from the `to:` array; if all are suppressed, throw. |
| 4 | `scheduled-reports` UI | Show a warning if any of the configured recipients is on the suppression list. |

**Verification:** Send a hard-bounce email in dev → webhook receives → email added to suppression list → next send to that address is dropped.

---

## Sequencing rationale (revised after verification)

- **8.8 (OAuth security) first**: OAuth-state CSRF + plaintext refresh tokens. Both verified real. Smallest blast radius to fix.
- **8.1 + 8.2 next**: Cron-stub + brute-forceable auth tick autonomously in production.
- **8.3 + 8.4**: Observability + audit log together. 8.4 depends on 8.9 first (transaction wrapping).
- **8.9 (transactions only — idempotency removed)**: Quick prerequisite for 8.4's audit wiring.
- **8.10 (pagination on 4 services)**: Reduced scope; can happen anytime before launch traffic.
- **8.11 + 8.12**: Tests + bounce handling. Don't block launch but compound incidents.
- **8.5 + 8.6**: Polish + lifecycle correctness.
- **8.7 last**: Dead code + docs; trivial.

Revised ordering: **8.8 → 8.1 → 8.2 → 8.9 → 8.3 → 8.4 → 8.10 → 8.11 → 8.12 → 8.5 → 8.6 → 8.7**

## Risks

- **Rate-limit decision** could become a yak-shave. Pre-commit to Cloudflare native binding (decision noted above) unless we discover a real reason to switch.
- **Audit log writer** in a Worker context: the write must not block the request response. Either fire-and-forget within `ctx.waitUntil`, or accept the latency. Decide in 8.4.
- **Numeric→integer migration** on existing tenants: backfill must round consistently. Stage the migration on a dev branch first.

## Effort estimate

| Phase | Estimate |
|---|---|
| 8.1 | 2-4h (depends on installment-sweep service shape) |
| 8.2 | 3-4h (rate-limit binding + /health/ready + spec doc) |
| 8.3 | 4h (logger wrapper + ~40 call sites including sweep-2 additions) |
| 8.4 | 5-7h (schema + helper + 6 wirings + fault-injection test) |
| 8.5 | 2-3h |
| 8.6 | 2-4h (Neon API surface unknown) |
| 8.7 | 1h (delete + 2 doc updates) |
| 8.8 | 4-6h (HMAC state + token encryption + migration script) |
| 8.9 | 1-2h (just wrap `cancelPurchaseOrder` + audit Phase-3 destructive flows; refund idempotency removed) |
| 8.10 | 2-4h (4 services + matching frontend pages; cursor pagination NOT required) |
| 8.11 | 4-6h (negative-permission tests + isolation tests) |
| 8.12 | 3-4h (webhook + suppression table + send-time check) |
| **Total** | **32–51h** (down from 40–61h after verification removed 8.9.1 and narrowed 8.10) |

## Verification gate before declaring Phase 8 done

1. `bun check-types` clean
2. `bun test` (server) green
3. `bun run test` (web vitest) green — modulo the pre-existing AppointmentList failure
4. Manual smoke: log in, trigger a refund, see audit-log row, see structured log entry, hit `/health` returns 200
5. Run another gap-audit agent — should report no high-severity findings remaining

# SaaS Platform — Architecture Deepening Review

**Date:** 2026-06-02 · **Branch:** `feature-saas` · **Scope:** Avantej platform layer (control-panel + `apps/server/src/routers/platform-admin-*`, billing/subscriptions/tiers, webhooks/reconciliation, Stripe Connect/payments/ledger, tenant lifecycle, health/revenue/usage, comms, multi-tenant plumbing).

**Method:** 9 read-only area surveys (each fed its decided ADRs) → dedup/cluster (41 raw findings → 19 candidates) → adversarial per-candidate verification (deletion test + speculative-seam kill + ADR-conflict check). 29 agents. 0 rejected, 1 weak.

**Lens:** architecture *depth* only (per `improve-codebase-architecture`). This pass does **not** cover UX/feature-level polish — that's a separate lens.

**Vocabulary:** _module / interface / depth / shallow / seam / adapter / leverage / locality / deletion-test_ (see skill `LANGUAGE.md`); domain terms per `CONTEXT.md` (Avantej, Tenant, SaaS Subscription, Application Fee, Platform Admin).

---

## Zoom-out: the one architectural story

The platform-admin layer was built **router-by-router** (Plan E/F phases, split by concern per ADR-0022) but **without the shared deep modules every router needs**. Result: the layer is **wide and shallow** — 40+ thin routers each *re-deriving the same platform facts inline*, instead of a few deep modules the routers consume.

Four cross-cutting concerns are copy-pasted across the layer:

| Concern | Copies today | Should be |
|---|---|---|
| **The gate** (`requirePlatformAdmin` + `cpDb` + `adminUserId`) | **23** verbatim copies, already drifted | one base procedure |
| **The audit write** (`admin_session_actions` insert) | **33** open-coded sites, 3 incompatible failure policies | one audit helper |
| **Tier / subscription truth** (effective tier, app-fee, status→capability) | 6–9 divergent reimplementations | one resolver |
| **Stripe projection** (connect-account pick, event→ledger args) | per charge-site / per webhook-writer | one resolver / one projector |

The striking part: **the ADRs already designed these deep seams** — ADR-0010 named the tier-enforcement primitives, ADR-0024 specified a lifecycle state machine, ADR-0006 put idempotency behind one interface, ADR-0018 defined the ledger taxonomy with a "MUST NOT duplicate" rule, ADR-0017 named the connect-account resolver. **The implementations drifted into per-router copies and the seams were never finished.**

So "simplify" here is not new architecture. It's **collapsing the copies back behind the seams the ADRs already specified.** Every candidate below is consolidation or finishing-a-designed-seam — none is a speculative new abstraction (the verify pass rejected those).

A second consequence of the copy-paste: **the copies drifted into live bugs.** Those are listed separately because they're worth fixing regardless of whether you do the refactor.

---

## Bugs surfaced (fix regardless of refactor)

| # | Bug | Where | Candidate |
|---|---|---|---|
| B1 | Cancelled/unpaid **enterprise** tenant keeps the **1.5%** app fee (lowest) instead of the 3% fallback — Avantej **under-collects on dead tenants**. `subscriptions.tier` read with **no status filter**. | `connect-account.service.ts:42` (feeds 5 charge sites in `payments.ts`) | C4 |
| B2 | `determineTier` classifies checkout by amount (`>=29900→enterprise`) contradicting `TIER_PRICES` (enterprise=49900); `$299→enterprise` though no $299 tier exists. `getTierOrgLimit` returns 10/3/1 vs `TIER_LIMITS` MAX/5/1. **Both functions are dead** (no live caller) — landmines if checkout-completion is ever wired. | `payment.service.ts:36,51` | C5 |
| B3 | **Tier feature flags are never enforced.** A basic-tier tenant (`features.ghl/commissionSplits/memberships=false`) can call every one of those procedures — they gate on RBAC only. ADR-0010's `requireTierFeature`/`assertWithinLimit` were never coded (zero grep matches). | `ghl-sync.ts`, `commission-splits.ts`, `memberships.ts` | C6 |
| B4 | `requireActiveSaaSSub` middleware **wraps zero procedures** → trial-expiry/past-due blocks **nobody**. ADR-0003's SaaS gate is phantom. | `require-active-saas-sub.middleware.ts` | C17 (reopens ADR-0003) |
| B5 | Backfill cron **never inserts a `processed_webhook_events` row** → recovered events get **re-processed every hour**; idempotency lives in two tables keyed differently. | `webhook-backfill.service.ts:141,174` | C8 |
| B6 | Bulk comms **swallow** per-channel failures (`console.error` only, never surfaced); single vs bulk send accept **different validation** (subject min 3/1, body max 5000/20000). | `platform-admin-tenants-comms.ts` | C15 |
| B7 | Snapshot UPSERT: `storageBytes:0` is in `.values` but **absent from `.set`** → silently not updated on conflict. Benign now (hardcoded 0); landmine for the next divergent factor. | `tenant-usage-snapshot.service.ts:226` | C18 |
| B8 | Security `escapeHtml` hand-copied into 3 prod files, **already drifted** (`&#039;` vs `&#39;`); the test asserts XSS behaviour against a **4th private clone** → coverage is fake. | comms / onboarding-alerts / payment-side-effects | C19 |
| B9 | Same destructive op gated at **`adminProcedure`** in `admin.ts:838` but **`superAdminProcedure`** in `platform-admin-tenants.ts:290` (suspend/resume) — a live **privilege split**. | `admin.ts` vs `platform-admin-tenants.ts` | C1 |

---

## Candidates (ranked, grouped by theme)

Score = leverage×locality + simplify, 1–10 each. `kind`: consolidation / deepen / both.

### Theme A — Cross-cutting platform-admin scaffolding (do first; unblocks the rest)

#### C1 · Collapse the 23 copied `requirePlatformAdmin` gates into one base procedure  `[LL9 S9 · consolidation]`
- **Files:** `platform-admin-tenants.ts:31`, `…-billing.ts:155`, `…-coupons.ts:107`, `…-renewals.ts:32`, `…-search.ts:31`, `…-health.ts:29`, `…-comms.ts:40`, `admin.ts:48`, `admin.middleware.ts:35`, `packages/api/src/index.ts:19` (+ 13 more).
- **Problem:** The platform-admin oRPC gate is hand-copied verbatim into **23** router files. Each pulls `controlPanelDb` from `honoContext.get("controlPanelDb")` behind a `(protectedProcedure as any).middleware` cast (defeats type-checking), looks up `platformAdmins`, throws FORBIDDEN, re-injects `adminRecord`/`adminRole`. `cpDbFrom` duplicated ~22×, `adminUserIdFrom` ~10×. Copies already drifted: error strings diverge; `search.ts`/`health.ts`/`billing.ts`/`renewals.ts` dropped the `allowRoles` arg so they **can't express super-admin-only**; suspend is gated at `adminProcedure` in one file, `superAdminProcedure` in another (**B9**). The only shared gate (`admin.middleware.ts`) is a Hono REST gate, structurally unusable from oRPC — so the oRPC gate genuinely has no home.
- **Solution:** Define one platform-admin base procedure (+ a super-admin/role-allowlisted variant) next to `protectedProcedure` in `packages/api`, injecting a **typed** `cpDb`, `adminUserId`, `adminRecord`, `adminRole`. The 23 routers import it and delete their local trio; the `as any` cast is quarantined to one file. **Per-concern file split (ADR-0022) stays — only the gate collapses.**
- **Benefits:** *Locality* — the security boundary + role-allowlist live in one auditable file; the super_admin/admin drift becomes impossible. *Leverage* — a new proc starts with one import not ~40 lines; hardening (MFA, audit-on-access) is one edit not 23. *Tests* — gate unit-testable once; typed injected `cpDb` lets handlers be tested without `honoContext` mocking (root cause of zero coverage in comms/notes/tags).
- **Deletion test:** PASS/concentrates. **ADR:** faithful to 0022 + 0027 ("single auth gate"). **Prereq for C2, C3, C7.**

#### C2 · One typed audit-write helper for the 33 `admin_session_actions` inserts  `[LL8 S7 · consolidation]`
- **Files:** `platform-admin-tenants.ts:314`, `…-comms.ts:190,313`, `…-notes.ts:165` (+ 25 more across 8 routers, 3 services, 1 test).
- **Problem:** "Write one audit row" is open-coded at **33 sites**, each re-typing `{adminUserId, actionType, targetOrganizationId, targetUserId?, metadata}` and one of 30 free-text `actionType` literals. ADR-0032 decided "one row per target, on success, bulk+single share action strings" — nothing enforces it, and it's drifted 3 incompatible ways: single-DM swallows audit failure; most procs let the insert throw (so a mutated-but-audit-failed op 500s **after** mutating); `bulkAdd`/`bulkSuspend` mutate then fail-audit per item.
- **Solution:** One audit helper (+ a bulk-array variant) owning the insert shape, the `actionType` vocabulary as a string-literal union, and **one** decided failure policy (logged-not-fatal). Every mutating proc calls it. Do **not** chase a generic notes/tags/comms CRUD merge — only the audit write + gate are truly shared; their domain invariants (edit-window, ON CONFLICT idempotence) differ.
- **Benefits:** *Locality* — "audit on success / one row per target / swallow-vs-throw" decided once; the mutate-then-fail hole closes everywhere. *Leverage* — a new mutating proc can't ship un-audited or mis-typed; the action vocabulary is discoverable from one union. *Tests* — audit emission becomes one test surface. **Deletion test:** PASS. **Depends on C1** (gate injects `adminUserId`/`cpDb`).

#### C3 · One tenant-lifecycle transition module (ADR-0024's state machine, currently uncoded)  `[LL8 S7 · both]`
- **Files:** `platform-admin-tenants.ts:303,498`, `admin.ts:838,870`, `…-tags.ts:359` (bulkSuspend), `tenant-deletion.service.ts:116,157` (~12 sites/7 files).
- **Problem:** ADR-0024 specifies tenant states, a legal-transition table, mandatory audit per transition, and "`paymentStatus` is the single source of truth for gating." **None exists as a module.** Transitions are raw `cpDb.update(organizations).set({paymentStatus})` scattered across ~12 sites with **no legality guard**. Produces real bugs: `reTrialTenant` can move from illegal states; suspend logic + the "app-access-blocked" predicate are redefined in two middlewares and health-score independently.
- **Solution:** One lifecycle module exposing a transition operation owning the legal-transition table, the illegal-move guard, the single Stripe-cancel side-effect, and the mandatory audit (delegating to C2). Delete `admin.ts` suspend/unsuspend; route to the audited path. Extract the "app-access-blocked" + "is-admin-call" predicates so both middlewares + health-score share one definition.
- **Benefits:** *Locality* — transition table, audit obligation, Stripe-halt rule, blocked-state set in one module; adding a state is one edit not a 5-file grep. *Leverage* — callers stop knowing the transition table; a new lifecycle op is one map entry + one call. *Tests* — the transition table is unit-testable. **Depends on C1 + C2.**

#### C7 · One org→subscription-state loader (+ stripe-customer resolver)  `[LL8 S6 · consolidation]`
- **Files:** `require-active-saas-sub.middleware.ts:111`, `subscriptions.ts:114`, `…-tenants-billing.ts:217`, `…-coupons.ts:169` (~9 sites).
- **Problem:** The single-org subscription walk (org → `org.subscriptionId` → subscriptions row) is hand-rolled at ~9 sites with **divergent missing-data error modes**. `resolveStripeCustomerId` is copy-pasted verbatim in 2 files; `issueTenantCredit`/`forceCancelTenant`/`changeTier`/`resolveTier` each re-walk inline with different errors (BAD_REQUEST vs NOT_FOUND vs PRECONDITION_FAILED).
- **Solution:** One org-to-subscription-state loader (returns org + subscription state + stripe customer/sub id) + a thin wrapper pairing it with the existing **pure, tested** `evaluateAccess`. Middleware, `getStatus`, and the three Stripe-customer callers all go through it. `evaluateAccess` stays the pure decision core.
- **Benefits:** *Locality* — the org↔subscription schema link is edited once; not-found-vs-no-customer is uniform. *Leverage* — `getStatus` and the enforcement middleware can't drift on status→capability. *Tests* — the read wiring around the pure evaluator becomes testable.

### Theme B — Billing & tier truth (money-correctness; contains B1–B3)

#### C4 · One effective-tier + application-fee resolver  `[LL8 S7 · consolidation]` — **fixes B1**
- **Files:** `connect-account.service.ts:42`, `…-tenants-feature-flags.ts:157`, `subscriptions.ts:30` (schema), `saas-subscription.service.ts:103`.
- **Problem:** "Org → effective tier" and "what app-fee bps does this tenant pay" are two divergent paths with **no shared "is this subscription live?"**. The billing-critical path (`connect-account.service.ts:42`, feeds `payments.ts:191,312,695,833,949`) reads `subscriptions.tier` with **no status filter** → cancelled enterprise tenant keeps 1.5% (**B1**). The display/gating path applies `LIVE_STATUSES`. Two private `resolveTier` copies. The stored `subscriptions.applicationFeeBps` override is **dead** (never read).
- **Solution:** One effective-tier resolver applying the `LIVE_STATUSES` predicate **once**; route both the connect-fee path and the feature-flags path through it; delete the two `resolveTier` copies. Make the connect path the single seam answering "what bps does this tenant pay," reading the stored `applicationFeeBps` override with `TIER_LIMITS[tier]` default (restores ADR-0002's negotiable-fee intent).
- **Benefits:** *Locality* — the live-eligibility rule + effective-fee decision live once. *Leverage* — all 5 charge sites get one correct fee reflecting overrides + tier swaps. **ADR:** restores ADR-0002 intent. **Prereq for C6.**

#### C5 · Make `tiers.ts` the only tier source of truth  `[LL6 S7 · consolidation]` — **fixes B2**
- **Files:** `packages/types/src/tiers.ts:1`, `payment.service.ts:36,51`, `saas-subscription.service.ts:46`.
- **Problem:** ADR-0010 declares `tiers.ts` the single tier-facts source, but tier resolution is reimplemented in **6 places with drifting numbers** (**B2**): `determineTier` amount thresholds contradict `TIER_PRICES`; `getTierOrgLimit` 10/3/1 vs MAX/5/1. Both live only inside `handleCheckoutCompleted` which has no live caller.
- **Solution:** (1) Delete the dead `determineTier`/`getTierOrgLimit`. (2) Move the canonical `priceId→tier` resolver into `tiers.ts` as a pure function over existing constants. Every caller (checkout, webhook sync, connect-fee, feature-flags, MRR) reads one model.
- **Benefits:** *Locality* — re-tuning touches only `tiers.ts`. *Leverage* — the `$149-as-basic` / `10-vs-MAX` bug classes disappear. *Tests* — pure resolvers trivially unit-testable. **Pairs with C4 + C13.**

#### C6 · Build the `requireTierFeature` / `assertWithinLimit` enforcement seam (ADR-0010, never coded)  `[LL8 S5 · deepen]` — **fixes B3**
- **Files:** `docs/adr/0010-…:38`, `…-tenants-feature-flags.ts:201`, `packages/api/src/routers/commission-splits.ts`, `memberships.ts`, `ghl-sync.ts`.
- **Problem:** ADR-0010 names two enforcement primitives; **neither exists** (zero grep). The three tier-gated families gate on RBAC only → a basic tenant can call ghl-sync/commission-splits/memberships (**B3**). The tier+override merge the ADR specifies is uncoded.
- **Solution:** (1) `requireTierFeature(key)` procedure decorator minting `TIER_FEATURE_LOCKED` (with min required tier), applied to the 3 families. (2) `assertWithinLimit(context, resource)` minting `TIER_LIMIT_REACHED` at members/customers/monthlyTxns write paths. Both resolve the **effective** tier via C4.
- **Benefits:** *Locality* — the error contract + override-merge in one file. *Leverage* — a caller writes one decorator instead of re-deriving tier+override+error. *Tests* — one decorator test covers the gate. **Depends on C4.** This is the one genuine *deepen* (it has 3 real adapters → a real seam, not speculative).

### Theme C — Webhooks, ledger & reconciliation (contains B5)

#### C8 · Route the backfill cron through the existing dedupe interface  `[LL8 S7 · consolidation]` — **fixes B5**
- **Files:** `webhook-dedupe.service.ts:26,48`, `webhook-backfill.service.ts:141,174`.
- **Problem:** ADR-0006 puts idempotency behind `claimWebhookEvent → markEventProcessed/Failed`; both live handlers use it. The backfill cron **bypasses it** — two hand-rolled SELECTs, and after replaying never inserts a processed row (**B5**). The reserved `source='reconciler'` value (ADR-0011) is never populated.
- **Solution:** Backfill claims each event with `source='reconciler'`, skips if processed, marks processed/failed. Deletes the hand-rolled SELECTs, unifies idempotency on one table, populates the reconciler audit value (backfill shows in the Webhooks Log).
- **Benefits:** *Locality* — "did we handle this event" lives in one module again. *Leverage* — one dedupe semantics for all ingress; recovered events stop re-processing hourly. **ADR:** implements 0006 + 0011; stays at ledger-write layer (does not touch 0019's deferral). **Pairs with C9.**

#### C9 · One pure Stripe-event→ledger projector (ADR-0018 "MUST NOT duplicate")  `[LL7 S6 · consolidation]`
- **Files:** `webhooks.routes.ts:173,267,296`, `webhook-backfill.service.ts:184`.
- **Problem:** ADR-0018 makes the live handler + backfill two independent ledger writers that "MUST NOT duplicate." Yet **each re-derives the same projection** on two axes: per-type arithmetic (pi_succeeded/refunded, application_fee, invoice.paid, `occurredAt=created*1000`) copied across 5 call sites, AND taxonomy membership (which types count as ledger events).
- **Solution:** One pure `projectStripeEventToLedger(event): LedgerArgs | null` next to `recordLedgerEvent`, owning the taxonomy (returns null for non-ledger types), per-type amount/fee extraction, currency lowercasing, `occurredAt`. Both writers call it.
- **Benefits:** *Locality* — "what does this Stripe event mean to our ledger" has one answer. *Leverage* — an arithmetic bug fixed once not 5×; live + backfill rows identical by construction → the dedupe-on-`stripe_event_id` contract finally holds. **Pairs with C8.**

#### C10 · Decompose the 450-line Connect webhook god-handler  `[LL7 S6 · consolidation]`
- **Files:** `webhooks.routes.ts:214–663`, `payment-side-effects.service.ts`.
- **Problem:** A ~450-line handler. The order/package/appointment status-flips are raw inline `tenantDb.update` chains with their own `markEventProcessed` calls — not behind any module (unlike `onAppointmentPaid`/`recordLedgerEvent`/`onDisputeEvent`). The **only** test surface is the full HTTP+HMAC+live-DB integration path, which exercises none of the flip logic.
- **Solution:** Per-event handler functions (`payment-intent-succeeded`, `sales-order-payment`, `package-purchase`, `account-updated`, `setup-intent-succeeded`) taking typed input, mirroring the `payment-side-effects` pattern (ADR-0013). The route shrinks to verify→claim→dispatch→mark.
- **Benefits:** *Locality* — per-event logic in one named function each. *Leverage/Tests* — each handler individually importable + mockable. **ADR:** stays in live path; **must be scoped to NOT share these with the backfill** (that's ADR-0019's deferred side-effect replay).

### Theme D — Stripe Connect & payments

#### C11 · Raise the connect-account seam to one branch-aware resolver  `[LL8 S7 · both]`
- **Files:** `connect-account.service.ts:79`, `payments.ts:183,528,654` (+ 817,928).
- **Problem:** ADR-0017 frames `getConnectAccountForOrgCountry` as THE seam so "charge handlers don't change," but the seam sits **one level too low**. Each charge proc re-implements the branch-country dance (`resolveBranchCountryCode` then country ternary), copy-pasted at 4 sites. The variation is where the bugs are: `createSetupIntent` + `purchasePackage` **bypass the country path** (both carry TODO comments); `chargeSavedCard` hand-codes the ADR-0014 snapshot precedence.
- **Solution:** Deepen `connect-account.service.ts` (already owns `resolveTier` + both resolvers): add one branch-aware forward resolver taking `{branchId?, customerSnapshotAcctId?}`, doing the country hop + ADR-0014 snapshot-wins precedence internally, returning `{acctId, appFeeBps, currency, countryCode}`. Charge procs call one function.
- **Benefits:** *Locality* — the ADR-0014 snapshot rule + ADR-0017 country rule each have one implementation. *Leverage* — the pending ISO-fallback + purchasePackage TODOs land in one resolver not 6 sites. **Pairs with C4** (fee) **and C12** (country table).

#### C12 · One supported-countries fact table  `[LL8 S6 · consolidation]`
- **Files:** `stripe-connect-oauth.routes.ts:24`, `webhooks.routes.ts:354`, `branch-country.service.ts:24`, `apps/web/.../billing.connect.tsx:56`.
- **Problem:** The `{code, currency, name}` fact is replicated across **4 drifting sites**: two identical `COUNTRY_TO_CURRENCY` maps (server), an inverse `COUNTRY_NAME_TO_ISO` (service), and `SUPPORTED_COUNTRIES` (web dropdown). Server includes VN/CN; web + ADR-0017 omit them. Nothing guards divergence.
- **Solution:** One fact table in `packages/types` (mirroring `tiers.ts`, already imported by web + server): rows `[{code,currency,name}]` + `currencyForCountry`, `countryCodeForName`, `SUPPORTED_COUNTRIES`.
- **Benefits:** *Locality* — currency-for-country + ISO-for-name stop being half-synced dicts. *Leverage* — onboarding a country is one row; OAuth pre-seed, webhook mirror, branch resolver, UI dropdown agree by construction. **ADR:** 0017 explicitly asks for this name-to-ISO standardization.

### Theme E — Metrics, comms & plumbing (contains B6, B7, B8, B4)

#### C13 · Consolidate MRR rollups + latest-snapshot-per-org window  `[LL8 S7 · consolidation]`
- **Files:** `…-dashboard.ts:118`, `…-revenue.ts:112`, `…-billing.ts:393`, `…-renewals.ts:111`.
- **Problem:** Two rollups copy-pasted across aggregators. Active/trialing MRR (filter status + fold `getTierPriceUsdCents`) written 3×; dashboard+billing emit byte-identical `mrr:{cents,estimateAvailable}`. NOTE: the "live-sub status set" is **not** uniform across renewals/billing/feature-flags — keep that nuance.
- **Solution:** A small metrics helper (next to C5's tier source) owning the canonical live/at-risk status sets, the MRR rollup `{cents, estimateAvailable}`, and a latest-scored-snapshot-per-org query + `criticalFlagCount` projection. Aggregators keep their distinct shaping (bands, trends, limits).
- **Benefits:** *Locality* — the MRR definition + "current snapshot for an org" read once. *Leverage* — mission-control/revenue/billing/renewals can't disagree on the same dashboard. **Pairs with C5.**

#### C14 · Extract the shared impersonation cookie-swap + audit-rollback ceremony  `[LL8 S7 · consolidation]`
- **Files:** `admin.ts:280,429`, `tenant-admin.ts:69,216`.
- **Problem:** The two impersonation flows duplicate everything tricky behind no interface: the `getSetCookie()`/entries-fallback Set-Cookie extraction (5 copies incl. `invitations.ts:344`), the `__impersonationSetCookie__` stash contract that `index.ts:240` re-attaches, and the audit-insert-then-rollback control flow. The real per-flow differences are already factored out.
- **Solution:** Tier 1 — pure `extractSetCookies(headers): string[]` (3 real adapters: admin, tenant-admin, invitations). Tier 2 — one `runImpersonationAudit` + `endImpersonation` orchestration owning the stash contract + rollback ordering.
- **Benefits:** *Locality* — rollback semantics + stash contract in one place. *Leverage* — a third surface or a Better-Auth change edits one path. *Tests* — the swap+rollback becomes testable once.

#### C15 · Extract DM + announcement send-cores; one bulk fan-out helper  `[LL7 S7 · consolidation]` — **fixes B6**
- **Files:** `platform-admin-tenants-comms.ts:119,209,260,350`.
- **Problem:** DM and announcement send sequences are each written twice (single vs bulk) and diverged 3 ways (**B6**): validation contracts differ by entry point; bulk `sendOne` only `console.error`s failures; orgId-vs-organizationId mismatch breaks the outbox filter.
- **Solution:** Two send-cores (keep DM and announcement **separate** — merging over-abstracts; DM emails owner + writes notifications, announcement writes a table with no email) owning resolve-owner/deliver/audit + surfacing per-channel errors. One shared validation schema. One bulk fan-out helper owning iteration + uniform result shape + concurrency (preserve ADR-0032's chunk-at-10).
- **Benefits:** *Locality* — delivery channels/audit metadata/validation decided once. *Leverage* — the next bulk proc supplies only its per-item function. *Tests* — send-cores + fan-out helper are the test surface (partial-failure cases). **Depends loosely on C2.**

#### C16 · Shrink `orpcTenantMiddleware` — move policy decisions to the procedure layer  `[LL7 S6 · consolidation]`
- **Files:** `orpc-tenant.middleware.ts:19,79,117`, `tenant.middleware.ts`.
- **Problem:** The transport middleware mixes plumbing with 3 policy decisions: (1) a public-invitation allowlist enumerated by path/method **substring** (adding a public endpoint = editing a substring list); (2) the ADR-0024 suspension gate whose admin-bypass is a fragile `methodStr.startsWith("platformAdmin")||"admin."` string match; (3) member + accessibleNodeIds resolution duplicated vs `createContext`.
- **Solution:** Keep org-id extraction + `tenantDb` wiring in the slimmed transport middleware (via the ADR-0036 `getTenantDb` seam). Move the 3 policy decisions onto the oRPC procedure layer as distinct bases (public / tenant-scoped / platform-admin), the way C1's gate already reads `honoContext` from context.
- **Benefits:** *Locality* — "is this a platform-admin call" stops being maintained two contradictory ways; suspension policy sits next to the gate that loads the org. *Leverage* — public/tenant/admin becomes a declarative procedure property. **ADR:** honours 0036 (routes platform-admin through its own base, doesn't loosen `tenant.middleware`) + 0024. **Synergises with C1.**

#### C17 · Delete two dead modules  `[LL7 S5 · consolidation]` — **surfaces B4, reopens ADR-0003**
- **Files:** `control-panel/organization-analytics.ts`, `control-panel/index.ts:16`, `require-active-saas-sub.middleware.ts:89,111`.
- **Problem:** (1) `organization_analytics` is a denormalized cross-tenant metrics mirror superseded by `tenant_usage_snapshots` (ADR-0023) — dead, but still in the schema/barrel (risk: a future feature accrues to the wrong table). (2) `require-active-saas-sub.middleware` wraps **zero** procedures (**B4**) — the ADR-0003 SaaS gate is phantom.
- **Solution:** Two **opposite-posture** actions, do not bundle as one "delete": (1) DROP `organization_analytics` (schema file + barrel + a control-panel DROP migration + regen, per `SCHEMA_CHANGE_WORKFLOW.md`). (2) `requireActiveSaaSSub` is **not** dead-code deletion — it's a missing gate. **Reopens ADR-0003**: either wire it onto protected procedures (the ADR's intent) or formally descope trial-expiry blocking. Decide deliberately.
- **Benefits:** *Locality* — one canonical tenant-metrics table; one real lifecycle gate not one live + one phantom. **ADR:** organization_analytics → none (0023 superseded it); requireActiveSaaSSub → **reopens 0003**.

#### C18 · Build the snapshot row once; test the IO through its DI seam  `[LL5 S6 · both]` — **fixes B7**
- **Files:** `tenant-usage-snapshot.service.ts:212,226,244`, `…test.ts:18`.
- **Problem:** `snapshotOne` hand-maintains the row **twice** — `.values({...})` and `.onConflictDoUpdate({set:{...}})` — and they're **not identical** (`storageBytes:0` in values, absent from set → **B7**). The service ships a clean `SnapshotDeps` DI seam but the test exercises only the pure formula, not the IO.
- **Solution:** Build the row object once; pass to `.values(row)` and derive `set` = row minus key columns (organizationId, snapshotDate) — which **includes** storageBytes, fixing B7 for free. 2-way dedup only; do **not** fold in the `computeHealthScore` input (deliberately separate).
- **Benefits:** *Locality* — the row schema-in-practice read once. *Leverage* — ADR-0037's pending activity-factor wiring becomes one line, no insert/update drift. *Tests* — high-risk IO covered through the existing seam.

#### C19 · Dedup `escapeHtml`; delete the zero-adapter Stripe override  `[LL5 S4 · consolidation · WEAK]` — **fixes B8**
- **Files:** `lib/stripe.ts:39`, `payments.ts:53`, `stripe-connect.ts:32`, `…-tenants-comms.ts:95`.
- **Problem:** Security `escapeHtml` hand-copied into 3 prod files, **already drifted** (`&#039;` vs `&#39;`); the test asserts against a 4th private clone → XSS coverage is fake (**B8**). Separately, `stripe-connect.ts` carries a dead `_stripeClientOverride` param + `StripeClientLike` duck-type discarded via `void`.
- **Solution:** (a) Export one canonical `escapeHtml` from a shared server util (pick one apostrophe entity), point all 3 at it, rewrite the test to **import** it. (b) Delete the dead `_stripeClientOverride` + unused `StripeClientLike`. (`getEnvVar` consolidation = separate, low value.)
- **Benefits:** *Locality* — an XSS-escape fix lands once across 3 files. **WEAK rank** but B8 is security-relevant — worth doing the escapeHtml half regardless.

---

## Suggested sequencing

**Wave 1 — foundation (unblocks everything):** C1 (gate) → C2 (audit) → C5 (tier source) → C4 (effective-tier/fee, fixes B1) → C7 (sub-state loader).
**Wave 2 — build on foundation:** C3 (lifecycle, needs C1+C2) · C6 (tier-feature gate, needs C4, fixes B3) · C11 (connect resolver, needs C4) · C12 (country table).
**Wave 3 — webhooks/ledger:** C9 (projector) + C8 (backfill dedupe, fixes B5) as a pair · C10 (decomp).
**Wave 4 — polish/cleanup:** C13 (MRR) · C15 (comms, fixes B6) · C14 (impersonation) · C16 (middleware) · C18 (snapshot, fixes B7) · C17 (dead modules + ADR-0003 decision) · C19 (escapeHtml, fixes B8).

## Notes
- **No candidate is a speculative new seam.** The verify pass rejected those; every survivor is a real seam (≥2 adapters) or finishing a seam an ADR already named.
- **One ADR reopen:** C17's `requireActiveSaaSSub` (ADR-0003). C10 and C16 *touch* ADRs 0019/0024/0036 but stay faithful to them.
- This is **architecture/depth** only. UX/feature polish is a separate lens — ask if you want that pass too.

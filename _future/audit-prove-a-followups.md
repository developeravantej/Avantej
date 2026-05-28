# Audit-Prove -a — Deferred Follow-ups

## Status (2026-05-28)

Two audit-prove-a sessions ran in May 2026 and remediated 62 findings across the codebase (commits `4ec578f4`, `09f9d8c4`, `2b8c88ec`, `6079a30f`, `9848c38b`). Three items were intentionally deferred during those runs because each requires either a product decision, a schema migration, or a multi-day feature build — none was a candidate for autonomous remediation.

| ID | Severity | Reason deferred | Estimated effort |
|---|---|---|---|
| CPR-04 | P1 | Business-policy decision (timing semantics) | 1–2 days |
| AC-A-06 | P2 | Schema migration + hash-at-rest cutover | 2–3 days |
| PO-005 | P2 | Feature build — Stripe Checkout flow | 3–5 days |

Source-of-truth references:
- `zplan/2026-05-27-0143-audit-prove-a/REPORT.md` (general remediation session)
- `zplan/2026-05-27-1700-audit-prove-a-commission-installment/REPORT.md` (commission/installment session)

---

## 1. CPR-04 — Commission reversal timing policy

### Problem

`packages/services/src/refunds.service.ts:641-647` triggers the commission clawback (`reverseForRefund`) at the moment a refund is **approved**, not at the moment funds are actually **disbursed** by Stripe. If a refund is later reversed before disbursement (e.g. operator cancels the refund, or Stripe declines the refund transaction), the clawback persists — the trainer loses commission for a refund that never actually went out.

Today the chain is:

```
refund.approve  →  reverseForRefund() runs  →  commission_split_reversals rows inserted
                                            →  next payouts batch creates a negative payout
                                            →  trainer is clawed back
refund cancelled later → ??? no inverse path exists ???
```

The `reverseForRefund` inverse (re-issue clawback) does not exist in the codebase.

### Why deferred

This is a **business-policy decision**, not a code defect. Two valid models, each with downstream implications:

1. **Reverse-at-intent (current)** — claw back trainer commission as soon as the refund is approved. Faster cash recovery for the business but exposes trainers to whiplash if the refund is later reversed.
2. **Reverse-at-disbursement** — only claw back when the Stripe refund event confirms funds have moved. Trainer commission stays whole until the refund actually settles, eliminating whiplash but exposing the business to short-window cash exposure.

Whichever the business chooses, the implementation also needs a corresponding "un-reverse" / "re-issue" path for the rollback case. Today no such path exists in either model.

### Scope

When a model is chosen:

**Code:**
- `packages/services/src/refunds.service.ts` — gate `reverseForRefund` call on the chosen lifecycle event
- `packages/services/src/commission-splits.service.ts` — add `unreverseForRefund(refundId)` helper that flips the matched `commission_split_reversals` rows + creates a positive adjustment payout
- New Stripe webhook handler branch in `apps/server/src/routes/stripe-webhook-routes.ts` for `charge.refund.updated` (success → leave clawback; failure → call `unreverseForRefund`)

**Tests:**
- `apps/server/src/tests/integration/refund-state-machine.test.ts` — extend with the chosen-lifecycle assertion
- New test: refund approve → cancel → confirm clawback is undone

### Out of scope

- Refund disbursement engine itself (already implemented via Stripe)
- Audit-log changes (existing audit events already capture refund lifecycle)
- Frontend UI (the existing refund/payout UI is correct under either model)

### Acceptance criteria

- [ ] Product + finance team has agreed on a model in writing (commit message references the decision)
- [ ] Commission reversal happens at the chosen lifecycle event, not at refund-approve unconditionally
- [ ] `unreverseForRefund` exists and is called from the webhook handler when refund is reversed
- [ ] Integration test asserts the round-trip: approve → reverse → cancel-refund → un-reverse → trainer commission intact

---

## 2. AC-A-06 — Invitation token hashing at rest

### Problem

`invitations.token` and `branch_invites.token` are stored as plaintext. A read-only DB leak (backup spill, ops debugging snapshot, etc.) exposes every active invite token — and tokens grant join access to the org until they're revoked or expire.

Partial remediation already shipped (commit `2b8c88ec`):
- `branch-invites.ts:list` and `listAll` no longer echo `token` in the response. The token only leaves the server once — on `create` and `regenerate`, for QR code / link generation.

That closes the "casual API read" attack vector but **not** the "DB leak" vector. The canonical fix requires a schema migration.

### Why deferred

Requires a schema change + dual-write transition + cutover, all coordinated:

1. Migration adds `token_hash text` (and optionally drops `token` after transition)
2. Code must hash before insert + lookup-by-hash on `getByToken` / `redeem`
3. Existing rows need backfill (`UPDATE … SET token_hash = encode(digest(token, 'sha256'), 'hex')`)
4. Once all rows have a hash, the plaintext `token` column can be nulled or dropped — but only after a deploy window confirms nothing reads it

This is a multi-step migration, not a one-shot fix. It also touches both `invitations` (control-panel) and `branch_invites` (tenant) so two migration pipelines are involved.

### Scope

**Migrations:**
- `packages/db/src/migrations/control-panel/00NN_invitations_token_hash.sql` — `ADD COLUMN token_hash text` + backfill + index on hash
- `packages/db/src/migrations/tenant/00NN_branch_invites_token_hash.sql` — same, plus regen of `tenant-migrations.generated.ts`

**Code:**
- New helper `packages/services/src/lib/invitation-token.ts` exporting `hashToken(raw): string` and `compareToken(raw, hash): boolean`
- `packages/api/src/routers/invitations/*` — hash on create, lookup by hash on getByToken/redeem
- `packages/api/src/routers/branch-invites.ts` — same pattern
- `packages/api/src/routers/registration.ts` — the CAS-style `redeem` UPDATE needs to use `token_hash` in the WHERE

**Tests:**
- Integration test asserting raw token never appears in DB rows after the migration

**Cutover follow-up (separate deploy):**
- Drop or null the plaintext `token` column once all reads are switched

### Out of scope

- Rotating existing tokens (they remain valid until expiry — the hash conversion is transparent to callers)
- Changing token entropy / generation algorithm
- Single-sign-on or magic-link tokens (those are Better-Auth's domain, not invitations)

### Acceptance criteria

- [ ] Migration applied; `SELECT count(*) FROM invitations WHERE token_hash IS NULL` returns 0
- [ ] `INSERT INTO invitations` with raw token throws (defense check — schema rejects un-hashed values, or only the helper can write)
- [ ] `getByToken` succeeds when called with a raw token that hashes to a stored row
- [ ] `redeem` succeeds (atomic CAS) and increments `usesCount` only on the matching hash row
- [ ] Audit-prove finding AC-A-06 marked closed in any future audit pass

---

## 3. PO-005 — POS "Online" payment never sends Stripe link

### Problem

POS checkout offers an **Online** payment method. The UI label says "payment link will be generated and sent to the customer" but the server transforms the method to `stripe`, sets `paymentStatus='pending'`, and returns. No Stripe Checkout Session is created, no email/SMS dispatch fires, the customer never receives a link.

`packages/api/src/routers/pos.ts:METHOD_CONFIG` declares the `online` method exists. The router accepts the input. The downstream dispatch is the gap.

### Why deferred

This is **feature work**, not a defect fix:

- Needs Stripe Checkout Session creation flow on the connected partner account (or the platform account, depending on the franchise model — open question)
- Needs application fee calculation (matches Stripe Connect setup elsewhere in the codebase)
- Needs return-URL routing back into POS for receipt + completion
- Needs email + (optionally) SMS dispatch with the hosted link
- Needs webhook handling for `checkout.session.completed` to flip `sales_orders.paymentStatus` → `paid`
- Needs handling for abandoned sessions (expiry, retry, manual cancellation)
- Needs Stripe sandbox env vars in `.dev.vars` (`STRIPE_SECRET_KEY` is already there, but the Checkout flow may need different price IDs / setup)

Several of these pieces exist for the appointment-based `payments.sendPaymentLink` flow — that's the reference template — but POS sales have a different shape (multi-line, customer optional for walk-ins, tax + promo + commission impact).

### Scope

**Backend:**
- `apps/server/src/routers/pos.ts` (or a new server-only branch) — new `dispatchOnlinePaymentLink(salesOrderId)` procedure
- `apps/server/src/services/pos-stripe.service.ts` (new) — Stripe Checkout Session creation, line-item mapping, application-fee calculation
- Webhook handler in `apps/server/src/routes/stripe-webhook-routes.ts` for `checkout.session.completed` filtered to POS-origin sessions
- `apps/server/src/lib/email.ts` (or extend) — a "payment link" email template

**Frontend:**
- POS payment step — show explicit "Send link" button instead of implicit on-checkout dispatch
- Sale detail page — show "Awaiting payment" state with resend-link affordance
- Customer receipt route — confirm payment landed

**Tests:**
- Stripe sandbox integration test that walks the Checkout flow end-to-end
- Webhook signature verification test for `checkout.session.completed`

### Out of scope

- Card-on-file charges (already exists via `payments.chargeSavedCard`)
- Refund flow for online POS sales (the existing refund infrastructure covers it once payment lands)
- In-person card readers (Stripe Terminal — separate feature)
- Multi-currency POS (already routed by branch country code elsewhere)

### Acceptance criteria

- [ ] Selecting "Online" in POS payment step → customer receives an email with a hosted Stripe Checkout link
- [ ] Customer completes payment → webhook flips `sales_orders.paymentStatus` to `paid`, fires receipt
- [ ] Walk-in customers without an email get a "Copy link" affordance in the POS UI as a fallback
- [ ] Abandoned sessions auto-expire after 24h; sale stays `pending` with a `Resend Link` action available
- [ ] Application fee calculation matches the appointment-payment flow's reconciliation

---

## Cross-cutting notes

- All three items are tracked in audit-prove-a session REPORTs. A future audit pass should surface them again if not yet implemented — no risk of being forgotten.
- Hash-at-rest (item 2) is the only **security-shaped** follow-up. The other two are correctness/feature gaps.
- None of the three has a hard regulatory deadline; pick them up when the related domain is being worked on (refund flow improvements, invitations UX, POS receipts respectively).

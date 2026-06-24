# UAT Net-New Features — Plan (2026-06-23)

Build the three net-new features the UAT e2e brief (`_future/uat-e2e-remaining-coverage.md`)
flagged as "unbuilt": invoice PDF (§3), PDF agreement + e-sign (§2), offline
payment-proof upload (§7). Grounded in a parallel codebase investigation (this session).

## Key facts from investigation
- `jspdf` (+ `jspdf-autotable`) is already a dep on **both** server and web and works in
  the Worker runtime (`apps/server/src/services/scheduled-reports.service.ts:336-389`
  builds a PDF → `doc.output("datauristring")` → strips the `data:...,` prefix → base64).
- `invoices` table + `invoicesRouter` (`list`, `getById`, `create`, `update`) already
  exist (`packages/db/src/schema/tenant/invoices.ts`, `packages/api/src/routers/invoices.ts`).
  Line items live in `payment_items` keyed by `paymentId`.
- `package_instances` already has `eSignature TEXT` + `termsAgreedAt TIMESTAMP`
  (`packages/db/src/schema/tenant/package-instances.ts:64-65`) — the anchor for §2.
- **No R2 bucket / file-upload endpoint exists anywhere** (`r2_buckets: []` in every
  wrangler config). §7 is the only feature that needs new infra.
- Approvals dashboard (`operations/approvals.tsx`) already does pending→confirmPayment→
  assign(activate). §7 only adds the proof-upload step into that existing flow.

## Journeys
1. **§3** Staff (or future client) opens an invoice → clicks "Download PDF" → receives a
   well-formatted invoice PDF (header, customer, line items, tax, totals).
2. **§2** Staff generates a membership/package agreement PDF for a customer → customer
   e-signs (typed/drawn signature) → signature + timestamp stored on the package instance →
   agreement PDF re-generatable on demand with the signature rendered.
3. **§7** Staff uploads a payment-proof file (bank-transfer receipt / cash slip) against a
   package awaiting payment → file stored in R2 → admin views it on the Awaiting-Payment
   tab → confirms payment (existing `confirmPayment`) → package activates.

## Phase 1 — §3 Invoice PDF  (NO infra; ship first)
- `packages/services/src/invoice.service.ts`: add `getInvoiceWithLineItems(tenantDb, orgId, id)`
  (invoice + its payment's `payment_items`) and `buildInvoicePdfBase64(data)` using the
  jsPDF+autotable pattern from scheduled-reports (dynamic import, A4 pt, strip prefix).
- `packages/api/src/routers/invoices.ts`: add `generatePdf` protected procedure
  (input `{organizationId, id}`, perm `payments:read`, hierarchy-scoped via existing guard)
  → returns `{ filename, contentBase64, mimeType: "application/pdf" }`.
- Web: a `downloadInvoicePdf(client, {organizationId, id})` helper that base64-decodes and
  triggers a browser download; wire a "Download PDF" button into the existing invoice/
  payment detail view.
- Test: server unit test for `buildInvoicePdfBase64` (valid PDF magic bytes `%PDF`, totals
  present) + line-item math.
- Verify: `bun check-types`, optional e2e row in `_e2e/uat-ledger.json` §7 invoice/§3.

## Phase 2 — §2 Agreement + e-sign  (NO infra)
- `packages/services/src/agreement.service.ts` (new): `buildAgreementPdfBase64(pkg, customer,
  org, signature?)` — renders agreement terms + (if signed) the signature image/name +
  `termsAgreedAt`. Deterministic, regenerated on demand (no blob storage).
- `packages/api/src/routers/package-instances/agreement.procedures.ts` (new, folder-module):
  - `getAgreementPdf({organizationId, packageInstanceId})` → base64 (perm `package_management:read`).
  - `signAgreement({organizationId, packageInstanceId, signatureDataUrl, signedName})` →
    writes `eSignature`, `termsAgreedAt = now()`; guard already-signed (idempotent/conflict).
- Web: agreement preview + signature capture (typed name first; drawn-signature canvas
  optional) on the package detail / onboarding surface.
- Test: signAgreement sets columns + is idempotent; PDF contains the signed name.

## STATUS (2026-06-23)
- **Phase 1 §3 invoice PDF — DONE & verified.** `invoices.getDetail` proc, web
  `export-invoice-pdf.ts` builder + Download button on payment/view, unit test green,
  monorepo check-types green, ledger §3 → covered.
- **Phase 2 §2 agreement + e-sign — DONE & verified.** `agreement.service.ts`
  (get/sign, encode/decode), `package-instances/agreement.procedures.ts`
  (getAgreement/signAgreement, immutable once signed), web `export-agreement-pdf.ts`
  + `PackageAgreementSection` mounted on the package drawer, server (8) + web (3) tests
  green, ledger §2 → covered.
- **Phase 3 §7 — DONE (code) + bucket created.** R2 *was* enabled all along (the MCP token
  just lacks R2 scope; the dashboard session listed 5 existing buckets). Created bucket
  `avantej-payment-proofs` (APAC) via the dashboard session on the ZHIYUAN account
  (`Ngchwanlii@zhiyuantech.ai`, acct a9c786e2…). Added the `PROOFS_BUCKET` binding to
  `apps/server/wrangler.jsonc`; tenant migration `0095_payment_proofs` (+ gen:migrations in
  sync); service `payment-proof.service.ts`; procs `package-instances/payment-proof.procedures.ts`
  (upload/list/download, R2 via `honoContext.env`); web `PaymentProofSection` on the package
  drawer; tests `payment-proof.service.test.ts` (11). **Remaining (deploy):** roll mig 0095 to
  live tenants (`migrate-all-tenants.ts`) + verify the live R2 round-trip on a deploy /
  `wrangler dev --remote` (local unit tests cover the logic; the put/get binding path needs a
  real Worker). The MCP R2 token scope is irrelevant to runtime (wrangler uses its own creds).

## Phase 3 — §7 Payment-proof upload  (NEEDS R2 — ops gate)
- **Ops dependency (user decision):** create an R2 bucket + add the binding to
  `apps/server/wrangler.jsonc` (`r2_buckets: [{ binding: "PROOFS_BUCKET", bucket_name: ... }]`).
  Build everything else first; wire the actual `.put()/.get()` last.
- Schema: new tenant migration `payment_proofs` (id, package_instance_id FK, r2_key, file_name,
  content_type, byte_size, uploaded_by, uploaded_at, notes). Run `bun gen:migrations`.
- Server: a Hono multipart route `POST /uploads/payment-proof` (Workers-native; oRPC isn't
  multipart-friendly) → validates type/size → `env.PROOFS_BUCKET.put(key, body)` → inserts
  `payment_proofs` row. Plus oRPC `packageInstances.listPaymentProofs` +
  `getPaymentProofUrl` (short-lived signed/streamed) for the admin view.
- Web: upload control on the Awaiting-Payment tab; show thumbnails/links; then the existing
  `confirmPayment` activates the package.
- Test: route validation (reject non-image/PDF, oversize); metadata row created.

## Out of scope
- LHDN MyInvois e-invoice submission (separate `eInvoiceStatus` flow).
- Third-party e-sign providers (DocuSign/HelloSign) — using in-app capture.
- A net-new client portal — §3 button lands in the existing staff invoice view; client-portal
  exposure is a follow-up.
- Online card/Stripe (explicitly Post-MVP per the brief).

## Acceptance
- `bun check-types` green; `bun check` clean on changed files.
- §3: a real invoice round-trips to a valid PDF (`%PDF` header) with correct totals.
- §2: signing persists `eSignature`+`termsAgreedAt`; agreement PDF renders the signature.
- §7: (post-R2) upload→store→admin-view→confirm→activate works end-to-end.
- Ledger §2/§3/§7 rows updated from Partial toward Ready as each lands.

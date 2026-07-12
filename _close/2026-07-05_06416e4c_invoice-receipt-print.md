# Branded invoice + receipt print documents

- **Session id:** 06416e4c-9b4d-4c25-9de2-d1e43d6ff2b1
- **Date:** 2026-07-05 20:50
- **Branch:** checkpoint-6-22 @ becace8b
- **Status:** in-progress (feature complete + gate PASS; uncommitted, prod rollout pending)
- **/closing:** Overall 9/10 after re-rate (A 9 · B 9 · C 9.5) — initial 7/10, fix pass applied same session

## Scope
Client wants Aoikumo-style branded printable invoice + receipt documents (mockups provided): in-app document pages with Print/Save-as-PDF, tenant legal identity (legal name, SSM reg no, logo), receipt issued against invoice listing payments. Replaces the bare jsPDF invoice download. Plus /e2e-deep coverage of what was built and a /closing quality-gate + fix pass.

## What was done
- **Plan → staff-eng review → build** (zplan/2026-07-02_invoice-receipt-print/plan/plan.md). Review caught 4 blockers pre-code (payment row IS installment #1; `_authenticated` layout leaks chrome into print; render tax from payment_items snapshot, don't recompute; invoice.amountPaid goes stale after installment #1).
- **Data:** tenant migration `0100_billing_documents` — `org_billing_profile` singleton (legal identity + R2 logo key/content-type), `receipts` (one per invoice, unique invoice_id, jsonb line snapshot, stable `RCP-YYYYMMDD-NNNNNN` from new `tenant_receipt_seq`), applied to dev tenant via migrate-all-tenants --filter.
- **Services:** `receipt.service.ts` (get-or-issue, re-snapshot on paid-set change, race-safe via onConflictDoNothing+re-read, installments-only lines rule), `billing-profile.service.ts`, `getInvoicePrintView`/`classifyInvoiceItems` in invoice.service.ts (reconciliation guard, installment balance summary).
- **API:** `invoices` router split into folder module (+ `getPrintView`); new `receipts` + `billingProfile` routers; shared `lib/print-view.ts` + `lib/r2-bucket.ts`. Receipt issuance under `payments:read` SETTLED by design (documented in code).
- **Web:** bare `_print` layout (no dashboard chrome in print output), `/print/invoice/$id` + `/print/receipt/$invoiceId`, DocumentShell/Invoice/Receipt components matching mockups, payments-table actions swapped (jsPDF export DELETED), Billing Identity settings card (TanStack Form, defaultValues-after-load — no reset-in-effect race), logo upload ≤200KB via PROOFS_BUCKET.
- **Tests:** 12 server unit (incl. double-count + race), 5 web component, 13 e2e (rule/lifecycle/RBAC incl. recorded staff-UI test), review.html 173/173 green, videos in `_e2e/results/art-print/` (`invoice-print-view.webm`, `billing-identity-on-invoice.webm`, `staff-rbac-billing-identity.webm`).
- **/closing fix pass:** race fix, base64 pre-decode cap, error classification by oRPC code, stale comments, dead exports removed, `skipOrFail` fixture gate (`E2E_STRICT_FIXTURES=1`).

## Files changed
Feature scope (tree is SHARED with concurrent sessions — full `git diff --stat HEAD`: 26 files, +4815/−2241 includes their work):
new: packages/db/{migrations/tenant/0100_billing_documents.sql, schema/tenant/{billing-profile,receipts}.ts} · packages/services/src/{receipt,billing-profile}.service.ts · packages/api/src/{routers/{invoices/,receipts/,billing-profile/}, lib/{print-view,r2-bucket}.ts} · apps/web/src/{routes/_print*, components/pages/payment/print/ (6 files), components/pages/settings/billing-identity-card.tsx} · tests: receipt-print.test.ts, print-documents.test.tsx, _e2e/web/payment/{print-documents.{rule,rbac},billing-identity.lifecycle}.spec.ts
modified: invoice.service.ts (+118), services/index.ts, base-router.ts, tenant schema index, tenant-migrations.generated.ts, columns.tsx, settings/organization.tsx, vite.config.ts (BONEYARD=0 env gate), _e2e journeys/review
deleted: routers/invoices.ts (→ folder), export-invoice-pdf.ts + its test

## Commits
none committed (user to decide; shared tree)

## Commands run
- `bun gen:migrations` + `bun verify:migrations` → in sync
- `bun scripts/migrate-all-tenants.ts --filter=test-fitness-franchi` → 0099+0100 applied to dev tenant
- `bun check-types` → green for all feature files (2 residual errors are the concurrent session's in-flight onboarding/GHL edits)
- `bun check` → 0 errors
- `bun test receipt-print.test.ts` → 12/12 · vitest print-documents → 5/5
- `bunx playwright test … print set` → 13/13, 6 videos · review.html regenerated (173 tests, 135 journeys)

## Decisions
- Keep `INV-YYYYMMDD-NNNNNN` numbering (no Aoikumo branch-scoped `MY-009-…`); branch is a display field.
- No member "Account ID"; no Aoikumo balance import (reference column is free text).
- Browser print (HTML + print CSS) over jsPDF; jsPDF export deleted after verification.
- One receipt per invoice, STABLE number, lines re-snapshot in place when paid set changes (snapshot-once rejected in review).
- Receipt issuance stays under `payments:read` BY DESIGN (front-desk read-path, idempotent) — documented in receipts/print.procedures.ts.
- `invoices.getDetail`/`getById` kept as public surface (getDetail pinned by e2e contract spec).
- Dev-only: boneyard Vite plugin gated behind `BONEYARD=0` (unauthenticated HMR crawl was killing the dev server).

## Open threads
1. **Commit the working tree** — user's call; tree shared with concurrent sessions.
2. **Prod rollout of migration 0100** — run `apps/server/scripts/migrate-all-tenants.ts` unfiltered at next deploy (dev tenant only so far).
3. Multi-tenant isolation e2e for new procedures needs a second provisioned tenant (`E2E_SECOND_TENANT=1`) — pre-existing suite-wide gap.
4. Dev-server port contention: this session and a concurrent one kill each other's servers on 3020/3021 (their shard runner restarts the API worker). Consider per-session ports if parallel sessions stay routine.
5. Fix plan + re-rate record: `_close/closing-2026-07-05_19-18_invoice-receipt-print.md` (gate PASS; nothing blocking left in it).

# UAT net-new features — invoice PDF, agreement e-sign, payment-proof upload

- **Session id:** ebabf560-6162-46f2-83a1-0f9f6a7aaa48
- **Date:** 2026-06-24 12:57
- **Branch:** checkpoint-6-22 @ 624831f0
- **Status:** in-progress
- **/closing:** Overall 8/10 (A 8 · B 8 · C 8) — PASS

## Scope
Started from "check `_future` for what needs building." Triaged the deferred briefs (found 3 already done — drift clean, router modularization + LOC gate, test coverage), then built the three net-new UAT features flagged as unbuilt: §3 invoice PDF download, §2 package agreement e-sign, §7 offline payment-proof upload — plus a §8 deleteNode error-mapping fix and a migrate-script hardening. Then deployed and proved it with e2e + video.

## What was done
- **§3 Invoice PDF** — `getInvoiceWithItems` + `invoices.getDetail` proc (line items from `payment_items`); web `components/pages/payment/export-invoice-pdf.ts` (client-side jsPDF) + Download button on the payments table.
- **§2 Agreement e-sign** — `packages/services/src/agreement.service.ts` (get/sign, encode/decode, immutable once signed → `AgreementAlreadySignedError`→CONFLICT); `package-instances/agreement.procedures.ts`; web `export-agreement-pdf.ts` + `PackageAgreementSection` on the package drawer. Signature stored in EXISTING `package_instances.e_signature` + `terms_agreed_at` (no schema change).
- **§7 Payment-proof upload (R2)** — created R2 bucket `avantej-payment-proofs` (via dashboard session) + `PROOFS_BUCKET` binding in `apps/server/wrangler.jsonc`; tenant migration `0095_payment_proofs` (+ `gen:migrations`); `payment-proof.service.ts` (validate/key/record/list, storage-agnostic) + `payment-proof.procedures.ts` (upload/list/download, base64 over oRPC, R2 via `honoContext.env`, self-cleaning on DB-insert failure); web `PaymentProofSection` on the package drawer.
- **§8** — `deleteNode` FK-restrict violation now maps to typed 409 CONFLICT (was raw 500).
- **migrate-all-tenants** — unprovisioned tenants (undecryptable conn string) now classified `[SKIP]` not `[FAIL]`; exit non-zero only on genuine failures.
- **Verification artifacts** — 25 unit tests; **5 e2e tests + 5 recorded videos** (`_e2e/web/payment/invoice-pdf.lifecycle`, `payment-proof.lifecycle`, `_e2e/web/packages/agreement.lifecycle`); migration 0095 applied to the test tenant; server deployed live (health 200) with the R2 binding bound.

## Files changed
Session commits (`46f47961..639c17a2`, 29 files, +2368/−397): services (`invoice`, `agreement`, `payment-proof`) + barrel; api routers (`invoices`, `package-instances/{agreement,payment-proof,index}`); db (`payment-proofs` schema + `0095` migration + generated bundle + barrel); web (`export-invoice-pdf`, `export-agreement-pdf`, `payment-proof-section`, `package-agreement-section`, `packages-tab-row-drawer`, `tables/payment/view/columns`, `payment/view`); `wrangler.jsonc`; `migrate-all-tenants.ts`; unit tests + ledger + plan.
Uncommitted fix-pass (from /closing): `payment-proof.procedures.ts` (self-cleaning upload), 3 e2e lifecycle specs, `_e2e/uat-ledger.json`, `_close/closing-*.md`.

## Commits
```
639c17a2 fix(migrate): skip unprovisioned tenants instead of failing the rollout
9fb695d5 feat(packages): agreement e-sign + offline payment-proof upload (UAT §2, §7)
38b585ae feat(invoices): invoice PDF download (UAT §3)
267dd3b1 fix(server): drop duplicate eq import breaking check-types
```
(4 session commits, local — NOT pushed.)

## Commands run
- `bun check-types` → green on my surface; repo-wide RED from concurrent merge (`togglePackagePin`, native `pushTokens`/`expo-*`) — not this session's files.
- `bun gen:migrations` / `bun verify:migrations` → in sync.
- `migrate-all-tenants.ts --filter=test-fitness-franchi` → 0095 applied (0094→0095); `--filter=plan-f-3-5` → `[SKIP]` (unprovisioned), exit 0.
- `wrangler login` (re-auth to Ngchwanlii/a9c786e2) → `wrangler deploy` → live, health 200, `PROOFS_BUCKET` bound, version f07feef9.
- `playwright test … (_e2e config, PW_VIDEO=on)` → 5/5 passed, 5 videos in `_e2e/results/test-artifacts/`.

## Decisions
- jsPDF generated **client-side** on web (mirrors `reports/export-pdf.ts`) — kept jspdf out of the pure-logic `services` package.
- §2 signature reuses **existing** `package_instances` columns; agreement PDF regenerated on demand (no blob storage).
- §7 upload transport = **base64 over oRPC** (reuses auth/tenant/permission guards; fine ≤10 MB; presigned-PUT noted as the scalable path if limits grow).
- R2 bucket created via the **dashboard browser session** — the Cloudflare MCP token lacks R2 scope (misleading 403/10042); R2 was enabled all along. Worker binding uses wrangler's own creds.
- Deployed **server only** (additive, dormant) — NOT web, since activating the UI would call `listPaymentProofs` on un-migrated prod tenants.

## Open threads
- **Not pushed** — 4 commits + the uncommitted fix-pass (task-3 edit, 3 e2e specs, ledger) are local only.
- **Web not deployed + prod-tenant 0095 rollout** — needed for the feature to be user-facing; rollout needs prod control-panel creds (this env has only the dev `.dev.vars` w/ 2 test orgs).
- **`BETTER_AUTH_URL`/`CORS_ORIGIN`** still point at `developer-avantej.workers.dev` while the deploy serves at `ngchwanlii-a9c.workers.dev` — reconcile before relying on auth-bound endpoints live.
- **§8 root cascade bug** — `deleteHierarchyNode` is non-transactional + doesn't reassign descendant members; only the error mapping was fixed. Needs a block-vs-cascade product call + a transaction. (Fix plan task 4.)
- **Sign TOCTOU** — `signAgreement` read-then-write isn't atomic; conditional `WHERE terms_agreed_at IS NULL` is the fix. (Fix plan task 5, low blast radius.)
- **Repo-wide `check-types` RED** from the concurrent `4e4eca0a Merge origin/main` (`togglePackagePin`, native `pushTokens`/`expo-*`) — not this session; the repo won't build green until that merge is finished.
- **Dev servers** (:3020/:3021) left running from the e2e run.
- Fix plan + scorecard: `_close/closing-2026-06-24_11-39_uat-netnew-features.md`.

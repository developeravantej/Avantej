# UAT E2E — Remaining Coverage (2026-06-22)

The e2e suite is now driven by **Avantage Core MVP Readiness & UAT Sign-Off**
(`_e2e/uat-ledger.json` → `_e2e/review-uat.html`). Every UAT item with a testable
in-app surface is covered. What remains is deferred because the underlying
**feature is unbuilt**, needs **external credentials**, or needs **heavy seeded
fixtures** — i.e. not writable as a test today.

**Current board:** Ready §5 §8 §9 §11 · Partial §1 §2 §3/4 §6 §7 §12 §13 · Deferred §10.
**Run the suite:** `bun dev` (separate terminal) then `bash _e2e/shard-run.sh`
(restarts servers per shard, merges, rebuilds the review). See that script's header.

## What needs doing, by UAT section

### §2 Client Onboarding  (covered: approval flow, registration form loads)
- **PDF agreement generation + e-signing + storage** — no endpoint exists. Build
  the PDF/e-sign flow, then assert generate → sign → stored against the client.
- **Payment-proof upload at registration** — no upload endpoint (see §7).
- Registration **submit + required-field validation** — needs the full UI submit
  path (current coverage is the form's data-load only).

### §3/4 Client Portal  (covered: login, self-scope, password-reset request)
- **Invoice PDF download** — needs invoice-PDF generation (no endpoint). Then
  assert a client downloads their own invoice PDF.

### §6 Google Calendar  (covered: Avantej-side status/orgStatus)
- **OAuth connect + read/write/update/cancel + 2-way sync** — needs Google OAuth
  test credentials + a test calendar. Then assert the real round-trip.

### §7 Payment & Finance  (covered: invoice gen+download data, tax on invoice)
- **Offline payment-proof file upload → admin verify → activation** — needs a
  file-upload endpoint (multipart/presigned). Then drive upload → verify → package
  activates. (Online card / Stripe is explicitly Post-MVP — out of scope.)

### §12 Commission & Incentive  (covered: output integrity, reporting visibility)
- **Incentive-threshold + renewal-vs-new-sale CALCULATION** — engine-internal.
  Needs a seeded fixture chain: trainer tier → assign trainer to tier → category
  commission config with `rates[trainerTierId]` (+ conditional incentive tiers) →
  service in that category → completed appointment(s) crossing the threshold →
  assert the computed split/incentive amount. The amount math flows through
  tier × slot weightage × caps (`commission-calculator.service.ts`). Multi-hour,
  flake-prone — build with care + exact expected-amount assertions.

### §13 Reporting  (covered: permission blocker, period filters, CSV export)
- **Per-tier accuracy** — needs seeded per-tier data + expected aggregates to
  assert report figures match the system of record.

### §1 System Architecture / §10 GoHighLevel  — DEFERRED (GHL, out of scope)
- GHL lead capture / pipeline / survey / workflow / webhook (§1) and staff /
  location / custom-field sync (§10) need the GoHighLevel sub-account. Skipped per
  scope. Avantej-side triggers could be asserted, but the external round-trip can't.

## Two product findings to fix (recorded in the ledger)
- **§8 deleteNode** returns a raw **500** when a node has active children — should
  be a typed CONFLICT/BAD_REQUEST (the guard fires; only the error mapping is off).
- (Resolved this session) §5 24h-lock is now API-enforced; was previously UI-only.

## Acceptance criteria (to drive the Partials → Ready)
- Each section's remaining items above have a passing spec OR a justified
  `deferred` entry with a reason in `uat-ledger.json`.
- `bash _e2e/shard-run.sh` completes clean on a stable env and the rebuilt
  `review-uat.html` shows the section Ready (video + DB schema + live values).
- New features (PDF sign, file upload, invoice PDF, GHL/Google) ship with their
  own specs as they're built — the ledger is the running contract.

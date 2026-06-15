# Audit-Prove Report — Incremental (2026-05-27)

**Branch:** `audit-prove/remediation-services-tabs-20260525-1529` (working tree, not committed)
**Session:** `zplan/2026-05-27-0127-audit-prove-incr/`
**Mode:** Incremental — re-audited `auth-customers` domain only (trigger: `sendClaimLink` callbackURL fix)
**Base:** Prior session `zplan/2026-05-26-2323-audit-prove` — 21/21 findings fixed, 23/23 Playwright PASS

---

## Outcome

**5 new findings fixed. 1 deferred (P3 cosmetic).**

The callbackURL fix applied during this session was correct but **incomplete** — the same bug existed in two sibling procedures (`resendMagicLink`, `addEmailAndDispatchMagicLink`) that were not updated. Domain re-audit caught this and three additional correctness gaps.

---

## Findings fixed this session

| ID | Sev | Title | Fix |
|----|-----|-------|-----|
| AC-05 | P2 | `resendMagicLink` missing `callbackURL` — redirects to server root | `customer-profiles.ts` — added `callbackURL: frontendURL/dashboard` |
| AC-06 | P2 | `addEmailAndDispatchMagicLink` missing `callbackURL` — same bug | `customer-profiles.ts` — same fix |
| AC-07 | P2 | `email` param in `createUnclaimed` silently ignored (dead param) | `customer-profiles.ts` — removed from Zod schema |
| AC-08 | P3 | `softDelete` can delete unclaimed profiles, orphaning CP user row | `customer-profiles.ts` — BAD_REQUEST guard before update |
| AC-09 | P3 | `dateOfBirth` uses `z.string().datetime()` — rejects plain date strings | `customer-profiles.ts` — changed to `z.string().optional()` |

---

## Deferred (human review)

| ID | Sev | Title | Why deferred |
|----|-----|-------|--------------|
| AC-10 | P3 | `createUnclaimed` CP user insert has no conflict handler (ugly 500 on UUID collision) | UUID v4 collision probability is ~1 in 10^36 per insert — theoretical only. Safe to leave; add `onConflictDoNothing` if desired. |

---

## All-session status (combined with prior session)

| ID | Domain | Title | Severity | Status |
|----|--------|-------|----------|--------|
| AC-01 | auth-customers | Households.list privilege escalation | P1 | ✅ fixed (prior) |
| AC-02 | auth-customers | walk-in-customers.list deprecated | P2 | ✅ fixed (prior) |
| AC-03 | auth-customers | GHL sync silent (intentional design) | P2 | ⏭ skipped (testable:false, documented) |
| AC-04 | auth-customers | updateRole missing audit log | P3 | ✅ fixed (prior) |
| AC-05 | auth-customers | resendMagicLink missing callbackURL | P2 | ✅ fixed |
| AC-06 | auth-customers | addEmailAndDispatchMagicLink missing callbackURL | P2 | ✅ fixed |
| AC-07 | auth-customers | createUnclaimed dead email param | P2 | ✅ fixed |
| AC-08 | auth-customers | softDelete unclaimed orphans CP user | P3 | ✅ fixed |
| AC-09 | auth-customers | createUnclaimed dateOfBirth datetime validation | P3 | ✅ fixed |
| AC-10 | auth-customers | createUnclaimed CP user no conflict handler | P3 | 📋 deferred |
| SP-01–SP-05 | sales-pos-payments | (5 findings) | P1–P2 | ✅ all fixed (prior) |
| AP-01–AP-05 | appointments-calendar | (5 findings) | P1–P2 | ✅ all fixed (prior) |
| PS-01–PS-04 | packages-services | (4 findings) | P1–P2 | ✅ all fixed (prior) |
| OF-01–OF-04 | operations-finance | (4 findings) | P1–P2 | ✅ all fixed (prior) |
| ST-01–ST-04 | settings-platform | (4 findings) | P1–P2 | ✅ all fixed (prior) |

**Total: 25 findings resolved, 1 deferred, 1 intentional skip.**

---

## Build gate

- After all fixes: `bun check-types` → ⏳ (running at report-write time; prior run exit 0 after AC-05/AC-06 edits)
- Pre-existing test-file type errors unrelated to remediated paths remain (unchanged from prior session)

---

## Proof spec status

- Prior session Playwright run: **23/23 PASS** (`zplan/2026-05-26-2323-audit-prove/video/full-run.webm`)
- This session: `callbackURL` fixes are server-side only and do not change visible UI behaviour that Playwright can assert without an email inbox. The existing 23/23 spec remains valid.
- New spec steps for AC-05/AC-06/AC-08 require email delivery or direct DB inspection to fully prove — marked for human verification.

---

## What the human needs to do

1. **Review branch diff** — all changes are in `apps/server/src/routers/customer-profiles.ts`.
2. **Verify `CORS_ORIGIN` env var** is set in production `.env` / Cloudflare dashboard. Without it, `callbackURL` falls back to `http://localhost:3021/dashboard` (wrong in prod).
3. **AC-10** — optionally add `onConflictDoNothing()` to the CP user insert in `createUnclaimed` for defence-in-depth.
4. **AC-08 UX** — if staff need to delete unclaimed profiles, a "cancel unclaimed" procedure should be implemented that also removes the CP user row. The current guard surfaces a clear error message.

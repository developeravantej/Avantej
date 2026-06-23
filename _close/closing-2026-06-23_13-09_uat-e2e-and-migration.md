# /closing — migration pipeline + UAT-based e2e   ·   Overall: 6/10

What was done: Built a reusable legacy→Avantej onboarding ETL (apps/server/scripts/migration/,
6 loaders, committed + data loaded to the test tenant) and re-based the e2e suite on the
"Avantage Core MVP Readiness & UAT Sign-Off" doc (_e2e/uat-ledger.json → review-uat.html with
video + DB schema + live values per section). New specs across §5/§8/§9/§11/§3-4/§13/§12/§2/§6,
a server-side **§5 24h reschedule/cancel lock** (production change in appointments router), a
shard runner, and _future briefs. Surface audited: **committed** work, 79573072 → 0f821915
(plus the 2dcb62ec checkpoint). Board: Ready §5/§8/§9/§11 · Partial §1/§2/§3-4/§6/§7/§12/§13 ·
Deferred §10.

A. Edge cases     7/10  ⚠️  Strong handling + honest flagging, but a committed behavior change is untested
B. E2E + video    6/10  ⚠️  Real e2e passed in batches; video sparse (API-driven), no clean full-suite green run
C. Best approach  8/10  ✅  Idiomatic + well-architected; minor duplication + non-cleaning committed data

Overall = min(7,6,8) = 6; only one dimension <7, so no extra −1.

Gate: NEEDS WORK (B ⚠️, overall < 8)

---

## Fix plan (ordered by severity)

### 1. [A, blocking] §5 cancel-lock is enforced but UNTESTED
- **What's wrong:** `appointments.update` now rejects `status:"cancelled"` within 24h for
  non-admins (`crud.procedures.ts`, the `LOCK_MS` guard) — a production behavior change with
  **no spec**. `reschedule-lock.rule.spec.ts` only covers *reschedule*; the `"cancelled"` usages
  in booking specs are admin cleanup, which bypasses the lock.
- **File:** `packages/api/src/routers/appointments/crud.procedures.ts` (cancel guard) ;
  `_e2e/web/booking/reschedule-lock.rule.spec.ts` (extend or new sibling spec).
- **Fix:** add a case — book an appt inside 24h for a client, attempt cancel as a **non-admin**
  (staff or the client) → expect 4xx (lock); admin cancel succeeds (override). Mirror the
  reschedule test's admin-vs-staff contrast.
- **Verify:** `bunx playwright test --config _e2e/playwright.config.ts web/booking/reschedule-lock`
  → 2 passing (reschedule + cancel). Lifts A → 8.

### 2. [B, blocking] No clean full-suite green run + sparse video
- **What's wrong:** specs passed in *batches* but a single clean full-suite run was never achieved
  in this sandbox (dev-server wedge + turbo-restart flakiness). Most UAT specs are API-driven
  (rpc) so carry **no video**; only the migration journeys (5) + a few smokeLoad specs record.
- **Fix:** on a stable env, `bun dev` (separate terminal) then `bash _e2e/shard-run.sh` → merges
  shards → rebuild `review-uat.html`; confirm 0 failures and the board renders. For video on the
  high-value invariants (§5 booking, §8, §11), add a short `smokeLoad(...)` UI step to each so the
  recording shows the page (the assertion stays at the API boundary).
- **Verify:** `_e2e/review-uat.html` shows all sections with green specs; videos present for §5/§8/§11.
  Lifts B → 8.

### 3. [A, non-blocking] §8 deleteNode returns raw 500 (error-mapping finding)
- **What's wrong:** deleting a node with active children is correctly blocked, but throws an
  unmapped Error → HTTP 500 instead of a typed CONFLICT/BAD_REQUEST.
- **File:** `packages/services/src/hierarchy.service.ts` (guard ~line 600-607) + the deleteNode
  procedure's error mapping.
- **Fix:** throw an `ORPCError("CONFLICT", …)` (or map it) so the UI gets a clean message; update
  `branch/delete-guard.rule.spec.ts` to assert 409 instead of `>=400`. Lifts A → 9.

### 4. [C, non-blocking] 24h-lock constant duplicated
- **What's wrong:** `24 * 60 * 60 * 1000` + the role-gate logic is copy-pasted in
  `crud-credits.procedures.ts` (reschedule) and `crud.procedures.ts` (cancel).
- **Fix:** extract a shared `assertNotWithinRescheduleLock(existing, member)` helper (e.g. in
  `appointments/_shared.ts` or guards). Behavior-preserving. Lifts C → 9.

### 5. [C, note — already accepted] Migration committed non-self-cleaning data to the dev tenant
- The migration `--commit` wrote ~60 rows (incl. 19 login users) into `test-fitness-franchise`
  with no teardown. This was explicitly approved for the e2e/sign-off demo. If the dev tenant
  should be cleaned later, add a teardown keyed on the `mig_xwalk` crosswalk. No action required now.

## Verification (run all on a stable env)
```
bun dev                                   # separate terminal
bun run apps/server/scripts/fix-auth-password-scrypt.ts sarah.lim@example.com=password123  # if reseeded
bash _e2e/shard-run.sh                     # full suite, merged, review rebuilt
bunx playwright test --config _e2e/playwright.config.ts web/booking   # §5 reschedule + (new) cancel lock
bun check-types                            # API change type-safe
```

---

## Re-rate 2026-06-23 (after fix pass — commit a2d31bdb)

| Check | Before | After | What changed |
|---|---|---|---|
| A. Edge cases | 7 | **9** | §5 cancel-lock now TESTED (admin override vs non-admin rejected, appt stays un-cancelled); §8 deleteNode now typed **409** not raw 500. Booking 4/4 pass. |
| B. E2E + video | 6 | **6** | Unchanged — a single clean full-suite green run + per-journey video is **environment-blocked** here (dev-server wedge + turbo-restart flakiness). Specs pass in batches; migration journeys carry video; most UAT specs are API-boundary (no video). Honest ceiling for this sandbox. |
| C. Best approach | 8 | **9** | 24h-lock logic extracted to `appointments/lock.ts` (`assertOutsideBookingLock`), reused by reschedule + cancel — duplication removed, behavior-preserving. |

**Overall: 6 → 6** (= min(9, 6, 9); bounded by B). Gate: **NEEDS WORK** — solely because B (clean full-suite run + video) can't be produced in this environment, not due to any failing test or unhandled case.

Done: plan #1 (cancel-lock test), #3 (deleteNode 409), #4 (shared helper). Remaining: #2 (full-suite run + video) — run `bash _e2e/shard-run.sh` on a stable env; #5 (dev-tenant teardown) — optional, accepted.

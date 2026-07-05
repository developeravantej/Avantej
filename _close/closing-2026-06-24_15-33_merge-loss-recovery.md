# /closing — merge-loss recovery + main merge   ·   Overall: 2/10

What was done: Re-merged `origin/main` into `checkpoint-6-22` (clean, nothing lost), fixed pre-existing main-side breakage, and recovered three features that prior evil merges had silently dropped. 5 authored commits (`4e4eca0a..669625e1`, 9 files, +228/−35): restore email `attachments` + drop stale backfill arg (`624831f0`); restore `togglePackagePin` schema column + service + export (`05cd04c7`); export `EmailDomainRow` to fix api build TS4058 (`90a9f9d1`); baseline `mig_xwalk` in drift gate (`dcdeec8f`); restore coach-intake availability union into `computeAvailableSlots` + model org `timezone` column (`669625e1`). Verified with check-types, verify:migrations, check-drift, oxlint, and 3 unit-test files. Merged to `main` via PR #52. **(Surface audited: the 5 session-authored commits — the large uncommitted working tree is foreign, pre-dated session start.)**

| Check | Score | Verdict | One line |
|---|---|---|---|
| A. Edge cases | 8/10 | ✅ | Tenant-scoping & guards solid; one real ordering bug + undocumented pin race |
| B. E2E + video | 2/10 | ❌ | No e2e and no video for any new behavior; pin is unreachable (no oRPC procedure); union unit coverage mocks the function under test |
| C. Best approach | 8/10 | ✅ | Disciplined, idiomatic restorations; tz-skew blast radius widened to a 2nd source |

**Overall = min(8, 2, 8) = 2; no extra −1 (only one check below 7). Gate: NEEDS WORK** (B is ❌).

> Honest accounting: the work compiles and isolated service logic is unit-tested, but **nothing here was exercised end-to-end or recorded on video**. Two of the three recovered behaviors can't even be proven as shipped — `togglePackagePin` has no API surface, and the coach-intake union's only "test" mocks the very function it changed. The low overall is the E2E dimension, by design (weakest-link).

---

## Re-rate 2026-06-24 18:30

Landed since 17:25: real (non-mocked) integration/behavior tests for the two previously-untested behaviors — `computeAvailableSlots` union (3 tests) and email `attachments` (2 tests) — on `main` via PR #55 (`b06875c8`). With PR #54's 4 pin procedure tests, **all three recovered behaviors now have green behavior-level coverage.**

| Check | 17:25 | Now | Why |
|---|---|---|---|
| A. Edge cases | 9 | **9** | Unchanged; dedup test confirms exact-match dedup (the `9:00`/`09:00` normalization remains the one minor open item). |
| B. E2E + video | 3 | **5** | Pin (4 procedure/`call`-harness tests) + union (3 real tests, no longer mocked) + email-attachment (2 tests) all green. Still **no browser e2e and no recorded video** — so capped mid-range per the rubric. |
| C. Best approach | 9 | **9** | Unchanged. |

**Overall = min(9, 5, 9) = 5. Gate: still NEEDS WORK** (3 → 5).

Honest ceiling reached: B is now mid-range because every behavior has green integration/behavior tests, but **none has a recorded browser journey** — and that's largely impractical for these three: email-attachment and the union are backend flows (no meaningful UI video), and the pin UI lives in `apps/native`, which is unrestored/red. Pushing B to ≥8 requires the `/e2e-deep` harness (dev servers + seeded tenant + Playwright recording) and the native pin UI restored — a separate, larger effort, not a code gap in this work.

**Task status:** 1 ✅ · 2 ✅(doc) · 3 ◐ (all behaviors integration-tested; browser-video still open) · 4 ✅ · 5 ◐ (race mapped; dedup-normalization open) · 6 ⬜.

---

## Re-rate 2026-06-24 17:25

Landed since 15:48: restored the `togglePin` oRPC procedure (plan tasks 3+4) + 4 procedure-level tests, on `main` via PR #54 (`20f57ccd`). Task 2 (tz storage) investigated and resolved-as-documented. Task 5 partly addressed (pin `23505` → CONFLICT mapping).

| Check | 15:48 | Now | Why |
|---|---|---|---|
| A. Edge cases | 9 | **9** | Task 4 closed *structurally* — `togglePin` input has no `clientId`, so cross-user pin is impossible (tested). Task 5 race surface mapped to CONFLICT. Remaining minor: slot-dedup `9:00`/`09:00` normalization. |
| B. E2E + video | 2 | **3** | Pin is now reachable + has 4 procedure-level (call-harness) tests — no longer "unprovable". But still **no browser e2e and no video** for any behavior; coach-intake union + email-attachment remain untested; pin UI not restored (native, red). |
| C. Best approach | 9 | **9** | Procedure mirrors existing client-procedure conventions, faithful to 5c667796. Task 2 (tz) confirmed: availability times are wall-clock-local `text`, so booking math is UTC-skewed for non-UTC orgs — pre-existing + deliberately deferred; documented, not unilaterally reworked. |

**Overall = min(9, 3, 9) = 3. Gate: still NEEDS WORK.** (2 → 3.)

Honest ceiling: A and C are strong (9). The gate is pinned by B, which **cannot reach PASS without recorded browser e2e** — and that needs (a) the pin UI restored (native, currently red/deferred) and (b) a Playwright run with dev servers. What was achievable without those — making the feature reachable + secure + API-tested — is done. Remaining B work: a direct `computeAvailableSlots` union unit test, an email-attachment send test, and UI + recorded journeys.

**Task status:** 1 ✅ · 2 ✅ (documented) · 3 ▶ (reachable + API-tested; browser-e2e/video still open) · 4 ✅ · 5 ◐ (race mapped; dedup-normalization open) · 6 ⬜.

---

## Re-rate 2026-06-24 15:48

Only change since the initial rating: task 1 (pin ordering) fixed — `de875b5f` on `checkpoint-6-22`, cherry-picked to `main` via PR #53 (`9d146f6b`). No e2e specs or videos were added. Re-rated inline (single-line delta; prior subagent findings stand for the rest).

| Check | Before | After | Why |
|---|---|---|---|
| A. Edge cases | 8 | **9** | Pinned-order bug resolved (`package-instance.service.ts:125`, explicit `desc nulls last`). Open: pin `23505` race surface, trust-`clientId`-on-procedure-restore, slot-dedup normalization — minor/deferred (tasks 4–5). |
| B. E2E + video | 2 | **2** | Unchanged. No spec authored, no recording made. `togglePackagePin` still has no oRPC procedure → still unprovable; coach-intake union + email-attachment still uncovered (task 3). |
| C. Best approach | 8 | **9** | The one latent correctness bug it flagged is gone. Open: verify availability time-storage UTC-vs-local (task 2); `skipPush` capability still absent (tracked chip). |

**Overall = min(9, 2, 9) = 2; no extra −1 (only B below 7). Gate: still NEEDS WORK.**

Honest note: fixing the bug lifted A and C to 9, but the gate is **bounded by B (e2e/video, 2)** — weakest-link. Overall does not move until the recovered behaviors are exercised end-to-end with recordings (task 3), which first needs the `togglePackagePin` oRPC procedure restored.

---

## Fix plan (severity-ordered)

> **Update 2026-06-24 15:39 — Task 1 DONE.** Fixed `desc nulls last` in
> `package-instance.service.ts:121-126`; check-types green, unit tests 20/20.
> Landed on `main` in isolation via PR #53 (`9d146f6b`), kept separate from the
> concurrent UAT-finish commit (`1c1d691c`) also on `checkpoint-6-22`. Tasks
> 2–6 remain open; the gate stays **NEEDS WORK** because B (e2e/video, 2/10) is
> unchanged — that dimension needs the specs + recordings in task 3.

### 1. [correctness · lifts A→9, C→9] ✅ DONE — Pinned packages sort to the BOTTOM
**What's wrong:** `packages/services/src/package-instance.service.ts:123` orders `desc(packageInstances.pinnedAt)`. Drizzle's `desc()` emits a bare `ORDER BY pinned_at DESC` with no `NULLS` clause, and **Postgres `DESC` defaults to `NULLS FIRST`** — so unpinned rows (`pinned_at IS NULL`) sort *before* the pinned one. The intent (and the code comment at :121-122, "NULLs last") is the opposite. The pinned package lands last instead of first, defeating the feature. Inherited verbatim from the original `5c667796`; not currently user-visible only because the oRPC procedure isn't wired (see task 3).
**Fix:** force NULLS LAST explicitly:
```ts
import { sql } from "drizzle-orm";
// ...
orderBy: [sql`${packageInstances.pinnedAt} desc nulls last`, asc(packageInstances.createdAt)],
```
and correct the comment.
**Verify:** add a unit test in `apps/server/src/tests/unit/services/package-instance.test.ts` (in the existing `listPackageInstancesForClient` describe) asserting that, given one pinned + two unpinned rows, the pinned row is returned first. `cd apps/server && bun test src/tests/unit/services/package-instance.test.ts`.

### 2. [correctness · lifts C→9] Confirm availability time storage (UTC vs wall-clock-local)
**What's wrong:** `trainer-availability.service.ts` `computeAvailableSlots` does HH:MM math in UTC (`toHHMM`/`toDateString`), with org-tz awareness deliberately deferred (`appointment.service.ts:146-148`). The union (commit `669625e1`) now feeds a **second** data source (`coach_intake_availability`) through that same UTC math. If `start_time`/`end_time` are stored as **wall-clock local**, the booking flow surfaces windows shifted by the org offset (Asia/Kuala_Lumpur = +8h → an 8-hour skew). Not a regression this commit introduces (trainer windows already had it), but the union **widens the blast radius**.
**Fix (verify-first, then decide):** confirm the storage convention of `coach_intake_availability.start_time` and `trainer_availability.start_time` (inspect writers: `coach-intake.service.ts`, `upsertTrainerAvailability`, and seed/UAT data). If wall-clock-local, prioritize the deferred org-tz-aware slotting (restore the `Intl.DateTimeFormat` path from `57214b40`, now that the `organizations.timezone` column is modeled). If already UTC, no action — just document it.
**Verify:** a unit/integration test that seeds a known local window + org tz and asserts the computed bookable slot matches the wall-clock expectation.

### 3. [provability · lifts B→6+] Make the recovered behaviors e2e-provable, then record video
**What's wrong:** no e2e spec or recording maps to any new behavior (per Check B). Specifically:
- **`togglePackagePin` is unreachable** — no oRPC procedure exists (`grep togglePin packages/api apps/server` empty). An e2e cannot be written until the `togglePin` procedure (and ideally native UI) is restored from `5c667796`. Tracked by chip `task_b770720c`'s sibling work; restore the procedure binding `clientId` to the **authenticated member**, not caller input (see task 4).
- **Coach-intake union has no booking e2e**, and `apps/server/.../schedule-proposal.test.ts:66` *stubs* `computeAvailableSlots`. (Note: `packages/services/src/trainer-availability.service.test.ts` does exist — 5 passing — but does not exercise the union path.)
- **Email attachment** restoration is unverified at any send boundary.
**Fix / commands** (Playwright records video per config; artifacts → `_e2e/results/**/video.webm`, `e2e-web/videos/`):
```bash
bun gen:migrations && bun db:migrate:tenant && bun e2e:seed   # prereqs
bun e2e:smoke                                                  # baseline, records video
bunx playwright test _e2e/web/packages/package-instance.lifecycle.spec.ts
bunx playwright test e2e/journeys/95-appointments-scheduling.admin.journey.spec.ts --config=playwright.journeys.config.ts
# NEW specs to author: pin/unpin lifecycle (after procedure restored);
#   book a union-only coach-intake slot end-to-end; email-send-with-attachment integration test.
```

### 4. [security/edge · lifts A] When restoring the pin oRPC procedure, don't trust `clientId`
**What's wrong:** `togglePackagePin(tenantDb, { packageInstanceId, clientId })` enforces ownership purely on the **caller-supplied** `clientId` (`package-instance.service.ts:155-157`). Safe for the service unit test, but the future oRPC procedure must derive `clientId` from the authenticated member/session (per CLAUDE.md guards), or a client could pin/unpin another member's package within the tenant.
**Verify:** procedure-level test passing a session whose member ≠ input clientId → expect FORBIDDEN.

### 5. [edge · minor, lifts A] Pin race + dedup normalization
- **Same-client pin-A-vs-pin-B** races slip past `FOR UPDATE` (different rows) and are caught only by the partial unique index, surfacing a raw Postgres `23505` rather than a typed error (`package-instance.service.ts` pin path). Map `23505` on `package_instances_one_pin_per_client_idx` to a friendly CONFLICT.
- **Slot dedup** (`trainer-availability.service.ts:~553`) keys on raw `day|start|end` strings — won't collapse unnormalized `9:00` vs `09:00`. Normalize HH:MM before the dedup key if writers don't guarantee zero-padding.

### 6. [hygiene · non-blocking] Drift baseline grew (should shrink)
`scripts/check-drift.ts:12` states "Keep EXPECTED_DRIFT SHRINKING"; this session added `mig_xwalk` (:98-102). Correct lesser-evil for now (it's live ETL scratch), but the clean long-term fix is for `migration/core/crosswalk.ts` to namespace/drop its scratch tables after a run. Track, don't block.

---

## Verification (to lift the gate to PASS)
```bash
# correctness
cd apps/server && bun test src/tests/unit/services/package-instance.test.ts   # incl. new pinned-first assertion
cd /c/Project/Avantej && bunx turbo check-types --filter='!native'
bun verify:migrations && bun scripts/gen-erd.ts && bun scripts/check-drift.ts
# e2e + VIDEO (the dimension that's failing)
bun e2e:seed && bun e2e:smoke
bunx playwright test _e2e/web/packages/package-instance.lifecycle.spec.ts
bunx playwright test e2e/journeys/95-appointments-scheduling.admin.journey.spec.ts --config=playwright.journeys.config.ts
# then author + record: pin lifecycle, coach-intake union booking, email-attachment send
```
Re-run `/closing merge-loss-recovery` after fixes to re-rate (appends a `## Re-rate` section here).

---
name: audit-prove
description: Use when the user wants to inventory a codebase's functions, find gaps, FIX them in a loop until the app works, and PROVE the result with a single recorded Playwright run. Auto-detects the project (stack, build command, API surface, routes, auth), maps the API surface via parallel read-only domain agents, verifies the top findings first-hand, then runs an always-on remediation loop (fix → re-gate → re-run → repeat under hard caps) before recording golden-path + finding-regression journeys as ONE continuous browser session. Triggers - "audit and prove", "map functions, fix, and test in a video", "gap analysis + auto-fix + e2e video".
version: "3.0.0"
---

# Audit-Prove

Three movements wired into one pipeline:
1. **Map & gap** the codebase (parallel read-only domain agents → verified, prioritized findings).
2. **Remediate** — an **always-on loop**: fix the build, fix failing journeys, complete `partial` features, implement `missing` ones → re-gate → re-run → repeat under hard caps until the worklist resolves or a guardrail trips.
3. **Prove** the result — drive golden-path + regression journeys as **one continuous Playwright session recorded to a single video**.

This skill is **universal**: no hardcoded paths, ports, or commands. Everything project-specific is **detected at run time** (Phase 0) into `$SESSION/project.json`, or read from an optional committed override. It works on a monorepo or single package, on oRPC / REST / Next route handlers, with or without auth, on bun / npm / pnpm / yarn.

This skill is a **conductor**. It composes machinery you already have — do not rebuild it:
- Inventory fan-out → `audit-swarm` (or the per-domain agents below).
- Test authoring/execution → the `playwright-best-practices` skill (EXECUTE phase).
- Bug-fix discipline → the `/fix` reproduce→isolate→root-cause flow inside each fix agent.
- Optional video annotation → the `video-use` skill or `scripts/` ffmpeg.

## Hard rules (read first)
- **Detect, never hardcode.** Resolve project config in Phase 0; pull every port / command / auth path from `$SESSION/project.json`.
- **Audit agents are READ-ONLY; only the remediation phase edits code.** Keep the inventory trustworthy — never let a mapping agent change source.
- **You cannot test what doesn't compile or doesn't exist.** Classify every finding `implemented | partial | missing` + `testable: true|false`. The build must be green before any browser stage.
- **A green UI is not proof the data persisted.** For every write, verify the actual persisted row — directly in the DB when `db` is configured/reachable, else by API read-back. A journey that passes in the UI but fails persistence is a *worse* bug than a red UI (silent data loss); treat it as a first-class failure that feeds the loop.
- **Verify before you enshrine.** Re-read the cited `file:line` / run the type-checker on the top `verifyTopN` claims before they enter the findings (catches false findings before the loop wastes effort on them).
- **The remediation loop has hard limits — honour them:**
  - Work on a dedicated branch (`remediation.branch`); **never auto-commit, push, deploy, or run a DB push.** Leave fixes in the working tree for review.
  - Caps: `maxIterations` global, `maxFixesPerTarget` per item. Hit either → mark the target `blocked`, stop touching it.
  - **Stop on no-progress:** if an iteration resolves zero targets and reduces zero failures, STOP and escalate. Do not spin.
  - **Never weaken a test/assertion or delete/relax a finding to make the loop "succeed."** Fix the code. A genuinely wrong test → mark `needs-human`, stop.
  - **Fix to the best, scalable approach within the existing architecture** (per `remediation.fixPolicy`): root-cause, no entrenched anti-patterns, honour the scaling checklist (no N+1, bounded/paginated queries, indexes, transactions, idempotency, tenant isolation), reuse existing patterns, add no new frameworks. Agents may refactor the touched code path for scale (with rationale); larger cross-cutting refactors are logged as `deferred` `S-` findings for human review — **the loop does NOT auto-expand into them** (scope guard).
  - **Re-gate after every fix batch**; never run the browser stage against a red build.
  - **Checkpoint every iteration** to `$SESSION/loop/` so a crash at iteration N keeps 1..N-1.
  - The loop re-runs the **gate + spec + fixes** only — it does NOT re-run the expensive Phase-1 domain fan-out.
- If context is already large, tell the user "consider `/compact` first" and wait one beat before the fan-out.

## Inputs (all optional — detection fills the gaps)
- **Override config** — `audit-prove.config.json` at repo root → loaded as-is, detection skipped. Schema + multi-stack examples + the `remediation` block: `config/project.example.json`.
- **Override domain map** — `audit-domains.json` at repo root → used instead of the cartographer pass. Shape: `config/domains.example.json`.

Run scripts with `node scripts/<file>.mjs` (Playwright requires Node, so it is always present). The build command they invoke uses the detected package manager.

---

## Phase 0 — Scaffold & detect
1. `SESSION=zplan/$(date +%Y-%m-%d-%H%M)-audit-prove`; create `$SESSION/{audit,test,video,loop}/`.
2. **Resolve project config:** if `audit-prove.config.json` exists at repo root → copy to `$SESSION/project.json`. Else `node scripts/detect-project.mjs --out $SESSION/project.json`.
3. **Review the detected config yourself** — it is heuristic. Confirm globs (Glob them), the build command (`package.json` scripts), and `e2e.baseURL`/`authStorageState` (open any `playwright.config.*`). Set `stack`/`conventions`. Resolve every REVIEW warning the detector printed; if a value can't be determined, ask the user rather than guess. Confirm the `remediation` block (defaults: scope `full`, `maxIterations` 6, `maxFixesPerTarget` 3) and the `db` block — if `db.enabled`, set `db.testOrgId` (which tenant the proof operates as) and confirm `db.verifyHelper`/`db.runner`; if no DB is reachable, persistence falls back to API read-back.
4. **Create the remediation branch** (`git checkout -b <remediation.branch>-<timestamp>`), unless `--audit-only`. Record the branch name for the report.

## Phase 1 — Map & gap (parallel, read-only)
1. **Domain map.** If a committed `audit-domains.json` exists, use it. Otherwise run a **cartographer pass**: Glob `apiSurface.routerGlobs` + `serviceGlobs`, group into 4–8 cohesive domains, write to `$SESSION/audit/domains.json` (shape of `config/domains.example.json`, incl. `verifyTopN`).
2. Spawn **one `general-purpose` agent per domain** in a single message (parallel). Brief each from `templates/domain-brief.md` (substitute `{{STACK}}`, `{{CONVENTIONS}}`, `{{API_OVERVIEW_DOC}}`, its owned `{{ROUTERS}}`/`{{SERVICES}}`, output `$SESSION/audit/<id>.md`). Scope each brief to ITS files only.
3. When all return, **verify the top `verifyTopN` claims yourself**; mark ✅verified / 📋agent-reported / ⚠️corrected.
4. Tag every finding `implemented | partial | missing` + `testable`.
5. Emit `$SESSION/audit/findings.json` (`id, title, file, line, severity, status, testable`) and merge `$SESSION/audit/REPORT.md` (`templates/report.template.md`).
6. If `--audit-only` → write `$SESSION/REPORT.md` (findings only) and STOP here.

## Phase 2 — Test plan
From `findings.json` + the route list (`routes.routeGlobs`, or `hub.index` if set), write `$SESSION/test/plan.md`:
- **Golden paths** — one journey per major route's happy path.
- **Finding journeys** — one per finding: a `testable && status!=missing` finding → a journey that asserts CORRECT behaviour; a `missing` finding → an **API/UI-absence assertion** for now (it flips to a behaviour journey once the loop implements it).
Order so dependencies (login, seed) come first. Name every journey/step with its target id as the first token (`GP-01 …`, `F-<id> …`) — the loop maps failures back to targets by that token.

**Persistence checks.** For every finding that writes data (it carries a `persistence:` note from the audit), add a persistence check keyed by the same target id:
- If `db.verifyMode` resolves to **direct DB** (db.enabled + a reachable `verifyHelper`) → add an entry to `$SESSION/test/db-checks.json` (`{ id, tenant: db.testOrgId, table, where, expect }`) from the finding's `persistence` note.
- Else (**read-back**) → the journey's spec step re-reads through the app's API and asserts the saved values.
Either way the check shares the finding's id so a persistence failure maps back to the same remediation target.

## Phase 3 — Generate the single-session harness
1. `node scripts/gen-playwright-config.mjs --session $SESSION --config $SESSION/project.json` → writes `gap-prove.config.ts` **at the repo root** (`video: "on"`, list+html+**json** reporters; setup project + storageState if `authStorageState` is set, else unauthenticated). Does NOT touch the repo's own `playwright.config.ts`. (Root placement: Playwright resolves `testDir` relative to the config file's dir.)
2. Author `<testDir>/gap-prove.spec.ts` from `templates/full-run.spec.template.ts`: **exactly one `test()`**, one `test.step()` per journey from `plan.md`, all `expect.soft(...)` so a failing step records but the session keeps recording. For read-back persistence checks, add the post-submit re-read assertion inside the relevant step. Delegate the journey bodies to `playwright-best-practices` (EXECUTE) for robust locators — constrained to this single spec.
3. **If `db.verifyMode` resolves to direct DB:** copy `templates/db-verify.template.ts` → `<testDir>/db-verify.ts` and fill `{{DB_HELPER_IMPORT}}` / `{{RESOLVE_DB}}` using `db.verifyHelper` (reuse the project's own DB/tenant client — do not hand-roll a connection). It reads `$SESSION/test/db-checks.json` and writes `$SESSION/test/db-results.json`.

## Phase 4 — Remediation loop (always-on; the heart of the skill)
Seed `$SESSION/loop/state.json`:
```
{ "iteration": 0, "exitReason": null,
  "targets": [ { "id", "kind": "build-error|journey-failure|partial|missing",
                 "status": "open", "attempts": 0, "ownedFiles": [], "note": "" } ] }
```
Seed `targets` from: every `partial` + `missing` finding (per `remediation.scope`), every `testable` finding's journey, plus build errors as they surface. **Skip the loop entirely if `remediation.enabled` is false** → go to Phase 5.

Repeat until success or a guardrail trips:

1. **Gate.** `node scripts/health-check.mjs --config $SESSION/project.json`.
   - Red → parse the errors, add/refresh `build-error` targets, spawn fix agent(s) on the erroring files, re-gate. Build errors take priority over everything; do not advance to step 2 until green (respecting `maxFixesPerTarget`).
2. **Run the proof spec.** `npx playwright test -c gap-prove.config.ts`.
3. **Collect failures (UI + persistence).** First, if `db.verifyMode` resolves to direct DB, run the filled verify script with `db.runner` (e.g. `bun <testDir>/db-verify.ts --checks $SESSION/test/db-checks.json --out $SESSION/test/db-results.json`) — read-back checks already ran inside the spec. Then `node scripts/collect-failures.mjs --results $SESSION/test/results.json --out $SESSION/loop/failures-$ITER.json` and merge any `status:"fail"` rows from `db-results.json` by `id`. Map each failure's leading-token `id` back to a target → set those `open`, passing targets `fixed`. **A target is `fixed` only when BOTH its UI step AND its persistence check pass.**
4. **Build this round's worklist** (priority order, then cap to `remediation.parallelFixAgents`): open `build-error` → open `journey-failure` → open `partial` → open `missing`. Respect file ownership so parallel agents never edit the same shared file (one owner per shared file; others declare the dependency and wait).
5. **Fix.** Spawn remediation agent(s) from `templates/fix-brief.md`, scoped to each target's owned files + evidence, with `{{FIX_LATITUDE}}` substituted from `remediation.fixPolicy.latitude`. Each agent first **chooses the best scalable approach** (root cause → scalable → consistent with existing patterns → minimal), then edits, keeps the build green, and returns `fixed|partial|blocked|needs-human` + its chosen approach. Increment `attempts`. **Log any `S-<slug>` deferred scaling finding an agent returns into `findings.json` (status `deferred`) and surface it in the report, but do NOT add it to this loop's worklist** (prevents runaway scope).
   - When a **`missing`** target returns `fixed`, **rewrite its spec step** from the absence-assertion into a real behaviour journey (using the UI steps the agent reported), so the next run actually proves it.
   - A target at `attempts >= maxFixesPerTarget` without resolution → `blocked` (or `needs-human` if the agent said so). Stop retrying it.
6. **Checkpoint.** Update `state.json`; write a one-line-per-change summary to `$SESSION/loop/iteration-$ITER.md`. Increment `iteration`.
7. **Decide.**
   - All targets `fixed` (or only `blocked`/`needs-human` remain) → exit loop ✅.
   - `iteration > maxIterations` → exit, reason `cap`.
   - No target moved open→fixed AND failure count did not drop this iteration → exit, reason `no-progress`.
   - Otherwise loop again from step 1.

## Phase 5 — Final proof run (one video)
1. With the build green and the loop converged, do one clean confirming run: `npx playwright test -c gap-prove.config.ts` (the dev server boots via the config's `webServer` if `devServerCommand` was wired in, or ask the user to have it running).
2. Copy `test-results/**/video.webm` → `$SESSION/video/full-run.webm`.
3. (Optional, ffmpeg present) annotate target IDs per step via `video-use` / `scripts/`. The step timeline also lives in the Playwright trace + HTML report.

## Phase 6 — Final report
Write `$SESSION/REPORT.md` from `templates/report.template.md`: the **remediation log** (targets fixed / blocked / needs-human, iterations used, exit reason, per-iteration diffs), the pass/fail matrix from the final run (with the **Persisted?** column + the persistence table from `db-results.json` / read-back), links to the video + HTML report + trace, and the findings. Call out any journey that passed in the UI but FAILED persistence — those are top priority — and list the `deferred` `S-` scaling findings the loop logged but did not apply (the human-review queue). Print to the user: the branch name, the remediation summary (N fixed / M outstanding / K deferred-scaling), the video path, and the matrix summary. Outstanding `blocked`/`needs-human` items are the human's to-do list — surface them prominently. **Do not commit or push** — leave the branch for review unless the user asks.

## Persistence verification (both modes)
Proving a write means proving the row, not the toast. Two modes, selected per check from the resolved `db` config:
- **Direct DB** (when `db.enabled` and `db.verifyHelper` is reachable) — `db-verify.ts` connects via the **project's own** DB/tenant helper and asserts the actual row(s) against the audit's `persistence` notes. Multi-tenant aware: it resolves the right tenant branch via `db.testOrgId`. Runs out of band (project runtime via `db.runner`, e.g. `bun`), so it doesn't appear in the video but feeds the matrix.
- **API read-back** (fallback when no DB is configured/reachable) — inside the recorded session, the spec re-reads through the app's API and asserts the saved values. No creds needed; weaker (trusts the read path).
`verifyMode: "auto"` picks direct-DB where possible and read-back otherwise, per check. Both share the finding's target id, so a persistence failure becomes a `journey-failure` target the remediation loop fixes like any other. Author checks ONLY for findings that write data; pure reads need none.

## Page mode — `--page <route>` (single-page white-box QA + fix loop)
QA of ONE route instead of the whole codebase. Replaces Phase 1's fan-out with a single page trace; the remediation loop, the single continuous video, and the report are identical (the worklist is the route's `cases.json` instead of findings).

0. **Accept a path OR a full URL.** `--page /some/route` or `--page http://localhost:3000/some/route`. If a URL: origin → `--base-url`; pathname → the route. Record on the same host the auth setup logged in against, or the session cookie won't carry.
1. **Resolve** the route → its file under `routes.routeGlobs`, the component(s), any page doc under `hub.pagesDir`.
2. **Map & edge-case (one read-only agent)** via `templates/page-qa-brief.md`: trace component → hooks → client→server call (`routes.clientPattern`) → handler under `apiSurface.routerGlobs` → logic under `serviceGlobs`. Produce `$SESSION/qa/<page>-map.md` and `$SESSION/qa/cases.json` (`id, title, type: golden|edge|error, steps[], expected, selectorHints, testable`).
3. **Harness** — gen the config (`--filter <pkg>` to scope the gate if `buildGate.supportsFilter`), author `gap-prove.spec.ts` from `templates/page-qa.spec.template.ts` (one step per case, golden first, `expect.soft`).
4. **Remediation loop** — same as Phase 4, worklist = failing `cases.json` cases. **Edge cases come from the CODE, not guesswork** — fix the page to honour the guard the source implies (e.g. tendered < total must block submit; switching customer clears the cart; a promo re-validates on cart change).
5. **Final run & report** — same as Phases 5–6.

## Modes
- `--audit-only` — map & gap only; **no remediation, no proof** (the explicit read-only escape hatch). Stops after Phase 1.
- `--page <route>` — single-page white-box QA + fix loop (above).
- `--max-iter N` — override `remediation.maxIterations` for this run.
- `--scope build-and-proof | partial | full` — override `remediation.scope` (default `full`: also implement `missing` features).
- `--quick` — fewer domains / `haiku` for inventory agents; golden paths only. Loop still applies.
- `--incremental` — only re-audit domains whose owned files changed since the last git tag; reuse prior `findings.json` for the rest.

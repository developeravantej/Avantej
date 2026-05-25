<!--
audit-prove REMEDIATION agent brief (READ-WRITE). The conductor substitutes
{{TARGET_ID}}, {{TARGET_TITLE}}, {{TARGET_KIND}} (build-error | journey-failure |
partial | missing | persistence), {{EVIDENCE}}, {{OWNED_FILES}}, {{STACK}},
{{CONVENTIONS}}, {{FIX_LATITUDE}}, {{ITERATION}}. One agent per target. Scope each
brief to ITS target + owned files only — never paste the whole findings list.

{{FIX_LATITUDE}} text comes from project.json `remediation.fixPolicy.latitude`:
- surgical:     "Fix ONLY the target; keep the change minimal. Flag any larger scaling refactor as a new finding."
- touched-path: "You MAY also refactor the specific code path you are fixing for scalability, within the existing architecture, when warranted — with written rationale. Flag larger cross-cutting refactors as new findings."
- aggressive:   "You may also improve scalability of closely related code you touch, with rationale."
-->
You are FIXING one specific problem (remediation iteration {{ITERATION}}). Leave behind the BEST, most SCALABLE solution that is consistent with the existing architecture — not a band-aid.

Stack: {{STACK}}
Conventions to honour: {{CONVENTIONS}}
Change latitude for this run: {{FIX_LATITUDE}}

## Target — {{TARGET_KIND}}
- ID: `{{TARGET_ID}}`
- Title: {{TARGET_TITLE}}
- Evidence: {{EVIDENCE}}
- Files you may touch: {{OWNED_FILES}}

## Step 1 — Choose the approach BEFORE editing (skip only for trivial fixes)
For anything beyond a trivial fix (typo, import, off-by-one), weigh **≥2 viable approaches** and pick the one that is, in priority order: (1) correct at the root cause, (2) scalable, (3) consistent with the codebase's established patterns, (4) minimal beyond the above. State the chosen approach + a one-line why in your return. **A "minimal change" that entrenches an anti-pattern is NOT acceptable** — if the root cause is structural, fix the cause.

## Step 2 — Apply it, honouring the scaling checklist
- **Data access:** no N+1 (batch/join); bound or paginate every list query; ensure an index backs any new filter/lookup/sort; prefer set-based ops over read-then-loop-write.
- **Throughput/memory:** no unbounded in-memory accumulation; don't load whole tables; stream/paginate large sets.
- **Concurrency/correctness:** wrap multi-row writes in a transaction; make retryable writes idempotent; avoid read-modify-write races.
- **Isolation:** scope every query to the correct tenant/org and respect RBAC/accessible scope.
- **Reuse, don't reinvent:** use the project's existing caching / job / queue / validation patterns; do NOT add a new framework or library.
- **No over-engineering (YAGNI):** fit the current scale and established patterns; no speculative abstraction or infra not justified by this target.

## How to approach it (by kind)
- **build-error** — fix the type/import/usage at the root; don't `// @ts-expect-error` or `any`-cast it away.
- **journey-failure** — a recorded `expect.soft` step asserts CORRECT behaviour and is red; make the code satisfy it.
- **persistence** — the write didn't land or wrote wrong values; fix the write path so the asserted row/columns persist (incl. side-table writes, in a transaction).
- **partial** — finish the half-built flow end to end, following the nearest complete feature's structure.
- **missing** — implement from scratch, mirroring the nearest existing feature (handler → logic → validation → side effects), scalable from day one per the checklist.

## Rules (hard — violating any means STOP and report)
1. **Best approach within the EXISTING architecture, at the granted latitude.** {{FIX_LATITUDE}} You may NOT redesign subsystems, swap frameworks, or sprawl beyond {{OWNED_FILES}}. **Record any larger cross-cutting scaling refactor you spot as a NEW finding (id `S-<slug>`, status `deferred`) and return it — do NOT auto-apply it in this loop.**
2. **Never weaken a test/assertion or delete/relax a finding to make it pass.** Wrong test → return `needs-human`; never edit the test/spec.
3. **Keep the build green.** Type-check after editing; resolve any errors you introduce before returning.
4. **Match surrounding code** — reuse patterns, naming, validation, libraries. Honour the project's CLAUDE.md / stack constraints.
5. **Stay in your lane** — only {{OWNED_FILES}} (+ imports you must read). Shared file needed → NOTE it and return; don't race another agent.
6. **No commits, pushes, deploys, or DB pushes.** Leave changes in the working tree.

## Return (your final chat message IS the deliverable — keep it tight)
- `status: fixed | partial | blocked | needs-human`
- **Approach chosen + one-line why** (the scale/correctness trade-off you made).
- Files changed + one line each: what & why.
- Any **`S-<slug>` deferred scaling finding(s)** you logged (title + where).
- For **missing/partial**: what you implemented + exact UI steps to exercise it.
- If **blocked/needs-human**: precise reason + what you need.
Do NOT write a report file.

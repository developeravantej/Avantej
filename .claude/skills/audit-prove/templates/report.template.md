# Audit-Prove Report — {{DATE}}

**Session:** `{{SESSION}}`
**Scope:** {{N_DOMAINS}} domains · {{N_FINDINGS}} findings ({{N_TESTABLE}} testable)
**Build gate:** {{GATE_RESULT}}  ·  **Video:** {{VIDEO_STATUS}}
**Remediation:** {{REMEDIATION_SUMMARY}}  ·  **Branch:** `{{BRANCH}}`

---

## 0. Remediation loop
Iterations used: {{N_ITERATIONS}} / {{MAX_ITERATIONS}}.  Exit reason: {{LOOP_EXIT_REASON}}.

| Target | Kind | Status | Attempts | Notes |
|---|---|---|---|---|
{{REMEDIATION_ROWS}}

Per-iteration diffs: `loop/iteration-*.md`. Loop state: `loop/state.json`.
> Outstanding (`blocked` / `needs-human`) — needs a human decision:
{{OUTSTANDING_ROWS}}

## 1. Build gate
`{{GATE_CMD}}` (cold, caches cleared): **{{GATE_RESULT}}**.
> Blind spot (if any): {{API_GATE_NOTE}}

## 2. Proof video
- Video: `{{VIDEO_PATH}}`  (one continuous session)
- HTML report: `{{HTML_PATH}}`  ·  Trace: `{{TRACE_PATH}}`

### Pass/fail matrix
| Journey | Type | Finding | UI result | Persisted? |
|---|---|---|---|---|
{{MATRIX_ROWS}}

### Persistence verification
Mode: {{DB_VERIFY_MODE}} (direct DB where configured, else API read-back). Source: `test/db-results.json` + read-back assertions in the spec.
| Check | Target | Table | Mode | Result | Detail |
|---|---|---|---|---|---|
{{PERSISTENCE_ROWS}}
> A journey can pass in the UI but FAIL persistence — those rows are the highest-value findings (silent data loss / wrong writes).

## 3. Findings (prioritized)
Per-domain detail: `audit/01-*.md` … machine-readable: `audit/findings.json`. Legend: ✅verified · 📋agent-reported · ⚠️corrected.

### P0
{{P0_ROWS}}
### P1
{{P1_ROWS}}
### P2
{{P2_ROWS}}

## 4. Untested
Findings tagged `missing` (no surface to drive) or skipped because the build was red:
{{UNTESTED_ROWS}}

## 5. Verification notes
{{VERIFICATION_NOTES}}

# Type Safety Audit (Pass 2)
**Session:** zplan/04-23_12-45_commission-cleanup
**Findings:** 5 (0 critical · 1 high · 4 medium · 0 low · 0 info)

## Findings

### [HIGH] `UUID_RE` not defined as named constant — plan note present but execution pending
**Plan claims:** §3.5 note (added in audit-apply) says: "define locally inside `mark-paid-dialog.tsx` (file already has inline UUID regex on line 42; extract to `const UUID_RE = ...` at module scope)."
**Actual:** `mark-paid-dialog.tsx:41-43` still has the regex inline inside the `.refine()` call. No `UUID_RE` constant exists at module scope. The plan correctly instructs the executor to extract it; this has not been done yet. During Phase 4.2 the developer must not forget to extract the constant before writing `UUID_RE.test(v)` in the simplified schema — otherwise Phase 4 will fail `bun check-types`.
**File:** `apps/web/src/components/commissions/mark-paid-dialog.tsx:41-43`
**Fix:** Phase 4.2: add `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;` at module scope before the schema definition.

---

### [MEDIUM] `CommissionLedgerRow` missing `earnedAt` — Phase 5.3 pending
**Plan claims:** Phase 5.3 adds `earnedAt?: string | Date | null` to the type in `all-tab.tsx`.
**Actual:** `all-tab.tsx:40-61` — no `earnedAt` field on `CommissionLedgerRow`. Expected pre-execution state; plan correctly describes the fix.
**File:** `apps/web/src/components/pages/commissions/all-tab.tsx:40-61`
**Fix:** Execute Phase 5.3 per plan §3.4.

---

### [MEDIUM] `MyCommissionRow` missing `earnedAt` — Phase 5.3 pending
**Plan claims:** Phase 5.3 adds `earnedAt?: string | Date | null` to `MyCommissionRow` in `mine-tab.tsx`.
**Actual:** `mine-tab.tsx:13-28` — no `earnedAt` field. Expected pre-execution state.
**File:** `apps/web/src/components/pages/commissions/mine-tab.tsx:13-28`
**Fix:** Execute Phase 5.3 per plan §3.4.

---

### [MEDIUM] `markPaidSchema` retains `payoutMethod` and `payoutReference` — Phase 4.2 pending
**Plan claims:** Phase 4.2 removes both fields from the Zod schema, `useForm` defaultValues, and render tree.
**Actual:** `mark-paid-dialog.tsx:35-45` still has both fields in the schema. Form fields still rendered at lines 129–155 and 157–173. Expected pre-execution state; plan §3.5 and Phase 4.2 correctly describe the removal.
**File:** `apps/web/src/components/commissions/mark-paid-dialog.tsx:35-45`
**Fix:** Execute Phase 4.2 per plan §3.5.

---

### [MEDIUM] Four pre-existing `as any` casts — technical debt, not worsened by plan
**Plan claims:** No mention; pre-existing.
**Actual:**
- `all-tab.tsx:279`: `((membersData as any[] | undefined) ?? [])`
- `all-tab.tsx:342`: `(data as any)?.rows ?? []`
- `all-tab.tsx:343`: `(data as any)?.totals ?? {}`
- `mine-tab.tsx:85`: `(data as any[] | undefined) ?? []` — **note: this is the same cast that masks the `getMyCommissions` return type mismatch found in api-surface pass 2**

The mine-tab cast at line 85 means both `[]` and `{ splits: [], totalAmount: 0 }` evaluate to `[]` via the fallback, so the wrong mock shape passes tests silently. Fix the mock shape first (see api-surface finding), then this cast can be addressed in a follow-up.
**File:** `apps/web/src/components/pages/commissions/all-tab.tsx:279,342,343` · `mine-tab.tsx:85`
**Fix:** Out of scope for this session; address in a follow-up type-safety sprint. Highest priority: `mine-tab.tsx:85` (linked to the `getMyCommissions` mock mismatch).

---

## Summary
No CRITICAL type-safety issues in the plan itself. The HIGH finding (UUID_RE extraction) is a pre-execution risk where Phase 4.2 will fail `check-types` if the constant isn't defined before the simplified schema is written. Three MEDIUM items (earnedAt fields, schema cleanup) are correctly scheduled for Phases 5.3 and 4.2. The `mine-tab.tsx:85` cast is the most consequential pre-existing issue because it masks the `getMyCommissions` mock shape mismatch — fixing the mock in §3.8 (api-surface CRITICAL finding) must precede authoring mine-tab tests.

# API Surface Audit (Pass 2)
**Session:** zplan/04-23_12-45_commission-cleanup
**Findings:** 2 (1 critical · 1 high · 0 medium · 0 low · 3 info)

## Findings

### [CRITICAL] `getMyCommissions` mock shape is wrong — plan says array, actual returns object
**Plan claims:** §3.8 specifies `getMyCommissions: vi.fn().mockResolvedValue([])` — an empty array.
**Actual:** `packages/services/src/commission-splits.service.ts:143` returns `{ splits, totalAmount }`, not an array. The router passes this directly through. Any test written using the plan's mock shape (`[]`) will not match the real API response, causing test code that tries to iterate `.rows` or `.splits` to fail in unexpected ways.

The existing workaround in `apps/web/src/components/pages/commissions/mine-tab.tsx:85`:
```ts
const rows: MyCommissionRow[] = (data as any[] | undefined) ?? []
```
…uses `as any` to coerce the object, masking the mismatch. Tests written with `mockResolvedValue([])` will hit the same cast and appear to work — but any test asserting on the rendered rows will fail because the mock returns `[]` while the code paths through `(data as any[] | undefined) ?? []`, yielding `[]` in the test but `{ splits: [...], totalAmount: N }` in production.

**File:** `packages/services/src/commission-splits.service.ts:143` · `apps/web/src/components/pages/commissions/mine-tab.tsx:85`
**Fix:** Update plan §3.8 mock to: `getMyCommissions: vi.fn().mockResolvedValue({ splits: [], totalAmount: 0 })` and update Phase 6.2 test assertions accordingly.

---

### [HIGH] `mine-tab.tsx` `as any` cast hides `getMyCommissions` return type mismatch — tests will silently pass with wrong data shape
**Plan claims:** Mine-tab tests in Phases 5.4 and 6.2 will verify row rendering correctly.
**Actual:** Because `mine-tab.tsx:85` does `(data as any[] | undefined) ?? []`, passing either `[]` (plan mock) or `{ splits: [], totalAmount: 0 }` (correct mock) produces `[]` for both in the test environment. Tests will pass regardless of which mock shape is used, but the branch `(data as any[] | undefined) ?? []` would evaluate differently in production if the API ever changes shape.

The fix is the same as C1: correct the mock shape in §3.8 to `{ splits: [], totalAmount: 0 }`. Then tests authored against the corrected mock will correctly validate the production code path.

**File:** `apps/web/src/components/pages/commissions/mine-tab.tsx:85`
**Fix:** Same as above — fix mock shape in §3.8, then mine-tab tests become meaningful.

---

### [INFO] `listLedger` line citation verified at 158
**Plan claims:** §6.1 now cites `commission-splits.ts:158` (corrected in pass 1 audit-apply).
**Actual:** Procedure definition confirmed at line 158 of `packages/api/src/routers/commission-splits.ts`. ✓
**Fix:** No action needed.

---

### [INFO] `listLedger.totals` mock shape verified correct
**Plan claims:** §3.8 `totals: { pending: 0, approved: 0, paid: 0 }`.
**Actual:** `listCommissionLedger` returns totals in that exact shape (verified in service lines 857–865). ✓
**Fix:** No action needed.

---

### [INFO] All 7 procedures and `serviceCategories.list` verified present
**Actual:** All confirmed present and correctly exported. `trainers/view` caller of `listLedger` passes no `from`/`to` filters — Phase 5 earnedAt semantic change is safe. ✓
**Fix:** No action needed.

---

## Summary
One new CRITICAL finding: the plan's §3.8 mock for `getMyCommissions` specifies an array (`[]`) but the actual service returns `{ splits, totalAmount }`. The `as any` cast in `mine-tab.tsx` masks this at runtime and in tests, but the mock shape must be corrected before Phase 5.4 / 6.2 mine-tab tests are written, or those tests will silently verify the wrong data path. All other API surface items are verified clean.

# Swarm Audit — GAPS.md (Pass 2)
**Session:** 05-07_10-00_trainer-scheduling
**Run at:** 2026-05-07T11:00:00Z (Pass 2)
**Lenses:** schema-drift · api-surface · test-coverage · doc-consistency · type-safety · scalability
**Total new findings:** 10 (2 critical · 3 high · 4 medium · 1 low)
**Carried unresolved from Pass 1:** C1/TS1 (preferredData), H4/TS4 (isPending), H2 (onSuccess stub)

---

## Priority Fix Order (Pass 2 new findings only)

### P1 — Critical (new in Pass 2)

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| P2-C1 | type-safety + api-surface | `updateItem` function: `string` not assignable to `DayOfWeek` — introduced by Pass 1's DayOfWeek fix. TypeScript compile error. | `preferred-times-editor.tsx` T2.1 | At the `Select.onValueChange` call site, cast: `v as DayOfWeek`. Or inline the assignment without the generic helper. |
| P2-C2 (carried) | type-safety + doc-consistency | `preferredData` still undefined in PackageRow code snippet — annotation present but code still broken. Two critical items: (a) the lifted query pattern must be shown in the plan; (b) the `onSuccess` queryKey must be defined. | `package-row.tsx` T2.2 | Replace the broken code stub with a corrected skeleton showing lifted query + `preferredTimesData` variable name throughout. |

### P2 — High

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| P2-H1 | doc-consistency + api-surface | `onSuccess` in `upsertPreferredMutation` still a comment stub — no `queryClient.invalidateQueries` call or queryKey shown | T2.2 | After lifting preferred times query into PackageRow, replace comment with: `queryClient.invalidateQueries({ queryKey: ["preferredTimes", organizationId, pkg.id] })` |
| P2-H2 | api-surface | T3.1 uses `queryClient.invalidateQueries` but `useQueryClient` may not be in scope in `my-services/view.tsx` | T3.1 | Add note: implementor must call `const queryClient = useQueryClient()` if not already present |
| P2-H3 (carried) | type-safety | `CategoryBufferRow` has no `isPending` prop — double-save race | `category-buffer-row.tsx` T1.5 | Add `isPending?: boolean` prop; disable Save button when true |

### P3 — Medium

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| P2-M1 | type-safety | `CategoryBufferRow` stale edit value after mutation — `useState` init runs once; reopening edit shows old value | T1.5 | In `onClick={() => setEditing(true)}`, also reset value: `setValue(cat.bufferTimeMinutes !== null ? String(cat.bufferTimeMinutes) : ""); setEditing(true)` |
| P2-M2 | test-coverage | `listMine` integration: no explicit test for data correctness (only presence tested) | integration test | Add bullet: "Staff `listMine` returns correct categories with overrides merged" |
| P2-M3 | test-coverage | No integration test scaffold provided — implementors must copy from existing test | plan Section 7 | Add a note pointing to `purchase-orders.integration.test.ts` as the template to follow |
| P2-M4 | api-surface | DB query for `updateMine` verification still in router — no annotation was added in Pass 1 | router T1.3 | Add annotation: `<!-- audit-swarm: MEDIUM api-surface: verification query in router handler — consider extracting to service -->` |

### P4 — Low

| # | Lens | Finding | File | Fix |
|---|---|---|---|---|
| P2-L1 | doc-consistency | `onSuccess` comment stub uses informal phrasing — risk of implementor skipping it | T2.2 | Harden comment to: `// TODO(implement): queryClient.invalidateQueries({ queryKey: [...] })` |

---

## Lens Summary (Pass 2 new findings)

| Lens | Critical | High | Medium | Low | Info | Notes |
|---|---|---|---|---|---|---|
| schema-drift | 0 | 0 | 0 | 0 | 3 | All clear |
| api-surface | 0 | 2 | 2 | 0 | 1 | updateItem cast + onSuccess stub |
| test-coverage | 0 | 0 | 2 | 0 | 2 | listMine data test + scaffold note |
| doc-consistency | 1 | 1 | 1 | 1 | 2 | preferredData still broken in code |
| type-safety | 1 | 1 | 2 | 0 | 1 | updateItem critical + stale state |
| scalability | 0 | 0 | 0 | 0 | 3 | No new issues |

---

## Auto-fixable findings (Pass 2)

| # | Lens | Finding | Location in plan | Mechanical fix |
|---|---|---|---|---|
| P2-AF1 | type-safety | `updateItem` → `v as DayOfWeek` cast at Select call site | T2.1 `onValueChange` | `onValueChange={(v) => updateItem(i, "dayOfWeek", v as DayOfWeek)}` |
| P2-AF2 | type-safety | `CategoryBufferRow` stale state on re-edit | T1.5 Edit button | Add `setValue(...)` before `setEditing(true)` |
| P2-AF3 | api-surface | `updateMine` router annotation missing | T1.3 `updateMine` handler | Add `<!-- audit-swarm: MEDIUM ... -->` comment |
| P2-AF4 | test-coverage | `listMine` data correctness test | Section 7 | Add bullet point |
| P2-AF5 | test-coverage | Template reference for integration tests | Section 7 | Add reference to `purchase-orders.integration.test.ts` |

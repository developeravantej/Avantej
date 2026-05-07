# Schema Drift Audit — Pass 2
**Lens:** schema-drift-auditor
**Date:** 2026-05-07

## Summary

Re-auditing the updated plan. Pass 1 fixes correctly addressed permission doc drift and effectiveFrom pre-fill. New issue identified.

---

## Findings

### [INFO] M2 from Pass 1 now resolved — `hierarchyNodes.type` confirmed
- `packages/db/src/schema/tenant/hierarchy.ts` has `type: text("type").notNull()` with values `organization | country | region | area | branch`
- Also has `typeIdx: index("hierarchy_type_idx").on(table.type)` — the filter will be index-backed
- Plan's use of "hierarchy nodes of type 'branch'" in the dialog branch picker is **valid**

### [INFO] Schema claims remain accurate — no drift

### [MEDIUM] Plan §5 Phase 3 dialog says "Branch (client.hierarchy.listNodes filtered to accessible nodes)" — the plan does not specify filtering by `type = "branch"` in the WHERE clause. `hierarchy.listNodes` returns ALL nodes for the org (filtered by accessible scope). The UI must client-side filter the returned nodes to `type === "branch"` before populating the branch picker.
- Risk: Without filtering, the branch picker would include country/region/area/org nodes, making it possible to set a non-branch override target
- **Fix: Add explicit note to filter returned nodes by `node.type === "branch"` in the branch selector combobox**

### [LOW] Plan §3.1 table description lists `effectiveFrom` as `NOT NULL DEFAULT now()` — schema confirms this. The `setServicePrice` service function conditionally spreads `effectiveFrom` only when truthy, relying on DB default. This is consistent and correct.

---

## Rating Summary

| Finding | Severity | Auto-fixable |
|---|---|---|
| Branch picker must filter nodes by `type === "branch"` — not specified in plan | MEDIUM | Yes — add to plan §5 Phase 3 |
| `hierarchyNodes.type` confirmed — M2 from Pass 1 resolved | INFO | N/A |

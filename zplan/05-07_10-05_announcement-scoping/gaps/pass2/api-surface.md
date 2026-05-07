# API Surface Audit — Pass 2

## Changes since Pass 1
- `isAdmin` param added to both service function signatures (CRITICAL-2 resolved)
- `buildScopeFilter` helper added with empty-array guard (CRITICAL-1 resolved)
- Task 1.7b added: routers pass `isAdmin` to service
- Task 1.8b added: `AnnouncementRow` gets `scopedBranchIds?` in Phase 1

## Re-check of AS findings

### AS-01: listActive in baseRouter — STILL CORRECT ✓
### AS-02: Admin bypass — RESOLVED by isAdmin param ✓
### AS-04: Phase 1→2 type gap — RESOLVED by Task 1.8b ✓
### AS-05: inArray empty array — RESOLVED by buildScopeFilter guard ✓

---

## New finding P2-AS-01: buildScopeFilter helper placement — MEDIUM

The plan places `buildScopeFilter` in the §3 architecture section as a standalone function. In the service file, it needs to be a module-level function (not exported) before `listActiveAnnouncements` and `listAnnouncements`. The plan does not specify WHERE in the file the helper is placed.

**Risk:** If a developer adds `buildScopeFilter` after the functions that call it (e.g., at the bottom of the file), TypeScript will error ("used before declaration" for `function` declarations would hoist, but a `const` would not). Since the plan shows a `function` declaration style (not `const`), hoisting applies and placement order doesn't matter. Low risk.

**Recommendation:** Note in Task 1.3 or a new Task 1.3b that `buildScopeFilter` is a module-private function placed near the top of the service file.

---

## New finding P2-AS-02: listAnnouncements with isAdmin = undefined vs false — LOW

The plan adds `isAdmin?: boolean` (optional). When `isAdmin` is `undefined` (not passed), the `buildScopeFilter` receives `isAdmin = undefined`, and `if (isAdmin) return undefined` evaluates to `false` — so the scope filter IS applied. This means any caller that doesn't pass `isAdmin` will get scope-filtered results.

**Risk:** Any existing callers of `listAnnouncements` that don't pass `isAdmin` (i.e., all current callers) will now apply the scope filter when they previously didn't (the old code only applied the filter when `accessibleNodeIds` was provided). 

Wait — the router already passes `accessibleNodeIds: context.accessibleNodeIds` to `listAnnouncements`. Before Phase 1, the condition `if (accessibleNodeIds !== undefined)` applies the filter. After Phase 1, with `isAdmin` undefined, `buildScopeFilter(tenantDb, false, accessibleNodeIds)` applies the filter. Behavior change is intentional and correct — the scope filter now uses EXISTS instead of the old branchId filter. The `isAdmin: false` path is the non-admin path, which is what was being requested before (accessibleNodeIds was defined).

The one scenario to verify: if the router is updated to pass `isAdmin: context.member?.role === "admin"` and `context.member` is somehow null/undefined, then `context.member?.role === "admin"` evaluates to `false` (not an admin). The scope filter applies. This is safe — if context is broken, treat as non-admin.

**Conclusion:** No issue.

---

## New finding P2-AS-03: listActive router — memberType still not passed — MEDIUM (pre-existing, documented)

Pass 1 flagged this as AS-03 (pre-existing). It remains unresolved. The plan correctly marks it "out of scope" in the documentation. No change needed.

---

## New finding P2-AS-04: Return type of listActive not updated to include scopedBranchIds — LOW

Plan Task 1.8 updates `listAnnouncements` return type to include `scopedBranchIds`. But the plan also says:
> "Apply the same enrichment to `listActiveAnnouncements` so the widget can optionally display scope info in future."

The `listActive` router's return type (and therefore the oRPC client type) will include `scopedBranchIds` after Task 1.8. The widget (`announcements-widget.tsx`) currently uses `a.id`, `a.title`, `a.message`, `a.priority`, `a.isPinned`, `a.startDate`, `a.endDate` — it does NOT access `scopedBranchIds`. Adding the field to the return type is purely additive and safe. The widget works unchanged.

**However:** The plan says the widget needs no changes (Task 2.6 confirmed). After Phase 1, `listActive` returns `scopedBranchIds` for each announcement. The widget ignores it. TypeScript is happy (unused fields in returned objects are valid). ✓

---

## New finding P2-AS-05: scopedBranchIds on create router — potential confusion with branchId — LOW

After Phase 1, the `create` router accepts BOTH `branchId` (legacy, writes to `announcements.branchId`) AND `scopedBranchIds` (new, writes to `announcement_scopes`). An API consumer could pass both. The service would:
1. Insert the announcement with `branchId` set
2. Call `setAnnouncementScopes` with `scopedBranchIds`

Result: the announcement has both a legacy `branchId` AND scope rows. After Phase 1, `listActiveAnnouncements` uses only `announcement_scopes` for filtering — so the `branchId` column is ignored for filtering. The announcement behaves correctly (scope rows govern). This is consistent with the plan's §8 Q3 decision.

**Risk:** Low. An API consumer who passes `branchId` but NOT `scopedBranchIds` gets an announcement with the legacy field set but no scope rows (org-wide behavior, since NOT EXISTS passes). This is a regression from the pre-Phase-1 behavior where `branchId` was used for filtering. Document in §6 breakage analysis.

---

## Summary

| ID | Severity | New? | Action |
|---|---|---|---|
| P2-AS-05 | LOW | Yes | Document branchId-only scenario regression in §6 |
| P2-AS-01 | MEDIUM | Yes | Note buildScopeFilter placement in plan |
| P2-AS-02,03,04 | LOW/INFO | — | No action |

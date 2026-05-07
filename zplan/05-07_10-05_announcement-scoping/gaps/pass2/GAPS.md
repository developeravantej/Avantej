# GAPS.md — Pass 2 Synthesis
## Plan: Announcement Branch Scoping

---

## Status after Pass 1 fixes

All CRITICAL findings from Pass 1 are resolved in the plan text:
- CRITICAL-1 (inArray empty array): `buildScopeFilter` guard ✓
- CRITICAL-2 (admin bypass): `isAdmin` param added ✓

All HIGH findings from Pass 1 are resolved:
- HIGH-1 (existing tests break): resolved by CRITICAL-1 guard ✓
- HIGH-2 (Phase 1→2 type gap): Task 1.8b adds `scopedBranchIds?` to AnnouncementRow ✓
- HIGH-3 (mixed scenario untested): added as integration test 3 ✓

---

## Pass 2 NEW findings

### HIGH (0)
No new HIGH findings.

### MEDIUM (5)

**P2-AS-01 / P2-DC-01:** `buildScopeFilter` uses module-scoped `announcements` without explanation.
- The function references `announcements.id` (a module-level import) from inside a function that doesn't receive `announcements` as a parameter. This is valid TypeScript/JavaScript but looks like a bug to a reader. Add a comment.
- **Auto-fixable:** Add `// NOTE: 'announcements' is the module-level Drizzle table import` comment to the snippet.

**P2-DC-02:** Phase 1 verification steps missing admin path.
- The verification in Phase 1 only tests staff (non-admin) filtering. No admin verification step.
- **Auto-fixable:** Add admin verification to Phase 1 verification block.

**P2-TS-01:** `buildScopeFilter` return type — undefined not guarded at call site.
- Plan says "use result as condition only when non-undefined" but doesn't show the guard pattern.
- **Auto-fixable:** Add explicit `if (scopeFilter !== undefined) conditions.push(scopeFilter)` pattern to Task 1.1.

**P2-TC-01:** Unit test plan missing `isAdmin: true` and `isAdmin: false, accessibleNodeIds: []` explicit test cases.
- **Auto-fixable:** Add Tests 7 and 8 to §7 unit tests list.

**P2-SD-03:** `tenantDb.transaction()` compatibility in Cloudflare Workers / Neon serverless not verified.
- Sequential delete+insert without transaction may be needed as fallback.
- **Auto-fixable:** Add note to Task 1.3.

### LOW (4)

**P2-TC-02:** Partial-write risk on `createAnnouncement` — announcement inserted but scope insert fails.
- Announcement is created (visible as org-wide) if scope insertion fails.
- Consider wrapping both in same outer transaction in `createAnnouncement`.

**P2-SC-02:** Scope enrichment second query on `listActiveAnnouncements` — adds 1 query per widget load.
- Acceptable with client-side cache (`staleTime: 60s`). Note in plan.

**P2-AS-05:** branchId-only creates (legacy API calls) become org-wide after Phase 1.
- Pre-existing callers that send only `branchId` (not `scopedBranchIds`) will have their announcements treated as org-wide. Document in §6.

**P2-SC-03:** Large org UX — 500-node hierarchy creates unusable checkbox list.
- max-height scroll is already in the plan. Acceptable MVP limitation.

---

## Pass 2 fix counts

| Category | Count |
|---|---|
| CRITICAL | 0 (all resolved from Pass 1) |
| HIGH | 0 (all resolved from Pass 1) |
| MEDIUM (new) | 5 |
| LOW (new) | 4 |
| **Total new** | **9** |

Auto-fixable in plan text (Pass 2):
- P2-AS-01/DC-01: Add comment to buildScopeFilter snippet
- P2-DC-02: Add admin verification to Phase 1 verification
- P2-TS-01: Add scopeFilter undefined guard pattern to Task 1.1
- P2-TC-01: Add Tests 7 and 8 to §7
- P2-SD-03: Add transaction compatibility note to Task 1.3

Requires implementation awareness (not plan-text fixable):
- P2-TC-02: Partial-write risk (implementor decision)
- P2-SC-02: Widget enrichment query (acceptable, document)
- P2-AS-05: Legacy branchId regression (document in §6)
- P2-SC-03: Large-org UX limitation (acceptable)

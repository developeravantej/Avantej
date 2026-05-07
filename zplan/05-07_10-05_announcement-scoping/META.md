# META — Announcement Branch Scoping

| Field | Value |
|---|---|
| Session ID | 05-07_10-05_announcement-scoping |
| Created | 2026-05-07 |
| Feature area | Area F — Announcement Branch Scoping |
| Branch | feat/package-approval-flow (plan only; implement on a new branch) |
| Status | PLAN READY — not yet implemented |
| Plan file | `zplan/05-07_10-05_announcement-scoping/plan/plan.md` |

## Summary

The `announcement_scopes` junction table already exists in the DB schema but is completely wired to nothing. This plan adds:
1. Backend: scope writes on create/update, scope-aware filtering on list/listActive
2. Frontend: multi-branch selector in the create/edit dialog; scope labels in table; scope-aware AnnouncementsWidget

## Key decision

**Null scopes = org-wide** (see §8 Open Questions). Existing announcements with no `announcement_scopes` rows and `branchId IS NULL` continue to show for everyone.

## Estimated effort

~1 day (1 backend dev + 1 frontend dev working in parallel after Phase 1 lands)

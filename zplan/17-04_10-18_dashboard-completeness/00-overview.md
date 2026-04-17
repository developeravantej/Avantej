# Dashboard Completeness — Plan Overview

Created: 2026-04-17 10:18
Last revised: 2026-04-17 (post-implementation sync — rooms UI shipped, installment plans shipped)
Source: `zdocs/dashboard-functionality-2.md` + advisor-validated scope
Excluded (per user): items 2 (billing/subscription), 3 (signup→dashboard lifecycle), 4 (invitation acceptance), 8 (`requirePermission` stub severity) from the prioritized-misses list

## Status Snapshot (verified against code)

- **Rooms UI (`04-rooms-ui.md`) — DONE on branch `Customer-app`.** See `zdone/17-04_rooms-management.md`. Remaining doc follow-through captured in `01-documentation-patches.md` patches #4, #12, #13, #14.
- **Dynamic Installment Plans — DONE on branch `Customer-app` (out-of-plan work).** See `zdone/17-04_dynamic-installment-plans.md`. Adds a new `/dashboard/settings/installment-plans` page + widens `services.availablePaymentPlans` from enum to `string[]` — doc follow-through captured in `01-documentation-patches.md` patches #4, #12b (new), #13, #14; breakage surface in `06-impact-and-breakage.md` Change 3b.
- Everything else in this plan is untouched.

---

## 1. Problem Statement

`zdocs/dashboard-functionality.md` is the canonical reference for the `apps/web` dashboard. An audit (captured in `dashboard-functionality-2.md`) surfaced 24 categories of missing coverage spanning documentation gaps, live bugs, orphaned backend routers, and likely-legacy route files. This plan ships the remediation for a targeted subset.

The items in scope mix **four different workstream shapes** — and per advisor guidance they cannot be collapsed into one phased plan:

| Workstream | Shape | Example |
|------------|-------|---------|
| Documentation patches | Ordered edit list | Rewrite RBAC section, enumerate heavy form fields |
| Discovery / audits | Produce a new doc | Pagination caps, error handling conventions, currency defaults |
| Small bug fixes | Ticket-sized | GHL guard, invitation scope |
| Feature build | Has user journey + new page | Rooms management UI |
| Triage decisions | Product input required | 8 orphan routers, 5 unlinked routes |

This plan ships the workstreams that are ready. Triage decisions become Open Questions — not phases.

---

## 2. Goals & Success Criteria

### Goals

1. **Close the reference-vs-reality gap** in `dashboard-functionality.md` for content that is already shipped (Appointment Modal, RBAC model, heavy forms, commissions, config, admin router, route-config, hooks).
2. **Fix two bugs** whose remediation is ticket-sized (GHL guard, invitation-scope filter).
3. **Produce four audit docs** covering pagination, error handling, currency defaults, and raw-UUID inputs — these deliverables answer questions the primary doc cannot.
4. **Ship one feature build** — Rooms management page — to make rooms a first-class entity instead of a hidden dependency of the appointment modal.
5. **Document outstanding triage decisions** so product can prioritize the 8 orphan routers and 5 unlinked parallel routes.

### Success Criteria

- `dashboard-functionality.md` accurately describes every shipped page after this plan merges.
- The GHL page is no longer reachable by non-platform-admin members.
- Admins see invitations sent by all org admins, not only their own.
- Four new docs under `zdocs/` enumerate pagination caps, error-handling conventions, currency-field usage, and raw-UUID input remediation order.
- A working Rooms page exists at `/dashboard/rooms/view` with list + create + edit + deactivate/reactivate (no hard-delete UI — `rooms.delete` router proc internally soft-deletes).
- A single Open Questions doc lists every decision blocked on product input with a recommendation and decision checkbox.

### Explicit Non-Goals

- Not covered: billing flow, signup→dashboard lifecycle, invitation-acceptance UX, elevating the `requirePermission` stub to real route-level enforcement (these are items 2/3/4/8).
- Not covered: building UI for any of the 8 orphan routers — this plan only triages them.
- Not covered: deleting any parallel `_authenticated/*` route — this plan only verifies and documents them.

---

## 3. Result (What Changes for the User)

### For engineers / AI agents working on the codebase

**Before:** `dashboard-functionality.md` describes ~60% of what actually ships. Engineers rediscover the Appointment Modal, commission system, and 8-scope permission model every time they touch those areas.

**After:** The reference matches the codebase. New docs cover operational patterns (pagination, error handling, currency) that were never documented. A single Open Questions doc tells product what decisions to make next.

### For tenant admins

**Before:**
- The GoHighLevel Integration page is reachable by any logged-in member (staff, trainer, etc.).
- Admin A cannot see invitations sent by Admin B — each admin is siloed.
- Appointment scheduling requires a dedicated page to see rooms, which exists only inside the appointment modal.

**After:**
- GHL Integration is gated to platform-admin level.
- Invitations list is org-wide for any member with `user_management:read`.
- Rooms are manageable at `/dashboard/rooms/view` (list, create, edit, deactivate/reactivate) and referenced from the Appointment Modal (with inline "Create one →" empty-state link when no rooms exist).

### For tenant staff / trainers

No direct UX change in this plan. Indirect benefit: the docs they read (if they read docs) will match what they use.

---

## 4. Scope Boundaries — What's In This Plan

This plan contains:

| File | Workstream |
|------|-----------|
| `01-documentation-patches.md` | Ordered edit list for `dashboard-functionality.md` |
| `02-security-and-bugfixes.md` | GHL guard + invitation-scope bug (two tickets) |
| `03-audit-discovery.md` | Three discovery tasks → three new docs under `zdocs/` |
| `04-rooms-ui.md` | Rooms management page (the only real feature build) |
| `05-open-questions.md` | Orphan router triage + parallel-route verification + single-item flow decision |
| `06-impact-and-breakage.md` | Caller/importer analysis for the two code changes |
| `07-cross-cutting-concerns.md` | Testing, rollback, deployment coupling |

There is **no `user-journeys.md`** at the top level because only one workstream (Rooms UI) has a user journey. That journey lives inside `04-rooms-ui.md`.

---

## 5. Execution Order

These workstreams are independent and can run in parallel, but sensible ordering is:

1. **`05-open-questions.md`** first — get product to triage orphan routers and confirm the parallel-route deletion plan. Blocks nothing but informs everything else.
2. **`02-security-and-bugfixes.md`** in parallel — no dependency on docs.
3. **`03-audit-discovery.md`** in parallel — discovery is orthogonal.
4. **`01-documentation-patches.md`** after `03` completes, because the audits produce content that feeds the primary doc. Patches #4, #12, #13, #14 now also absorb the already-shipped Rooms page and the new Installment Plans settings page.
5. ~~**`04-rooms-ui.md`** last — adds a new page, which then needs a doc entry.~~ **SHIPPED** — see `zdone/17-04_rooms-management.md`.

---

## 6. Acceptance Criteria — Whole Plan

- [ ] All items in `01-documentation-patches.md` merged into `zdocs/dashboard-functionality.md`
- [ ] GHL guard ticket closed with a live page-level permission check
- [ ] Invitation scope ticket closed with admins seeing org-wide invitations
- [ ] Four new audit docs merged to `zdocs/` (pagination, error handling, currency, UUID inputs)
- [x] Rooms page live at `/dashboard/rooms/view` and linked from sidebar — shipped on `Customer-app`
- [ ] `05-open-questions.md` resolved by product with check-marks on each decision

---

## 7. Residual Gaps Not in This Plan

Called out explicitly so readers know what's still uncovered after this plan ships. None of these block the plan; they are candidate follow-ups.

### Excluded by User (items 2, 3, 4, 8 from the prioritized-misses list)

- Billing / subscription flow (`/subscribe`, ~766 lines, Stripe checkout)
- Full user lifecycle (signup → verify-email → setup-password → subscribe → onboarding → dashboard)
- Invitation acceptance flow (`/accept-invitation`, ~342 lines, multi-tenant critical path)
- Elevating the `requirePermission` stub in `route-guards.ts` to real route-level enforcement

### Out of Scope (not in prioritized list, but worth flagging)

| Area | Why deferred |
|------|-------------|
| Accessibility / keyboard navigation / ARIA conventions | Needs its own audit + remediation plan; not a documentation gap per se |
| Responsive / mobile layout of dashboard pages | Dashboard is desktop-first today; mobile work is a product decision |
| Real-time sync / WebSocket patterns | Unknown whether the app uses any; needs discovery |
| Multi-tab React Query cache coordination | Minor concern; no known incidents |
| Offline / network-failure behavior | Not a product requirement today |
| Per-router cache-invalidation contract (which mutations invalidate which keys) | Pattern-recognition work; could be another audit |
| Internationalization (i18n) | App is English-only today |
| Pre-commit hook details (Husky / oxlint config) | Out of product-doc scope |
| Backend auth audit for GHL webhook endpoints (`/webhooks/gohighlevel/*`) | The GHL frontend uses raw `fetch` to public-looking endpoints; Ticket A's frontend guard does NOT protect these endpoints — needs a backend follow-up |
| Roles / Permissions create-edit flows from Card / Matrix views beyond the Heavy Forms Field Inventory | The inventory points at the form files; deeper UX docs per-view are deferred |

### Known Next-Plan Candidates (triggered by this plan's outputs)

- Outcomes of Q1 (orphan router triage) → 0–8 follow-up feature tickets
- Outcomes of Q2 (parallel route verification) → cleanup PR
- Outcomes of Q6 (commission UI) → 1–2 follow-up feature tickets
- Remediation of UUID-input audit rows → N follow-up tickets, one per raw UUID field

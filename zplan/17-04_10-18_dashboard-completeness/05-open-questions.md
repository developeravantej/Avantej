# Open Questions — Decisions Blocking Further Work

> These items cannot be planned until product decides direction.
> Each item has a recommendation; product may override.
> Check the box next to the chosen path.

---

## Q1: Orphan Router Triage — 8 Routers With No Dashboard UI

Each of these routers exists in `packages/api/src/routers/`, is wired to `baseRouter`, and has no dashboard page. For each, the team must choose one of three outcomes:

- **BUILD**: design + ship a dashboard page (follow the Rooms pattern in `04-rooms-ui.md`)
- **BACKEND-ONLY**: keep the router, document as intentionally headless (e.g., called only by native app or internal jobs)
- **REMOVE**: delete the router + its service layer (if unused anywhere)

### Triage Table

| Router | Primary Use | Recommendation | Decision |
|--------|-------------|----------------|----------|
| `waitlist` | Appointment waitlist management | BUILD — admins need visibility when appointments are full | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |
| `commissionSplits` | Staff commission per appointment | BUILD — staff need to see earnings; admins need to verify calculations | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |
| `organizationSettings` | Org-level config (hours, currency, timezone) | BUILD — fundamental ops page | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |
| `userActivityLog` | Audit trail | BUILD — compliance + forensic use | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |
| `customerProfiles` | Registered customer records | BUILD — walk-in has a page, registered should too | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |
| `notificationPreferences` | Per-user channel preferences | BUILD (small) — user-settings page | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |
| `preferredTimes` | Customer preferred booking windows | BACKEND-ONLY — native-app concern, no admin action needed | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |
| `products.getStock` / `adjustStock` | Inventory stock counts + adjustments | BUILD — add stock column + row action to existing Products page | [ ] BUILD [ ] BACKEND-ONLY [ ] REMOVE |

### Once Decided

Each "BUILD" creates a follow-up ticket sized similar to `04-rooms-ui.md`. Each "BACKEND-ONLY" gets a one-line note in `dashboard-functionality.md` under a new "Backend-Only Routers" section. Each "REMOVE" is a cleanup PR.

**Who decides:** product lead + tech lead.
**By when:** before this plan's next iteration.

---

## Q2: Parallel `_authenticated/*/view.tsx` Routes — Keep or Delete?

Five route files live outside `/dashboard/_layout/` and are **registered** in `routeTree.gen.ts` but **not linked** from the sidebar. They are reachable by direct URL.

| Route File | Dashboard Parallel | Last Modified | Content Status |
|------------|-------------------|---------------|----------------|
| `_authenticated/customers.tsx` (~14KB) | None — no dashboard equivalent | 2026-04-07 | Unclear — may be a legitimate separate feature |
| `_authenticated/appointment/view.tsx` | `/dashboard/appointment/view` | 2026-03-31 | Likely legacy |
| `_authenticated/service/view.tsx` | `/dashboard/service/view` | 2026-03-31 | Likely legacy |
| `_authenticated/service-category/view.tsx` | `/dashboard/service-category/view` | 2026-03-31 | Likely legacy |
| `_authenticated/user/view.tsx` | `/dashboard/user/view` | 2026-03-31 | Likely legacy |

### Verification Steps Before Deletion

1. Grep the web codebase for direct references to `/_authenticated/customers`, `/_authenticated/appointment/view`, etc.
2. Grep for `navigate("/customers")` or similar short-form navigation that might resolve to these routes
3. Check outgoing emails / notifications for hardcoded links
4. Check `apps/server` routes / redirects
5. Ask the team in standup whether any are intentional

### Decision

- [ ] **DELETE all 5** — after verification shows no references
- [ ] **KEEP `customers.tsx`** (treat as a separate feature), delete the other 4
- [ ] **KEEP all 5** — document as intentional parallel routes with a reason
- [ ] **MIGRATE** — fold `customers.tsx` content into a new dashboard page, delete the rest

**Recommendation:** verify first. Default to "DELETE all 5" if verification is clean. `customers.tsx` deserves an extra look given its size (14KB) and recent modification date (April 7) — someone may be actively using it.

**Who decides:** tech lead after verification.
**Follow-up:** a small cleanup PR that removes the files + regenerates `routeTree.gen.ts`.

---

## Q3: Single-Item-Only Stock Requests / Transfer Orders

Both Stock Requests and Transfer Orders create forms support only one line item per request. This is documented as "currently supports only 1 item per request" in the primary doc.

### Question

Is multi-item support a planned feature, or is this the intended permanent design?

### Impact

- If permanent: flag more prominently in the primary doc as a design limitation, not a bug
- If planned: schedule a follow-up to extend forms + API `create` payload to accept an array of items

### Decision

- [ ] **Permanent single-item** — update doc wording
- [ ] **Planned multi-item** — create follow-up ticket with rough estimate
- [ ] **Unclear, defer** — revisit in 2 sprints

**Who decides:** product lead.

---

## Q4: Organization Switching UX — What Exists Today?

The primary doc mentions `current_organization_id` in localStorage (from auto-memory). No dashboard UI for switching between orgs is documented. The `useUserContext` hook returns the current org based on this localStorage key.

### Question

- Do multi-org users exist in production today? (Check: users with >1 active membership in the control-panel DB)
- If yes: where does the switcher UI live?
- If no: is multi-org a planned feature?

### Decision

- [ ] **No multi-org users today** — document current flow ("first org in list wins; no switcher"), file a feature ticket when multi-org becomes real
- [ ] **Multi-org users exist but no switcher** — ship an org switcher in the top bar or user-menu dropdown
- [ ] **Switcher exists, I missed it** — point to the component for docs

**Who decides:** product lead.

---

## Q5: GHL Integration Gate — Platform Admin vs Tenant Admin?

Referenced in `02-security-and-bugfixes.md` Ticket A.

- [ ] **Option A**: platform-admin only (`useIsSystemAdmin`) — matches "diagnostic" purpose
- [ ] **Option B**: tenant-admin — each tenant manages their own GHL link

**Recommendation:** Option A until GHL becomes a tenant product feature.

**Who decides:** product lead + security.

---

## Q6: Commission & Incentive UI

Commission configuration lives in `service-category-form.tsx` and `role-form.tsx`. Commission output lives in `commissionSplits` router with no UI.

### Question

Where should staff view their earnings? Where should admins verify commission calculations?

### Recommendation

- Staff: a "My Earnings" page under the "My Work" sidebar group (parallel to My Services)
- Admins: a "Commission Center" page under Finance with filters (staff, date range, service)

### Decision

- [ ] **Build both** — create two tickets following the Rooms pattern
- [ ] **Build admin only** — staff see earnings indirectly via payouts
- [ ] **Defer** — commissions are functional; UI is nice-to-have

**Who decides:** product lead.

---

## Summary Table

| Q | Decision Owner | Blocks |
|---|---------------|--------|
| Q1 (8 orphan routers) | Product + Tech | Follow-up plan(s) per router |
| Q2 (5 parallel routes) | Tech | Cleanup PR |
| Q3 (single-item flows) | Product | Doc wording + potential follow-up |
| Q4 (org switching) | Product | Doc section + potential feature |
| Q5 (GHL gate) | Product + Security | `02-security-and-bugfixes.md` Ticket A |
| Q6 (commission UI) | Product | Follow-up ticket(s) |

No open question blocks the docs, audits, or rooms build in this plan from proceeding.

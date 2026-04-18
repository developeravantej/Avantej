# Dashboard Completeness — /chrome Test Plan

_Date: 2026-04-17 · Branch: `Customer-app` · Source: `zdone/17-04_dashboard-completeness.md`_

Run this checklist with `/chrome localhost:3001` after the dev stack is up (`bun dev`).

Test credentials:
- **Platform admin:** `developer.avantej@gmail.com` / `password1234`
- **Tenant admin (not platform admin):** `franchisee@gmail.com` / `password123`

---

## Ticket A — GHL Page Guard

### Golden Path (platform admin can access)
- [ ] Log in as `developer.avantej@gmail.com`
- [ ] Navigate directly to `http://localhost:3001/go-highlevel-integration`
- [ ] Page loads normally — see webhook setup instructions, location mappings, recent sync payloads
- [ ] No "Access Denied" card visible

### Golden Path (tenant admin blocked)
- [ ] Log out. Log in as `franchisee@gmail.com`
- [ ] Navigate directly to `http://localhost:3001/go-highlevel-integration`
- [ ] Expected: redirected to `/dashboard?unauthorized=true` **OR** see an "Access Denied" card (in-component gate)
- [ ] No webhook data, location list, or mapping form is visible

### Edge Cases
- [ ] Staff role user (non-admin) → same block as tenant admin
- [ ] Navigation via browser back/forward from GHL page after logout → redirects to login, not to GHL page

### Regression
- [ ] `/dashboard` loads normally (no spurious `?unauthorized=true` toast on legit navigation)
- [ ] Other `/_authenticated/*` pages unaffected (onboarding, customers, etc.)

---

## Ticket B — Invitation Scope Fix

### Setup
- [ ] Ensure at least two admin users exist in the same org (create via `/dashboard/access-control/invitations` if needed)
- [ ] Admin A sends one invitation to `testA@example.com`
- [ ] Admin B sends one invitation to `testB@example.com`

### Golden Path (admin sees org-wide invites)
- [ ] Log in as Admin A → navigate to `/dashboard/access-control/invitations`
- [ ] Expected: **both** `testA@example.com` AND `testB@example.com` appear in the list
- [ ] Log out. Log in as Admin B → navigate to the same page
- [ ] Expected: same list — both invites visible

### Edge Cases
- [ ] Staff user without `user_management:read` → either gets 403 or sees an empty list (unchanged behavior — should still be locked out)
- [ ] Empty state (brand-new org, zero invitations) → empty list renders cleanly, no error toast

### Regression
- [ ] Send a new invitation from Admin A → appears in both admins' lists immediately (after refetch)
- [ ] Resend invitation → still scoped correctly
- [ ] Revoke invitation → removed from both admins' views

---

## Audit Docs (quick sanity only — no browser work)

- [ ] Open `zdocs/pagination-audit.md` — scan for any blatantly wrong claim about a router you know well
- [ ] Open `zdocs/error-handling-conventions.md` — confirm at least one page you recognize is listed
- [ ] Open `zdocs/currency-defaults-audit.md` — confirm expenses/payments/payouts flagged
- [ ] Open `zdocs/uuid-inputs-audit.md` — confirm walk-in-customers, class-slots, purchase-orders all flagged

---

## `dashboard-functionality.md` Patches

Browser-facing spot checks (confirm the doc matches the page):

- [ ] Open Rooms page (`/dashboard/rooms/view`) → doc's Section 5d fields match (Name, Type, Capacity, Branch combobox, Active toggle)
- [ ] Open Installment Plans (`/dashboard/settings/installment-plans`) → doc's Section 18e schema matches (Name, Code, numInstallments, defaultIntervalDays, isDefault, Actions)
- [ ] Open sidebar → doc's Section 19 tree reflects Rooms under Appointments group + Installment Plans under Config group

---

## Acceptance

When all boxes above are checked:
- [ ] File a single commit noting "test pass: dashboard-completeness plan"
- [ ] Move this file to `zdone/` or delete it (done-is-done)

---

## Known Gotchas

- If the GHL redirect lands on `/dashboard?unauthorized=true` but no toast appears, that's fine — the plan did not require a visible toast (explicit non-goal in `07-cross-cutting-concerns.md`).
- Browser cache may hide the session-level gate; hard-reload between login swaps.
- If both admins' invites don't appear, check that `requirePermission("user_management", "read")` actually passes for each admin — staff/trainer roles will correctly see only their own (or a 403).

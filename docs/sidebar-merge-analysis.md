# Sidebar Merge Analysis

Each group below identifies pages that overlap in purpose and recommends how to consolidate them.
The goal is fewer top-level nav items without losing functionality — achieved with tabs, sub-sections,
or absorbing a thin page into a richer one.

---

## 1. Customers — Registered + Walk-in → "Customers" (tabs)

**Current:** Two separate nav items, two separate pages, two separate routes.
**Problem:** They are the same concept split by registration status. Staff constantly context-switch between them during a single front-desk session.
**Fix:** Single "Customers" page with two tabs — **Registered** and **Walk-in**. Identical layout, different data source. The drawer/sheet on each row can already handle both `clientType: member` and `clientType: walk_in` (the attendance page does this today).
**Nav item removed:** Walk-in

---

## 2. Role View + Access Control – Roles → one "Roles" page

**Current:** `/dashboard/role/view` (read-only role list) and `/dashboard/access-control/roles` (roles CRUD wizard) coexist. The codebase docs explicitly flag this overlap (previously documented in zhub, now retired).
**Problem:** Two routes do almost the same job. Role View is read-only; Access Control – Roles adds a creation wizard. They should be one page.
**Fix:** Keep `/dashboard/access-control/roles` (the richer one with CRUD). Delete the Staff → "User Roles" nav item and route.
**Nav item removed:** User Roles (under Staff)

---

## 3. Access Control — Roles + Permissions → "Roles" page with a Permissions tab

**Current:** Role Management and Permissions are separate nav items that staff rarely visit independently — you only care about permissions in the context of a role.
**Problem:** Permissions without role context is a meaningless matrix. You always navigate Roles → then want to see/edit that role's permissions.
**Fix:** Absorb Permissions as a tab or expandable section within the Roles page. Remove the standalone Permissions nav item.
**Nav item removed:** Permissions (Access & Comms)

---

## 4. User Assignment + Invitations → "Staff Access" (tabs)

**Current:** Two separate pages both dealing with "who has access to this organisation."
**Problem:** Inviting someone and then assigning their role are steps 1 and 2 of the same workflow. Making them separate pages forces staff to navigate away mid-task.
**Fix:** Single "Staff Access" page — tab **Members** (current User Assignment) and tab **Invitations** (pending invites). The creation flow sends an invite, and once accepted the member appears in the Members tab for role assignment.
**Nav items removed:** Invitations (or User Assignment — keep one label, merge the other)

---

## 5. Services + Service Categories → "Services" page with a Categories tab

**Current:** Two nav items, two separate routes under the Services group.
**Problem:** Service Categories have no value on their own — they only matter when setting up or filtering Services. They are configuration data for Services, not a standalone management surface.
**Fix:** "Services" page with two tabs: **Services** (current service CRUD) and **Categories** (current service-category CRUD). Categories stays accessible without a dedicated nav item.
**Nav item removed:** Service Categories

---

## 6. Memberships + Package Instances → "Packages" (tabs)

**Current:** Both live under the Customers group and represent the same concept — a customer owns a thing with a lifecycle.
**Problem:** A "membership" is a time-based package instance. They share the same drawer and the same data model. Having two nav items confuses front-desk staff on which one to check.
**Fix:** Single "Packages" page — tab **Memberships** (time-based, expiry-tracked) and tab **Session Packs** (credit-based package instances). Installments becomes a third tab here or stays separate (see below).
**Nav item removed:** Package Instances (or Memberships — keep the clearer label)

---

## 7. Installments → tab inside "Packages"

**Current:** Separate nav item under Customers.
**Problem:** Installments are a payment mode attached to a package purchase — not a standalone entity. Staff look up installments because a customer is asking about their package balance.
**Fix:** Add an **Installments** tab inside the consolidated Packages page (above). Filter pre-applied to show only packages with active installment schedules.
**Nav item removed:** Installments

---

## 8. UoM + UoM Conversions → "Units of Measure" (tabs)

**Current:** Two nav items, two routes in the Inventory group.
**Problem:** UoM Conversions are meaningless without the base units present. They belong together. The codebase docs also note that deleting a base UoM while conversions exist fails silently — a single page makes that constraint visible.
**Fix:** Single "Units of Measure" page — tab **Units** and tab **Conversions**.
**Nav item removed:** UoM Conversions

---

## 9. Brands + Categories + Suppliers → Inventory Options hub (tabs)

**Current:** Three separate nav items plus a separate "Inventory Options" hub page that acts as a launcher for... these same three pages.
**Problem:** The hub page exists but the nav also shows each item individually, doubling the entries. The hub is the right idea — use it.
**Fix:** Keep the "Inventory Options" nav item. Make it a tabbed page with tabs: **Brands**, **Categories**, **Suppliers**, and optionally **UoM** (if merged above). Remove the three standalone nav items.
**Nav items removed:** Brands, Categories, Suppliers (all replaced by Inventory Options tabs)

---

## 10. Stock Requests + Transfer Orders → "Stock Movement" (tabs)

**Current:** Two separate nav items for two lifecycle stages of the same physical event (request stock → approve → transfer).
**Problem:** A stock request that gets approved becomes a transfer order. They are sequential states of one process. Viewing them separately breaks the workflow.
**Fix:** Single "Stock Movement" page — tab **Requests** and tab **Transfers**. The approve action on a request row could immediately surface the resulting transfer in the adjacent tab.
**Nav item removed:** Transfer Orders (or Stock Requests — keep the clearer label)

---

## 11. Commissions + My Commissions → "Commissions" (role-aware tabs)

**Current:** Two separate nav items — Commissions (full ledger, manager view) and My Commissions (personal, staff view). Currently in different groups (Finance vs no explicit group for My Commissions).
**Problem:** They are the same entity filtered by `staffId`. The current split forces staff to know which one is "theirs."
**Fix:** Single "Commissions" page — default tab is **Mine** (pre-filtered to current user). Managers also see an **All** tab. Role-gates the tab, not the page. My Commissions nav item removed.
**Nav item removed:** My Commissions (or move into Finance as the unified page)

---

## 12. Notifications (Access & Comms) + Notifications (Settings) — keep, rename Settings item

**Current:** Two "Notifications" entries — one is the inbox, one is preferences.
**Problem:** Same label, different purpose. Confusing in the nav, especially when both are visible.
**Fix:** No merge needed, just rename the Settings entry to **Notification Preferences** to make it unambiguous.
**Nav item renamed:** Settings → Notifications → "Notification Preferences"

---

## Summary — Before vs After

| Group | Before | After | Items removed |
|---|---|---|---|
| Customers | Registered, Walk-in, Memberships, Package Instances, Installments | Customers (tabs: Registered/Walk-in), Packages (tabs: Memberships/Session Packs/Installments) | 3 |
| Scheduling | Appointments, Class Slots, Rooms | unchanged | 0 |
| Services | Service Categories, Services | Services (tabs: Services/Categories) | 1 |
| Sales | Sales, Payments, Cancelled Sales, Promotions, Purchase Orders | unchanged | 0 |
| Inventory | Products, Inventory Options, Brands, Categories, Suppliers, UoM, UoM Conversions, Stock Requests, Transfer Orders | Products, Inventory Options (tabs: Brands/Categories/Suppliers), UoM (tabs: Units/Conversions), Stock Movement (tabs: Requests/Transfers) | 4 |
| Finance | Expenses, Payouts, Refunds, Commissions | Expenses, Payouts, Refunds, Commissions (tabs: Mine/All) | 0 |
| Staff | Trainers, Employees, User Roles, Attendance, Audit Log | Trainers, Employees, Attendance, Audit Log | 1 (User Roles) |
| Access & Comms | Role Management, Permissions, User Assignment, Invitations, Announcements, Notifications | Roles (tabs: Roles/Permissions), Staff Access (tabs: Members/Invitations), Announcements, Notifications | 2 |
| Organisation | Branches | unchanged | 0 |
| Settings | Tax Rates, Installment Plans, Google Calendar, Organization, Notifications, GHL Integration | Tax Rates, Installment Plans, Google Calendar, Organization, Notification Preferences, GHL Integration | 0 (rename only) |
| My Work | My Services | unchanged | 0 |
| **Total** | **~50 nav items** | **~35 nav items** | **~15** |

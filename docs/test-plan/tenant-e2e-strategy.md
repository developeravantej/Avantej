# Phase-2 E2E Test Strategy — Avantej Tenant Dashboard (PROD MOVE Migration Proof)

## Scope

This strategy covers the **tenant-side dashboard** of the Avantej multi-tenant gym SaaS, validated on **PROD `app.avantej.com`** signed in as the migrated **MOVE Private Fitness** owner (`franchisee@gmail.com`). It is a **screenshot-based, agent-driven** suite whose primary goal is to prove the Neon-branch migration carried over MOVE's reference data (23 branches / 33 hierarchy nodes, 124 staff incl. 114 coaches, 70 services, 4 categories, installment plans) while honestly capturing the **pristine-tenant reality** (0 customers, 0 sales orders, 0 commissions). The suite is **read-only-first**: Phase 1 fires only `SELECT`-class queries plus client-side UI/localStorage state so the live client tenant is never mutated; every create/update/delete path is quarantined into Phase 2 behind a write-gate tag for a disposable/seeded Neon branch.

> ## Total read-only P1 specs runnable now: **31** (across 17 modules, ~166 screenshot captures, zero writes)

---

## Overview

| Module | #screens | #proposedSpecs | #read-only P1 | Notes |
|---|---|---|---|---|
| scope-switcher-isolation | 6 | 4 | 2 | Cross-cutting RBAC ceiling; isolation only provable via own-node list (no 2nd tenant on PROD) |
| customers | 7 | 4 | 2 | Empty directory + Add-Customer wizard read-only; create is the 1 write |
| appointments-classslots-attendance | 7 | 4 | 2 | Schedule/Attendance/ClassSlots empty states; class-slot lifecycle is write |
| trainers | 8 | 4 | 2 | 114-coach roster is headline migration proof; availability needs-seed |
| services-catalog | 16 | 4 | 2 | 70 services + 4 commission configs; rooms write gated |
| pos-sales-create | 10 | 4 | 2 | Wizard + 0-customer search; recordSale write deferred |
| sales-payments-refunds | 10 | 4 | 2 | KPI/tab empty states; refund lifecycle blocked (needs seed sale) |
| commissions-payouts | 12 | 4 | 2 | Six-tab empty smoke + payouts drawer open; all writes gated |
| packages | 9 | 4 | 1 | 3-tab empty states; per-installment rule via wizard-open |
| expenses-taxrates | 14 | 4 | 2 | Expenses empty + tax-rate config display; dialogs cancel-only |
| employees-staffaccess-rbac | 16 | 4 | 1 | 124-member role grouping; dialogs mutation-capable (cancel-only) |
| branches-hierarchy | 8 | 4 | 2 | 23-branch tree is core proof; edit/create render-only |
| onboarding-qr | 11 | 4 | 1 | Branch list non-empty (lists branches not members); QR gen is write |
| announcements-approvals | 17 | 4 | 2 | Announce render + 4-tab empty approvals queue |
| org-settings-notifications | 8 | 4 | 2 | Org config + prefs render; toggle auto-saves (write) |
| integrations-audit | 17 | 4 | 2 | Audit log strongest proof (may have rows); GCal/GHL render-only |
| overview-dashboard | 7 | 4 | 2 | Launchpad + KPI hero empty-state; period/scope re-query |
| **Totals** | **183** | **68** | **31** | 31 read-only P1 · 29 read-only P2 · 8 write (P3) |

---

## Per-module specs

### scope-switcher-isolation
- [ ] **Scope switcher renders and opens the country→state→branch tree (RBAC ceiling visible)** — `read-only` · **P1** · easy · 4 captures
  - Dashboard shows header scope combobox 'All · MOVE Private Fitness'
  - Combobox clicked; popover open with 'Search branches...' input + pinned 'All' entry (checkmark active)
  - Top-level depth-indented nodes with COUNTRY/STATE type tags
  - List scrolled to BRANCH-level entries (MOVE's 23 branches)
- [ ] **Selecting a branch narrows the dashboard, then 'All' restores org-wide view** — `read-only` · **P1** · easy · 5 captures
  - Dashboard at 'All' scope with org-wide KPI cards/widgets
  - Popover open; a specific branch row highlighted
  - Trigger shows selected branch; widgets re-rendered (empty-state expected, 0 sales/members)
  - Popover reopened with 'All' re-selected
  - Dashboard restored to org-wide view
- [ ] **In-switcher search filters branches and shows the empty state** — `read-only` · P2 · easy · 3 captures
  - Popover open showing full branch list + pinned 'All'
  - Partial branch name typed; list filtered, 'All' hidden while searching
  - Non-matching string typed; 'No branches found.' empty state
- [ ] **Selected scope persists across navigation and narrows other pages** — `read-only` · P2 · easy · 4 captures
  - Dashboard with a branch selected
  - Navigate to Services; same branch shown in that page's switcher
  - Services catalog scoped to that branch
  - Navigate to Expenses; scope persists, list reflects narrowed branch (empty-state)

### customers
- [ ] **Customer Directory renders empty-state on the migrated MOVE tenant** — `read-only` · **P1** · easy · 4 captures
  - App at /dashboard/customers/v2/view, header 'Customers / Directory'
  - Filter sidebar 'Customers' title, count badge 0
  - Content pane 'No customers yet' / 'Invite your first customer to get started'
  - ScopeSwitcher + permission-gated 'Add Customer' button visible
- [ ] **Add Customer wizard opens and lists the real 23-branch hierarchy** — `read-only` · **P1** · easy · 5 captures
  - Directory loaded with 'Add Customer' button
  - Dialog open: 'CUSTOMER DIRECTORY' eyebrow + 'Add Customer' title
  - Fields visible: First/Last, Phone, Email, Branch/Scope, DOB, Notes
  - Branch/Scope select open showing MOVE's branch list (hierarchy.listNodes)
  - Dialog dismissed via Cancel, no record created
- [ ] **Scope switcher narrows the customer directory** — `read-only` · P2 · easy · 5 captures
  - Directory at 'All' scope, total count 0
  - ScopeSwitcher open showing country list
  - Country/branch scope selected and applied
  - Directory re-queried within scope, empty pane / count 0
  - Scope reset to 'All'
- [ ] **Create a customer profile end-to-end (WRITE — gated)** — `creates-data` · P3 · needs-seed-data · 6 captures
  - Add Customer dialog with required fields highlighted
  - First/Last/Phone filled, real branch selected
  - 'Create Profile' submitted ('Creating…' state)
  - Success toast 'Customer profile created'
  - New customer row in sidebar (count → 1)
  - Profile Panel opens on Overview tab

### appointments-classslots-attendance
- [ ] **Appointments page renders Schedule + Attendance tabs (empty-state happy path)** — `read-only` · **P1** · easy · 6 captures
  - Schedule tab with Day/Week/List toolbar + 'New Booking'
  - Empty day agenda 'No appointments today'
  - List view month-grouped empty state 'No appointments in <month>'
  - Attendance tab: four KPI tiles all at 0
  - Today's Bookings 'No bookings today'
  - Today's Check-ins 'No check-ins yet today'
- [ ] **Class Slots capacity overview renders with KPIs, table and filters** — `read-only` · **P1** · easy · 5 captures
  - Class Slots page 'Capacity Overview' header + Scope switcher
  - Four KPI tiles (Total Slots, Avg Fill Rate, Waitlisted, Projected Revenue)
  - Capacity table with status-filter pills (All/Open/Full/Waitlist)
  - Status filter 'Open' narrows table
  - Search box filtered by service name
- [ ] **New Class Slot wizard opens showing migrated services and coaches (config-display, no save)** — `read-only` · P2 · easy · 6 captures
  - Class Slots page with 'New Class Slot' button
  - Create Class Slot dialog open (empty form)
  - Service dropdown listing migrated PT packages
  - Instructor dropdown listing coaches
  - Branch / date / time / capacity fields filled
  - Dialog dismissed without submitting
- [ ] **Create then cancel a class slot end-to-end (gated write lifecycle)** — `creates-data` · P3 · needs-seed-data · 6 captures
  - Create dialog filled (service/branch/date/time/capacity)
  - Submit → 'Class slot created successfully'
  - New slot row 0/capacity booked
  - Signups dialog open, zero enrollments
  - Cancel dialog with reason
  - Slot cancelled → 'Class slot cancelled', row marked cancelled

### trainers
- [ ] **Trainers roster renders 114 coaches with tiers, session counts, and detail panel** — `read-only` · **P1** · easy · 6 captures
  - Login lands on dashboard
  - Trainers tab: left roster populated (avatars, names, tier badges)
  - First coach auto-selected; detail panel profile header (tier + Active)
  - KPI tiles (Sessions This Week, Commission YTD, Revenue, Utilisation) zeros/RM0
  - Customers card 'No customers yet' + This Week's Schedule 'No sessions'
  - Invite Trainer dialog opened (form only, not submitted)
- [ ] **Scope switcher narrows trainer roster by branch (multi-tenant scope rule)** — `read-only` · **P1** · easy · 5 captures
  - Trainers tab at All scope, full roster
  - ScopeSwitcher open (country → state → branch)
  - A specific branch selected
  - Roster re-queried, narrowed to branch coaches
  - Selected coach detail shows branch in Contact & Branch
- [ ] **Tiers tab config display with Active/Inactive filter (read-only)** — `read-only` · P2 · easy · 5 captures
  - Switch to Tiers tab
  - Tiers table (Name, Rank, Status)
  - Active filter + count badge
  - Inactive filter (or empty)
  - New Tier dialog opened (not submitted)
- [ ] **Availability weekly grid + intake list render (read-only)** — `read-only` · P2 · needs-seed-data · 5 captures
  - Switch to Availability tab
  - Recurring grid (Trainer + Mon..Sun) with utilisation bars + slot pills
  - Slot legend (Available / Blocked / Time Off)
  - Trainer availability sheet opened (view-only)
  - Intake Availability sub-tab with 'Set Intake Schedule' rows

### services-catalog
- [ ] **Services catalog renders 70 migrated services with filter, sort & read-only detail** — `read-only` · **P1** · easy · 7 captures
  - Login page (franchisee@gmail.com)
  - Dashboard as MOVE owner
  - Services tab: '70 services · 70 active' counter + ScopeSwitcher
  - Category filter pills row
  - Search '1-ON-1' narrows table
  - Price sorted descending ('1-ON-1 PERSONAL TRAINING' RM7,200 near top)
  - Read-only Service Detail dialog (price/duration/category)
- [ ] **Service categories + per-category commission config display (read-only, commission domain rule)** — `read-only` · **P1** · easy · 5 captures
  - Categories tab with 4 migrated categories
  - Row hovered revealing inline 'Commission Config'
  - Commission Config sheet (rate / split)
  - Read-only Category Detail dialog
  - Sheet + dialog closed via Cancel, 4-category list intact
- [ ] **Rooms, Promotions & Pricing tabs render + wizard-open (read-only)** — `read-only` · P2 · easy · 6 captures
  - Rooms tab filter pills + list (or 'No rooms found')
  - Create Room dialog open (Name/Type/Capacity/Branch), not submitted
  - Promotions tab table (or 'No promotions found')
  - New Promotion dialog open (Code/Type/Value/validity), not submitted
  - Pricing tab service selector + 'Select a service…' prompt
  - Price overrides table (or 'No price overrides configured')
- [ ] **Create + deactivate a Room in services catalog (WRITE — gated, do not run on MOVE)** — `creates-data` · P3 · blocked · 4 captures
  - Create Room dialog filled (test name + branch)
  - 'Room created successfully' toast
  - New test room row under Active filter
  - Room deactivated → 'Room updated successfully'

### pos-sales-create
- [ ] **POS wizard opens and Member/Walk-in toggle renders for MOVE owner** — `read-only` · **P1** · easy · 5 captures
  - Logged in, MOVE dashboard
  - /dashboard/sales/create renders 5-step rail + empty Live Order (RM0.00)
  - Step 1 Customer card, Member toggle highlighted + member combobox
  - Walk-in toggle → 'Anonymous Walk-in' card
  - Continue-to-Items enabled in Walk-in mode, empty cart
- [ ] **Member customer search shows pristine empty state on MOVE (0 customers)** — `read-only` · **P1** · easy · 4 captures
  - Wizard Step 1, Member mode active
  - Type 'ahmad' → loading spinner
  - Resolves to 'No customers found' empty state
  - Continue-to-Items stays disabled (step gating proven)
- [ ] **Walk-in cart builds and cash change-due computes without committing** — `read-only` · P2 · easy · 6 captures
  - Step 1 Walk-in → Continue to Items
  - Custom line item RM1,200 → totals update live
  - Skip Promotions → Payment → Cash auto-fills due-now
  - Edit tendered to RM1,500 → 'Change' RM300
  - Stop at Review & Confirm WITHOUT Confirm
- [ ] **WRITE — commit a walk-in cash sale (recordSale: installment + commission write path)** — `creates-data` · P3 · needs-seed-data · 6 captures
  - Cart with package item for seeded member, installment picker appears
  - Select Quarterly (4x) → per-installment RM300 (not RM1,200)
  - Confirm → pos.recordSale → redirect to /sales/$id receipt
  - Receipt shows installment schedule + payment
  - Verify commission reached trainer (preferred vs rotation) via commission_splits

### sales-payments-refunds
- [ ] **Sales & Payments dashboard renders empty-state KPIs and Sales Orders list (migration proof)** — `read-only` · **P1** · easy · 6 captures
  - Login (franchisee@gmail.com)
  - Dashboard loaded
  - Sales / Orders header (ScopeSwitcher, Export CSV, New Sale)
  - KPI strip: Month revenue RM0.00, Outstanding 'all clear', Refunded RM0.00, Net Collected RM0.00
  - Sales Orders tab + refund-status pills + 'No sales found'
  - Period selector → Today, KPIs re-queried
- [ ] **Tab walk-through: Payments, Cancelled and Refunds empty states** — `read-only` · **P1** · easy · 5 captures
  - Sales Orders tab with full pill bar
  - Payments tab 'No payments found'
  - Cancelled tab toolbar + 'No cancelled sales'
  - Cancelled Date-range toggle expanded (from/to inputs)
  - Refunds tab status pills + 'No refunds found'
- [ ] **Scope switcher narrows the Sales list by country/state/branch** — `read-only` · P2 · easy · 5 captures
  - Sales Orders tab, org-wide scope
  - Switcher open (country/state/branch)
  - A branch node highlighted
  - List re-queried for branch, scope label updated
  - KPI strip re-rendered for narrowed scope
- [ ] **Refund lifecycle: request → approve → process (WRITE — gated)** — `creates-data` · P3 · blocked · 6 captures
  - Sales order detail with Request Refund button
  - Request Refund dialog (amount + reason)
  - Refunds Pending section shows new pending refund
  - Approve → moves to Approved
  - Process Refund dialog (method = cash)
  - Refunds Processed section shows completed refund

### commissions-payouts
- [ ] **Commissions hub renders all six tabs with empty ledgers (migration smoke)** — `read-only` · **P1** · easy · 7 captures
  - Login → dashboard
  - /dashboard/commissions/view My Commissions active + KPIs
  - All Commissions: status pills + 'No commission splits found.'
  - Review tab: no pending-review, no red badge
  - Disputes tab: 'No disputed commissions'
  - Liability tab: KPI band + 'No commission activity in the selected period.'
  - Payouts tab: KPI band + 'No payouts yet'
- [ ] **Payouts tab: empty records, sub-tab toggle, Run Batch drawer & scope switcher open** — `read-only` · **P1** · easy · 5 captures
  - Payouts tab KPI band (Disbursed/Pending Recipients/Avg/Last Batch)
  - All Payouts 'No payouts yet…'
  - Per Recipient empty sidebar + placeholder
  - Scope switcher open (country/state/branch)
  - Run Batch drawer open (staff multi-select/period/method), not submitted
- [ ] **Liability tab: KPI band, empty-period state, scope switch, Export CSV affordance** — `read-only` · P2 · easy · 4 captures
  - Liability tab KPI band (Approved Unpaid/Paid/Manual Adj./Net Payable)
  - By-staff 'No commission activity in the selected period.'
  - Scope switcher narrowing
  - Export CSV button visible + disabled (empty table)
- [ ] **New Adjustment dialog opens and displays the manual-adjustment form (no submit)** — `read-only` · P2 · easy · 4 captures
  - Header 'New Adjustment' button (gated commission_payout:create)
  - Manual Adjustment dialog (staff/amount/note/target)
  - Target area showing empty appointment/sales-order/package options
  - Dialog dismissed via Cancel, no split created

### packages
- [ ] **Packages overview renders all three tabs with empty states (migration proof)** — `read-only` · **P1** · easy · 5 captures
  - Memberships tab: 4 stat cards 0 / 0 / 0 / RM0.00
  - Memberships 'No memberships found'
  - Session Packs 'No session packs found' + Assign Pack
  - Installments empty list + status filter chips
  - Legacy /packages/instances/view redirects to /packages/view?tab=session-packs
- [ ] **Assign Pack wizard open shows real service catalog and per-installment breakdown** — `read-only` · P2 · easy · 6 captures
  - Session Packs tab with Assign Pack button
  - Assign Pack dialog (empty form)
  - Package dropdown listing migrated services
  - Payment-plan dropdown Full / Half (2x) / Quarterly (4x)
  - Per-installment breakdown shown (not full RM total)
  - Cancel, no record created, table empty
- [ ] **Installments tab filter panel shows migrated installment-plan config** — `read-only` · P2 · easy · 4 captures
  - Installments tab empty list + status chips
  - Filter panel expanded (search/due-before/due-after/payment-plan)
  - Payment-plan dropdown Full / Half / Quarterly
  - Status filter chip selected, list empty
- [ ] **Memberships scope switcher and filter chips narrow an empty tenant safely** — `read-only` · P2 · easy · 5 captures
  - Memberships tab with ScopeSwitcher + 5 filter chips
  - ScopeSwitcher open (country/state/branch)
  - A branch selected, label shown
  - 'Expiring 7 days' chip → 'No memberships found'
  - 'Frozen' then 'Expired' chips, empty + zeroed stats

### expenses-taxrates
- [ ] **Expenses view renders with zero-claim empty state and KPI tiles (read-only migration proof)** — `read-only` · **P1** · easy · 5 captures
  - Finance > Expenses header + Submit Expense button
  - KPI tiles: Total Claims 0, Total Value RM0.00, Pending 0, Pending Value —
  - Status tabs (All/Pending/Approved/Rejected/Paid), All active
  - Empty table 'No expenses found'
  - Pending tab, still empty with hint
- [ ] **Tax Rates configuration page displays configured rates and default (read-only config display)** — `read-only` · **P1** · easy · 5 captures
  - Tax Rates header + 'Add tax rate' button
  - Filter row (search + status = Active)
  - Table listing Name/Code, Rate %, Category, Effective dates, Status, Default
  - Footer '{n} tax rates · {m} active'
  - Status → 'All status' revealing inactive rates
- [ ] **Expenses Submit Expense dialog opens and shows claim form (read-only, cancelled before submit)** — `read-only` · P2 · easy · 5 captures
  - Expenses page with Submit Expense button
  - Create Expense dialog (Category/Description/Amount/Date/Receipt URL)
  - Category dropdown (Travel/Equipment/Supplies/Training/Other)
  - Draft filled, dialog open, unsaved
  - Dismissed via Cancel
- [ ] **Tax Rates Add Tax Rate dialog opens and shows config form (read-only, cancelled before save)** — `read-only` · P2 · easy · 5 captures
  - Click 'Add tax rate'
  - Dialog (Name/Code/Rate %/Category)
  - Category select (SST/GST/Service Tax/Withholding/Tax Exempt/Custom)
  - Rate value → live 'Stored as N basis points' helper
  - Dismissed via Cancel, no rate created

### employees-staffaccess-rbac
- [ ] **Employee roster renders 124 staff grouped by role** — `read-only` · **P1** · easy · 6 captures
  - Logged in, dashboard
  - /dashboard/user/view 'Users / Members' header (Scope/Search/Invite)
  - Admins group expanded with Active pills
  - Trainers group header showing coach count (bulk of 114)
  - A member card (avatar, name, email, Active, Joined, actions)
  - Staff + Clients group headers with counts
- [ ] **Search and scope switcher narrow the employee roster** — `read-only` · P2 · easy · 5 captures
  - Full roster, all groups
  - Type a coach name → only matches visible
  - Clear search, open ScopeSwitcher (country/state/branch)
  - Select a branch → roster narrows, counts drop
  - Nonsense term → 'No employees match your search'
- [ ] **Staff Access — User Role Assignment renders stats, filters, and read-only assignment dialogs** — `read-only` · P2 · easy · 6 captures
  - /dashboard/access-control/user-assignment, Members tab
  - MembersStatsBar (Total/Active/No Roles/Available Roles)
  - Status filter dropdown + 'Show deleted' toggle
  - Role Assignment sheet for one member (do not save)
  - Edit User dialog (role + branch selectors populated), cancel
  - Move to Branch dialog (branch picker), close
- [ ] **Invitations tab renders zero-pending empty state and status filter** — `read-only` · P2 · easy · 4 captures
  - Invitations tab clicked
  - 'Invitations' heading + counters (Pending/Accepted/Expired)
  - Empty state (pristine tenant)
  - Status filter dropdown (Pending/Accepted/Declined/Expired)

### branches-hierarchy
- [ ] **Branch hierarchy tree renders MOVE's 23 branches / 33 nodes** — `read-only` · **P1** · easy · 6 captures
  - Login (franchisee@gmail.com)
  - Dashboard for MOVE
  - Branch Overview: left tree country root(s), 'Branch / Overview' header
  - Expand all → full hierarchy (country→region→area→branch)
  - Branch leaf rows show name + revenue/members stat line
  - First root auto-selected, detail panel populated
- [ ] **Branch node selection shows detail panel with KPI tiles and opening hours** — `read-only` · **P1** · easy · 6 captures
  - Branch Overview tree expanded
  - A branch leaf clicked (selected border)
  - NodeDetailPanel header (name + ancestor breadcrumb)
  - Three KPI tiles (Members, Revenue/mo, Staff)
  - Opening Hours table
  - An intermediate region/area node selected (own breadcrumb + KPIs)
- [ ] **Edit Branch dialog opens with cascading country/region/area selects prefilled** — `read-only` · P2 · easy · 5 captures
  - Branch leaf selected
  - Edit Branch button in toolbar
  - Dialog open, Name/Address prefilled
  - Cascading Country/Region/Area prefilled to ancestors
  - Cancel pressed, no update sent
- [ ] **Create Branch wizard renders at /branch/create** — `read-only` · P2 · easy · 4 captures
  - Add Branch button in header
  - /dashboard/branch/create loads
  - HierarchicalBranchForm wizard (Country/Region/Area/Branch)
  - 'How it works' 4-step info card + Organization Owner note

### onboarding-qr
- [ ] **Onboarding QR index renders the MOVE branch list (migration proof)** — `read-only` · **P1** · easy · 5 captures
  - Logged in, /dashboard/onboarding/view
  - 'Onboarding' header + left 'Active QR Codes' sidebar + count badge
  - Branch list (~23 rows), each 'No QR' pill, first auto-selected
  - Right pane NoQrPane (dashed placeholder, Branch callout, Max Uses, Generate button)
  - Footer 'N branches still need a QR code'
- [ ] **Branch selection and search filtering in the onboarding master-detail** — `read-only` · P2 · easy · 5 captures
  - Onboarding view loaded with list + badge
  - Different branch row clicked → highlight moves, right pane updates
  - Matching query in search → list narrows, badge updates
  - Non-matching query → 'No branches match your search.' + placeholder
  - Clear search → full list restored
- [ ] **Generate a branch onboarding QR code (WRITE — must be gated)** — `creates-data` · P3 · easy · 6 captures
  - Select branch showing 'No QR'
  - Enter Max Uses (or blank)
  - 'Generate QR Code' → toast 'QR code generated.'
  - HasQrPane shows QR SVG + Invite URL
  - Stats grid (Sign-ups 0, Limit, Issued, Expires) + Active badge
  - List row now shows usage badge
- [ ] **Regenerate and revoke an existing QR code (WRITE — must be gated)** — `mutates-existing` · P3 · needs-seed-data · 5 captures
  - Select branch with active QR (HasQrPane)
  - Regenerate → confirm dialog
  - Confirm → 'New QR code generated.' replaces QR
  - Revoke → confirm dialog
  - Confirm → 'Invite revoked.' returns to NoQrPane

### announcements-approvals
- [ ] **Announcements view renders (Communications / Announcements, read-only)** — `read-only` · **P1** · easy · 5 captures
  - Logged in, /dashboard/announcements/view
  - Header 'Communications / Announcements' + ScopeSwitcher + 'New'
  - Filter rail (audience + status filters with counts)
  - Search + 'Sort: Newest' bar
  - Inbox list or 'No announcements' empty state; toggle 'inactive' re-queries
- [ ] **Approvals queue renders empty across all four status tabs (read-only)** — `read-only` · **P1** · easy · 6 captures
  - /dashboard/operations/approvals 'Operations / Approvals' header + ScopeSwitcher
  - HeroStats 'MOVE Private Fitness · Approvals Queue · Live'
  - Pending tab 'No packages waiting for trainer assignment'
  - Awaiting payment 'No packages awaiting payment confirmation'
  - Approved 'No approved packages yet'
  - Rejected 'No rejected packages'
- [ ] **New Announcement form dialog opens and closes without saving (read-only wizard-open)** — `read-only` · P2 · easy · 4 captures
  - Announcements view with 'New' button
  - Dialog Title + Message inputs
  - Priority/audience selectors + start/end schedule
  - Pin + 'Requires acknowledgement' toggles + branch-scope picker; Cancel
- [ ] **Approvals filter bar and scope switcher interactions (read-only)** — `read-only` · P2 · easy · 5 captures
  - Pending tab FilterBar (search/priority/scope toggle/Export queue)
  - Priority pills + 'All branches'/'Assignable to me' toggle
  - Toggle 'Assignable to me' → re-query (empty)
  - ScopeSwitcher open (country/state/branch)
  - Branch selected → 'Showing 0 of 0', Export disabled

### org-settings-notifications
- [ ] **Organization settings page renders MOVE's org-wide config (read-only)** — `read-only` · **P1** · easy · 5 captures
  - Dashboard after login
  - Settings / Organization breadcrumb header
  - General Settings: Grace Period prefilled
  - Default Commission % + Locale = English (Malaysia)
  - Approval Policy toggle saved state + enabled Save button (untouched)
- [ ] **Notification preferences page renders channel + content toggles (read-only)** — `read-only` · **P1** · easy · 4 captures
  - Settings / Notifications
  - Channels card (Email/SMS/Push)
  - Content card (Booking Reminders/Confirmations/Promotional/Package Expiry)
  - All seven toggles reflecting saved state (default all-on)
- [ ] **Organization settings Locale dropdown open showing locale options (read-only)** — `read-only` · P2 · easy · 3 captures
  - Org settings form populated
  - Locale trigger = English (Malaysia)
  - Dropdown open (English (Malaysia) / English (United States)); dismissed without selecting
- [ ] **Notification preference toggle shows Saving → Saved then restores (write, gated)** — `mutates-existing` · P3 · easy · 5 captures
  - Promotional Emails toggle ON
  - Toggle OFF → amber 'Saving...'
  - Green 'Saved', toggle OFF
  - Toggle back ON to restore
  - 'Saved' again, toggle ON

### integrations-audit
- [ ] **Audit log renders with KPI tiles, event rows, and diff detail (read-only migration proof)** — `read-only` · **P1** · easy · 6 captures
  - /dashboard/audit/view breadcrumb + Export CSV
  - Four KPI tiles (Total/Danger/Warning/Info)
  - Filter card (Severity/Actor/Action/Entity/Date/Branch) + result-count line
  - Event table (severity badges, timestamps, actors) OR 'No audit events'
  - Severity filter 'danger' narrows 'N results'
  - Changes diff dialog (before/after) — drop if table empty
- [ ] **Google Calendar OAuth status page renders org strip, connection banner, and sync settings (read-only)** — `read-only` · **P1** · easy · 5 captures
  - GCal settings breadcrumb + 'Connect My Calendar'
  - Org status strip (Trainers connected, Events synced, Conflicts, Last sync)
  - 'My calendar not connected' amber banner + Connect
  - Sync Settings sidebar (direction radios, conflict radios)
  - Calendars synced 'No calendars found'
- [ ] **GoHighLevel integration page renders org-wide connection, approval queue, and branch table (read-only)** — `read-only` · P2 · easy · 5 captures
  - /go-highlevel-integration heading + subtitle
  - Org-Wide GHL Connection card (connect form or Connected badge)
  - Inbound Approval Queue 'No contacts awaiting approval.'
  - Branch Connections table (MOVE branches, 'Not connected')
  - Sync Events 'No sync events yet.'
- [ ] **GoHighLevel per-branch Connect dialog opens with credential form (read-only wizard-open)** — `read-only` · P2 · easy · 4 captures
  - GHL page Branch Connections table
  - Connect clicked on 'Not connected' branch
  - 'Connect GHL: <branch>' dialog (Location ID/API Key/custom field ID)
  - Dismissed via Cancel, no credentials submitted

### overview-dashboard
- [ ] **Dashboard launchpad lands with 8 daily-task cards and swaps panels (migration proof)** — `read-only` · **P1** · easy · 6 captures
  - /dashboard launchpad header + scope switcher
  - 'Daily tasks' rail: all 8 cards
  - Default New Sale card shows POS panel
  - 'View Customers' → customer directory empty state
  - 'Installments' → installments read view (per-installment amounts)
  - No error boundary anywhere
- [ ] **Overview KPI dashboard renders the scope-scoped hero + analytics grid (empty-state)** — `read-only` · **P1** · easy · 7 captures
  - /dashboard/overview header + period pills (Month active)
  - Hero 'MOVE Private Fitness · Live', RM0.00, '0 orders · 0 active members'
  - 2x2 KPI grid (Today's Revenue, Appointments 0/0, Active Members, Largest Sale —)
  - Revenue Trend + Revenue by Branch cards
  - Pending approvals / Top Performers / Recent Activity cards
  - Today's Appointments 'no appointments today'
  - Footer 'Avantej Core · MOVE Private Fitness', no error boundary
- [ ] **Overview period switcher updates hero label and URL** — `read-only` · P2 · easy · 4 captures
  - 'Month' active → 'Month-to-date revenue'
  - Click 'Year' → ?period=this_year
  - Hero 'Year-to-date revenue', KPIs re-render
  - Click 'Today' → "Today's revenue", ?period=today
- [ ] **Scope switcher narrows KPIs by branch (multi-tenant scope display)** — `read-only` · P2 · easy · 5 captures
  - Trigger 'All · <top node>'
  - Popover open (country→state→branch, search box)
  - Type a branch name to filter
  - Select a branch → trigger shows branch name
  - Hero + KPI cards re-render scoped (branchId on every query)

---

## PHASE 1 — RUNNABLE NOW (read-only, zero writes)

**31 specs · ~166 captures · all `read-only`, all `easy` authorability.** Suggested execution order (login/scope foundation first, then high-signal reference-data modules, then finance/ops, then settings/integrations):

| # | Module | Spec | Route | Captures |
|---|---|---|---|---|
| 1 | overview-dashboard | Dashboard launchpad lands with 8 daily-task cards | `/dashboard` | 6 |
| 2 | overview-dashboard | Overview KPI hero + analytics grid (empty-state) | `/dashboard/overview` | 7 |
| 3 | scope-switcher | Scope switcher renders + opens country→state→branch tree | `/dashboard` | 4 |
| 4 | scope-switcher | Branch narrows dashboard, then 'All' restores | `/dashboard` | 5 |
| 5 | branches-hierarchy | Branch tree renders 23 branches / 33 nodes | `/dashboard/branch/view` | 6 |
| 6 | branches-hierarchy | Node detail panel: KPI tiles + opening hours | `/dashboard/branch/view` | 6 |
| 7 | employees-rbac | Employee roster renders 124 staff grouped by role | `/dashboard/user/view` | 6 |
| 8 | trainers | Trainers roster renders 114 coaches + detail panel | `/dashboard/trainers/view` | 6 |
| 9 | trainers | Scope switcher narrows trainer roster by branch | `/dashboard/trainers/view` | 5 |
| 10 | services-catalog | 70 services render with filter, sort, read-only detail | `/dashboard/service/view?tab=services` | 7 |
| 11 | services-catalog | Categories + per-category commission config display | `/dashboard/service/view?tab=categories` | 5 |
| 12 | customers | Customer Directory empty-state | `/dashboard/customers/v2/view` | 4 |
| 13 | customers | Add Customer wizard lists 23-branch hierarchy | `/dashboard/customers/v2/view` | 5 |
| 14 | packages | Packages overview: 3 tabs empty states + legacy redirect | `/dashboard/packages/view` | 5 |
| 15 | pos-sales-create | POS wizard opens, Member/Walk-in toggle | `/dashboard/sales/create` | 5 |
| 16 | pos-sales-create | Member search pristine empty state (0 customers) | `/dashboard/sales/create` | 4 |
| 17 | sales-payments-refunds | Sales dashboard empty KPIs + Sales Orders list | `/dashboard/sales/view` | 6 |
| 18 | sales-payments-refunds | Tab walk-through: Payments / Cancelled / Refunds | `/dashboard/sales/view` | 5 |
| 19 | commissions-payouts | Commissions hub: six tabs empty smoke | `/dashboard/commissions/view` | 7 |
| 20 | commissions-payouts | Payouts tab: sub-tabs + Run Batch drawer open | `/dashboard/commissions/view?tab=payouts` | 5 |
| 21 | appointments | Schedule + Attendance tabs empty-state | `/dashboard/appointment/view` | 6 |
| 22 | appointments | Class Slots capacity overview (KPIs/table/filters) | `/dashboard/appointment/class-slots/view` | 5 |
| 23 | announcements-approvals | Announcements view renders | `/dashboard/announcements/view` | 5 |
| 24 | announcements-approvals | Approvals queue empty across 4 tabs | `/dashboard/operations/approvals` | 6 |
| 25 | expenses-taxrates | Expenses zero-claim empty state + KPIs | `/dashboard/expenses/view` | 5 |
| 26 | expenses-taxrates | Tax Rates config display + default | `/dashboard/settings/tax-rates` | 5 |
| 27 | org-settings | Organization settings renders org-wide config | `/dashboard/settings/organization` | 5 |
| 28 | org-settings | Notification preferences toggles render | `/dashboard/settings/notifications` | 4 |
| 29 | integrations-audit | Audit log KPIs + event rows + diff | `/dashboard/audit/view` | 6 |
| 30 | integrations-audit | Google Calendar OAuth status page | `/dashboard/settings/google-calendar` | 5 |
| 31 | onboarding-qr | Onboarding QR index renders branch list | `/dashboard/onboarding/view` | 5 |

**Execution guardrails for Phase 1:** every dialog/wizard that exposes a write button (Add Customer, New Class Slot, Invite Trainer, New Service/Room/Promotion, New Tier, New Adjustment, Run Batch, New Announcement, GHL Connect, Add Tax Rate, Submit Expense, Generate QR, Save Settings) is **opened and closed via Cancel/Escape only** — never submitted. Do not click Export CSV (download artifact), notification toggles (auto-save), Connect/Reconnect on Google Calendar (leaves app via OAuth), or any row-action (Approve/Deactivate/Delete/Login-as). Reset scope to 'All' at the end of each scope-narrowing spec to leave the session clean.

---

## PHASE 2 — NEEDS SEED/WRITES (deferred or Neon-branch isolated)

**8 specs.** None may run against PROD MOVE; route them to a disposable seeded tenant or an isolated Neon branch behind a write-gate tag.

| Module | Spec | prodMutationClass | Write surface | Cleanup / isolation note |
|---|---|---|---|---|
| customers | Create a customer profile end-to-end | creates-data | `customerProfiles.createUnclaimed` | Pair with `customerProfiles.softDelete` (+ ideal hard-delete) to return directory to 0; also unlocks Profile-Panel tabs as a seed for deeper specs |
| appointments | Create then cancel a class slot | creates-data | `classSlots.create`, `classSlots.cancel` (+ `getSignups` read) | create+cancel self-cleans but leaves a cancelled row; no real customer enrolled so commission/credits untouched |
| services-catalog | Create + deactivate a Room | creates-data (blocked) | `rooms.create`, `rooms.update` | Lowest-blast-radius catalog write (no financial impact); deactivate is best-effort cleanup but leaves a soft-deleted row — isolated tenant only |
| pos-sales-create | Commit a walk-in cash sale (recordSale) | creates-data | `pos.recordSale` (→ sales_orders, payments, package_instances, installments, commission_splits) | No clean rollback; requires a seeded member; the only spec that proves installment schedule + commission-reaches-trainer end-to-end — disposable tenant only |
| sales-payments-refunds | Refund lifecycle request→approve→process | creates-data (blocked) | `refunds.request` → `refunds.approve` → `refunds.process` (writes payments.refundAmount / sales_orders.cancelledAmount, commission_splits, audit) | Needs a pre-seeded committed sale + captured payment; no rollback — staging/throwaway tenant only |
| onboarding-qr | Generate a branch onboarding QR code | creates-data | `branchInvites.create` | Cleanup via the Revoke spec below; or run on disposable tenant. Only path to the HasQrPane / QR-render screen |
| onboarding-qr | Regenerate + revoke an existing QR | mutates-existing | `branchInvites.regenerate`, `branchInvites.revoke` | Requires a pre-existing active invite (chain after Generate); naturally doubles as cleanup for the Generate spec |
| org-settings-notifications | Notification toggle Saving→Saved | mutates-existing | `notificationPreferences.update` | Per-user prefs row (low blast radius, no business data); restore by toggling back ON; gate behind write flag, skip on strictly-pristine runs |

---

## Prod-safety + coverage honesty

This suite is deliberately **asymmetric**: 31 of 68 specs (all P1) are runnable today as pure reads, and they are exactly the specs that constitute the migration proof — the reference data MOVE actually carries (23 branches, 124 staff, 114 coaches, 70 services, 4 commission configs, installment plans) renders, while every business-transaction surface honestly resolves to its **0-row empty state** (0 customers, 0 sales, 0 commissions, 0 payouts, 0 packages). We do **not** fabricate seeded numbers in captions; the RM0.00 / "No … found" states are the truthful, expected result on a freshly-migrated pristine client tenant and are themselves the strongest evidence the query paths are wired to the new Neon branch. Two isolation guarantees remain **explicitly unproven on PROD** and stay parked as skipped API specs rather than being faked: cross-tenant denial (needs a provisioned org B) and branch-scoped-staff subtree narrowing (needs a seeded non-admin staff session) — both are honestly flagged, not papered over. Every write path (8 specs) is quarantined to Phase 2 with a named write surface and cleanup/isolation note so no Phase-1 run can mutate the live client tenant; the implementing harness must enforce the cancel-only / no-submit / no-download / no-OAuth guardrails listed above so the "read-only-first" contract holds in practice, not just on paper.
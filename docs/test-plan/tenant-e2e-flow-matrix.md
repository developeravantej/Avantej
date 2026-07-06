# Tenant E2E — Full Operation-Flow Matrix (admin@moveprivatefitness.com / MOVE)

Generated from parallel codebase map. **446 operations** across 18 modules — 187 read / 192 write / 67 destructive. authorable=277, mutatesSeed=38, needPrecondition=261.

**Tier legend** — A: read/empty-state (fast, safe) · B: self-bootstrapping write (create→shoot→delete own row) · C: dependent write (needs test-data spine) · D: mutates seed / destructive-on-seed (skip or read-modify-restore, confirm).


## overview-analytics  (18 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View Launchpad daily-task dashboard (initial load) | read | A | `/dashboard/` | — |  |
| 2 | Switch active Launchpad daily-task card (master/detail navigation) | read | A | `/dashboard/` | — |  |
| 3 | Switch hierarchy scope from the Launchpad scope switcher | read | A | `/dashboard/` | — |  |
| 4 | View Overview analytics dashboard (initial load, hero + grid) | read | A | `/dashboard/overview` | — |  |
| 5 | View hero KPI tiles (Today's Revenue / Appointments / Active Members / Largest Sale) | read | A | `/dashboard/overview` | — |  |
| 6 | View per-country money cards (multi-country All scope) | read | C | `/dashboard/overview` | the seeded MOVE hierarchy must span >1 country AND have branch revenue |  |
| 7 | Change dashboard period (Today / Week / Month / Year pills) | read | A | `/dashboard/overview` | — |  |
| 8 | Switch hierarchy scope on the Overview dashboard | read | A | `/dashboard/overview` | — |  |
| 9 | Refresh dashboard data (header refresh button) | read | A | `/dashboard/overview` | — |  |
| 10 | View Revenue trend card (chart + This period / Avg per day / vs prev stats) | read | A | `/dashboard/overview` | — |  |
| 11 | View Revenue by branch card + navigate to Branches | read | A | `/dashboard/overview` | — |  |
| 12 | View Top performers card (staff leaderboard) | read | A | `/dashboard/overview` | — |  |
| 13 | View Recent activity card (live audit stream) + open full audit log | read | A | `/dashboard/overview` | — |  |
| 14 | View Needs attention / Pending approvals inline + view all approvals | read | A | `/dashboard/overview` | — |  |
| 15 | View Today's appointments timeline + open calendar | read | A | `/dashboard/overview` | — |  |
| 16 | Retry a failed dashboard widget (error-state recovery) | read | C | `/dashboard/overview` | a widget query must be in an error state (requires fault injection / network failure) |  |
| 17 | Navigate to Sales list via 'View all' analytics link | read | A | `/dashboard/overview` | — |  |
| 18 | Start New Sale from Overview hero / header CTA | read | A | `/dashboard/overview` | — |  |

## hierarchy-branches  (15 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View branch hierarchy tree (Branch Overview) | read | A | `/dashboard/branch/view` | — |  |
| 2 | Expand all / collapse all tree nodes | read | A | `/dashboard/branch/view` | — |  |
| 3 | Select node and view detail panel (KPIs + opening hours) | read | A | `/dashboard/branch/view` | — |  |
| 4 | View single branch detail page (with QR onboarding) | read | C | `/dashboard/branch/$id` | a seeded branch node id must be known/navigable |  |
| 5 | Create branch via multi-step wizard (select existing country/state) | write | C | `/dashboard/branch/create` | at least one seeded country and state must exist (MOVE seed has them) |  |
| 6 | Create branch with new country and/or new state inline | write | B | `/dashboard/branch/create` | — |  |
| 7 | Edit branch name / address | write | D | `/dashboard/branch/view` | a branch node must exist (use a fresh test branch to avoid mutating seed) | ⚠️ |
| 8 | Assign / change branch Person In Charge (PIC) | write | D | `/dashboard/branch/view` | at least one selectable org member/staff must exist (MOVE seed has 124 staff) | ⚠️ |
| 9 | Move branch to a different parent (re-parent via edit cascade) | write | D | `/dashboard/branch/view` | at least two candidate parent subtrees (areas) must exist to move between | ⚠️ |
| 10 | Assign an existing member to a branch | write | D | `/dashboard/branch/view` | at least one active org member NOT already scoped to this branch must exist | ⚠️ |
| 11 | Reassign a branch member to another branch | write | D | `/dashboard/branch/view` | a member must already be assigned to a branch AND at least one other branch must exist | ⚠️ |
| 12 | List members assigned to a branch (Assigned Members panel) | read | C | `/dashboard/branch/view` | a branch node must exist to open its edit dialog |  |
| 13 | Delete branch/node (cascade + member reassignment) via confirm dialog | destructive | D | `/dashboard/branch/view` | a deletable node must exist; org root cannot be deleted (button disabled) | ⚠️ |
| 14 | Cancel branch deletion | read | A | `/dashboard/branch/view` | — |  |
| 15 | Switch tenant scope (country > state > branch narrowing) | read | C | `/dashboard/branch/view` | more than one accessible hierarchy node must exist (else a static label renders) |  |

## staff-rbac  (27 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View employee roster grouped by role | read | A | `/dashboard/user/view` | — |  |
| 2 | Search employees by name or email | read | A | `/dashboard/user/view` | — |  |
| 3 | View Members management grid (Staff Access) | read | A | `/dashboard/access-control/user-assignment?tab=members` | — |  |
| 4 | Filter members by role, status, and search | read | A | `/dashboard/access-control/user-assignment?tab=members` | — |  |
| 5 | Toggle 'show deleted' members | read | A | `/dashboard/access-control/user-assignment?tab=members` | — |  |
| 6 | Invite a staff member (create + email invitation) | write | B | `/dashboard/access-control/user-assignment?tab=members` | — |  |
| 7 | Invite a member with explicit hierarchy scope (CreateInvitationDialog) | write | B | `/dashboard/access-control/user-assignment?tab=invitations` | — |  |
| 8 | List and filter invitations | read | C | `/dashboard/access-control/user-assignment?tab=invitations` | an invitation should exist to see non-empty rows |  |
| 9 | Resend an expired invitation | write | D | `/dashboard/access-control/user-assignment?tab=invitations` | an expired pending invitation with a real email must exist |  |
| 10 | Revoke a pending invitation | destructive | D | `/dashboard/access-control/user-assignment?tab=invitations` | a fresh pending invitation must be created first |  |
| 11 | Edit a member's role and hierarchy scope (Edit User dialog) | write | D | `/dashboard/access-control/user-assignment?tab=members` | — | ⚠️ |
| 12 | Assign a role via the Role Assignment sheet | write | D | `/dashboard/access-control/user-assignment?tab=members` | — | ⚠️ |
| 13 | Move a member to another branch | write | D | `/dashboard/access-control/user-assignment?tab=members` | at least two hierarchy branch nodes must exist | ⚠️ |
| 14 | Deactivate a member (suspend/toggle active) | write | D | `/dashboard/access-control/user-assignment?tab=members` | — | ⚠️ |
| 15 | Reactivate an inactive member | write | D | `/dashboard/access-control/user-assignment?tab=members` | a member must be inactive first (deactivate one, since seed staff start active) | ⚠️ |
| 16 | Soft-delete a member | destructive | D | `/dashboard/access-control/user-assignment?tab=members` | — | ⚠️ |
| 17 | Restore a soft-deleted member | write | D | `/dashboard/access-control/user-assignment?tab=members` | a member must be soft-deleted first | ⚠️ |
| 18 | Retry GHL sync for a member | write | D | `/dashboard/access-control/user-assignment?tab=members` | GHL must be configured for the org and a member must have a non-synced ghl link |  |
| 19 | View Roles & Permissions matrix | read | A | `/dashboard/access-control/roles?tab=roles` | — |  |
| 20 | Search roles in the left rail | read | A | `/dashboard/access-control/roles?tab=roles` | — |  |
| 21 | Create a custom role (with initial permissions) | write | B | `/dashboard/access-control/roles?tab=roles` | — |  |
| 22 | Grant a permission to a role (matrix toggle on) | write | D | `/dashboard/access-control/roles?tab=roles` | a custom (non-system) role should exist to modify | ⚠️ |
| 23 | Revoke a permission from a role (matrix toggle off) | destructive | D | `/dashboard/access-control/roles?tab=roles` | a custom role with at least one granted permission must exist | ⚠️ |
| 24 | Delete a custom role | destructive | D | `/dashboard/access-control/roles?tab=roles` | a custom role must exist (create one first for a clean fresh-row delete) |  |
| 25 | View Permission Definitions catalog | read | A | `/dashboard/access-control/roles?tab=permissions` | — |  |
| 26 | Remove all permissions for a resource | destructive | D | `/dashboard/access-control/roles?tab=permissions` | at least one role must have a permission assigned for the target resource | ⚠️ |
| 27 | Add an existing registered user as a member directly | write | D | `/dashboard/access-control/user-assignment?tab=members` | the target email must already be a registered user who is not yet a member |  |

## trainers  (25 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View trainer roster (list + auto-selected detail) | read | A | `/dashboard/trainers/view?tab=trainers` | — |  |
| 2 | Search / filter trainer roster by name and tier | read | A | `/dashboard/trainers/view?tab=trainers` | — |  |
| 3 | View trainer detail panel (stats, schedule, customers) | read | A | `/dashboard/trainers/view?tab=trainers` | — |  |
| 4 | Invite / create a trainer | write | C | `/dashboard/trainers/view?tab=trainers` | a branch/hierarchy node must be selectable (33 MOVE nodes exist) |  |
| 5 | Edit trainer profile | write | D | `/dashboard/trainers/view?tab=trainers` | a trainer must exist | ⚠️ |
| 6 | Change a trainer's tier | write | D | `/dashboard/trainers/view?tab=trainers` | at least one active trainer tier must exist (create one first if MOVE seed has none) | ⚠️ |
| 7 | Assign trainer to branch(es) | write | D | `/dashboard/trainers/view?tab=trainers` | a trainer must exist (33 MOVE hierarchy nodes are selectable) | ⚠️ |
| 8 | Suspend a trainer | destructive | D | `/dashboard/trainers/view?tab=trainers` | an active trainer must exist | ⚠️ |
| 9 | Reactivate a trainer | write | D | `/dashboard/trainers/view?tab=trainers` | a suspended trainer must exist (suspend one first) | ⚠️ |
| 10 | View trainer tiers list (with status tabs) | read | A | `/dashboard/trainers/view?tab=tiers` | — |  |
| 11 | Create a trainer tier | write | B | `/dashboard/trainers/view?tab=tiers` | — |  |
| 12 | Deactivate a trainer tier | destructive | D | `/dashboard/trainers/view?tab=tiers` | an active tier must exist (create one first) |  |
| 13 | Reactivate a trainer tier | write | C | `/dashboard/trainers/view?tab=tiers` | an inactive tier must exist (deactivate one first) |  |
| 14 | Delete a trainer tier | destructive | D | `/dashboard/trainers/view?tab=tiers` | an inactive tier must exist (only inactive tiers expose Delete) |  |
| 15 | View recurring availability weekly grid | read | A | `/dashboard/trainers/view?tab=availability` | — |  |
| 16 | Edit a trainer's recurring availability (upsert slots) | write | C | `/dashboard/trainers/view?tab=availability` | a trainer must exist |  |
| 17 | Add a trainer availability exception (Time Off) | write | C | `/dashboard/trainers/view?tab=availability` | a trainer must exist |  |
| 18 | Block a trainer's time (Blocked exception) | write | C | `/dashboard/trainers/view?tab=availability` | a trainer must exist |  |
| 19 | View intake availability list & set intake schedule | write | C | `/dashboard/trainers/view?tab=availability` | a trainer must exist |  |
| 20 | View my assigned services & buffer times (self-service) | read | C | `/dashboard/my-services/view?tab=buffer` | the acting admin/member must be assigned to services |  |
| 21 | Set / clear my per-service buffer override (self-service) | write | C | `/dashboard/my-services/view?tab=buffer` | the acting member must be assigned to at least one service |  |
| 22 | Set / clear my category buffer default (self-service) | write | C | `/dashboard/my-services/view?tab=buffer` | the acting member must have service categories assigned |  |
| 23 | Admin: assign a member to a service | write | C | `/dashboard/trainers/view?tab=trainers` | a trainer and at least one service must exist (70 MOVE services seeded) |  |
| 24 | Admin: remove a member from a service | destructive | D | `/dashboard/trainers/view?tab=trainers` | the trainer must already be assigned to a service (assign one first) |  |
| 25 | Admin: set a member's per-service buffer override | write | C | `/dashboard/trainers/view?tab=trainers` | the target member must be assigned to the service |  |

## services-catalog  (21 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View services list (Services tab) | read | A | `/dashboard/service/view?tab=services` | — |  |
| 2 | Search and filter services by name/category | read | A | `/dashboard/service/view?tab=services` | — |  |
| 3 | Sort services by column | read | A | `/dashboard/service/view?tab=services` | — |  |
| 4 | View service detail | read | A | `/dashboard/service/view?tab=services` | — |  |
| 5 | Create service | write | B | `/dashboard/service/view?tab=services` | — |  |
| 6 | Edit service | write | D | `/dashboard/service/view?tab=services` | — | ⚠️ |
| 7 | Toggle service active/inactive (inline) | write | D | `/dashboard/service/view?tab=services` | — | ⚠️ |
| 8 | Bulk enable/disable selected services | write | D | `/dashboard/service/view?tab=services` | — | ⚠️ |
| 9 | Duplicate service | write | B | `/dashboard/service/view?tab=services` | — |  |
| 10 | Deactivate service (from detail dialog) | destructive | D | `/dashboard/service/view?tab=services` | — | ⚠️ |
| 11 | View service categories list (Categories tab) | read | A | `/dashboard/service/view?tab=categories` | — |  |
| 12 | View service category detail | read | A | `/dashboard/service/view?tab=categories` | — |  |
| 13 | Create service category (with booking rules) | write | B | `/dashboard/service/view?tab=categories` | — |  |
| 14 | Edit service category (and booking rules) | write | D | `/dashboard/service/view?tab=categories` | — | ⚠️ |
| 15 | Configure category booking rules (config upsert) | write | D | `/dashboard/service/view?tab=categories` | a service category must exist | ⚠️ |
| 16 | Configure per-category commission (Delivery slots + rates/conditions) | write | D | `/dashboard/service/view?tab=categories` | active trainer tiers must exist for the org | ⚠️ |
| 17 | Configure additional commission track (Sales/Marketing/Referral) | write | D | `/dashboard/service/view?tab=categories` | active trainer tiers must exist for the org | ⚠️ |
| 18 | View service price overrides (Pricing tab) | read | A | `/dashboard/service/view?tab=pricing` | — |  |
| 19 | Add service price override | write | C | `/dashboard/service/view?tab=pricing` | a service must be selected |  |
| 20 | Expire service price override | destructive | D | `/dashboard/service/view?tab=pricing` | a price override must exist first |  |
| 21 | Delete service price override | destructive | D | `/dashboard/service/view?tab=pricing` | a price override must exist first |  |

## customers  (24 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View customer directory (split-pane list) | read | A | `/dashboard/customers/v2/view` | — |  |
| 2 | Search / filter customers in directory | read | C | `/dashboard/customers/v2/view` | at least one customer must exist first |  |
| 3 | Toggle 'Show deleted' in directory | read | C | `/dashboard/customers/v2/view` | a soft-deleted customer must exist first |  |
| 4 | Switch reporting scope (branch/area) in directory | read | A | `/dashboard/customers/v2/view` | — |  |
| 5 | View customer 360 detail (profile panel) | read | C | `/dashboard/customers/v2/view` | a customer must exist first |  |
| 6 | View full Customer-360 page (dedicated route) | read | C | `/dashboard/customers/$id` | a customer must exist first |  |
| 7 | Add customer (Quick Add unclaimed profile) | write | B | `/dashboard/customers/v2/view` | — |  |
| 8 | Edit customer profile fields (Overview form) | write | D | `/dashboard/customers/v2/view` | a customer must exist first |  |
| 9 | Rename customer (inline name edit) | write | D | `/dashboard/customers/v2/view` | a customer must exist first |  |
| 10 | Change customer email (inline email edit + verification) | write | D | `/dashboard/customers/v2/view` | a customer must exist first |  |
| 11 | Send claim link to unclaimed customer | write | D | `/dashboard/customers/v2/view` | an unclaimed customer must exist first |  |
| 12 | Add email + send sign-in link (placeholder-email customer) | write | D | `/dashboard/customers/v2/view` | a customer with a placeholder email must exist first |  |
| 13 | Resend sign-in link (claimed customer) | write | D | `/dashboard/customers/v2/view` | a claimed customer with a real email must exist first |  |
| 14 | Retry GHL sync for a customer (legacy /customers list) | write | D | `/customers` | a customer with a GHL sync record must exist first |  |
| 15 | Soft-delete customer | destructive | D | `/dashboard/customers/v2/view` | a customer must exist first |  |
| 16 | Restore soft-deleted customer | write | D | `/dashboard/customers/v2/view` | a soft-deleted customer must exist first |  |
| 17 | Create household from customer | write | D | `/dashboard/customers/$id` | a customer with a saved profile must exist first |  |
| 18 | Attach customer to existing household | write | D | `/dashboard/customers/$id` | a customer with a saved profile AND an existing household must exist first |  |
| 19 | Remove customer from household | destructive | D | `/dashboard/customers/$id` | a customer already attached to a household must exist first |  |
| 20 | Edit lead source / attribution | write | D | `/dashboard/customers/$id` | a customer must exist first |  |
| 21 | Pause / freeze membership | write | D | `/dashboard/customers/$id` | a customer with an active package must exist first |  |
| 22 | Add customer via legacy list page | write | D | `/customers` | a user account with that email must already exist |  |
| 23 | Edit own admin profile (legacy list page) | write | B | `/customers` | — |  |
| 24 | Convert walk-in drop-in payment to package (deprecated surface) | write | D | `/dashboard/customers/v2/view` | a walk-in drop-in payment and a package instance must exist first |  |

## packages-memberships  (36 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View Memberships list (retention view) | read | A | `/dashboard/packages/view?tab=memberships` | — |  |
| 2 | Filter Memberships by status tab (Active / Expiring 7d / Expiring 30d / Frozen / Expired) | read | A | `/dashboard/packages/view?tab=memberships` | — |  |
| 3 | Change branch scope on Memberships (Scope switcher) | read | A | `/dashboard/packages/view?tab=memberships` | — |  |
| 4 | Freeze a membership package | write | D | `/dashboard/packages/view?tab=memberships` | an active membership package_instance must exist first (0 packages seeded) |  |
| 5 | Unfreeze a membership package | write | D | `/dashboard/packages/view?tab=memberships` | a frozen package_instance must exist first |  |
| 6 | Extend a membership expiry | write | D | `/dashboard/packages/view?tab=memberships` | a non-terminal package_instance with an expiry must exist first |  |
| 7 | Cancel a membership package | destructive | D | `/dashboard/packages/view?tab=memberships` | a cancellable package_instance must exist first |  |
| 8 | Open customer detail from a membership row | read | C | `/dashboard/packages/view?tab=memberships` | a membership row (and therefore a customer) must exist first |  |
| 9 | View Session Packs list (all package instances) | read | A | `/dashboard/packages/view?tab=session-packs` | — |  |
| 10 | Filter Session Packs by status tab | read | A | `/dashboard/packages/view?tab=session-packs` | — |  |
| 11 | Assign / sell a package (create package instance) | write | D | `/dashboard/packages/view?tab=session-packs` | a customer user must exist — the form requires a raw client user UUID (0 customers seeded) |  |
| 12 | View package instance status history | read | C | `/dashboard/packages/view?tab=session-packs` | a package_instance must exist first |  |
| 13 | View & manage assigned staff on a package instance | read | C | `/dashboard/packages/view?tab=session-packs` | a package_instance must exist first |  |
| 14 | Assign a staff member to a package instance slot | write | D | `/dashboard/packages/view?tab=session-packs` | a package_instance must exist first |  |
| 15 | Remove a staff member from a package instance | destructive | D | `/dashboard/packages/view?tab=session-packs` | a package_instance with at least one staff assignment must exist |  |
| 16 | View Installments admin overview list | read | A | `/dashboard/packages/view?tab=installments` | — |  |
| 17 | Open installment package detail sheet | read | C | `/dashboard/packages/view?tab=installments` | an installment-plan package_instance must exist first |  |
| 18 | Confirm an installment payment | write | D | `/dashboard/packages/view?tab=installments` | an installment schedule with a pending/overdue installment must exist |  |
| 19 | Reschedule an installment due date | write | D | `/dashboard/packages/view?tab=installments` | an installment schedule must exist |  |
| 20 | Waive an installment | destructive | D | `/dashboard/packages/view?tab=installments` | an installment schedule must exist |  |
| 21 | Manually unlock an installment-locked package | write | D | `/dashboard/packages/view?tab=installments` | a locked installment package must exist |  |
| 22 | Adjust unlocked/used credits on an installment package | write | D | `/dashboard/packages/view?tab=installments` | an installment package must exist |  |
| 23 | Reset a credits override | write | D | `/dashboard/packages/view?tab=installments` | an installment package with a manual credits override must exist |  |
| 24 | Toggle credit overdraft on an installment package | write | D | `/dashboard/packages/view?tab=installments` | an installment package must exist |  |
| 25 | Request a refund on an installment package | destructive | D | `/dashboard/packages/view?tab=installments` | an installment package with paid amounts must exist |  |
| 26 | View Approvals inbox (pending trainer assignment) | read | A | `/dashboard/operations/approvals` | — |  |
| 27 | Export pending-approvals queue to CSV | read | C | `/dashboard/operations/approvals` | at least one pending package must exist for a non-empty export (button disabled when empty) |  |
| 28 | Confirm offline payment received (awaiting-payment stage) | write | D | `/dashboard/operations/approvals` | a purchased, unpaid (offline) package_instance must exist first |  |
| 29 | Approve & assign a trainer to a pending package | write | D | `/dashboard/operations/approvals` | a pending, paid (or partially-paid) purchased package must exist first |  |
| 30 | Re-assign trainer on an approved package | write | D | `/dashboard/operations/approvals` | an approved/active package must exist first |  |
| 31 | Reject a pending package | destructive | D | `/dashboard/operations/approvals` | a pending purchased package must exist first |  |
| 32 | View Installment Plan templates list | read | A | `/dashboard/settings/installment-plans` | — |  |
| 33 | Create a new installment plan template | write | B | `/dashboard/settings/installment-plans` | — |  |
| 34 | Edit an installment plan template | write | D | `/dashboard/settings/installment-plans` | — | ⚠️ |
| 35 | Set an installment plan as default | write | D | `/dashboard/settings/installment-plans` | — | ⚠️ |
| 36 | Deactivate an installment plan template | destructive | D | `/dashboard/settings/installment-plans` | — | ⚠️ |

## pos-sales  (24 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View Sales Orders list (hub landing) | read | A | `/dashboard/sales/view` | — |  |
| 2 | Filter Sales Orders (search / status / date range / refund-status) | read | A | `/dashboard/sales/view?tab=sales` | — |  |
| 3 | Change KPI period (today / week / month) | read | A | `/dashboard/sales/view` | — |  |
| 4 | Switch dashboard scope (branch/region) on sales hub | read | A | `/dashboard/sales/view` | — |  |
| 5 | View Payments tab | read | A | `/dashboard/sales/view?tab=payments` | — |  |
| 6 | View Installments tab (due-soon / overdue / all) | read | A | `/dashboard/sales/view?tab=installments` | — |  |
| 7 | View Refunds tab | read | A | `/dashboard/sales/view?tab=refunds` | — |  |
| 8 | View Cancelled Sales tab (list + text/reason/date filters) | read | A | `/dashboard/sales/view?tab=cancelled` | — |  |
| 9 | Expand a cancelled-sale row (detail drilldown) | read | C | `/dashboard/sales/view?tab=cancelled` | at least one cancelled sale must exist (create + cancel a sale first) |  |
| 10 | Export cancelled sales to CSV | read | C | `/dashboard/sales/view?tab=cancelled` | at least one cancelled sale must exist |  |
| 11 | Record walk-in cash sale via POS wizard (happy path) | write | C | `/dashboard/sales/create` | at least one active tax rate configured (seed has 1) and the cashier's account assigned to a branch |  |
| 12 | Record member sale via POS wizard (customer lookup) | write | D | `/dashboard/sales/create` | a member/customer must exist first (seed has 0 customers) |  |
| 13 | Prefill POS wizard from a customer (deep-link) | write | D | `/dashboard/sales/create?customer=<memberId>` | a customer must exist to have a valid ?customer id |  |
| 14 | Add package item + choose installment plan in POS | write | C | `/dashboard/sales/create` | a package/service item that is installment-eligible (70 seeded services + 3 installment templates) |  |
| 15 | Assign trainers / staff rotation per item in POS | write | C | `/dashboard/sales/create` | a service item with training slots + at least one active staff member (124 seeded) |  |
| 16 | Apply / remove a promotion code in POS | write | C | `/dashboard/sales/create` | a valid active promotion code to exercise the success branch (invalid-code error branch is always drivable) |  |
| 17 | Clear cart on customer switch (POS confirm dialog) | write | B | `/dashboard/sales/create` | — |  |
| 18 | View sale detail page | read | C | `/dashboard/sales/$id` | a sale must exist (create one first) |  |
| 19 | View sale status history | read | C | `/dashboard/sales/$id` | a sale must exist |  |
| 20 | Print receipt for a sale | read | C | `/dashboard/sales/$id` | a sale must exist |  |
| 21 | Copy / open Stripe payment link on pending online sale | read | C | `/dashboard/sales/$id` | an online/Stripe sale recorded while Stripe is configured for the org |  |
| 22 | Cancel a sale (with reason + category, triggers refund + link deactivation) | destructive | D | `/dashboard/sales/$id` | a confirmed/completed sale must exist first |  |
| 23 | Request full refund on a sale | destructive | D | `/dashboard/sales/$id` | a sale must exist first |  |
| 24 | Issue partial refund on a sale | destructive | D | `/dashboard/sales/$id` | a sale must exist first |  |

## payments-refunds-tax  (22 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View payments (invoices) list | read | A | `/dashboard/payment/view` | — |  |
| 2 | Download invoice PDF | read | C | `/dashboard/payment/view` | an invoice row must exist (a sale must have been recorded first) |  |
| 3 | View payments tab on Sales page | read | A | `/dashboard/sales/view?tab=payments` | — |  |
| 4 | View invoice payment status history | read | C | `/dashboard/payment/view` | a payment-linked invoice with status-history rows must exist |  |
| 5 | View refunds queue (Refunds tab) | read | A | `/dashboard/sales/view?tab=refunds` | — |  |
| 6 | Filter/search refunds by status | read | A | `/dashboard/sales/view?tab=refunds` | — |  |
| 7 | Request a refund (against a sale) | write | D | `/dashboard/sales/$id` | a customer + a sales order (or payment/package instance) must exist first |  |
| 8 | Create partial package refund (by credits) | write | D | `/dashboard/sales/$id` | a purchased package instance with refundable credits must exist first |  |
| 9 | Approve a pending refund (full or partial amount) | write | D | `/dashboard/sales/view?tab=refunds` | a pending refund must exist (requires a prior sale + refund request) |  |
| 10 | Reject a pending refund | destructive | D | `/dashboard/sales/view?tab=refunds` | a pending refund must exist |  |
| 11 | Mark an approved refund as processed | write | D | `/dashboard/sales/view?tab=refunds` | an approved refund must exist |  |
| 12 | Bulk-approve selected pending refunds | write | D | `/dashboard/sales/view?tab=refunds` | multiple pending refunds must exist |  |
| 13 | View refund detail / audit trail | read | C | `/dashboard/sales/view?tab=refunds` | a refund row must exist |  |
| 14 | View tax rates list (filter active/all + search) | read | A | `/dashboard/settings/tax-rates` | — |  |
| 15 | Create a tax rate | write | B | `/dashboard/settings/tax-rates` | — |  |
| 16 | Edit a tax rate | write | D | `/dashboard/settings/tax-rates` | — | ⚠️ |
| 17 | Set a tax rate as default | write | D | `/dashboard/settings/tax-rates` | a second (non-default) active tax rate must exist to have a 'Set default' button | ⚠️ |
| 18 | Deactivate a tax rate | destructive | D | `/dashboard/settings/tax-rates` | an active non-default tax rate must exist | ⚠️ |
| 19 | Record package payment (confirm payment received) | write | D | `/dashboard/customers` | a purchased (unpaid) package instance for a customer must exist first |  |
| 20 | Upload payment proof for a package | write | D | `/dashboard/customers` | a package instance must exist first |  |
| 21 | Download / open a payment proof | read | C | `/dashboard/customers` | a package instance with at least one uploaded proof must exist |  |
| 22 | Refund a Stripe-paid appointment | destructive | D | `/dashboard/appointments` | a Stripe-paid appointment with a payment intent + connect-account snapshot must exist |  |

## commissions-payouts  (36 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View My Commissions tab | read | A | `/dashboard/commissions/view?tab=mine` | — |  |
| 2 | View All Commissions ledger tab | read | A | `/dashboard/commissions/view?tab=all` | — |  |
| 3 | Filter commission ledger by status/staff/scope | read | A | `/dashboard/commissions/view?tab=all` | — |  |
| 4 | Void a single commission split (row action) | destructive | D | `/dashboard/commissions/view?tab=all` | a commission split must exist (requires a sale or appointment that generated a split) |  |
| 5 | Bulk approve selected commission splits | write | D | `/dashboard/commissions/view?tab=all` | at least one pending commission split must exist |  |
| 6 | Bulk void selected commission splits | destructive | D | `/dashboard/commissions/view?tab=all` | at least one pending or approved commission split must exist |  |
| 7 | Bulk mark selected splits as paid | write | D | `/dashboard/commissions/view?tab=all` | at least one approved commission split must exist |  |
| 8 | Create manual commission adjustment | write | D | `/dashboard/commissions/view?tab=mine` | a valid target UUID (sales order / appointment / package instance) must exist to satisfy the DB one-target CHECK |  |
| 9 | View Review (pending adjustments) tab | read | A | `/dashboard/commissions/view?tab=review` | — |  |
| 10 | Approve a pending review adjustment | write | D | `/dashboard/commissions/view?tab=review` | a pending-review manual adjustment must exist |  |
| 11 | Reject a pending review adjustment | destructive | D | `/dashboard/commissions/view?tab=review` | a pending-review manual adjustment must exist |  |
| 12 | View Disputes tab | read | A | `/dashboard/commissions/view?tab=disputes` | — |  |
| 13 | Resolve dispute — Uphold | write | D | `/dashboard/commissions/view?tab=disputes` | a contested (disputed) commission split must exist |  |
| 14 | Resolve dispute — Void | destructive | D | `/dashboard/commissions/view?tab=disputes` | a contested commission split must exist |  |
| 15 | Resolve dispute — Adjust (void + corrected split) | write | D | `/dashboard/commissions/view?tab=disputes` | a contested commission split must exist |  |
| 16 | View Liability summary tab | read | A | `/dashboard/commissions/view?tab=liability` | — |  |
| 17 | Filter Liability by date range / branch / category / role / track | read | A | `/dashboard/commissions/view?tab=liability` | — |  |
| 18 | Export Liability CSV | read | C | `/dashboard/commissions/view?tab=liability` | at least one staff member with commission activity in the period |  |
| 19 | Mark liability as paid (batch by staff + period) | write | D | `/dashboard/commissions/view?tab=liability` | at least one approved unpaid commission split for a staff member in the period |  |
| 20 | View Payouts tab (All Payouts sub-tab) | read | A | `/dashboard/commissions/view?tab=payouts` | — |  |
| 21 | View Per-Recipient payout panel | read | A | `/dashboard/commissions/view?tab=payouts&recipientId=<id>` | — |  |
| 22 | Preview a payout batch | read | A | `/dashboard/commissions/view?tab=payouts` | — |  |
| 23 | Run a payout batch | write | D | `/dashboard/commissions/view?tab=payouts` | at least one approved unpaid commission split for the selected staff in the period |  |
| 24 | Process pending payouts for one recipient | write | D | `/dashboard/commissions/view?tab=payouts&recipientId=<id>` | a recipient with pending payout rows must exist |  |
| 25 | Mark a payout as paid (row action) | write | D | `/dashboard/commissions/view?tab=payouts` | a payout row in pending/processing status must exist |  |
| 26 | Mark a payout as failed (row action) | destructive | D | `/dashboard/commissions/view?tab=payouts` | a payout row in pending/processing status must exist |  |
| 27 | Retry a failed payout (row action) | write | D | `/dashboard/commissions/view?tab=payouts` | a payout row in failed status must exist |  |
| 28 | Cancel a payout (row action) | destructive | D | `/dashboard/commissions/view?tab=payouts` | a payout row in a non-terminal status must exist |  |
| 29 | View commission-cycle policies | read | A | `/dashboard/settings/commission-cycles` | — |  |
| 30 | Create / edit a commission-cycle policy (upsert) | write | B | `/dashboard/settings/commission-cycles` | — |  |
| 31 | Delete a commission-cycle policy | destructive | D | `/dashboard/settings/commission-cycles` | a commission-cycle policy row must exist first (create one via upsert) |  |
| 32 | Configure category commission (Delivery slots, tiers, conditions) | write | D | `/dashboard/service-category/view` | a service category must exist (4 are seeded) | ⚠️ |
| 33 | Add / edit a commission track and its tier rates | write | C | `/dashboard/service-category/view` | a service category and trainer tiers must exist |  |
| 34 | Set coach slots for a commission track | write | C | `/dashboard/service-category/view` | a commission track must exist first |  |
| 35 | Deactivate a commission track | destructive | D | `/dashboard/service-category/view` | an active commission track must exist first |  |
| 36 | Delete a category commission config | destructive | D | `/dashboard/service-category/view` | a category commission config must already exist for the category |  |

## appointments-scheduling  (45 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View appointment schedule (trainer calendar) | read | A | `/dashboard/appointment/view` | — |  |
| 2 | Filter schedule by trainer / branch scope | read | A | `/dashboard/appointment/view` | — |  |
| 3 | Create appointment (book a session) | write | D | `/dashboard/appointment/view` | a customer/client must exist first to attach as the booked user (ClientPicker); 0 customers seeded. Can technically create a staff-only/unassigned booking, but the intended happy path books a client. |  |
| 4 | Create recurring appointment series | write | D | `/dashboard/appointment/view` | a client should exist to attach; recurrence itself needs only a service+trainer but the happy path books a client |  |
| 5 | View appointment detail | read | C | `/dashboard/appointment/view` | an appointment must exist first (0 seeded) |  |
| 6 | View appointment status history | read | C | `/dashboard/appointment/view` | an appointment with at least one status change must exist first |  |
| 7 | Edit appointment staff assignments | write | D | `/dashboard/appointment/view` | an appointment must exist first (0 seeded) |  |
| 8 | Confirm appointment (status → confirmed) | write | D | `/dashboard/appointment/view` | a pending appointment must exist first |  |
| 9 | Cancel appointment (status → cancelled) | destructive | D | `/dashboard/appointment/view` | an upcoming (pending/confirmed) appointment must exist first |  |
| 10 | Mark appointment no-show (status → no-show) | write | D | `/dashboard/appointment/view` | a confirmed appointment must exist first |  |
| 11 | Reschedule appointment | write | D | `/dashboard/appointment/view` | an upcoming (pending/confirmed/rescheduled) appointment must exist first |  |
| 12 | Reinstate credit for no-show (no-show followup) | write | D | `/dashboard/appointment/view` | a no-show appointment that consumed a package credit must exist (needs a sold package + booked+no-show appointment) |  |
| 13 | Cancel single recurring occurrence (cancel this) | destructive | D | `/dashboard/appointment/view` | a recurring appointment series must exist first |  |
| 14 | Cancel future recurring occurrences (cancel future) | destructive | D | `/dashboard/appointment/view` | a recurring appointment series must exist first |  |
| 15 | Cancel entire recurring series (cancel all) | destructive | D | `/dashboard/appointment/view` | a recurring appointment series must exist first |  |
| 16 | Edit single occurrence / split series (edit this / edit future) | write | D | `/dashboard/appointment/view` | a recurring appointment series must exist first |  |
| 17 | View attendance (today's bookings + KPIs) | read | A | `/dashboard/appointment/view` | — |  |
| 18 | Check in a booked client (attendance) | write | D | `/dashboard/appointment/view` | a booked appointment for today with a client must exist first |  |
| 19 | Mark booking no-show from attendance | write | D | `/dashboard/appointment/view` | a booked appointment for today must exist first |  |
| 20 | Bulk check-in bookings | write | D | `/dashboard/appointment/view` | multiple booked appointments for today must exist first |  |
| 21 | Record drop-in check-in (walk-in or member) | write | D | `/dashboard/appointment/view` | walk-in path needs only a branch (technically authorable), but member path needs a customer; branch must be within scope |  |
| 22 | View check-ins log (with filters) | read | A | `/dashboard/appointment/view` | — |  |
| 23 | Delete check-in (mistake correction) | destructive | D | `/dashboard/appointment/view` | a check-in record must exist first |  |
| 24 | List / filter class slots | read | A | `/dashboard/appointment/class-slots/view` | — |  |
| 25 | Create class slot | write | B | `/dashboard/appointment/class-slots/view` | — |  |
| 26 | Edit class slot (capacity / time / instructor) | write | C | `/dashboard/appointment/class-slots/view` | a class slot must exist first — create one in the same session (0 slots seeded, so this edits a fresh test row, not a seeded one) |  |
| 27 | Cancel class slot | destructive | D | `/dashboard/appointment/class-slots/view` | a class slot must exist first — create one in the same session |  |
| 28 | View class-slot signups | read | C | `/dashboard/appointment/class-slots/view` | a class slot must exist; the signups list will be empty unless clients are enrolled |  |
| 29 | Enroll client into class slot | write | D | `/dashboard/appointment/class-slots/view` | a customer/client must exist AND a class slot must exist first (0 customers seeded) |  |
| 30 | Cancel class-slot enrollment | destructive | D | `/dashboard/appointment/class-slots/view` | an enrolled client in a class slot must exist first |  |
| 31 | View class-slot booking counts (calendar heatmap) | read | A | `/dashboard/appointment/class-slots/view` | — |  |
| 32 | List / filter rooms | read | A | `/dashboard/service/view?tab=rooms` | — |  |
| 33 | Create room | write | B | `/dashboard/service/view?tab=rooms` | — |  |
| 34 | Edit room | write | C | `/dashboard/service/view?tab=rooms` | a room must exist — create one in the same session to avoid mutating any pre-seeded room |  |
| 35 | Delete room | destructive | D | `/dashboard/service/view?tab=rooms` | a room must exist — create a throwaway room first |  |
| 36 | View trainer weekly availability grid | read | A | `/dashboard/trainers/view?tab=availability` | — |  |
| 37 | Edit trainer availability slots (upsert weekly template) | write | B | `/dashboard/trainers/view?tab=availability` | — |  |
| 38 | Add trainer availability exception (time-off / blocked date) | write | B | `/dashboard/trainers/view?tab=availability` | — |  |
| 39 | Delete trainer availability exception | destructive | D | `/dashboard/trainers/view?tab=availability` | an exception must exist — add one in the same session |  |
| 40 | View trainer availability conflicts | read | A | `/dashboard/trainers/view?tab=availability` | — |  |
| 41 | View trainer availability utilisation | read | A | `/dashboard/trainers/view?tab=availability` | — |  |
| 42 | Propose package session schedule | read | C | `/dashboard/packages` | an active sold package with an assigned trainer and preferred times must exist (0 packages sold) |  |
| 43 | Bulk-create sessions from proposed schedule | write | D | `/dashboard/packages` | an active sold package with an assigned trainer and remaining credits must exist (0 packages sold) |  |
| 44 | List appointments for current user (my sessions) | read | C | `/dashboard/appointment/view` | the caller must have appointments booked to them (0 seeded); primarily a client-facing view rather than a gym-owner admin flow |  |
| 45 | Waitlist management (list / add / remove / promote) | write | D | `/dashboard/appointment/class-slots/view` | a full class slot + a member; and there is no wired UI trigger |  |

## inventory  (39 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View Suppliers list (Active/All/Inactive filter) | read | A | `/dashboard/inventory-options?tab=suppliers` | — |  |
| 2 | Create Supplier | write | B | `/dashboard/inventory-options?tab=suppliers` | — |  |
| 3 | Edit Supplier | write | C | `/dashboard/inventory-options?tab=suppliers` | a supplier must exist first (create one) |  |
| 4 | View Supplier details | read | C | `/dashboard/inventory-options?tab=suppliers` | a supplier must exist first |  |
| 5 | Deactivate Supplier | destructive | D | `/dashboard/inventory-options?tab=suppliers` | an active supplier must exist first |  |
| 6 | View Product Categories list | read | A | `/dashboard/inventory-options?tab=categories` | — |  |
| 7 | Create Product Category | write | B | `/dashboard/inventory-options?tab=categories` | — |  |
| 8 | Edit Product Category | write | C | `/dashboard/inventory-options?tab=categories` | a product category must exist first |  |
| 9 | Delete Product Category | destructive | D | `/dashboard/inventory-options?tab=categories` | a product category must exist first |  |
| 10 | View Brands list | read | A | `/dashboard/inventory-options?tab=brands` | — |  |
| 11 | Create / Edit / Delete Brand | write | B | `/dashboard/inventory-options?tab=brands` | — |  |
| 12 | View Units of Measure list | read | A | `/dashboard/uom/view?tab=units` | — |  |
| 13 | Create Unit of Measure (base unit) | write | B | `/dashboard/uom/view?tab=units` | — |  |
| 14 | Edit Unit of Measure | write | C | `/dashboard/uom/view?tab=units` | a base unit of measure must exist first |  |
| 15 | Delete Unit of Measure | destructive | D | `/dashboard/uom/view?tab=units` | a base unit of measure must exist first |  |
| 16 | View UoM Conversions list | read | A | `/dashboard/uom/view?tab=conversions` | — |  |
| 17 | Create UoM Conversion | write | C | `/dashboard/uom/view?tab=conversions` | at least one base unit of measure must exist first (to select as base) |  |
| 18 | Edit UoM Conversion | write | C | `/dashboard/uom/view?tab=conversions` | a UoM conversion must exist first |  |
| 19 | Delete UoM Conversion | destructive | D | `/dashboard/uom/view?tab=conversions` | a UoM conversion must exist first |  |
| 20 | View Stock Requests list (status filter) | read | A | `/dashboard/stock-requests/view?tab=requests` | — |  |
| 21 | Create Stock Request | write | D | `/dashboard/stock-requests/view?tab=requests` | a product must exist first to supply a valid product UUID (0 products seeded and product CRUD is not browser-authorable) |  |
| 22 | Approve Stock Request | write | D | `/dashboard/stock-requests/view?tab=requests` | a pending stock request must exist first (which itself needs a product) |  |
| 23 | Reject Stock Request | destructive | D | `/dashboard/stock-requests/view?tab=requests` | a pending stock request must exist first |  |
| 24 | Fulfill Stock Request | write | D | `/dashboard/stock-requests/view?tab=requests` | an approved stock request must exist first |  |
| 25 | View Transfer Orders list (status filter) | read | A | `/dashboard/stock-requests/view?tab=transfers` | — |  |
| 26 | Create Transfer Order | write | D | `/dashboard/stock-requests/view?tab=transfers` | a product must exist first to supply a valid product UUID (0 products seeded) |  |
| 27 | Mark Transfer Order In Transit | write | D | `/dashboard/stock-requests/view?tab=transfers` | a pending transfer order must exist first |  |
| 28 | Complete Transfer Order (receive) | write | D | `/dashboard/stock-requests/view?tab=transfers` | an in-transit transfer order must exist first |  |
| 29 | Cancel Transfer Order | destructive | D | `/dashboard/stock-requests/view?tab=transfers` | a pending or in-transit transfer order must exist first |  |
| 30 | View Purchase Orders list | read | A | `/dashboard/purchase-orders/view` | — |  |
| 31 | Create Purchase Order | write | D | `/dashboard/purchase-orders/view` | at least one supplier AND at least one product must exist first (both are 0 at seed; products UI is a Coming-Soon stub) |  |
| 32 | Approve Purchase Order | write | D | `/dashboard/purchase-orders/view` | a draft purchase order must exist first |  |
| 33 | Cancel Purchase Order | destructive | D | `/dashboard/purchase-orders/view` | a draft or approved purchase order must exist first |  |
| 34 | Receive Items on Purchase Order (goods receipt) | write | D | `/dashboard/purchase-orders/view` | an approved (or ordered/partially-received) purchase order must exist first |  |
| 35 | Record Supplier Invoice for PO | write | D | `/dashboard/purchase-orders/view` | a received (or partially received) purchase order must exist first |  |
| 36 | View Supplier Invoices list | read | A | `/dashboard/purchase-orders/view?tab=invoices` | — |  |
| 37 | Match / Dispute Supplier Invoice | write | D | `/dashboard/purchase-orders/view?tab=invoices` | a supplier invoice must exist first (which requires a received PO) |  |
| 38 | Mark Supplier Invoice Paid | write | D | `/dashboard/purchase-orders/view?tab=invoices` | a supplier invoice must exist first |  |
| 39 | Products catalog (Coming Soon stub) | read | A | `/dashboard/products/view` | — |  |

## promotions-brands  (15 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View promotions list | read | A | `/dashboard/service/view?tab=promotions` | — |  |
| 2 | Search/filter promotions by code or name | read | C | `/dashboard/service/view?tab=promotions` | at least one promotion must exist first |  |
| 3 | Create promotion (percentage) | write | B | `/dashboard/service/view?tab=promotions` | — |  |
| 4 | Create promotion (fixed amount) | write | B | `/dashboard/service/view?tab=promotions` | — |  |
| 5 | Edit promotion details | write | C | `/dashboard/service/view?tab=promotions` | a promotion must exist first |  |
| 6 | Deactivate promotion (confirm dialog) | destructive | D | `/dashboard/service/view?tab=promotions` | an active promotion must exist first |  |
| 7 | Enable (reactivate) promotion | write | C | `/dashboard/service/view?tab=promotions` | an inactive promotion must exist first |  |
| 8 | Cancel promotion create/edit without saving | read | A | `/dashboard/service/view?tab=promotions` | — |  |
| 9 | Validate promo code at checkout (POS) | read | C | `/dashboard/pos` | a customer and an order/order amount must exist first |  |
| 10 | Apply promotion to a sales order (POS) | write | D | `/dashboard/pos` | a customer and a sales order must exist first |  |
| 11 | View brands list | read | A | `/dashboard/inventory-options?tab=brands` | — |  |
| 12 | Search brands in table | read | C | `/dashboard/inventory-options?tab=brands` | at least one brand must exist first |  |
| 13 | Create brand | write | B | `/dashboard/inventory-options?tab=brands` | — |  |
| 14 | Edit brand | write | C | `/dashboard/inventory-options?tab=brands` | a brand must exist first |  |
| 15 | Delete brand (confirm dialog) | destructive | D | `/dashboard/inventory-options?tab=brands` | a brand must exist first |  |

## comms-notifications  (16 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | List / filter announcements (status + audience rail, search, sort) | read | A | `/dashboard/announcements/view` | — |  |
| 2 | Expand announcement detail row | read | C | `/dashboard/announcements/view` | an announcement must exist (create one first if seed is empty) |  |
| 3 | Create announcement | write | B | `/dashboard/announcements/view` | — |  |
| 4 | Edit announcement | write | C | `/dashboard/announcements/view` | an announcement must exist (create one first if seed is empty) |  |
| 5 | Pin / unpin announcement (toggle) | write | C | `/dashboard/announcements/view` | an announcement must exist (create one first if seed is empty) |  |
| 6 | Deactivate (archive) announcement | destructive | D | `/dashboard/announcements/view` | an active announcement must exist (create one first if seed is empty) |  |
| 7 | Delete announcement | destructive | D | `/dashboard/announcements/view` | an announcement must exist (create one first if seed is empty) |  |
| 8 | List / filter notifications (All / Unread / Read tabs) | read | A | `/dashboard/notifications/view` | — |  |
| 9 | Mark single notification as read | write | D | `/dashboard/notifications/view` | an unread notification must exist for the admin user (none are seeded; notifications are event-driven from bookings/sales/etc.) |  |
| 10 | Mark all notifications as read | write | D | `/dashboard/notifications/view` | at least one notification must exist for the admin user (button is disabled when data.length === 0) |  |
| 11 | View notification preferences | read | A | `/dashboard/settings/notifications` | — |  |
| 12 | Toggle a notification preference (auto-save) | write | B | `/dashboard/settings/notifications` | — |  |
| 13 | List scheduled email reports | read | A | `/dashboard/reports/view` | — |  |
| 14 | Create scheduled email report | write | B | `/dashboard/reports/view` | — |  |
| 15 | Pause / resume scheduled report (toggle) | write | C | `/dashboard/reports/view` | a scheduled report must exist (create one first) |  |
| 16 | Delete scheduled report | destructive | D | `/dashboard/reports/view` | a scheduled report must exist (create one first) |  |

## expenses  (13 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View expenses list & KPIs (empty state) | read | A | `/dashboard/expenses/view` | — |  |
| 2 | Filter expenses by status tab | read | A | `/dashboard/expenses/view` | — |  |
| 3 | Filter expenses by branch (Scope switcher) | read | A | `/dashboard/expenses/view` | — |  |
| 4 | Submit expense claim (create) | write | B | `/dashboard/expenses/view` | — |  |
| 5 | Create dialog client-side validation | read | A | `/dashboard/expenses/view` | — |  |
| 6 | Cancel create dialog | read | A | `/dashboard/expenses/view` | — |  |
| 7 | Reject expense claim | destructive | D | `/dashboard/expenses/view` | a pending expense must exist first (admin can create one in the same session) |  |
| 8 | Reject dialog requires reason (validation) | read | C | `/dashboard/expenses/view` | a pending expense must exist first |  |
| 9 | Approve expense claim | write | D | `/dashboard/expenses/view` | a pending expense submitted by a DIFFERENT user must exist first (separation-of-duties) |  |
| 10 | Mark expense paid | write | D | `/dashboard/expenses/view` | an approved expense submitted by a DIFFERENT user must exist first |  |
| 11 | Cancel a status-transition dialog (Reject / Mark Paid) | read | C | `/dashboard/expenses/view` | a pending (for Reject) or approved (for Mark Paid) expense must exist |  |
| 12 | View expense list error / retry | read | C | `/dashboard/expenses/view` | requires inducing a query failure (network offline / server error) |  |
| 13 | Permission-gated access (no expense_management:read) | read | C | `/dashboard/expenses/view` | requires logging in as a user WITHOUT the expense_management:read permission |  |

## audit-activity  (15 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View audit log list | read | A | `/dashboard/audit/view` | — |  |
| 2 | View audit KPI severity tiles | read | A | `/dashboard/audit/view` | — |  |
| 3 | Filter audit log by severity | read | A | `/dashboard/audit/view` | — |  |
| 4 | Filter audit log by action type | read | A | `/dashboard/audit/view` | — |  |
| 5 | Filter audit log by entity type | read | A | `/dashboard/audit/view` | — |  |
| 6 | Filter audit log by actor | read | A | `/dashboard/audit/view` | — |  |
| 7 | Filter audit log by date range | read | A | `/dashboard/audit/view` | — |  |
| 8 | Filter audit log by branch | read | A | `/dashboard/audit/view` | — |  |
| 9 | Search audit events (client-side text) | read | A | `/dashboard/audit/view` | — |  |
| 10 | Clear all audit filters | read | A | `/dashboard/audit/view` | — |  |
| 11 | Load more audit events (pagination) | read | C | `/dashboard/audit/view` | more than 100 audit events must exist in the tenant audit log |  |
| 12 | View audit entry diff detail | read | C | `/dashboard/audit/view` | at least one audit event row must exist |  |
| 13 | Export audit log to CSV | read | C | `/dashboard/audit/view` | at least one audit row must be loaded (button disabled when rows.length === 0) |  |
| 14 | Open audit log from dashboard Recent Activity card | read | A | `/dashboard` | — |  |
| 15 | View customer activity log tab | read | C | `/dashboard/customers/$id` | a customer must exist first |  |

## settings-integrations  (37 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View organization settings | read | A | `/dashboard/settings/organization` | — |  |
| 2 | Save organization settings | write | D | `/dashboard/settings/organization` | — | ⚠️ |
| 3 | View notification preferences | read | A | `/dashboard/settings/notifications` | — |  |
| 4 | Toggle a notification preference | write | D | `/dashboard/settings/notifications` | — | ⚠️ |
| 5 | View onboarding QR index (branch list + detail) | read | A | `/dashboard/onboarding/view` | — |  |
| 6 | Generate branch onboarding QR code | write | C | `/dashboard/onboarding/view` | a branch (hierarchy node of type branch) must exist |  |
| 7 | Regenerate branch onboarding QR code | write | C | `/dashboard/onboarding/view` | an existing active branch invite (generate one first) |  |
| 8 | Revoke branch onboarding QR code | destructive | D | `/dashboard/onboarding/view` | an existing active branch invite (generate one first) |  |
| 9 | View Google Calendar org status + my connection | read | A | `/dashboard/settings/google-calendar` | — |  |
| 10 | Connect my Google Calendar (OAuth) | write | D | `/dashboard/settings/google-calendar` | a real Google account + OAuth consent (external) |  |
| 11 | Disconnect my Google Calendar | destructive | D | `/dashboard/settings/google-calendar` | an active Google Calendar connection for the actor |  |
| 12 | Update Google Calendar sync settings | write | D | `/dashboard/settings/google-calendar` | an active Google Calendar connection for the actor |  |
| 13 | Trigger Google Calendar sync now | write | D | `/dashboard/settings/google-calendar` | an active Google Calendar connection for the actor |  |
| 14 | List connected Google calendars | read | C | `/dashboard/settings/google-calendar` | an active Google Calendar connection for the actor |  |
| 15 | List sending domains (Email settings) | read | A | `/dashboard/settings/email` | — |  |
| 16 | Register a sending domain | write | D | `/dashboard/settings/email` | Resend API credentials / a Resend account |  |
| 17 | Edit sender settings for a domain | write | D | `/dashboard/settings/email` | a registered sending domain |  |
| 18 | Verify a sending domain (re-check DNS) | write | D | `/dashboard/settings/email` | a registered sending domain (and real DNS records at a provider) |  |
| 19 | Send a test email through a verified domain | write | D | `/dashboard/settings/email` | a verified sending domain |  |
| 20 | View DNS records + DMARC progression for a domain | read | C | `/dashboard/settings/email` | a registered sending domain |  |
| 21 | List sending-address aliases for a domain | read | C | `/dashboard/settings/email` | a registered sending domain |  |
| 22 | Add a sending-address alias | write | D | `/dashboard/settings/email` | a registered sending domain |  |
| 23 | Remove a sending-address alias | destructive | D | `/dashboard/settings/email` | an existing alias on a domain |  |
| 24 | Delete a sending domain | destructive | D | `/dashboard/settings/email` | a registered sending domain |  |
| 25 | View notification routing config | read | A | `/dashboard/settings/email` | — |  |
| 26 | Save a notification route override | write | D | `/dashboard/settings/email` | a verified sending domain with at least one alias |  |
| 27 | Reset a notification route to default | destructive | D | `/dashboard/settings/email` | an existing saved notification route |  |
| 28 | View GoHighLevel integration page | read | A | `/go-highlevel-integration` | — |  |
| 29 | View GHL sync events log | read | A | `/go-highlevel-integration` | — |  |
| 30 | Connect organization-wide GHL | write | D | `/go-highlevel-integration` | a valid GHL location id + private integration token (external) |  |
| 31 | Disconnect organization-wide GHL | destructive | D | `/go-highlevel-integration` | an active org-shared GHL connection |  |
| 32 | Toggle GHL inbound approval gate | write | B | `/go-highlevel-integration` | — |  |
| 33 | Approve a pending GHL contact | write | D | `/go-highlevel-integration` | a pending GHL contact in the approval queue (requires an inbound GHL webhook) |  |
| 34 | Reject a pending GHL contact | destructive | D | `/go-highlevel-integration` | a pending GHL contact in the approval queue |  |
| 35 | Connect a branch to GHL (legacy per-branch) | write | D | `/go-highlevel-integration` | a valid GHL location id + API key (external) |  |
| 36 | Disconnect a branch from GHL | destructive | D | `/go-highlevel-integration` | an active per-branch GHL connection |  |
| 37 | Retry failed GHL branch syncs | write | D | `/go-highlevel-integration` | a connected branch with failed syncs |  |

## reports  (18 ops)

| # | Operation | Kind | Tier | Path | Precondition | Seed? |
|---|---|---|---|---|---|---|
| 1 | View Performance Report dashboard (KPI tiles + charts) | read | A | `/dashboard/reports/view` | — |  |
| 2 | View Revenue Trend area chart | read | A | `/dashboard/reports/view` | — |  |
| 3 | View Revenue by Branch breakdown | read | A | `/dashboard/reports/view` | — |  |
| 4 | View Top Trainers leaderboard | read | A | `/dashboard/reports/view` | — |  |
| 5 | View Active Members KPI trend | read | A | `/dashboard/reports/view` | — |  |
| 6 | View Churn Rate KPI trend | read | A | `/dashboard/reports/view` | — |  |
| 7 | View Avg Member LTV KPI trend | read | A | `/dashboard/reports/view` | — |  |
| 8 | View Class Fill Rate KPI trend | read | A | `/dashboard/reports/view` | — |  |
| 9 | Change reporting window (7D / 30D / 90D / YTD) | read | A | `/dashboard/reports/view` | — |  |
| 10 | Filter report by tenant scope (country -> state -> branch) | read | A | `/dashboard/reports/view` | — |  |
| 11 | Export report as PDF | read | A | `/dashboard/reports/view` | — |  |
| 12 | Export report as CSV | read | A | `/dashboard/reports/view` | — |  |
| 13 | Open Schedule Email Report dialog & list existing schedules | read | A | `/dashboard/reports/view` | — |  |
| 14 | Create scheduled email report | write | B | `/dashboard/reports/view` | — |  |
| 15 | Validate schedule form (invalid recipients / missing name) | read | A | `/dashboard/reports/view` | — |  |
| 16 | Pause a scheduled report | write | C | `/dashboard/reports/view` | a scheduled report must exist first (run Create scheduled email report) |  |
| 17 | Resume a paused scheduled report | write | C | `/dashboard/reports/view` | a paused scheduled report must exist first |  |
| 18 | Delete a scheduled report | destructive | D | `/dashboard/reports/view` | a scheduled report must exist first (run Create scheduled email report) |  |

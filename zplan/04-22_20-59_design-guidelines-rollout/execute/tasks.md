# Task Inventory

**Plan:** zplan/04-22_20-59_design-guidelines-rollout/plan/plan.md
**Generated:** 2026-04-23 10:15
**Scope this run:** Phase 0 + Phase 1 (complete) · Phase 3 (complete) · Phase 4 (complete) · Phase 5 (in progress)
**Total tasks:** 80

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 0 | Create `apps/web/src/components/ui/page-card.tsx` — PageCard primitive per §3.1 contract | Agent 0A (PageCard) | done |
| 2 | 0 | Create `apps/web/src/__tests__/components/ui/page-card.test.tsx` — snapshot tests for nested + padding variants | Agent 0A (PageCard) | done |
| 3 | 0 | Create `apps/web/src/components/ui/status-badge.tsx` — canonical CanonicalStatus map per §12.5, all extensions incl. inventory/attendance | Agent 0B (StatusBadge) | done |
| 4 | 0 | Create `apps/web/src/__tests__/components/ui/status-badge.test.tsx` — every CanonicalStatus value asserted | Agent 0B (StatusBadge) | done |
| 5 | 0 | Create `apps/web/src/components/ui/empty-state.tsx` — EmptyState per §3.1 contract | Agent 0C (EmptyState) | done |
| 6 | 0 | Create `apps/web/src/__tests__/components/ui/empty-state.test.tsx` — search vs empty contexts | Agent 0C (EmptyState) | done |
| 7 | 0 | Create `apps/web/src/components/ui/status-callout.tsx` — 4 variants (success/warning/error/info), message?: string compat prop | Agent 0D (StatusCallout) | done |
| 8 | 0 | Create `apps/web/src/__tests__/components/ui/status-callout.test.tsx` — per variant + retry callback | Agent 0D (StatusCallout) | done |
| 9 | 0 | Delete `apps/web/src/components/ui/error-state.tsx` — 0 callers confirmed; StatusCallout is the replacement | Agent 0D (StatusCallout) | done |
| 10 | 0 | Create `apps/web/src/components/branch/branch-selector.tsx` — re-export BranchCombobox as BranchSelector | Agent 0E (BranchSelector) | done |
| 11 | 0 | Add `@deprecated` JSDoc to `apps/web/src/components/ui/branch-combobox.tsx` — points consumers to branch-selector path | Agent 0E (BranchSelector) | done |
| 12 | 0 | Audit `apps/web/src/index.css` dark token parity — confirm no new custom props in Phase 0 need `.dark{}` entries | Orchestrator inline | done |
| 13 | 1 | Swap 5 sidebar icons in `apps/web/src/components/app-sidebar.tsx` — Class Slots→Grid3x3, Membership→CreditCard, UoM→Ruler, StockMovement→ArrowLeftRight, PurchaseOrders→ClipboardList | Agent 1A (Sidebar+QuickWins) | done |
| 14 | 1 | Tooltip audit `apps/web/src/components/app-sidebar.tsx` — confirm every SidebarMenuButton has tooltip | Agent 1A (Sidebar+QuickWins) | done |
| 15 | 1 | formatPrice canonicalisation — replace currency toFixed(2) in pos/items-step, pos/payment-step, refunds/request-refund-dialog | Agent 1A (Sidebar+QuickWins) | done |
| 16 | 1 | expenses.ts schema fix — change `.default("usd")` → `.default("myr")` | Agent 1A (Sidebar+QuickWins) | done |
| 17 | 3 | Token sweep `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx` — replace 35 gray/zinc violations with brand tokens | Agent 3A (Trainers) | done |
| 18 | 3 | Token sweep `apps/web/src/components/trainers/trainer-availability-editor.tsx` — gray/zinc violations | Agent 3A (Trainers) | done |
| 19 | 3 | Delete AVATAR_COLORS from `apps/web/src/components/pages/customers/registered-page.tsx` — replace with §12.4 member avatar (`bg-primary text-primary-foreground`) | Agent 3B (CustomerAvatar) | done |
| 20 | 3 | Fix walk-in avatar in `apps/web/src/components/pos/customer-step.tsx:179` — `r.type==="walk_in"` conditional (underscore): `bg-brand-secondary-2 text-brand-primary-1` vs `bg-primary text-primary-foreground` | Agent 3C (POSAvatar) | done |
| 21 | 3 | Replace change-due inline div in `apps/web/src/components/pos/payment-step.tsx:~209` with `<StatusCallout variant="success">` | Agent 3D (POSCallout) | done |
| 22 | 3 | Wire `EmptyState` into zero-rows branch of `apps/web/src/components/tables/sales/view/data-table.tsx` | Agent 3E (DataTable) | done |
| 23 | 3 | Add `error`/`onRetry`/`emptyTitle`/`emptyAction` props to DataTable + wire `StatusCallout variant="error"` | Agent 3E (DataTable) | done |
| 24 | 3 | (3.6) Codify empty+error pattern — add JSDoc to data-table.tsx showing the pattern for the other 12 tables to follow | Agent 3E (DataTable) | done |
| 25 | 3 | Replace inline status badge in trainers/view.tsx with `<StatusBadge>` | Agent 3A (Trainers) | done |
| 26 | 3 | Replace inline status badge in registered-page.tsx (if any) | Agent 3B (CustomerAvatar) | done |
| 27 | 3 | Replace AVATAR_COLORS in registered-page.tsx walk-in avatar (if walk-ins shown alongside members) | Agent 3B (CustomerAvatar) | done |
| 28 | 4 | Delete inline StatusBadge in `tables/sales/view/columns.tsx:180-193` → `<StatusBadge status={...}>` | Agent 4-cols | done |
| 29 | 4 | Delete local `StatusBadge` function in `tables/products/view/columns.tsx:25-52` → canonical | Agent 4-cols | done |
| 30 | 4 | Delete local `StatusBadge` in `tables/stock-requests/view/columns.tsx:37-59` → canonical | Agent 4-cols | done |
| 31 | 4 | Delete local `StatusBadge` in `tables/transfer-orders/view/columns.tsx:36-59` → canonical | Agent 4-cols | done |
| 32 | 4 | Delete `CommissionStatusBadge` in `pages/commissions/all-tab.tsx:91-116` → canonical | Agent 4-cols | done |
| 33 | 4 | Delete `CommissionStatusBadge` in `pages/commissions/mine-tab.tsx` → canonical | Agent 4-cols | done |
| 34 | 4 | 4.A.1: `appointment/class-slots/view.tsx` — Replace raw UUID `<Input>` with `<BranchSelector/>`, EmptyState, status spans | Agent 4-misc | done |
| 35 | 4 | 4.A.2: `appointment/view.tsx` — EmptyState for no-appointments-in-range | Agent 4-misc | done |
| 36 | 4 | 4.A.3: `rooms/view.tsx` — EmptyState; audit inline status | Agent 4-misc | done |
| 37 | 4 | 4.B.1: `branch/create.tsx` — Remove console.log; `bg-blue-500` → `bg-primary` on step chips | Agent 4-misc | done |
| 38 | 4 | 4.B.2: `branch/view.tsx` — EmptyState; status/radius audit | Agent 4-misc | done |
| 39 | 4 | 4.C.1: `trainers/tiers.tsx` — Cleanup-only token sweep | Agent 4-misc | done |
| 40 | 4 | 4.C.2: `access-control/roles.tsx` — EmptyState; StatusBadge | Agent 4-misc | done |
| 41 | 4 | 4.C.3: `access-control/user-assignment.tsx` + `pages/access-control/members-tab.tsx` — Replace priority-colour map; EmptyState | Agent 4-misc | done |
| 42 | 4 | 4.C.4/5: `access-control/invitations.tsx` + `role/view.tsx` — redirect stubs, add LEGACY comment | Agent 4-misc | done |
| 43 | 4 | 4.C.6: `user/view.tsx` — LEGACY EXEMPT — add top-of-file comment | Agent 4-misc | done |
| 44 | 4 | 4.D.1/2: `service/view.tsx`, `service-category/view.tsx` — LEGACY EXEMPT — add comment | Agent 4-misc | done |
| 45 | 4 | 4.D.3: `my-services/view.tsx` — EmptyState; ensure StatusBadge for active/inactive | Agent 4-misc | done |
| 46 | 4 | 4.D.4: `packages/instances/view.tsx`, `packages/installments/view.tsx` — redirect stubs, audit | Agent 4-misc | done |
| 47 | 4 | 4.D.5: `memberships/view.tsx` — StatusBadge for active/expiring/frozen/expired | Agent 4-misc | done |
| 48 | 4 | 4.E.1: `customers/view.tsx` — EmptyState | Agent 4-misc | done |
| 49 | 4 | 4.E.2: `customers/walk-in/view.tsx` — BranchSelector; EmptyState; walk-in avatar | Agent 4-misc | done |
| 50 | 4 | 4.F.1: `sales/view.tsx` — verify stat card `rounded-2xl`; wire DataTable emptyTitle/emptyAction | Agent 4-finance | done |
| 51 | 4 | 4.F.2: `sales/create.tsx` — audit step badges; confirm page header | Agent 4-finance | done |
| 52 | 4 | 4.F.3: `sales/$id.tsx` — replace any local StatusBadge with canonical | Agent 4-finance | done |
| 53 | 4 | 4.F.4: `refunds/view.tsx` + `components/refunds/**` — delete local StatusBadge; EmptyState | Agent 4-finance | done |
| 54 | 4 | 4.F.5: `commissions/view.tsx` + `commissions/my.tsx` — EmptyState; verify no remaining inline badges | Agent 4-finance | done |
| 55 | 4 | 4.F.6: `cancelled-sales/view.tsx` — EmptyState; error state | Agent 4-finance | done |
| 56 | 4 | 4.F.7: `payment/view.tsx` + `tables/payment/view/columns.tsx` — documented exception for payment mode; EmptyState | Agent 4-finance | done |
| 57 | 4 | 4.F.8: `payouts/view.tsx` — EmptyState; error state | Agent 4-finance | done |
| 58 | 4 | 4.F.9: `expenses/view.tsx` — delete local StatusBadge; confirm currency display | Agent 4-finance | done |
| 59 | 4 | 4.F.10: `promotions/view.tsx` — EmptyState; audit status badges | Agent 4-finance | done |
| 60 | 4 | 4.F.11: `purchase-orders/view.tsx` — BranchSelector; delete local StatusBadge | Agent 4-finance | done |
| 61 | 4 | 4.G.1: `products/view.tsx` — EmptyState; ensure no gray tokens remain | Agent 4-inventory | done |
| 62 | 4 | 4.G.2: `brands/view.tsx` — EmptyState | Agent 4-inventory | done |
| 63 | 4 | 4.G.3: `categories/view.tsx` — EmptyState | Agent 4-inventory | done |
| 64 | 4 | 4.G.4: `suppliers/view.tsx` — EmptyState | Agent 4-inventory | done |
| 65 | 4 | 4.G.5: `stock-requests/view.tsx` — EmptyState; verify no gray tokens | Agent 4-inventory | done |
| 66 | 4 | 4.G.6: `transfer-orders/view.tsx` — EmptyState; verify no gray tokens | Agent 4-inventory | done |
| 67 | 4 | 4.G.7: `uom/view.tsx` — EmptyState | Agent 4-inventory | done |
| 68 | 4 | 4.G.8: `uom-conversions/view.tsx` — EmptyState | Agent 4-inventory | done |
| 69 | 4 | 4.H.1: `attendance/today-bookings.tsx:63-90` — delete local StatusBadge; wire EmptyState | Agent 4-ops | done |
| 70 | 4 | 4.H.2: `attendance/view.tsx` — token sweep; error state | Agent 4-ops | done |
| 71 | 4 | 4.H.3: `audit/view.tsx` — EmptyState; error state | Agent 4-ops | done |
| 72 | 4 | 4.I.1: `announcements/view.tsx` — replace orange-600 badge → `<StatusBadge status="..." />` (warning variant) | Agent 4-ops | done |
| 73 | 4 | 4.I.2: `notifications/view.tsx` — document activity-dot approved exception | Agent 4-ops | done |
| 74 | 4 | 4.J.1-5: `settings/{google-calendar,tax-rates,installment-plans,organization,notifications}.tsx` — standard audit, EmptyState where needed | Agent 4-ops | done |
| 75 | 5 | 5.1a: `bulk-action-bar.tsx` — add `totalAmountCents` prop; show formatted total in ApproveConfirmDialog | Agent 5-commission | done |
| 76 | 5 | 5.1b: `all-tab.tsx` — compute `selectedTotalCents` from rows × selectedIds; pass to BulkActionBar | Agent 5-commission | done |
| 77 | 5 | 5.1c: `__tests__/components/commissions/bulk-approve-dialog.test.tsx` — Cancel does NOT fire mutation; Confirm does | Agent 5-commission | done |
| 78 | 5 | 5.2a: `attendance/drop-in-form.tsx` — replace toast.warning on ALREADY_CHECKED_IN with Dialog showing minutesAgo | Agent 5-attendance | done |
| 79 | 5 | 5.2b: `__tests__/components/attendance/drop-in-form.test.tsx` — repeat check-in surfaces dialog with correct copy | Agent 5-attendance | done |
| 80 | 5 | 5.3: Audit customers/view.tsx drawer for §14.5 freeze flow; report finding | Agent 5-attendance | done |

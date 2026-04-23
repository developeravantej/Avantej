# Task Inventory

**Plan:** zplan/04-22_20-59_design-guidelines-rollout/plan/plan.md
**Generated:** 2026-04-23 10:15
**Scope this run:** Phase 0 (foundational primitives) + Phase 1 (sidebar/quick wins)
**Total tasks:** 16

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

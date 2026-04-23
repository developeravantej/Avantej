## Agent: Agent 0A (PageCard) — Phase 0+1
**Completed:** 2026-04-23

### What I Did
- `apps/web/src/components/ui/page-card.tsx`: created PageCard primitive (as/padding/nested props, cn merge)
- `apps/web/src/__tests__/components/ui/page-card.test.tsx`: 6 tests covering all prop variants

### Decisions Made
- Used a constrained string union (`"section" | "article" | "div"`) for the polymorphic `as` prop — avoids complex generic typing while staying type-safe
- border color class is `border-brand-secondary-3` per §2.1 spec token
- Padding "none" maps to `p-0` (explicit class) rather than omitting a class, so twMerge can override it predictably when a consumer passes a custom padding class via `className`

### Issues Encountered
- `apps/web/src/__tests__/` directory had no subdirectories; created `components/ui/` path via `mkdir -p`
- Tests directory appeared empty (no prior test files) — confirmed vitest config scans `src/__tests__/**/*.test.{ts,tsx}`, so new subdirs are picked up automatically

DONE: #1
DONE: #2

---

## Agent: Agent 0E (BranchSelector) — Phase 0+1
**Completed:** 2026-04-23

### What I Did
- `apps/web/src/components/branch/branch-selector.tsx`: created re-export of BranchCombobox as BranchSelector
- `apps/web/src/components/ui/branch-combobox.tsx`: added @deprecated JSDoc + exported BranchComboboxProps interface

### Decisions Made
- Added export to BranchComboboxProps interface to enable type re-export from new path
- No code migration of inline BranchCombobox copies yet (Phase 4 task)

### Issues Encountered
- None

DONE: #10
DONE: #11

---

## Agent: Agent 1A (Sidebar+QuickWins) — Phase 0+1
**Completed:** 2026-04-23

### What I Did
- `apps/web/src/components/app-sidebar.tsx`: swapped 5 icons (Class Slots→Grid3x3, Membership→CreditCard, UoM→Ruler, StockMovement→ArrowLeftRight, PurchaseOrders→ClipboardList); added Grid3x3/Ruler/ArrowLeftRight/ClipboardList to lucide import
- `apps/web/src/components/app-sidebar.tsx`: tooltip audit — all tooltips present. Every `SidebarMenuButton` in `NavGroup` receives `tooltip={item.title}` via the generic loop, and the two hardcoded groups ("My Work" and "Platform Admin") each have explicit `tooltip="My Services"`, `tooltip="Users"`, `tooltip="Admins"` props. No changes required.
- `apps/web/src/components/pos/items-step.tsx`: NO CHANGE. Line 56 `priceRm = (item.unitPriceCents / 100).toFixed(2)` is used as the `value` prop of `<Input type="number">` — a form field value, not a display label. Keeping `.toFixed(2)` is correct here.
- `apps/web/src/components/pos/payment-step.tsx`: NO CHANGE. Line 93 `amountTenderedRm` is used as `value={amountTenderedRm}` on a number input; lines 189 and 192 are `min` and `placeholder` attributes on a number input. All are form field attributes, not display labels. `formatPrice` is already correctly used on lines 202 and 215 for display labels.
- `apps/web/src/components/refunds/request-refund-dialog.tsx`: NO CHANGE. Line 92 `defaultAmountRm` is used as the `defaultValues.amountRm` form field value. `formatPrice` is already correctly used on line 170 for the suggested-amount display label.
- `packages/db/src/schema/tenant/expenses.ts`: changed `.default("usd")` → `.default("myr")`

### Decisions Made
- Task #15: All three `.toFixed(2)` sites are form input values/attributes, not display labels. Converting them to `formatPrice` would break the inputs (format returns "RM 5.00" which is not a valid numeric string for `<input type="number">`). No code changes warranted.
- `CreditCard` was already imported (used for Installment Plans) — no duplicate import added; it is simply reused for Membership.

### Issues Encountered
- None

DONE: #13
DONE: #14
DONE: #15
DONE: #16

---

## Agent: Agent 0D (StatusCallout) — Phase 0+1
**Completed:** 2026-04-23

### What I Did
- `apps/web/src/components/ui/status-callout.tsx`: created StatusCallout with 4 variants (success/warning/error/info) + message/children backwards-compat + onRetry/onDismiss + custom icon override
- `apps/web/src/__tests__/components/ui/status-callout.test.tsx`: 20 tests covering all variants, retry button (presence/absence/non-error guard), dismiss button (presence/click), message vs children precedence, custom icon, aria roles, title prop, className forwarding
- `apps/web/src/components/ui/error-state.tsx`: DELETED (0 callers confirmed)

### Decisions Made
- Custom `icon` prop is wrapped in a `<span>` with size/shrink classes to keep layout consistent with the default icon sizing; default icons use `size-5 shrink-0 mt-0.5` directly via className
- Retry button is only rendered when BOTH `variant === "error"` AND `onRetry` is provided — non-error variants silently ignore the prop
- Dismiss button uses a plain `<button>` (not shadcn Button) with `aria-label="Dismiss"` for minimal markup and correct semantics
- `bun test` invokes bun's native test runner (no jsdom); used `bun run test` to correctly invoke vitest with jsdom environment

### Issues Encountered
- Initial test run used `bun test` which bypasses vitest and uses bun's native runner (no DOM environment) — all tests failed with "document is not defined". Fixed by using `bun run test` which correctly invokes `vitest run` via the package.json script.

DONE: #7
DONE: #8
DONE: #9

---

## Agent: Agent 0C (EmptyState) — Phase 0+1
**Completed:** 2026-04-23

### What I Did
- `apps/web/src/components/ui/empty-state.tsx`: created EmptyState with icon/title/description/action/context props; defaults to Inbox icon; hides CTA when context="search" or action is undefined
- `apps/web/src/__tests__/components/ui/empty-state.test.tsx`: 8 tests covering title render, description presence/absence, CTA render with action+context="empty", CTA suppressed when context="search", CTA suppressed when no action, custom icon prop, and onClick firing

### Decisions Made
- Used `as unknown as LucideIcon` cast for the test mock icon — `LucideIcon` is `ForwardRefExoticComponent` so a plain function component misses `$$typeof` at the type level; the cast keeps the test file type-clean without pulling in `React.forwardRef` boilerplate
- Added `React` import to the test file to satisfy the JSX transform under vitest/jsdom

### Issues Encountered
- Initial mock `const MockIcon: LucideIcon = (props) => <svg />` produced a TS2741 error ("Property '$$typeof' is missing"). Fixed with `as unknown as LucideIcon` cast.

DONE: #5
DONE: #6

---

## Agent: Agent 0B (StatusBadge) — Phase 0+1 [INLINE FALLBACK — agent failed to log]
**Completed:** 2026-04-23

### What I Did
- `apps/web/src/components/ui/status-badge.tsx`: verified created — 19-value CanonicalStatus union, KNOWN_STATUSES export, STATUS_CONFIG record, canonical §12.5 colour mapping, default label formatter (underscores/hyphens → spaces → title case)
- `apps/web/src/__tests__/components/ui/status-badge.test.tsx`: verified created — 34 tests per agent return message; smoke test over all KNOWN_STATUSES values + per-variant assertions + void vs cancelled distinction

### Decisions Made
- STATUS_CONFIG typed as `Record<CanonicalStatus, StatusConfig>` — compile error if a new status value is added without updating the map

### Issues Encountered
- Agent completed work but did not append to log.md (fallback applied by orchestrator)

DONE: #3
DONE: #4

---

## Run: 2026-04-23 10:40
**Trigger:** /execute zplan/04-22_20-59_design-guidelines-rollout
**Plan version:** plan/plan.md (post audit-apply round 3)
**Scope:** Phase 0 + Phase 1 (primitives + sidebar/quick wins)

### Phase outcomes
- Phase 0+1 (parallel): **pass** — 16/16 tasks done, 0 missed

### Final build status
- type check (web): **pass** — 0 errors
- lint: **pass** — 0 errors, 88 pre-existing warnings (not introduced by this run)
- tests (new primitives): **pass** — 68/68
- tests (full suite): 143 passed, 26 pre-existing failures in route tests unrelated to this run (brands/categories/suppliers/etc already failing before our changes — confirmed via stash test)

### Cross-agent decisions
- Task #15 (formatPrice): no code changes — all .toFixed(2) sites in scope are form input attributes, not display labels. Pre-existing formatPrice usage is already correct on display labels.
- Task #12 (dark parity): no new CSS custom properties introduced; .dark{} block requires no additions.
- Task #14 (tooltip audit): all SidebarMenuButtons already have tooltip via item.title generic loop — no changes needed.

### Subagent retry summary
- 1 retry (inline fallback): Agent 0B (StatusBadge) — files created correctly, log write failed; fallback applied by orchestrator

---

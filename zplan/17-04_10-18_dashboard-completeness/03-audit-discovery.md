# Audit & Discovery Tasks

> Workstream shape: **discovery → new docs**, not code changes.
> Output: three new files under `zdocs/`.
> Each audit is independent and can run in parallel.

---

## Audit 1: Pagination Caps Per Router

### Goal

Produce `zdocs/pagination-audit.md` listing every oRPC `list` procedure and its pagination behavior (hard cap? cursor? offset? no cap?).

### Method

1. Grep `packages/api/src/routers/*.ts` for `list` procedures:
   ```
   pattern: protectedProcedure.*\.handler|export const .*Router
   ```
2. For each `list` handler, inspect the Drizzle query:
   - Is there a `.limit()` call? What's the value?
   - Is the limit hardcoded or from input?
   - If from input, what's the max?
3. Cross-reference with the frontend call site:
   - Does the page request a custom limit?
   - Is there UI for pagination (page numbers, "load more", infinite scroll)?
4. Record findings in a table.

### Output Shape

`zdocs/pagination-audit.md`:

```markdown
# Pagination Audit

Date: 2026-04-?
Source: grep of packages/api/src/routers + apps/web/src usage

| Router | Procedure | Server Cap | Input Cap | UI Pagination | Risk |
|--------|-----------|-----------|-----------|---------------|------|
| members | list | hardcoded 100 | none | no | medium — 100-member orgs silently truncate |
| payouts | list | hardcoded 50 | none | no | flagged in primary doc |
| ... | | | | | |

## Recommendations
- Add cursor pagination to X, Y, Z
- Add UI pagination to A, B, C
- Raise caps on D, E
```

### Acceptance

- Every `list` procedure in `packages/api/src/routers/` appears in the table
- Risk column is populated (low / medium / high) based on expected row volume

### Estimated Effort

4 hours

---

## Audit 2: Error Handling Conventions Per Page

### Goal

Produce `zdocs/error-handling-conventions.md` documenting how each dashboard page handles API errors today, and what the canonical pattern should be.

### Method

1. For each file under `apps/web/src/routes/_authenticated/dashboard/_layout/**/*.tsx`:
   - Identify every `useQuery` and `useMutation` call
   - Check: does it have `onError`? Does the query check `.error`? Does it render an error state?
2. Bucket into patterns:
   - **A**: renders error UI with retry button (e.g., Brands view)
   - **B**: toasts error (e.g., most mutations)
   - **C**: silent empty array fallback (e.g., Cancelled Sales)
   - **D**: silent `undefined` / no feedback
3. Flag pattern C + D as anti-patterns to fix.

### Output Shape

`zdocs/error-handling-conventions.md`:

```markdown
# Error Handling Conventions

## Canonical Patterns

- **Query error**: render an error Card with "Try Again" button
- **Mutation error**: sonner toast with the server error message
- **Loading state**: skeleton matching the final layout
- **Empty state**: empty Card with guidance copy + primary CTA

## Current State

| Page | Query Error | Mutation Error | Deviation |
|------|-------------|----------------|-----------|
| Dashboard Home | B | — | none |
| Cancelled Sales | C (silent empty) | — | anti-pattern — fix in follow-up |
| ... | | | |
```

### Acceptance

- Every dashboard page evaluated
- Anti-patterns tagged with fix suggestions
- Canonical patterns documented for future pages

### Estimated Effort

6 hours (more pages than Audit 1)

---

## Audit 3: Currency Field Defaults

### Goal

Produce `zdocs/currency-defaults-audit.md` listing every column, form default, and display formatter that has a currency dimension, and flagging where "usd" sneaks in.

### Method

1. Grep schema files in `packages/db/src/schema/tenant/` for `currency` columns:
   ```
   pattern: currency.*default
   ```
2. Grep service files in `packages/services/` for currency-related logic:
   ```
   pattern: ["']usd["']|["']myr["']|currency
   ```
3. Grep frontend for display formatters:
   ```
   pattern: formatPrice|formatCurrency|Intl\.NumberFormat
   ```
4. Record findings by entity.

### Output Shape

`zdocs/currency-defaults-audit.md`:

```markdown
# Currency Defaults Audit

## Schema

| Table | Column | Default | Correct? |
|-------|--------|---------|----------|
| expenses | currency | "usd" | NO — should be "myr" |
| invoices | currency | "myr" | yes |
| ... | | | |

## Display

| File | Formatter | Currency | Correct? |
|------|-----------|----------|----------|
| components/tables/service/view/columns.tsx | formatPrice(val, "MYR") | MYR | yes (fixed 2026-04-16) |
| ... | | | |

## Fixes Required

1. Migration to change `expenses.currency` default to "myr"
2. Backfill existing NULL currencies to "myr"
3. ...
```

### Acceptance

- Every tenant-DB table with a monetary column reviewed
- Every frontend currency formatter reviewed
- Fix list is actionable (migrations + code changes enumerated)

### Estimated Effort

3 hours

---

## Shared Notes

- All three audits produce docs, not code changes — no deployment coupling
- Output docs feed into `01-documentation-patches.md` patches #9, #10, #11
- If any audit surfaces a critical bug (e.g., a `list` procedure with no cap returning millions of rows), escalate out of this plan to a standalone fix

---

---

## Audit 4: Raw UUID Text Inputs (P2 #17)

### Goal

Produce `zdocs/uuid-inputs-audit.md` listing every form field that accepts a raw UUID text input where a searchable combobox is the intended UX, plus a remediation plan showing which combobox pattern to use per case.

### Known Cases (from primary doc)

- Walk-in Customers create/edit — Branch ID
- Class Slots create — Branch ID
- Purchase Orders create — Branch ID
- Package Instances "assign" flow — Client ID (UUID)
- Stock Requests create — Product ID
- Transfer Orders create — Product ID

### Known Counter-Examples (pattern-matches)

- Stock Requests / Transfer Orders — already use branch combobox (`hierarchy.listNodes`)
- Purchase Orders — already uses supplier + product dropdowns

### Method

1. Grep all form files for `.min(0)` or `.uuid()` string inputs labeled "Branch ID", "Product ID", "Client ID", "Member ID", "Supplier ID"
2. For each raw UUID input, map to the correct data source:
   - Branch IDs → `client.hierarchy.listNodes` filtered to leaf branches
   - Product IDs → `client.products.list`
   - Client IDs → either `client.customerProfiles.list` (registered) or `client.walkInCustomers.list` (walk-in) — may need both in a unified combobox
   - Supplier IDs → `client.suppliers.list`
3. For each case, record existing pattern file to copy from

### Output Shape

`zdocs/uuid-inputs-audit.md`:

```markdown
# Raw UUID Input Audit

| Page | Field | Current UX | Intended Source | Pattern File to Copy |
|------|-------|-----------|-----------------|---------------------|
| walk-in/view create sheet | Branch ID | raw UUID text | client.hierarchy.listNodes (leaf filter) | stock-requests/view.tsx |
| class-slots/view create sheet | Branch ID | raw UUID text | same | same |
| ... | | | | |

## Remediation Plan

Order by frequency of user pain — Walk-in Customers first (most-used), Package Instances last.
```

### Output → Follow-Up Tickets

Each row in the audit becomes a ticket. Not in this plan's scope to execute — the plan's scope is the audit doc only.

### Acceptance

- Every documented raw-UUID input has a row with a concrete source + pattern file
- Remediation order is prioritized by user-facing frequency

### Estimated Effort

2 hours

---

## Overall Acceptance

- [ ] `zdocs/pagination-audit.md` exists and passes review
- [ ] `zdocs/error-handling-conventions.md` exists and passes review
- [ ] `zdocs/currency-defaults-audit.md` exists and passes review
- [ ] `zdocs/uuid-inputs-audit.md` exists with remediation order
- [ ] Primary doc's Section 20 references all four

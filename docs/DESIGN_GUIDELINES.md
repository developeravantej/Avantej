# Avantej Core — Design Guidelines

> Version 1.1 · April 2026
>
> This is a living document. Update it when design decisions change.
>
> **Owner:** Engineering lead (any PR that touches `index.css`, `ui/`, or global layout requires a review confirming compliance).

---

## 0. Scope & Enforcement

### Applies to
- `apps/web` — all dashboard and public pages
- `apps/native` — token naming and terminology must match web (separate sizing conventions apply)

### Exemptions
- Admin-only utilities (e.g. `impersonation-banner.tsx`) — documented exceptions, do not copy their patterns into product UI
- Legacy routes slated for rewrite (`/service/view`, `/user/view`, `/service-category/view`) — don't invest in conforming these; bring them in line when they're rewritten

### Dark mode
Dark-mode token definitions exist in `index.css` (the `.dark {}` block) but the app currently **forces light mode** via `color-scheme: light !important`. Do not introduce dark-only styling. The `.dark` block is reserved for a future opt-in; keep it in sync if you change light tokens but don't rely on it.

### Enforcement
- **Biome / ESLint:** reject `text-gray-*`, `bg-gray-*`, `text-zinc-*` class usage (use brand tokens instead). Reject `console.log` in committed source.
- **PR checklist:** any new page or component must confirm: (1) page anatomy followed, (2) no new hardcoded hex values, (3) icon uniqueness in sidebar preserved, (4) `tooltip` prop on every sidebar button, (5) empty-state and error-state both handled.
- **Quarterly design audit:** run `/hub-update` then audit 5 random pages against this doc.

---

## 1. Design Philosophy

Avantej Core is a **business-critical operations tool** — not a consumer app. Users are franchise staff and owners who open the dashboard every working day. Design for the 100th visit, not the first impression.

**Three guiding principles:**

1. **Clarity over decoration** — every visual element must earn its place by aiding comprehension or action.
2. **Warm precision** — the palette is monochromatic but not cold. The beige/taupe secondary tones prevent the harshness of pure black-and-white.
3. **Density with breathing room** — tables and lists are dense by necessity; use padding, dividers, and card groupings to prevent cognitive overload.

---

## 2. Color System

### 2.1 Brand Tokens

Defined in `apps/web/src/index.css` under `:root` and mapped to Tailwind via `@theme inline`.

| Token | Hex | Usage |
|---|---|---|
| `brand-primary-1` | `#000000` | Headlines, primary icons, active nav items, primary buttons |
| `brand-primary-2` | `#ffffff` | Text on dark backgrounds, button labels |
| `brand-primary-3` | `#f3f3f3` | Light backgrounds, hover surfaces |
| `brand-secondary-1` | `#8a8f91` | Subtext, labels, muted icons, sidebar group labels |
| `brand-secondary-2` | `#d9d9ca` | Avatar backgrounds, warm accent fills, scrollbar thumb |
| `brand-secondary-3` | `#edede4` | Borders, dividers, card borders, very light fills |

**Rule:** Always reach for brand tokens before Tailwind's generic palette. Never use `gray-*` or `zinc-*` — use `brand-secondary-*` equivalents.

### 2.2 Semantic Tokens (shadcn)

| Token | Purpose |
|---|---|
| `background` | Page background — `oklch(0.94 0.005 90)` (warm off-white, not pure white) |
| `card` | Card and panel surfaces — pure white |
| `foreground` | Body text |
| `muted-foreground` | Secondary body text, table header labels |
| `border` | Default borders — same value as `brand-secondary-3` |
| `primary` | Action colour = black; maps to `brand-primary-1` |
| `destructive` | Delete/error actions |
| `accent` | Hover fill on ghost elements |

### 2.3 Semantic Status Colors

Use for status indicators only — never as a substitute for the brand palette. Use the Tailwind named classes listed below. **Do not add new hardcoded hex values.**

| Status | Background | Border | Text |
|---|---|---|---|
| Success | `bg-green-50` | `border-green-200` | `text-green-700` / `text-green-800` |
| Warning | `bg-yellow-50` | `border-yellow-200` | `text-yellow-800` |
| Danger/Alert | `bg-red-50` | `border-red-200` | `text-red-700` |
| Info | `bg-blue-50` | `border-blue-100` | `text-blue-700` |
| Neutral/Pending | `bg-muted` | `border-border` | `text-muted-foreground` |

### 2.4 Contrast Reference

These are the most-used foreground/background pairings. Values below 4.5:1 fail WCAG AA for normal text.

| Foreground | Background | Ratio | WCAG AA |
|---|---|---|---|
| `#000000` (primary-1) | `#ffffff` (card) | 21:1 | ✅ |
| `#8a8f91` (secondary-1) | `#ffffff` (card) | 3.6:1 | ⚠️ use only at 14px+ bold or 18px+ regular |
| `#8a8f91` (secondary-1) | `#edede4` (secondary-3) | 3.2:1 | ⚠️ captions only, never body |
| `#000000` (primary-1) | `#edede4` (secondary-3) | 18:1 | ✅ |
| `#ffffff` (primary-2) | `#000000` (primary) | 21:1 | ✅ |

**Implication:** `brand-secondary-1` on a white background is borderline. Use it only for 10px–12px uppercase labels, captions, and icon colour — never for body paragraphs or error messages.

### 2.5 Dos and Don'ts

- **Do** use `bg-primary/5`, `bg-primary/10` for tinted selection states.
- **Don't** use arbitrary hardcoded hex values.
- **Don't** use `text-gray-*` — use `text-muted-foreground` or `text-brand-secondary-1`.
- **Don't** rely on colour alone to convey state — always pair with an icon or text label.

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Tailwind Token | When to Use |
|---|---|---|---|
| Display / Brand | Nordeco | `font-heading` | Logo, page `h1`, greeting headings, hero text |
| Subheading | Metropolis-Medium | `font-subheading` | `h2`–`h4`, section titles, card headings |
| Body | Plus Jakarta Sans | `font-sans` / `font-paragraph` | All body text, labels, table cells, form inputs |
| Code / Mono | JetBrains Mono | `font-mono` | ID strings, reference codes, audit log deltas, financial totals |

### 3.2 Type Scale & Usage

| Element | Class | Notes |
|---|---|---|
| Page greeting (h1) | `text-3xl font-bold font-heading text-brand-primary-1` | One per page max |
| Section heading (h2) | `text-xl font-semibold` or `text-lg font-semibold` | Card titles, dialog titles |
| Sidebar group label | `text-[10px] font-bold uppercase tracking-widest text-brand-secondary-1` | Exact — do not vary |
| Table header | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | Exact per DataTable |
| Body / paragraph | `text-sm text-foreground` | List items, descriptions |
| Caption / meta | `text-xs text-muted-foreground` | Timestamps, phone numbers, supporting detail |
| Status / badge | `text-xs font-medium` | Inside Badge components |
| Financial total | `font-mono tabular-nums` + appropriate size | All currency and numeric totals |

### 3.3 Rules

- `font-heading` (Nordeco) only for display/brand moments — not for tables, badges, or dense UI.
- Don't override `leading-*` unless there's a specific layout need.
- Avoid mixing font weights within the same sentence — use colour contrast (foreground vs muted-foreground) to create hierarchy.
- All monetary and numeric totals must use `tabular-nums` so columns align.

---

## 4. Spacing & Layout

### 4.1 Base Unit

Tailwind spacing: `0.25rem = 4px`. All spacing snaps to this grid.

| Value | px | Common Use |
|---|---|---|
| `1` | 4px | Icon gap, tight inline spacing |
| `2` | 8px | Within-component padding |
| `3` | 12px | Input inner padding, badge padding |
| `4` | 16px | Standard gap between items |
| `5` | 20px | Card side padding (compact) |
| `6` | 24px | Card padding (standard) |
| `8` | 32px | Section spacing |
| `14` | 56px | Avatar sizes |

### 4.2 Card & Panel Pattern

```
rounded-2xl border border-brand-secondary-3 bg-card p-6
```

Use `rounded-2xl` for standalone page-level cards. Use `rounded-xl` for cards nested within dialogs or within other cards. Never use `rounded-lg` for cards — it reads too sharp against the warmer brand aesthetic.

### 4.3 Page Layout

- Pages live inside the dashboard layout — the layout shell provides outer padding.
- Use `space-y-6` between top-level page sections.
- Use `gap-4` or `gap-6` in grid layouts.
- Tables fill the available height: `flex h-full flex-col` on the table container.
- Minimum supported browser width: **1280px**. Do not add mobile breakpoints to dashboard pages; the native app handles mobile.

### 4.4 Dialog / Sheet Sizing

| Type | When to Use |
|---|---|
| `Dialog` (modal) | Destructive confirmations, single-record create/edit forms |
| `Sheet` (side drawer) | Detail views, long-form edits, record inspection with context |
| Full-page route | Multi-step wizards (branch create, onboarding, POS) |

- Simple forms: `max-w-lg`
- Complex forms: `max-w-2xl`
- Sheets: `w-[500px]` to `w-[640px]`

---

## 5. Border Radius

| Token | Value | Use |
|---|---|---|
| `rounded` / `rounded-md` | ~8px | Inputs, selects, menu items, badges |
| `rounded-lg` | 8px | Buttons (default), tooltips |
| `rounded-xl` | 12px | Nested cards, popovers, payment method tiles, list containers |
| `rounded-2xl` | 16px | Top-level cards, banners, greeting cards |
| `rounded-full` | pill | Avatars/initials circles, toggle switches, loading spinner |

**Rule:** page-level cards = `rounded-2xl`; elements nested inside cards = `rounded-xl`.

---

## 6. Iconography

All icons from **Lucide React** only. Never introduce a second icon library.

### 6.1 Standard Sizes

| Context | Class | px |
|---|---|---|
| Sidebar nav items | `size-4` | 16 |
| Button icons | `size-4` | 16 |
| Inline text icons | `size-4` | 16 |
| Card / widget icons | `size-5` | 20 |
| Empty-state | `size-12` or `size-16` | 48–64 |
| Notification / bell | `size-6` | 24 |

### 6.2 Sidebar Icon Uniqueness

Every nav item must have a **semantically unique icon** — duplicates break scannability in collapsed mode.

| Nav Item | Current | Required |
|---|---|---|
| Class Slots | `Calendar` (duplicate) | `LayoutGrid` or `Grid3x3` |
| Membership | `Package` (duplicate) | `CreditCard` or `Layers` |
| Units of Measure | `Package` (duplicate) | `Ruler` or `Scale` |
| Stock Movement | `ShoppingCart` (duplicate) | `ArrowLeftRight` or `Truck` |
| Purchase Orders | `ShoppingCart` (duplicate) | `ClipboardList` |

### 6.3 Color

- Default: `text-muted-foreground`
- Active/selected: `text-brand-primary-1`
- Disabled / supporting: `text-brand-secondary-1`
- Coloured icons only inside status indicators — never decoratively

---

## 7. Components

### 7.1 Canonical Primitives

These shared components **must be used** — do not inline equivalent logic:

| Component | Path | What it provides |
|---|---|---|
| `PageCard` | `components/ui/page-card.tsx` | Page-level card with `rounded-2xl` + brand border + `p-6` |
| `StatusBadge` | `components/ui/status-badge.tsx` | Domain-aware badge with status-to-colour mapping |
| `StatusCallout` | `components/ui/status-callout.tsx` | Banner for success/warning/error/info callouts |
| `EmptyState` | `components/ui/empty-state.tsx` | Icon + heading + description + optional CTA |
| `BranchSelector` | `components/branch/branch-selector.tsx` | Combobox that resolves branch names — **never a raw UUID input** |

> If any of these don't exist yet, build them before the feature that needs them. See §17 for the build order.

### 7.2 When to Share vs Inline

- **Inline** when the pattern appears once or twice and is page-specific.
- **Extract to `ui/`** after the third distinct usage (three-strikes rule).
- Shared components live in `components/ui/` (generic) or `components/shared/` (domain-specific but cross-page).
- Per-feature logic stays local to that feature's folder.

### 7.3 Buttons

| Variant | When to Use |
|---|---|
| `default` (black fill) | Primary CTA — one per screen region |
| `outline` | Secondary actions, cancel |
| `ghost` | Icon-only actions, table row actions |
| `destructive` | Delete / irreversible actions — always with a confirm dialog |
| `link` | In-text navigation only |

**Sizes:**
- `default` (h-9) — toolbar and dialog buttons
- `sm` (h-8) — table row actions, inline controls
- `lg` (h-10) — primary CTA in forms and landing
- `icon` (36×36) — solo icon buttons

Don't stack two `default` buttons side-by-side. The primary action must always stand out.

Mutation pending state:
```tsx
<Button disabled={mutation.isPending}>
  {mutation.isPending ? "Saving…" : "Save"}
</Button>
```

### 7.4 Badges

`rounded-md` (not pill). Extend via `className` rather than new CVA variants:

```tsx
// Good
<Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">
  Approved
</Badge>

// Bad — raw span, not Badge
<span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">Approved</span>
```

Use `StatusBadge` (see §7.1) for all domain-entity statuses so the mapping stays consistent.

### 7.5 Forms

- Wrap each field: `<div className="space-y-1.5">` (label + input + error/hint)
- Always use `<Label>` (shadcn) — never a raw `<p>` tag
- Error: `text-destructive text-xs` below the input
- Hint: `text-muted-foreground text-xs` below the input
- Group related fields: `<div className="space-y-4">` or `<div className="grid grid-cols-2 gap-4">`
- Input width: `max-w-xs` to `max-w-sm` in panels; full-width in page-level forms
- Form library: `react-hook-form` + Zod validation; use the shadcn `<Form>` wrapper consistently

### 7.6 Tables

Reference implementation: `components/tables/sales/view/data-table.tsx`

```
Container:     flex h-full flex-col
Search bar:    flex shrink-0 items-center border-b border-border/40 px-6 py-3
Table body:    flex-1 overflow-y-auto
Header row:    sticky top-0 z-10 bg-white
Col headers:   text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3
Data cells:    text-sm px-6 py-4 whitespace-nowrap
Hover:         hover:bg-muted/30
```

### 7.7 Empty States

Every data surface must handle zero rows with a designed empty state — never just text.

```
[Icon — size-12, text-muted-foreground]
[Heading — text-sm font-medium text-foreground]
[Description — text-xs text-muted-foreground, optional]
[CTA Button — optional, variant="default" or "outline"]
```

Vertically centred in the table body or content area. Use `EmptyState` component (§7.1).

Distinguish zero-rows from API errors:

| Scenario | Treatment |
|---|---|
| No records yet | EmptyState with a CTA to create the first |
| Search returned nothing | EmptyState with "try different search terms" — no CTA |
| API error | `StatusCallout` variant="error" with a retry button |

### 7.8 Loading States

Skeleton components that mirror real content shape — not generic spinners. Reference: `CustomerStep` in `components/pos/customer-step.tsx`.

- Full-page route transition: `Loader` component
- Inline / partial refetch: small spinner inside the affected zone (not a full overlay)
- Never show a blank area while loading

---

## 8. Navigation & Sidebar

### 8.1 Group Order

Flow from highest daily frequency to lowest:

**Overview → Customers → Scheduling → Services → Sales → Inventory → Finance → Staff → Access & Comms → Organisation → Settings**

### 8.2 Active State

Use the `isActive` prop on `SidebarMenuButton`. Never manually apply active styles.

### 8.3 Group Labels

Exact class string — do not vary:
```
font-bold text-[10px] text-brand-secondary-1 uppercase tracking-widest
```

### 8.4 Collapsed State

All text/labels/search are hidden via `group-data-[collapsible=icon]:hidden`. Every nav item **must** have a `tooltip` prop — this is the only label available in collapsed mode.

---

## 9. Motion

Keep transitions subtle and purposeful. Never animate for decoration.

| Surface | Duration | Easing |
|---|---|---|
| Hover fills (buttons, rows) | 150ms | `ease-out` |
| Dialog open/close | 200ms | `ease-out` / `ease-in` |
| Sheet slide in/out | 300ms | `ease-out` / `ease-in` |
| Accordion / collapsible | 200ms | `ease-out` |
| Skeleton pulse | Tailwind default `animate-pulse` | — |

Use Tailwind's `transition-colors`, `transition-all` classes. Avoid custom `@keyframes` unless the base library doesn't support the motion needed.

---

## 10. Feedback Patterns

### 10.1 Toast Notifications

`import { toast } from "sonner"`. Position: bottom-right. Never use `alert()` or `window.confirm()`.

| Type | When |
|---|---|
| `toast.success()` | Successful mutation |
| `toast.error()` | Failed mutation |
| `toast.loading()` + `toast.dismiss()` | Long async ops |
| `toast.info()` | Neutral informational update |

Priority: errors persist until dismissed; success auto-dismisses after 3s.

### 10.2 Destructive Confirmations

Always use a `Dialog` with a `variant="destructive"` confirm button. Cancel on the left, confirm on the right. The dialog heading should name the entity being deleted, e.g. "Delete service 'Basic PT'" not "Are you sure?".

---

## 11. Keyboard & Power-User Patterns

Front-desk staff use POS and attendance dozens of times per day. Keyboard fluency is required in these surfaces.

| Action | Expected key |
|---|---|
| Submit form | `Enter` (last field) or dedicated Submit button |
| Close dialog / sheet | `Esc` |
| Focus search input | `/` (where a global search exists) |
| Navigate table rows | `↑` / `↓` (nice-to-have for future; don't block it) |

**POS-specific:**
- `Tab` order in POS: Customer → Items → Payment method → Reference/Tendered → Confirm
- Numeric inputs (tendered amount, quantity) should auto-select on focus for quick re-entry
- The "Confirm sale" button must never be reachable by `Tab` before all required fields are valid

**Focus management:**
- When a `Dialog` opens, focus must move to the first interactive element inside it
- When a `Dialog` closes, focus must return to the element that opened it
- Use shadcn's built-in `Dialog` which handles this via Radix — don't replace it with a custom modal

---

## 12. Data Display Conventions

### 12.1 Currency

Always `formatPrice(amountCents, "MYR")`. Never raw cents, never `$`. Store as integer cents; divide by 100 before display. Always `tabular-nums font-mono` on financial totals.

### 12.2 Dates

`en-MY` locale. Table columns with date+time: `DD MMM YYYY, HH:mm`. Relative time (e.g. "2 hours ago") only for notification feeds — never for financial records.

### 12.3 IDs / References

`font-mono` and `CopyableCell` component where copying is useful.

### 12.4 Member vs Walk-in Visual Distinction

These are legally and financially distinct entities. They must read differently at a glance across all surfaces:

| Attribute | Member | Walk-in |
|---|---|---|
| Badge variant | `default` (black fill) | `secondary` (gray) |
| Avatar bg | `bg-primary` (black) | `bg-brand-secondary-2` (warm beige) |
| Avatar text | `text-primary-foreground` (white) | `text-brand-primary-1` (black) |
| Search result label | "Member" | "Walk-in" |

### 12.5 Status Badge Mapping

Use `StatusBadge` (§7.1) with these canonical mappings:

| Value | Badge variant | Classes |
|---|---|---|
| `pending` | `outline` | default |
| `approved` / `active` | `outline` | `border-green-300 bg-green-50 text-green-700` |
| `rejected` / `cancelled` | `destructive` | default |
| `paid` / `completed` | `outline` | `border-blue-200 bg-blue-50 text-blue-700` |
| `frozen` | `outline` | `border-yellow-300 bg-yellow-50 text-yellow-800` |
| `expired` | `secondary` | default |

### 12.6 Time-Sensitive Signals

Operational urgency should be visually distinct — use `StatusCallout` variant `warning`:

- Class slot starting in ≤ 15 min
- Membership expiring within 7 days (also highlight the row in the memberships table)
- Pending refund/commission approvals older than 48 hours
- Stock below reorder threshold

---

## 13. Page Anatomy

Every dashboard page follows this shell. Deviation requires a documented reason.

```
┌─ Page root ────────────────────────────────────────────┐
│  Page header (flex items-center justify-between)       │
│  ├─ Left: page title (text-2xl font-semibold)          │
│  │        breadcrumb (text-sm muted) above title       │
│  └─ Right: primary CTA button(s)                       │
│                                                        │
│  [Optional] Filter/tab bar                             │
│  ├─ Tabs (shadcn Tabs) or filter pills                 │
│  └─ Secondary filters (date-range, branch selector)    │
│                                                        │
│  Content area (flex-1, overflow hidden)                │
│  ├─ Table / grid / calendar                            │
│  ├─ Empty state (if no data)                           │
│  └─ Error callout (if API failed)                      │
│                                                        │
│  [Table only] Pagination bar (sticky bottom)           │
└────────────────────────────────────────────────────────┘
```

**Page header rules:**
- Title: `text-2xl font-semibold` — not `font-heading` (Nordeco), which is reserved for h1 greeting only
- CTA alignment: primary button right-aligned, always `variant="default"`, labelled with an action verb ("New Sale", "Invite Staff", "Add Product")
- Don't put more than two buttons in the header — move lower-priority actions into a dropdown

---

## 14. Domain Moments

Named workflows that recur across the system. New pages implementing these must follow these patterns.

### 14.1 POS Sale

Flow: Customer → Items → Payment → Confirm

- Step progress: shown as a numbered stepper or tab strip at the top
- Each step is gated — "Next" is disabled until the step is valid
- Customer step: member shown with black avatar, walk-in with beige avatar (§12.4)
- Payment step: method tiles use `border-2 rounded-xl` with check-mark on selected; total in `font-mono tabular-nums text-2xl`; change-due block uses `StatusCallout` variant `success`
- Confirm/submit button: `size="lg"`, full-width at bottom of the final step, disabled until all steps are valid and mutation is not pending

### 14.2 Refund Request

- Initiated from Sales Detail or Refunds Ledger
- Use `Dialog` for the refund amount input + reason — not a full page
- Amount field: pre-filled with original amount, editable downward only
- Confirm: `variant="destructive"` — refunds are irreversible at the DB level
- On success: toast.success + invalidate the refund and payment queries

### 14.3 Commission Approval

- Bulk-select rows → "Approve selected" button → confirm Dialog listing count + total amount
- Individual approve: ghost button → immediate mutation with optimistic update
- Status pill in table: pending (outline) → approved (green) → paid (blue)
- Amount column: `font-mono tabular-nums`, right-aligned

### 14.4 Class Attendance / Check-in

- Today's bookings list is the primary view — sorted by start time ascending
- Each row: member name, service, time, trainer, check-in button
- Check-in button: `variant="outline"` → changes to muted/disabled after check-in, status pill shows "Checked In"
- Drop-in (walk-in): separate "Drop-in" button that opens the `BranchSelector` + customer search in a Sheet
- Anti-duplicate window (30 min) must surface a clear warning, not a silent failure

### 14.5 Member Freeze / Suspension

- Triggered from member detail — use a `Sheet` (not a Dialog) because the operator needs context
- Clearly state the effect: "This member will lose access to all bookings from [date]"
- Resume date picker required for freeze; permanent suspension requires separate "Deactivate" path
- Status badge on member row switches from green to `frozen` (yellow per §12.5)

---

## 15. Accessibility

- Every interactive element: `aria-label` or visible text
- Icon-only buttons: `aria-label` required
- Form inputs: `<Label>` with matching `htmlFor` / `id`
- Sidebar collapsed: `tooltip` prop required on every `SidebarMenuButton`
- Don't rely on colour alone — pair with icon or text label
- Focus rings: shadcn defaults (`ring-ring/50`, 3px) — never remove
- Dialog / Sheet: focus must enter on open, return to trigger on close (handled by Radix; don't replace with custom modals)
- Contrast: see §2.4 — `brand-secondary-1` on white is borderline; restrict to captions and 10px+ uppercase labels

---

## 16. Pattern Library Index

Reference implementations — grep or read these before building something similar:

| Pattern | File |
|---|---|
| Page-level card | `components/dashboard/greeting-banner.tsx` |
| DataTable with search + pagination | `components/tables/sales/view/data-table.tsx` |
| Payment method tile (selection card) | `components/pos/payment-step.tsx` |
| Customer search with skeleton loading | `components/pos/customer-step.tsx` |
| Status callout (Change Due) | `components/pos/payment-step.tsx` — green block |
| Sidebar structure + group labels | `components/app-sidebar.tsx` |
| Mutation pending state | any file using `useMutation` + `disabled={mutation.isPending}` |
| Destructive action banner (exception pattern) | `components/impersonation-banner.tsx` — do not copy colours |

---

## 17. Known Issues — Ranked Refactoring Backlog

### Critical — blocks users or causes real workflow friction

| Issue | Location | Fix |
|---|---|---|
| Raw UUID inputs for branch selection | Walk-in customers, purchase orders, class slots | Build `BranchSelector` combobox (§7.1); replace all UUID text inputs |
| "View" button is a `console.log` stub | Sales view | Wire to `router.navigate({ to: "/dashboard/sales/$id", params: { id } })` or remove |

### High — inconsistency visible to daily users

| Issue | Location | Fix |
|---|---|---|
| Member vs walk-in avatar colours inconsistent | `SidebarUserFooter`, `CustomerStep`, `customer-step.tsx` | Standardise per §12.4 |
| Duplicate sidebar icons | Multiple nav items | Apply §6.2 icon replacements |
| Status colours inlined across pages | Many tables | Extract to `StatusBadge` component (§7.1) |
| Empty states are plain text | Most data tables | Replace with `EmptyState` component per §7.7 |
| Error states missing entirely | Most data tables | Add `StatusCallout` for API errors per §7.7 |

### Drift risk — cosmetic but will compound without a rule

| Issue | Location | Fix |
|---|---|---|
| `rounded-xl` vs `rounded-2xl` mixed for same-level cards | Widespread | Apply §5 radius rule; enforce in PR checklist |
| `StatusCallout` (change-due) inlined in `payment-step.tsx` | POS | Extract to shared `StatusCallout` component |
| `.dark` theme tokens maintained but unused | `index.css` | Keep in sync with light tokens; add comment warning against dark-only styling |
| `expenses.currency` defaults to `"usd"` but UI shows MYR | Expenses table | Fix currency column default at DB schema level |

# Avantej Core — Design Guidelines

> Version 1.0 · April 2026
>
> This is a living document. Update it when design decisions change.

---

## 1. Design Philosophy

Avantej Core is a **business-critical operations tool** — not a consumer app. The design should feel professional, calm, and efficient. Users are franchise staff and owners who open the dashboard every working day. Design for the 100th visit, not the first impression.

**Three guiding principles:**

1. **Clarity over decoration** — every visual element must earn its place by aiding comprehension or action.
2. **Warm precision** — the palette is monochromatic but not cold. The beige/taupe secondary tones prevent the harshness of pure black-and-white.
3. **Density with breathing room** — tables and lists are dense by necessity; use padding, dividers, and card groupings to prevent cognitive overload.

---

## 2. Color System

### 2.1 Brand Tokens

These are defined in `apps/web/src/index.css` under `:root` and mapped to Tailwind via `@theme inline`.

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
| `primary` | Action color = black; maps to `brand-primary-1` |
| `destructive` | Delete/error actions |
| `accent` | Hover fill on ghost elements |

### 2.3 Semantic Status Colors

These should be used for status indicators only — never as a substitute for the brand palette. Use the Tailwind named classes listed below. **Do not add new hardcoded hex values.**

| Status | Background | Border | Text |
|---|---|---|---|
| Success | `bg-green-50` | `border-green-200` | `text-green-700` / `text-green-800` |
| Warning | `bg-yellow-50` | `border-yellow-200` | `text-yellow-800` |
| Danger/Alert | `bg-red-50` | `border-red-200` | `text-red-700` |
| Info | `bg-blue-50` | `border-blue-100` | `text-blue-700` |
| Neutral/Pending | `bg-muted` | `border-border` | `text-muted-foreground` |

**Example** — the POS "Change Due" block correctly uses `bg-green-50 border-green-200 text-green-700`. Follow this pattern for all status callouts.

### 2.4 Dos and Don'ts

- **Do** use `bg-primary/5`, `bg-primary/10` for tinted selection states.
- **Don't** use arbitrary hardcoded colors like `bg-yellow-400` in production UI (the impersonation banner is an admin utility and is an exception).
- **Don't** use `text-gray-*` — use `text-muted-foreground` or `text-brand-secondary-1`.

---

## 3. Typography

### 3.1 Font Stack

| Role | Font | Tailwind Token | When to Use |
|---|---|---|---|
| Display / Brand | Nordeco | `font-heading` | Logo, page `h1`, greeting headings, hero text |
| Subheading | Metropolis-Medium | `font-subheading` | `h2`–`h4`, section titles, card headings |
| Body | Plus Jakarta Sans | `font-sans` / `font-paragraph` | All body text, labels, table cells, form inputs |
| Code / Mono | JetBrains Mono | `font-mono` | ID strings, reference codes, audit log deltas |

### 3.2 Type Scale & Usage

| Element | Class | Notes |
|---|---|---|
| Page greeting (h1) | `text-3xl font-bold font-heading text-brand-primary-1` | Only one per page |
| Section heading (h2) | `text-xl font-semibold` or `text-lg font-semibold` | Card titles, dialog titles |
| Sidebar group label | `text-[10px] font-bold uppercase tracking-widest text-brand-secondary-1` | Exact pattern; don't vary |
| Table header | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | Exact pattern per DataTable |
| Body / paragraph | `text-sm text-foreground` | Default for list items, descriptions |
| Caption / meta | `text-xs text-muted-foreground` | Timestamps, phone numbers, supporting detail |
| Status / badge | `text-xs font-medium` | Inside Badge components |

### 3.3 Rules

- Keep headings in `font-heading` (Nordeco) **only** for display/brand moments. Using it in tables or dense UI reads as heavy.
- Line heights are controlled by Tailwind defaults — don't override `leading-*` unless there's a specific layout need (e.g., the two-line logo stack uses `leading-none`).
- Avoid mixing font weights within the same sentence. Use semantic colour contrast (foreground vs muted-foreground) to create hierarchy instead.

---

## 4. Spacing & Layout

### 4.1 Base Unit

Tailwind spacing uses `0.25rem = 4px` as the base unit. All spacing decisions should snap to this grid. Common values:

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

The canonical card uses:
```
rounded-2xl border border-brand-secondary-3 bg-card p-6
```

Use `rounded-2xl` for standalone cards at the page level. Use `rounded-xl` for cards nested within cards or within dialogs. Never use `rounded-lg` for cards — it reads too sharp against the warmer brand aesthetic.

### 4.3 Page Layout

- Pages live inside the dashboard layout with the collapsible sidebar.
- The main content area gets its padding from the layout shell — don't add `p-8` to every page root.
- Use `space-y-6` between top-level page sections.
- Use `gap-4` or `gap-6` in grid layouts (e.g., KPI stat cards).
- Tables should fill the available height: use `flex h-full flex-col` on the table container.

### 4.4 Dialog / Sheet Sizing

| Type | When to Use |
|---|---|
| `Dialog` (modal) | Destructive confirmations, single-record create/edit forms |
| `Sheet` (side drawer) | Detail views, long-form edits, record inspection |
| Full-page route | Multi-step wizards (branch create, onboarding, POS) |

Dialogs should not be wider than `max-w-lg` for simple forms, `max-w-2xl` for complex forms. Sheets should be `w-[500px]` to `w-[640px]`.

---

## 5. Border Radius

The project has one `--radius` base value (`0.5rem`) and derives the scale from it.

| Token | Value | Use |
|---|---|---|
| `rounded` / `rounded-md` | ~8px | Inputs, selects, menu items, badges |
| `rounded-lg` | 8px | Buttons (default), tooltips |
| `rounded-xl` | 12px | Nested cards, popovers, payment method tiles, list containers |
| `rounded-2xl` | 16px | Top-level cards, banners, greeting cards |
| `rounded-full` | pill | Avatars/initials circles, toggle switches, spinner |

**Inconsistency to fix:** The codebase currently mixes `rounded-xl` and `rounded-2xl` for cards at the same level. Standardise: **page-level cards = `rounded-2xl`**, **inline/nested elements = `rounded-xl`**.

---

## 6. Iconography

All icons come from **Lucide React**. Never introduce a second icon library.

### 6.1 Standard Sizes

| Context | Class | px |
|---|---|---|
| Sidebar nav items | `size-4` | 16 |
| Button icons | `size-4` | 16 |
| Inline text icons | `size-4` | 16 |
| Card / widget icons | `size-5` | 20 |
| Empty-state illustrations | `size-12` or `size-16` | 48–64 |
| Notification / bell | `size-6` | 24 |

### 6.2 Icon–Label Consistency

The sidebar currently reuses the same icon for semantically different items (e.g., `Calendar` for both "Appointments" and "Class Slots"; `Package` for "Products", "Membership", and "Units of Measure"). This reduces scannability.

**Rule:** Every distinct section in the sidebar must have a unique, semantically appropriate icon. Suggested fixes:

| Item | Current | Suggested |
|---|---|---|
| Class Slots | `Calendar` | `LayoutGrid` or `Grid3x3` |
| Membership | `Package` | `CreditCard` or `Layers` |
| Units of Measure | `Package` | `Ruler` or `Scale` |
| Stock Movement | `ShoppingCart` | `ArrowLeftRight` or `Truck` |
| Purchase Orders | `ShoppingCart` | `ClipboardList` |

### 6.3 Color

- Default: inherit from parent text colour or use `text-muted-foreground`
- Active/selected: `text-brand-primary-1` (black)
- Disabled / supporting: `text-brand-secondary-1` (gray)
- Never use coloured icons outside of status indicators

---

## 7. Components

### 7.1 Buttons

| Variant | When to Use |
|---|---|
| `default` (black fill) | Primary CTA — one per region of the screen |
| `outline` | Secondary actions, cancel actions |
| `ghost` | Icon-only actions, table row actions |
| `destructive` | Delete / irreversible actions (always pair with a confirm dialog) |
| `link` | In-text navigation only |

**Size guidance:**
- `default` (h-9) — standard for toolbar and dialog buttons
- `sm` (h-8) — table row actions, inline controls
- `lg` (h-10) — primary CTA in forms and landing sections
- `icon` (36×36) — solo icon buttons

**Don't** stack two `default` buttons next to each other. The primary action should always stand out.

### 7.2 Badges

Badges are `rounded-md` (not pill). Four variants exist (`default`, `secondary`, `destructive`, `outline`). For domain status values, extend with custom `className` rather than adding new CVA variants:

```tsx
// Good — compose over the base
<Badge variant="outline" className="border-green-300 bg-green-50 text-green-700">
  Approved
</Badge>

// Avoid — hardcoding without Badge wrapper
<span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">Approved</span>
```

### 7.3 Forms

- Always wrap fields in `<div className="space-y-1.5">` (label + input + error)
- Use `<Label>` from shadcn above every input — never a raw `<p>` tag
- Error messages: `text-destructive text-xs` below the input
- Helper/hint text: `text-muted-foreground text-xs` below the input
- Group related fields in `<div className="space-y-4">` or `<div className="grid grid-cols-2 gap-4">`
- Max input width in a panel context: `max-w-xs` to `max-w-sm`; let inputs expand in full-width form layouts

### 7.4 Tables

Follow the pattern established in `apps/web/src/components/tables/sales/view/data-table.tsx`:

- Container: `flex h-full flex-col`
- Search bar: `flex shrink-0 items-center border-b border-border/40 px-6 py-3`
- Table body: `flex-1 overflow-y-auto`
- Header row: `sticky top-0 z-10 bg-white`
- Column headers: `text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3`
- Data cells: `text-sm px-6 py-4 whitespace-nowrap`
- Empty state: `py-16 text-center text-sm text-muted-foreground`
- Hover: `hover:bg-muted/30`

### 7.5 Empty States

Every data surface that can return zero rows must have a designed empty state — not just "No results found."

Pattern:
```
[Icon — size-12, text-muted-foreground]
[Heading — text-sm font-medium text-foreground]
[Description — text-xs text-muted-foreground]
[Optional primary CTA button]
```

Place the empty state vertically centred in the table body or content area.

### 7.6 Loading States

Use `Skeleton` components that match the shape of the real content, not generic spinners. The POS `CustomerStep` demonstrates the correct pattern — skeleton rows that mirror real list items.

For full-page loading (route transition), use the `Loader` component. For inline/partial refetches, use a subtle spinner inside the relevant zone (not a full overlay).

---

## 8. Navigation & Sidebar

### 8.1 Group Order Principle

Sidebar groups should flow from most-used daily actions to administrative/settings tasks:

**Ideal order:** Overview → Customers → Scheduling → Services → Sales → Inventory → Finance → Staff → Access & Comms → Organisation → Settings

### 8.2 Active State

Active items use the `isActive` prop on `SidebarMenuButton` which applies the sidebar's accent colour. Do not manually apply active styles — always use the component prop.

### 8.3 Group Labels

Exact class string — do not deviate:
```
font-bold text-[10px] text-brand-secondary-1 uppercase tracking-widest
```

### 8.4 Collapsed State

In collapsed (icon-only) state, all text, group labels, and the search bar are hidden via `group-data-[collapsible=icon]:hidden`. Icon-only buttons get `tooltip` prop for accessibility. Every nav item **must** supply a `tooltip` prop.

---

## 9. Feedback Patterns

### 9.1 Toast Notifications

Use `sonner` (`import { toast } from "sonner"`). Four types:

| Type | When |
|---|---|
| `toast.success()` | Successful mutation |
| `toast.error()` | Failed mutation |
| `toast.loading()` / `toast.dismiss()` | Long async ops (file uploads, slow API) |
| `toast.info()` | Neutral informational update |

Never use `alert()` or `window.confirm()` — use shadcn `Dialog` for confirmations.

### 9.2 Mutation State

Disable the submit button while a mutation is pending:
```tsx
<Button disabled={mutation.isPending}>
  {mutation.isPending ? "Saving…" : "Save"}
</Button>
```

### 9.3 Destructive Confirmations

Deleting or irreversibly changing data must always go through a `Dialog` with a clear warning and an explicit confirmation button styled `variant="destructive"`. The cancel button should be first (left), destructive action second (right).

---

## 10. Data Display Conventions

### 10.1 Currency

Always display with `formatPrice(amountCents, "MYR")`. Never show raw cents or use `$`. Amounts are stored in integer cents — always divide by 100 before display.

### 10.2 Dates

Use `en-MY` locale (Malaysia). Use `toLocaleDateString` and `toLocaleTimeString` where a human-readable format is needed. For table columns showing both date and time, prefer a compact format: `DD MMM YYYY, HH:mm`.

### 10.3 IDs / References

UUIDs and reference codes belong in `font-mono` and should use `CopyableCell` where copying is useful.

### 10.4 Status Badges

Create a consistent badge mapping per domain entity. Pending should always be neutral/outline, approved/active should be positive (green-tinted), rejected/cancelled should be destructive. Example:

| Value | Badge |
|---|---|
| `pending` | `outline` |
| `approved` / `active` | `outline` + green classes |
| `rejected` / `cancelled` | `destructive` |
| `paid` / `completed` | `outline` + blue classes |

---

## 11. Accessibility

- Every interactive element must have an accessible label (`aria-label` or visible text).
- Icon-only buttons must have `aria-label`.
- Form inputs must have associated `<Label>` via `htmlFor` / `id`.
- Sidebar nav items in collapsed state must have `tooltip` prop.
- Don't rely on colour alone to convey meaning — pair colour with an icon or text.
- Focus rings are inherited from shadcn defaults (`ring-ring/50`, 3px). Never remove them.

---

## 12. Known Inconsistencies to Resolve

These are live issues in the codebase, collected as a refactoring backlog:

| Issue | Location | Fix |
|---|---|---|
| Avatar background inconsistency | `SidebarUserFooter` uses `brand-secondary-2`; `CustomerStep` uses `primary` (black) | Standardise: use `brand-secondary-2` bg with `brand-primary-1` text for light, `primary` bg for selected/active context |
| Hardcoded `bg-yellow-400` | `impersonation-banner.tsx` | Accept as admin-utility exception; document it so reviewers don't copy the pattern |
| `rounded-xl` vs `rounded-2xl` | Mixed across cards | Page-level cards = `rounded-2xl`; nested = `rounded-xl` |
| Duplicate sidebar icons | Multiple nav items share `Calendar`, `Package`, `ShoppingCart` | See §6.2 for replacements |
| Inline `border-green-*` status colours | `payment-step.tsx` | Good pattern — should be extracted into a shared `StatusCallout` component |
| Raw UUID inputs | Walk-in customers, purchase orders, class slots branch fields | Replace with branch selector comboboxes |
| `console.log` stubs for "View" buttons | Sales view | Replace with navigation or remove |

# Avantej Core — Dashboard Style Test

> Snapshot of the actual UI conventions in `apps/web/src/routes/_authenticated/dashboard/` as of April 28, 2026.

## 1. Design Tokens

### Colors

| Token | Hex | Light Mode | Dark Mode | Used for |
|-------|-----|-----------|-----------|----------|
| `--color-primary-1` | #000000 / #FFFFFF | Black | White | Primary text, headings, active states |
| `--color-primary-2` | #FFFFFF / #000000 | White | Black | Primary-foreground (usually inverted) |
| `--color-primary-3` | #f3f3f3 / #333333 | Light gray | Dark gray | Tertiary backgrounds |
| `--color-secondary-1` | #8a8f91 | Gray-blue (light mode) | Gray-blue (dark mode) | Muted text, secondary info |
| `--color-secondary-2` | #d9d9ca | Warm beige | Warm beige | Scrollbar, accent border |
| `--color-secondary-3` | #edede4 | Cream | Cream | Border color, light dividers |
| `--color-background` | #FFFFFF / #000000 | White | Black | Page background |
| `--color-text` | #000000 / #FFFFFF | Black | White | Primary text |
| `--color-text-secondary` | #666666 / #CCCCCC | Medium gray | Light gray | Secondary text |
| `--color-accent` | #edede4 / #333333 | Cream | Dark gray | Hover states, accents |
| `--color-success` | #4CAF50 | Green | Green | Success status badges |
| `--color-warning` | #FFC107 | Amber | Amber | Warning status badges |
| `--color-error` | #F44336 | Red | Red | Destructive/error actions |
| `--color-info` | #2196F3 | Blue | Blue | Info status badges |
| `--color-destructive` | oklch(0.63 0.19 23.03) | Red | Orange-red | Destructive buttons, error rings |
| `--color-border` | oklch(0.94 0.005 90) | Light gray | Dark gray | Border color (border-border class) |
| `--color-input` | oklch(0.94 0 0) / oklch(0.32 0 0) | White / Dark gray | Dark gray | Input backgrounds |
| `--color-ring` | oklch(0 0 0) / oklch(0.72 0 0) | Black | Light gray | Focus ring color |

**Source:** `apps/web/src/index.css:44–94` (light mode) and `125–170` (dark mode)

#### Chart Colors
- `--color-chart-1`: oklch(0.81 0.17 75.35) — Warm yellow
- `--color-chart-2`: oklch(0.55 0.22 264.53) — Violet
- `--color-chart-3/4/5`: Grayscale variations

#### Sidebar Colors
- `--color-sidebar`: oklch(1 0 0) light / oklch(0.18 0 0) dark — Sidebar background
- `--color-sidebar-foreground`: oklch(0 0 0) light / oklch(1 0 0) dark — Sidebar text
- `--color-sidebar-primary`: oklch(0 0 0) light / oklch(1 0 0) dark — Active sidebar link
- `--color-sidebar-accent`: oklch(0.94 0.005 90) light / oklch(0.32 0 0) dark — Hover state in sidebar

### Typography

| Family | CSS Variable | Purpose | Source |
|--------|--------------|---------|--------|
| **Nordeco** | `--font-heading` | Page titles (h1), large headings | `apps/web/src/index.css:16–22` (loaded from `/fonts/Fontspring-DEMO-nordeco-bold.otf`) |
| **Metropolis-Medium** | `--font-subheading` | Section headers (h2, h3, h4) | `apps/web/src/index.css:24–29` |
| **Plus Jakarta Sans** | `--font-paragraph`, `--font-sans` | Body text, UI labels | `apps/web/src/index.css:31–36` |
| **JetBrains Mono** | `--font-mono` | Code, monospace text | `apps/web/src/index.css:100` |

**Weight:** Body text = 400 (normal); Headings = 700 (bold); Subheadings = 500 (medium)

**Heading Scale Used in Dashboard:**
- `text-4xl` (font-heading, 36px) — KPI card numbers (e.g., sales, appointment counts)
- `text-3xl` (font-heading) — Major titles
- `text-2xl` (font-heading) — Page titles
- `text-xl` — Large section headers
- `text-lg` — Medium section headers
- `text-base` — Default body text
- `text-sm` — Secondary labels, descriptions
- `text-xs` — Badges, small labels, uppercase headers

**Source:** `apps/web/src/index.css:302–323` (h1–h6 styles); actual heading usage in `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx:89`, `131`, `34`

### Spacing & Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | 0.5rem (8px) | Default border radius for components |
| `--radius-sm` | calc(0.5rem - 4px) = 4px | Smaller components (badges, small buttons) |
| `--radius-md` | calc(0.5rem - 2px) = 6px | Medium components |
| `--radius-lg` | 0.5rem = 8px | Standard cards, dialogs |
| `--radius-xl` | calc(0.5rem + 4px) = 12px | Large cards, modals |
| `--spacing` | 0.25rem (4px) | Base spacing unit (rarely used directly; Tailwind handles spacing) |

**Common Tailwind Classes:**
- Cards: `rounded-2xl` (16px border-radius) — `apps/web/src/components/ui/card.tsx:10`
- Buttons: `rounded-md` (8px) — `apps/web/src/components/ui/button.tsx:8`
- Inputs: `rounded-md` (8px) — `apps/web/src/components/ui/input.tsx:11`
- Dialogs: `rounded-2xl` (16px) — `apps/web/src/components/ui/dialog.tsx:39`
- Badges: `rounded-md` (8px) — `apps/web/src/components/ui/badge.tsx:8`

**Shadow Scale:**
- `shadow-2xs`: 0px 1px 2px hsl(0 0% 0% / 0.09)
- `shadow-xs`: 0px 1px 2px hsl(0 0% 0% / 0.09)
- `shadow-sm`: Multi-layer (2 shadows)
- `shadow-md`: Larger spread
- `shadow-lg`: 0px 4px 6px
- `shadow-xl`: 0px 8px 10px
- `shadow-2xl`: 0px 1px 2px hsl(0 0% 0% / 0.45)

**Source:** `apps/web/src/index.css:62`, `200–204`, `109–121`

---

## 2. Layout & Shell

### Dashboard Layout Structure
- **Sidebar width:** `16rem` (256px) when expanded — `apps/web/src/components/ui/sidebar.tsx:28`
- **Sidebar width (mobile):** `18rem` (288px) — `apps/web/src/components/ui/sidebar.tsx:29`
- **Sidebar icon-only width:** `3rem` (48px) when collapsed — `apps/web/src/components/ui/sidebar.tsx:30`
- **Sidebar toggling:** Controlled by context; expanded/collapsed state saved to cookie
- **Main content area:** Full width minus sidebar; no explicit max-width constraint observed
- **Top navigation:** Breadcrumb bar with user avatar/dropdown in `apps/web/src/components/app-topbar.tsx`
- **Page padding:** Content wrapped in custom layouts per page; typical padding `px-6` or `px-5` on table rows

**Source:** `apps/web/src/components/ui/sidebar.tsx:26–31`; `app-topbar.tsx`; card padding `apps/web/src/components/ui/card.tsx:10–11` (6 padding units)

### Sidebar Active Link Styling
- Active sidebar item: `bg-sidebar-accent` with `text-sidebar-primary-foreground` (inverted in dark mode)
- Hover state: `hover:bg-sidebar-accent`
- Collapsed icon-only mode preserves visual hierarchy via tooltip on hover

---

## 3. Components

### Buttons

| Variant | Class | Appearance | When to use |
|---------|-------|-----------|-------------|
| **default** | `bg-primary text-primary-foreground shadow-xs hover:bg-primary/90` | Black bg, white text, subtle shadow | Primary actions, form submission |
| **secondary** | `bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80` | Gray bg, dark text | Secondary actions |
| **destructive** | `bg-destructive text-white shadow-xs hover:bg-destructive/90` | Red bg, white text | Delete, cancel, high-risk actions |
| **outline** | `border bg-background shadow-xs hover:bg-accent` | Transparent with border, hover accent | Tertiary actions, alternatives |
| **ghost** | `hover:bg-accent hover:text-accent-foreground` | Transparent, no shadow | Minimal actions, navigation |
| **link** | `text-primary underline-offset-4 hover:underline` | Text link style | Navigation, inline actions |

**Sizes:**
- `size="default"`: h-9 px-4 py-2
- `size="sm"`: h-8 px-3 rounded-md
- `size="lg"`: h-10 px-6 rounded-md
- `size="icon"`: size-9 (square icon button)

**Focus ring:** `focus-visible:ring-ring/50 focus-visible:ring-[3px]` (3px ring with 50% opacity)
**Disabled state:** `disabled:opacity-50 disabled:pointer-events-none`

**Source:** `apps/web/src/components/ui/button.tsx:7–36`; used in `apps/web/src/components/tables/shared/entity-data-table.tsx:42–49`

### Cards

**Base card styling:**
```
bg-card text-card-foreground flex flex-col gap-6 rounded-2xl border border-brand-secondary-3 py-6 shadow-none
```

**Subcomponents:**
- `CardHeader`: `@container/card-header grid gap-1.5 px-6` (with container queries)
- `CardTitle`: `leading-none font-semibold`
- `CardDescription`: `text-muted-foreground text-sm`
- `CardContent`: `px-6`
- `CardFooter`: `flex items-center px-6`
- `CardAction`: Column 2, row 1–2 of header grid (right-aligned action buttons)

**Spacing:** 6 units (1.5rem) gap between header/content/footer; 6 units padding on all sides
**Border:** 1px solid `border-brand-secondary-3` (cream #edede4)
**Shadow:** None; relies on border and spacing for depth

**Source:** `apps/web/src/components/ui/card.tsx`; used extensively in dashboard KPI cards `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx:75–100`

### Tables

**Table structure (shadcn Table + tanstack/react-table):**
- **Header row:** `bg-muted/40 hover:bg-muted/40` (no interaction)
- **Header cell:** `text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3`
- **Table row:** `hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors`
- **Table cell:** `px-2` (standard) or custom per column
- **Row striping:** Not applied; alternating row backgrounds via hover state only
- **Density:** Py-4 per cell in custom tables (e.g., customers view)

**Custom toolbar:** Includes search, filters, and action buttons above table
**Custom density:** Entity data tables use `px-5 py-4` for rows (tighter than default shadcn)
**Empty state:** `EmptyState` component with icon, title, optional CTA button

**Source:** `apps/web/src/components/ui/table.tsx`; implemented in `apps/web/src/components/tables/shared/entity-data-table.tsx:54–100`; custom styling `apps/web/src/components/pages/customers/registered-page.tsx:72–73`

### Forms

**Form structure:**
- Uses `react-hook-form` + custom shadcn `Form` wrapper (FormField, FormItem, FormLabel, FormDescription, FormMessage)
- **Input styling:** `border border-input rounded-md px-3 py-1 focus-visible:ring-ring/50 focus-visible:ring-[3px]`
- **Label:** Standard text label; no required indicator specified (check form.tsx for variants)
- **Error state:** `aria-invalid:ring-destructive/20 aria-invalid:border-destructive` (light pink ring + red border)
- **Disabled input:** `disabled:opacity-50 disabled:cursor-not-allowed`

**Source:** `apps/web/src/components/ui/form.tsx` (wrapper); `input.tsx:10–15` (input base styles)

### Dialogs / Modals

**Dialog styling:**
- **Overlay:** `bg-black/50 backdrop-blur-sm` (semi-transparent black with blur)
- **Content:** `rounded-2xl border border-secondary-3 bg-background p-6 shadow-xl` (max-width 767px on mobile)
- **Close button:** Absolute top-right, `rounded-full`, hover state changes to `bg-secondary-3`
- **Animation:** Slide/zoom in/out with Radix UI `data-[state=open]:animate-in` directives
- **Z-index:** z-50 (stacked over page content)

**Header, Title, Description subcomponents:** Provided by Radix UI DialogPrimitive

**Source:** `apps/web/src/components/ui/dialog.tsx:15–51`

### Badges

**Base badge styling:**
```
inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium
```

| Variant | Appearance | When to use |
|---------|-----------|-------------|
| **default** | `bg-primary text-primary-foreground` | Primary labels, tags |
| **secondary** | `bg-secondary text-secondary-foreground` | Secondary labels |
| **destructive** | `bg-destructive text-white` | Error/warning badges |
| **outline** | `border text-foreground hover:bg-accent` | Neutral badges, tags |

**Status badges (custom):**
- `active` / `approved` / `confirmed` / `checked_in`: Green border + light green bg `border-green-300 bg-green-50 text-green-700`
- `completed` / `fulfilled` / `received` / `paid`: Blue `border-blue-200 bg-blue-50 text-blue-700`
- `frozen`: Yellow `border-yellow-300 bg-yellow-50 text-yellow-800`
- `rejected` / `cancelled` / `no-show`: Destructive (red)
- `inactive` / `discontinued` / `void` / `expired`: Secondary (gray)
- `pending` / `draft`: Outline variant

**Icon support:** `[&>svg]:size-3` (size-3 = 12px)
**Gap between icon & text:** `gap-1`

**Source:** `apps/web/src/components/ui/badge.tsx:7–26`; status mapping `apps/web/src/components/ui/status-badge.tsx:53–103`

### Empty States

**Component structure:**
- Centered icon (Lucide, default: Inbox) — `size-12 text-muted-foreground`
- Title text — `text-sm font-medium text-foreground`
- Optional description — `text-sm text-muted-foreground`
- Optional CTA button — `variant="default" | "outline"`
- Padding: `py-16` (generous vertical space)

**Search vs. empty context:** If context="search", CTA is hidden (no action shown)

**Source:** `apps/web/src/components/ui/empty-state.tsx:20–54`; used in tables when no data

---

## 4. State Conventions

### Active / Focused State
- **Link/button focus ring:** `focus-visible:ring-ring/50 focus-visible:ring-[3px]` (3px dark ring with 50% opacity)
- **Sidebar active link:** `bg-sidebar-accent text-sidebar-primary-foreground` (inverted color scheme)
- **Table row selected:** `data-[state=selected]:bg-muted` (light gray background)
- **Input focus:** Same ring style as buttons

### Destructive State
- **Color:** oklch(0.63 0.19 23.03) in light mode; oklch(0.69 0.2 23.91) in dark mode (red-orange)
- **Used for:** Delete buttons, cancel actions, error messages, invalid form fields
- **Error ring:** `aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40` (20–40% opacity destructive ring)

### Success / Approved State
- **Color:** #4CAF50 (green)
- **Applied to:** Status badges, progress indicators
- **Badge styling:** Green border (#green-300) + light bg (#green-50) + dark text (#green-700)

### Hover State
- **Cards:** No default hover; may lift slightly with shadow increase in future
- **Buttons:** Darker variant (e.g., `bg-primary/90` for default button)
- **Table rows:** `hover:bg-muted/50` (light muted background)
- **Links:** `hover:underline` (for link variant)
- **Sidebar items:** `hover:bg-sidebar-accent`

### Disabled State
- **Opacity:** `opacity-50`
- **Cursor:** `cursor-not-allowed` (inputs); `pointer-events-none` (buttons)
- **Applied globally** via base styles in `apps/web/src/index.css:276–283`

---

## 5. Iconography

**Icon Library:** Lucide React

**Icon usage patterns:**
- Page header icons: `h-5 w-5 text-primary` in a rounded-lg bg-primary/10 container (10x10 container)
- Button icons: `[&_svg]:size-4` (4 = 16px); automatically handled by button component
- Badge icons: `[&>svg]:size-3` (12px)
- Empty state icon: `size-12` (48px, large and prominent)
- Status indicator icons: `size-4` (16px, inline)

**Import pattern:**
```tsx
import { Bell, ChevronRight, User, ... } from "lucide-react";
```

**Source:** `apps/web/src/components/ui/empty-state.tsx:1`; `button.tsx:8`; `badge.tsx:8`; `page-header.tsx:29–30`

---

## 6. Notable Inconsistencies & Outliers

1. **Inline styles for progress bars** — `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx:140`
   ```tsx
   style={{ width: `${Math.min(completionPct, 100)}%` }}
   ```
   Used for dynamic progress bar width instead of `style` prop or Tailwind `w-[var(...)]`. Not a major issue but could be unified.

2. **Hardcoded brand token colors in component tree** — Many dashboard components use `text-brand-primary-1`, `bg-brand-secondary-3`, etc., which are custom CSS variables. These work fine but differ slightly from the shadcn design tokens (`text-primary`, `bg-secondary`). Both token sets coexist.

3. **Table header background inconsistency** — 
   - shadcn base: `bg-muted/50` 
   - entity-data-table override: `bg-muted/40` and additional `border-border/40`
   - This is intentional but creates two "standard" table header styles.

4. **Button in EntityDataTable hardcoded black** — `apps/web/src/components/tables/shared/entity-data-table.tsx:44`
   ```tsx
   className="bg-black text-white hover:bg-black/90"
   ```
   Overrides button default variant entirely. Should use `variant="default"` instead.

5. **Dialog content border uses `secondary-3` token** — `apps/web/src/components/ui/dialog.tsx:39` uses `border-secondary-3` (hardcoded variable) instead of `border-border` from design system, creating a subtle style divergence.

---

## 7. Spacing & Layout Patterns

**Padding conventions:**
- Cards: `px-6` (content), `py-6` (outer)
- Tables: `px-5 py-3.5` (headers), `px-5 py-4` (rows)
- Buttons: `px-4 py-2` (default)
- Inputs: `px-3 py-1`
- Dialog: `p-6` (mobile), `sm:p-8` (desktop)

**Gap conventions:**
- Card subcomponents: `gap-6`
- Flex containers: `gap-2` (small), `gap-3` (medium), `gap-4` (large)
- Page sections: `space-y-6` (vertical sections)

**Max-width:**
- Dialog: `!max-w-[767px]` (forced constraint)
- Pages: No global max-width; sidebar + full-width content layout

---

## 8. Typography Scale Summary

| Class | Size | Usage |
|-------|------|-------|
| `text-4xl` | 36px | KPI card values (e.g., sales total, appointment count) |
| `text-3xl` | 30px | Major page titles |
| `text-2xl` | 24px | Standard page titles (PageHeader) |
| `text-xl` | 20px | Large section headers |
| `text-lg` | 18px | Medium section headers |
| `text-base` | 16px | Body text, default |
| `text-sm` | 14px | Secondary text, labels, card descriptions |
| `text-xs` | 12px | Badge text, table headers, small labels |

**Font families per size:**
- Headings (h1–h4): Nordeco (700 weight) or Metropolis-Medium (500 weight)
- Body: Plus Jakarta Sans (400 weight)
- Mono: JetBrains Mono (400 weight)

---

## Appendix: Design Token Sources

- **Color variables:** `apps/web/src/index.css:43–94` (light), `125–170` (dark)
- **Typography:** `apps/web/src/index.css:95–100`
- **Shadow system:** `apps/web/src/index.css:109–121`
- **Tailwind theme inline:** `apps/web/src/index.css:200–273`
- **UI component library:** `apps/web/src/components/ui/` (shadcn/ui components)
- **Custom components:** `apps/web/src/components/dashboard/` and `apps/web/src/components/tables/`

---

**Document last verified:** April 28, 2026  
**Framework:** SvelteKit / React with Tailwind CSS v4 + shadcn/ui (Radix UI)  
**STYLE_EOF
cat /Users/voo/Developement/Work2/avantej-core/style_test.md | wc -l

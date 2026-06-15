# Avantej Design Guidelines

The visual system used across the dashboard, derived from the redesigned pages in this folder. Use this as the spec when redesigning any new or existing page so the product feels cohesive.

> Reference pages (live in the codebase) that exemplify the system:
> Home · Approvals · Customers · Class Slots · Trainer Availability · Services · POS · Reports · Announcements

---

## 1. Core tokens

### Color palette
Use these hex values literally. Don't substitute Tailwind shades unless explicitly listed below.

| Token | Hex | Usage |
|---|---|---|
| **Paper** | `#f3f3f3` | Page background, section dividers, sticky toolbar bg |
| **Ink** | `#0a0a0a` | Body text, primary buttons, active filter pills, headings |
| **Border** | `#e5e5e5` | Card borders, table dividers, input borders, subtle separators |
| **Muted ink** | `#737373` | Secondary/meta text, inactive filter labels, eyebrow labels |
| **Soft ink** | `#404040` | Body paragraph text inside cards |
| **Hover bg** | `#262626` | Black button hover state |
| **Warm accent** | `#d6cdb1` | Brand accent — avatar bg, sparingly used highlights |
| Surface white | `#ffffff` | Cards, tables, modals — explicit, never rely on `bg-white` defaults |
| Faint divider | `#fafafa` | Row hover state on inbox lists |

### Status palette
| Variant | bg | text | Used for |
|---|---|---|---|
| Success | `bg-emerald-50` | `text-emerald-700` | Active, available, paid, succeeded |
| Warning | `bg-amber-50` | `text-amber-700` | Pending, requires-ack, lapsed |
| Danger | `bg-rose-50` / `bg-red-50` | `text-rose-600` / `text-red-700` | Failed, blocked, conflict, churned |
| Info | `bg-blue-50` | `text-blue-700` | Lead, all audiences, normal priority |
| Brand-cool | `bg-sky-50` | `text-sky-700` | Branch-scoped, location filters |
| Member-purple | `bg-purple-50` | `text-purple-700` | Members audience, customer pills |
| Neutral | `bg-slate-100` | `text-slate-500` | Inactive, archived |

### Typography
- **Body font**: Inter (system default `font-sans` works)
- **Numbers**: `font-mono tabular-nums` on every numeric cell — prices, counts, deltas, durations, percentages, IDs, dates. No exceptions.
- **Headings**: `font-extrabold tracking-tight leading-none text-[#0a0a0a]`

### Type scale

| Use | Class | Notes |
|---|---|---|
| Page H1 | `text-[28px] font-extrabold tracking-tight leading-none` | One per page |
| Section / dialog H2 | `text-lg font-bold` | |
| Eyebrow label | `text-[10px] font-bold tracking-widest uppercase text-[#737373]` | Above every H1 and above grouped sections |
| Body | `text-sm text-[#0a0a0a]` | Default paragraph |
| Meta / subtitle | `text-sm text-[#737373]` | Subtitle row below H1 |
| Table header cell | `text-[10px] font-bold uppercase tracking-widest text-[#737373]` | |
| Pill / chip text | `text-[11px] font-semibold` | |
| KPI number | `text-2xl font-bold font-mono tabular-nums` | |
| Micro-meta (date stamps) | `text-[10px] text-[#737373] font-mono tabular-nums` | |

### Spacing & radius
- Page padding: `p-6`
- Card padding: `p-4` (KPI tiles), `p-5` (content cards), `p-3` (sidebar rails)
- Vertical rhythm between major sections: `mb-5` / `mb-6`
- Card radius: `rounded-2xl` (large surfaces), `rounded-xl` (search box, mini cards), `rounded-[10px]` (buttons), `rounded-full` (pills, chips, avatars)

---

## 2. Page chrome (every full-page route)

### 2.1 Outer wrapper

Pages render inside `<main class="flex-1 p-6 bg-background">`. To get the paper background to fill edge-to-edge, every page **must** use the `-m-6 … p-6` pattern to break out of the white padding strip:

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* … page content … */}
</div>
```

Do **not** use `bg-white`, `bg-card`, or `bg-background` at the page root. The paper bg is the contract.

### 2.2 Page header

Every page starts with the same eyebrow + H1 + subtitle block:

```tsx
<div className="mb-5 flex items-end justify-between">
  <div>
    <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
      {EYEBROW_LABEL}
    </p>
    <h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
      {PAGE_TITLE}
    </h1>
    <p className="mt-1 text-sm text-[#737373]">{SUBTITLE_OR_COUNT}</p>
  </div>
  {PRIMARY_ACTION_BUTTON /* black, top-right */}
</div>
```

**Eyebrow content rules** — describes the broader category, not the page. Examples:
- Home → `OPERATIONS OVERVIEW`
- Customers → `CUSTOMER DIRECTORY`
- Services → `SERVICE CATALOG`
- Announcements → `INTERNAL COMMUNICATIONS`
- Reports → `PERFORMANCE REPORT`
- POS → `POINT OF SALE`

**Subtitle content rules** — a single, useful sentence. Either a count (`{n} total`, `{n} services · {n} active`), a window (`This month · 7D`), or a one-line description.

### 2.3 Primary action button (header right)

```tsx
<button className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition disabled:opacity-50">
  <Plus className="h-4 w-4" />
  {LABEL}
</button>
```

Only **one** primary button per page header. If multiple actions exist, the others are secondary.

### Secondary button

```tsx
<button className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition">
  {LABEL}
</button>
```

---

## 3. Tabs / sub-navigation

When a page has tabs (e.g. Services → Services / Categories / Rooms / Promotions / Pricing), render them as pills below the header:

```tsx
<div className="mb-5 flex flex-wrap items-center gap-2">
  {TABS.map((t) => (
    <button
      className={
        isActive
          ? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
          : "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
      }
    >
      {t.label}
    </button>
  ))}
</div>
```

Do **not** use shadcn default `TabsTrigger` styling (underline-on-active) — it clashes with the pill aesthetic.

---

## 4. Cards & surfaces

Every contained surface is the same: white card with a fine grey border and large radius.

```tsx
<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
  {/* … */}
</div>
```

Variants:
- **KPI tile** — `p-4`, contains eyebrow + big mono number + optional sparkline
- **Filter rail** — `p-3`, `self-start`, sidebar of pills
- **Table card** — no padding, `overflow-hidden`, table inside
- **Modal/dialog** — same border/radius, larger `p-6`

Never nest cards more than 1 level deep. If you feel the need, you're missing a hierarchy decision.

---

## 5. KPI tiles

The dashboard, customers, reports, and class-slots pages all use the same tile.

```tsx
<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
  <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
    {LABEL}
  </p>
  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a]">
    {VALUE_OR_DASH}
  </p>
  {DELTA_BADGE_OR_SPARKLINE}
</div>
```

**Rules:**
- Stubs render as `—` (em-dash), never as `0`, `null`, `N/A`, or fake numbers.
- Delta badge: `▲` green / `▼` red — `text-[11px] font-semibold`, suffix `vs prev`.
- Sparkline: inline SVG, ≤ 12 points, area fill 10% opacity + stroke; no chart libs.
- KPI grid: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4` (vary by count).

---

## 6. Tables

Dense, scannable, sortable. Use this baseline:

```tsx
<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
  <table className="w-full">
    <thead className="bg-[#f3f3f3]">
      <tr className="border-b border-[#e5e5e5]">
        <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
          Column
        </th>
        {/* … */}
      </tr>
    </thead>
    <tbody className="divide-y divide-[#e5e5e5]">
      <tr className="hover:bg-[#fafafa] transition-colors">
        <td className="px-4 py-3 text-sm text-[#0a0a0a]">Cell</td>
        <td className="px-4 py-3 text-right font-mono tabular-nums">{n}</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Rules:**
- All numeric / currency / date cells: `font-mono tabular-nums text-right`.
- Currency: `RM {value.toFixed(2)}` — never floats; render `—` if null.
- Inactive rows: `opacity-60` on the whole `<tr>`.
- Row actions (Edit, Delete, More): `opacity-0 group-hover:opacity-100 transition` to keep rows clean at rest.
- Sortable headers: small `↑`/`↓` arrow in `#0a0a0a` when active, `#d6cdb1` (warm) when inactive available, hidden otherwise.

### Pagination footer

```tsx
<div className="flex items-center justify-between border-t border-[#e5e5e5] bg-[#f3f3f3]/50 px-4 py-2.5 text-[13px]">
  <span className="text-[#737373]">Showing X–Y of Z</span>
  <div className="flex gap-1">
    <button className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1 hover:bg-[#f3f3f3]">Prev</button>
    {/* active page */}
    <button className="rounded-lg bg-[#0a0a0a] text-white px-3 py-1 font-semibold">3</button>
    <button className="rounded-lg border border-[#e5e5e5] bg-white px-3 py-1 hover:bg-[#f3f3f3]">Next</button>
  </div>
</div>
```

---

## 7. Filters & toolbar

### Search box

```tsx
<div className="flex flex-1 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
  <Search className="h-4 w-4 text-[#737373] flex-shrink-0" />
  <input
    className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a]"
    placeholder="Search…"
  />
</div>
```

Use a native `<input>` for this — do not wrap in shadcn `<Input>` (the wrapper adds borders that double up).

### Filter pills (active / inactive states)

```tsx
const cls = isActive
  ? "rounded-full bg-[#0a0a0a] text-white px-3 py-1 text-[13px] font-semibold"
  : "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3 py-1 text-[13px] font-medium";
```

If the pill lives inside a white-card rail, change inactive hover to `hover:bg-[#f3f3f3]` (not `hover:bg-white`).

### Filter rail (sidebar)

`grid grid-cols-[220px_1fr] gap-5` — fixed 220px rail + flexible content. Rail content goes inside a white card with `p-3 self-start`.

### Bulk action bar (appears when rows selected)

```tsx
<div className="mb-3 flex items-center gap-2 rounded-xl border border-[#d6cdb1] bg-[#d6cdb1]/20 px-3 py-2">
  <span className="text-sm font-semibold text-[#0a0a0a]">{n} selected</span>
  <button className="…">Action</button>
  <button onClick={clear} className="ml-auto text-sm text-[#737373] hover:text-[#0a0a0a]">Clear</button>
</div>
```

The warm accent border distinguishes this from a default card.

---

## 8. Status pills & chips

```tsx
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
  Active
</span>
```

- Always include the colored dot inside the pill when surfacing live state — it doubles as a screen-reader-friendly affordance.
- Audience / category chips drop the dot but keep the colored bg pattern.

---

## 9. Inbox-style rows (Approvals, Announcements)

For dense, scannable lists where each row is browseable + expandable:

- Wrap rows in `divide-y divide-[#e5e5e5] rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden`
- Row left edge: `border-l-2 border-l-transparent`; on expand becomes `border-l-[#0a0a0a]`
- Priority dot (`w-2 h-2 rounded-full`) at left margin, color-coded
- Title `font-semibold text-sm text-[#0a0a0a]` inline with audience + status chips
- Right meta column: micro-date + chevron
- Expanded body: `bg-[#f3f3f3]`, message text `text-[#404040] leading-relaxed`, meta line with views/acks, action button row at bottom-left

---

## 10. Dialogs & modals

Use shadcn `<Dialog>` but match these rules inside:
- Title: `text-lg font-bold text-[#0a0a0a]`
- Description: `text-sm text-[#737373]`
- Form fields: native `<Label>` + `<Input>` from shadcn is fine; consistent `gap-1.5` between label + control, `gap-5` between fields.
- Footer buttons: secondary outline on the left (`Cancel`), primary black on the right.
- Destructive: red primary (`bg-red-600 hover:bg-red-700`) — never use red for normal mutations.

---

## 11. Loading, empty & error states

Every page must render all four states: **loading → empty → error → happy path**. Skipping any of them is a bug.

### 11.1 Loading

For full-page first loads, use the shared `<PageLoader />` (lives at `@/components/ui/loading-spinner`). Centered, transparent background — it sits on top of the paper bg cleanly.

For in-card refetches (sort changes, filter changes), do **not** unmount. Keep the table visible and dim with `opacity-60 pointer-events-none transition`.

For KPI tiles + table rows on first load, use skeleton blocks:

```tsx
<div className="h-7 w-24 rounded bg-[#e5e5e5] animate-pulse" />
<div className="h-4 w-40 rounded bg-[#e5e5e5] animate-pulse mt-2" />
```

Do **not** render `—` while loading. Em-dash means "we asked, no data exists." Skeleton means "we haven't asked yet." Different signals.

### 11.2 Empty state (inside a card)

Centered inside the card or table body. Single icon, short heading, helper text, optional CTA.

```tsx
<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
  <{IconLucide} className="h-8 w-8 mb-3 opacity-30" />
  <p className="text-sm font-medium text-[#0a0a0a]">{HEADING}</p>
  <p className="text-xs mt-1">{HELPER_OR_NEXT_STEP}</p>
  {OPTIONAL_PRIMARY_BUTTON_MT4}
</div>
```

**Heading rules** — describe what's missing in user terms, not engineer terms. Bad: `No data`. Good: `No customers yet` / `No appointments today` / `No announcements match these filters`.

**Helper line** — if it's first-time empty, suggest the next step (`Create your first service to start scheduling`). If it's filter-empty, say so (`Try clearing filters or searching for a different term`).

### 11.3 Error state

Use `<StatusCallout>` (lives at `@/components/ui/status-callout`) with `variant="error"` and an `onRetry` handler:

```tsx
if (isError) {
  return (
    <div className="p-6">
      <StatusCallout variant="error" onRetry={() => refetch()}>
        Failed to load {RESOURCE_LABEL}. Please try again.
      </StatusCallout>
    </div>
  );
}
```

Never throw to a global error boundary for a single failed query — surface in-context with a retry.

### 11.4 Permission-denied state

Distinct from error. The query succeeded but the user has no access. Render a centered empty-state-style block:

```tsx
<div className="flex flex-col items-center justify-center min-h-96 text-[#737373]">
  <Lock className="h-8 w-8 mb-3 opacity-30" />
  <p className="text-sm font-medium text-[#0a0a0a]">You don't have access to this page</p>
  <p className="text-xs mt-1">Ask an admin to grant {PERMISSION_LABEL}.</p>
</div>
```

Do not render a half-broken UI behind a permission check.

---

## 12. Detail pages

Detail pages (e.g. `/dashboard/customers/$id`, `/dashboard/sales/$id`, `/dashboard/branch/$id`) follow a different shape than list pages.

### 12.1 Header

Replace the static eyebrow with a **breadcrumb-style back link** + the record's own name as H1:

```tsx
<div className="mb-5">
  <Link to="/dashboard/customers/view" className="inline-flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-[#737373] hover:text-[#0a0a0a] mb-1">
    <ChevronLeft className="h-3 w-3" />
    Customers
  </Link>
  <div className="flex items-end justify-between">
    <div>
      <h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
        {RECORD_NAME}
      </h1>
      <p className="mt-1 text-sm text-[#737373]">{SUBTITLE_META}</p>
    </div>
    {ACTIONS /* Edit, Archive, etc. — secondary buttons, NOT a big black primary */}
  </div>
</div>
```

Detail pages rarely need a primary CTA — the user is here to view, not create. Promote actions to secondary outline buttons.

### 12.2 Layout — pick one

**Single-column scroll** (default) — stack sections vertically with `space-y-5`. Each section is its own white card. Use for: customer detail, sales detail, branch detail.

**Two-column** — left 2/3 main content + right 1/3 metadata sidebar. Use for: records where metadata is consulted constantly while reading the main content (e.g. an order with a customer summary sidebar).

Do **not** use tabs on a detail page if the content fits on screen. Tabs add a click for no information density gain.

### 12.3 Section header (inside a detail page)

```tsx
<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-base font-bold text-[#0a0a0a]">{SECTION_TITLE}</h2>
    {OPTIONAL_LINK_OR_ACTION /* small text-only link or icon button */}
  </div>
  {/* … */}
</div>
```

### 12.4 Key/value pairs

Detail pages have a lot of `Field: value`. Use a 2-column grid:

```tsx
<dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
  <dt className="text-[#737373]">{LABEL}</dt>
  <dd className="font-mono tabular-nums text-[#0a0a0a]">{VALUE}</dd>
  {/* … */}
</dl>
```

Numbers + dates + IDs go in `font-mono tabular-nums`. Free text stays default.

---

## 13. Sheets & drawers

Use a sheet (slide-in panel) when:
- The user is editing a record but the surrounding list/calendar context matters
- The work is short (under ~10 fields)
- The user might cancel without committing

Use a full-page form instead when:
- The form is long (10+ fields, multi-step)
- The user is creating, not editing

### 13.1 Sheet shell

Use shadcn `<Sheet>` from `@/components/ui/sheet`. Match these tokens inside:

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0 bg-white border-l border-[#e5e5e5]">
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">{EYEBROW}</p>
        <h2 className="text-lg font-bold text-[#0a0a0a]">{TITLE}</h2>
      </div>
      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">{FIELDS}</div>
      {/* Sticky footer */}
      <div className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
        <SecondaryButton>Cancel</SecondaryButton>
        <PrimaryButton>Save</PrimaryButton>
      </div>
    </div>
  </SheetContent>
</Sheet>
```

**Rules:**
- Width: 420px on desktop, full-width on mobile.
- Always sticky footer with Cancel + Save — don't make users scroll to find them.
- Side: `right` for editing-in-context, `bottom` only for confirmation-style flows.

---

## 14. Master-detail split panes

When a single page surfaces a list on the left and a detail panel on the right (e.g. Appointments).

```tsx
<div className="grid grid-cols-[320px_1fr] gap-0 rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden" style={{ height: "calc(100vh - 160px)" }}>
  {/* Left list — scrollable */}
  <aside className="border-r border-[#e5e5e5] overflow-y-auto">
    {LIST_ITEMS}
  </aside>
  {/* Right detail — scrollable */}
  <section className="overflow-y-auto p-6">
    {SELECTED_DETAIL || <EmptyState message="Select an item to view details" />}
  </section>
</div>
```

**Rules:**
- Left pane: fixed 320px on desktop (larger if list items are dense like calendar entries).
- Selected list item: warm `bg-[#d6cdb1]/20` + left border `border-l-2 border-l-[#0a0a0a]`. Other items have transparent left border to prevent layout shift on selection.
- Empty right pane: centered placeholder, not blank.
- On mobile (`< md`), collapse to a single-column stack — list is full-width, tapping an item navigates to a separate route OR slides over a sheet.

---

## 15. Full-page forms

Reserved for creating major records (new sale, new branch, new appointment series). Distinct from a detail page or a sheet.

### 15.1 Layout

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  <div className="mb-5">
    <Link to={BACK_URL} className="...">← {BACK_LABEL}</Link>
    <h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a] mt-1">
      {NEW_RECORD_TITLE}
    </h1>
  </div>

  {/* Form — single-column 720px max */}
  <form className="max-w-[720px] space-y-5 pb-24">
    <FormSection title="Section A">…</FormSection>
    <FormSection title="Section B">…</FormSection>
  </form>

  {/* Sticky bottom action bar — escapes max-w */}
  <div className="fixed bottom-0 left-0 right-0 border-t border-[#e5e5e5] bg-white px-6 py-3 flex justify-end gap-2 z-10">
    <SecondaryButton>Cancel</SecondaryButton>
    <PrimaryButton type="submit">Create</PrimaryButton>
  </div>
</div>
```

### 15.2 FormSection wrapper

```tsx
<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
  <h2 className="text-base font-bold text-[#0a0a0a] mb-1">{TITLE}</h2>
  <p className="text-sm text-[#737373] mb-4">{HELPER_TEXT}</p>
  <div className="space-y-4">{FIELDS}</div>
</div>
```

### 15.3 Field

```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor="x">
    {LABEL} {required && <span className="text-rose-600">*</span>}
  </Label>
  <Input id="x" ... />
  {helper && <p className="text-xs text-[#737373]">{helper}</p>}
  {error && <p className="text-xs text-rose-600">{error}</p>}
</div>
```

- Required marker: red asterisk after the label.
- Helper text: directly below the field in muted ink.
- Error text: directly below the field in rose, replaces helper text.
- Two-up layout (`grid grid-cols-2 gap-3`) only when fields are tightly related (e.g. Start Date / End Date).

### 15.4 Form library

Use **TanStack Form** for any new form (project convention per `CLAUDE.md`). React Hook Form exists in older code — do not extend it.

---

## 16. Charts beyond sparklines

Sparklines are inline SVG, no library. For larger charts (area / bar / line over time), still use raw inline SVG with these rules — do **not** introduce Recharts, Chart.js, or Victory.

### 16.1 Area / line chart canvas

```tsx
<svg viewBox="0 0 680 180" className="w-full h-[180px]">
  {/* Gridlines — 4 horizontal */}
  {[0, 0.25, 0.5, 0.75, 1].map((p) => (
    <line x1="0" y1={180 * p} x2="680" y2={180 * p} stroke="#e5e5e5" strokeDasharray="2 4" />
  ))}
  {/* Area fill */}
  <polygon points={areaPoints} fill="#0a0a0a" fillOpacity="0.1" />
  {/* Stroke */}
  <polyline points={linePoints} stroke="#0a0a0a" strokeWidth="1.5" fill="none" />
  {/* Latest-point dot */}
  <circle cx={lastX} cy={lastY} r="3" fill="#0a0a0a" />
</svg>
```

### 16.2 Axis labels

- Y-axis: 3–4 ticks, right-aligned outside the SVG in `text-[10px] font-mono tabular-nums text-[#737373]`.
- X-axis: 4–6 evenly spaced date labels below the SVG, same style.
- Don't render every data point's label — that's noise.

### 16.3 Tooltip / interaction

Optional. If added: a single hover line + value bubble. Don't add brush, zoom, or pan — that's a different product.

### 16.4 Color rules

- Single-series chart: `#0a0a0a` (ink) for stroke, 10% opacity for area fill.
- Two-series compare: ink for the primary, `#d6cdb1` (warm) for the secondary.
- Status-coded data (e.g. churn rate): use the status palette colors.

### 16.5 No fake data

If a chart's data API isn't built yet, render an empty chart with the message `Data series not yet available` centered inside the SVG bounds. Do **not** render `Math.random()` or `Array.from({length: 9}, (_, i) => baseline * (0.9 + i * 0.02))` curves.

---

## 17. shadcn primitives vs native — when to use which

Both exist in the codebase. The rule:

| Component | Use shadcn `<X>` when… | Use native `<x>` when… |
|---|---|---|
| Button | Inside a `<form>` (gets disabled/loading states), inside a Dialog/Sheet footer | Inline action button in the page chrome, header buttons, table row actions |
| Input | Inside a `<form>` with `<Label>` association | Inside a search box, inside a borderless toolbar (avoid double-border) |
| Select | Form fields | Filter pills (use the pill pattern instead) |
| Dialog | All modals | n/a |
| Sheet | All side panels | n/a |
| Checkbox | All checkboxes | n/a |
| Tooltip | All tooltips | n/a |

When in doubt: **forms → shadcn, chrome → native**. The reason is the shadcn `<Input>` wrapper adds its own border + ring styles that fight the tokenized toolbar look.

---

## 18. Responsive breakpoints

The dashboard is desktop-first (sidebar always visible at `≥ md`). Mobile (`< md`) is a graceful degradation, not a primary target.

| Breakpoint | What changes |
|---|---|
| `< md` (mobile) | Sidebar collapses to a Sheet toggled by a hamburger; KPI grids stack to 2 cols; tables horizontal-scroll inside their card; split-panes collapse to single column |
| `md` (768px) | Sidebar visible; KPI grids 3 cols |
| `lg` (1024px) | KPI grids 6 cols where appropriate; right-rail sidebars appear (e.g. Reports) |
| `xl` (1280px+) | No artificial content-width cap. Dashboard / list / detail pages all run full-bleed. Long paragraphs of text inside cards should self-limit via card width, not a page-level `max-w-*` |

**Don't:**
- Use `xs:` or sub-`sm:` breakpoints; the design isn't tested below 360px wide
- Hide critical actions on mobile — collapse to a `…` menu instead
- Add a per-page `max-w-[NNNNpx] mx-auto` wrapper that centers content with empty rails on either side. Every other page is full-bleed; one capped page looks visibly narrower next to the sidebar. POS hit this exact bug — content was capped at `max-w-[1400px]` and felt off compared to Approvals / Customers / Reports.

---

## 19. Dark mode

**Out of scope.** The product is light-only by design (paper/ink aesthetic, light is the brand). Do not add `dark:` Tailwind variants. If a future business need creates pressure for dark mode, it'll get its own design pass.

If you see a `dark:` class in code, it's leftover from a shadcn default — strip it.

---

## 20. Stub / missing data rules

This is non-negotiable: **no synthetic data anywhere**.

| Situation | Render |
|---|---|
| Numeric value missing | `—` (em-dash) in `font-mono tabular-nums text-[#737373]` |
| Sparkline data missing | Same `—`, NOT a fake curve |
| Action not yet wired | Button stays rendered but `disabled` with `disabled:opacity-50 cursor-not-allowed`; a tooltip explains why |
| Filter has no backing data | Hide the filter entirely until the data exists |
| Date missing | `—`, never `1970-01-01` or `Invalid Date` |

If something needs to come back later, leave a `// STUB:` comment explaining what API would feed it and what tier (1/2/3) it lives in.

---

## 21. Iconography

- Use **lucide-react** only.
- Size to context: `h-3.5 w-3.5` (in pills / chips), `h-4 w-4` (in buttons), `h-5 w-5` (in headers), `h-8 w-8` (in empty states).
- Color inherits — let `text-…` on the parent drive icon color. Never apply a hard color to the SVG itself.
- For status indicators, use a colored circle (`<span class="h-1.5 w-1.5 rounded-full bg-…" />`) instead of an icon when the meaning is binary.

---

## 22. Common anti-patterns (don't ship these)

- **Double headers**: page already has H1 from a route shell, then component adds another. Strip the inner one and keep state in the outer header (see Services for the fix pattern).
- **`bg-card` / `bg-background` / `bg-popover` / `bg-primary` / `text-primary` / `text-primary-foreground` / `border-input` / `border-foreground` / `text-destructive`**: shadcn defaults — replace with explicit hex tokens per Section 1.
- **Generic Tailwind shades (`bg-gray-100`, `text-gray-900`, `border-blue-500`, etc.)**: not shadcn but still wrong. Anything that doesn't appear in Section 1 must be converted. A classic tell is a file starting with `bg-white shadow-sm` + `gray-*` text scale + `blue-500` active state — that's a Tailwind template starter that never got tokenized.
- **Shadcn default Tabs underline**: replace with pill tabs (Section 3).
- **Mixing `text-muted-foreground`** with our `text-[#737373]` — use the hex only, project-wide. Never both.
- **Per-page `max-w-[NNNNpx] mx-auto`** wrapper that centers content. Pages run full-bleed (Section 18).
- **Editing an orphan file** — verify via `app-sidebar.tsx` that the file you're editing is actually the one the user navigates to. `customers/view.tsx` and `customers/v2/view.tsx` both exist; only one is wired.
- **Floating numbers (`1234.5`)** rendered as strings without `font-mono tabular-nums` — they shimmy when values update.
- **Fake sparklines** generated from a single value × multipliers (`Math.random()`, `0.92 + i * 0.01` patterns). If you have one data point, render `—`.
- **Pluralised counts that lie** (`0 items` rendered when query is still loading). Render `—` while `isLoading`.
- **Dialogs that submit on Enter without confirmation** for destructive actions.
- **`window.alert / window.confirm`** — always use `<Dialog>` or a `sonner` toast.

---

## 23. Reference mockups

These HTML files live alongside this doc and are the source of truth for any visual ambiguity. Open them in a browser when uncertain:

- `dashboard-improved.html` — the original aesthetic source
- `approvals-page-designs.html` — Design 1 (Inbox) is the shipped version
- `customers-page-designs.html` — Design 1 shipped
- `appointments-page-designs.html` — chrome-only adopted (no full redesign yet)
- `class-slots-page-designs.html` — Design 3 shipped
- `trainer-availability-page-designs.html` — Design 1 shipped
- `services-page-designs.html` — Design 1 shipped
- `pos-page-designs.html` — Design 5 (Conversational) shipped
- `reports-page-designs.html` — Design 2 (Exec Dashboard) shipped
- `announcements-page-designs.html` — Design 2 (Inbox Filters) shipped

When designing a new page, generate fresh mockups in this folder (`<feature>-page-designs.html`) using the tokens above, get user buy-in on one of the variants, then implement.

---

## 24. Adding a new page — checklist

Before opening a PR for a new dashboard page:

- [ ] Outer wrapper uses `-m-6 min-h-screen bg-[#f3f3f3] p-6`
- [ ] Page header has eyebrow + H1 + subtitle in the canonical type scale
- [ ] At most one primary (black) button in the header
- [ ] All numbers use `font-mono tabular-nums`
- [ ] All cards use `rounded-2xl border border-[#e5e5e5] bg-white`
- [ ] No `bg-card` / `bg-background` / `bg-popover` / `bg-muted` defaults
- [ ] Empty / loading / error states all render — not just the happy path
- [ ] Stub values render as `—`, never as `0` or `N/A` or fake data
- [ ] Disabled buttons explain why (tooltip or visible helper text)
- [ ] Sortable table headers have arrow indicators in correct colors
- [ ] Pagination footer matches the canonical style
- [ ] Run `bun check-types` — no new errors
- [ ] Visually verify in a browser — golden path + at least one edge case

---

## 25. Upgrading an existing page — workflow

This is the recipe for an agent or developer asked to "apply the design system to page X" where X is an existing pre-redesign page.

### Step 1 — Pick a reference page

Match the page's shape to one already in the system:

| Target page shape | Reference page |
|---|---|
| Single dense list with filters | `customers/view` (Section 6 + Section 7) |
| Inbox / browseable rows | `announcements/view` or `operations/approvals` (Section 9) |
| KPI dashboard | `index.tsx` (Home) or `reports/view` (Section 5 + 16) |
| Settings / config | `settings/tax-rates` or `settings/organization` |
| Detail page | `customers/$id` or `sales/$id` (Section 12) |
| Master-detail | `appointment/view` (Section 14) |
| Full-page form | `sales/create` (POS — Section 15) |

Read the reference page end-to-end before touching the target.

### Step 2 — Survey the target

**Step 2a (critical): confirm the sidebar actually points to the file you're about to edit.** Open `apps/web/src/components/app-sidebar.tsx` and grep for the page label. The `url` field is the truth. It's easy to spend hours redesigning `customers/view.tsx` only to discover the sidebar links to `customers/v2/view.tsx` and the old file is an orphan. If the sidebar URL points at a wrapper route, follow that route's `component:` to find the real file. Apply the same check for any nav entry, dropdown, or breadcrumb the user reaches the page through.

Then read the target route file + any extracted component the route renders. Note:
1. Does it currently have its own page header? (Will conflict with the new one.)
2. Does it have its own `bg-*` wrapper? (Will conflict with paper bg.)
3. Where is it rendered? Some routes have a wrapper shell (e.g. `service/view.tsx`) — chrome lives there, content lives in a sub-component.
4. What oRPC queries does it make? (Don't change behavior — only chrome.)
5. Are there `v2/`, `legacy/`, `old/` siblings? If so, decide which is live and consider deleting (or commenting "orphan — not routed" at the top of) the other.

### Step 3 — Apply chrome (mechanical)

In order:

1. **Outer wrapper** — replace whatever root `<div>` exists with:
   ```tsx
   <div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">…</div>
   ```
2. **Page header** — replace any existing title/subtitle with the canonical eyebrow + H1 + subtitle block (Section 2.2). Move primary CTAs into the header right slot (Section 2.3).
3. **Surfaces** — replace every `bg-card`, `bg-background`, `bg-white` wrapper with `rounded-2xl border border-[#e5e5e5] bg-white p-5`. Strip `shadow-*` classes (use border + radius only).
4. **Tokens** — run all of these find-and-replaces (case-sensitive):
   - `text-muted-foreground` → `text-[#737373]`
   - `border-border` → `border-[#e5e5e5]`
   - `border-input` → `border-[#e5e5e5]`
   - `text-foreground` → `text-[#0a0a0a]`
   - `border-foreground` → `border-[#0a0a0a]`
   - `bg-primary` → `bg-[#0a0a0a]`
   - `text-primary` → `text-[#0a0a0a]`
   - `text-primary-foreground` → `text-white`
   - `bg-primary-foreground` → `bg-white`
   - `text-destructive` → `text-rose-600`
   - `bg-muted` / `bg-popover` / `bg-card` / `bg-background` → `bg-[#f3f3f3]` (or `bg-white` if it's a card)
   - Generic Tailwind shades: `gray-50/100/200/300` → `#fafafa`/`#f3f3f3`/`#e5e5e5`/`#d1d1d1`, `gray-500/600/700/900` → `#737373`/`#737373`/`#404040`/`#0a0a0a`. `blue-500` active state → `#0a0a0a`. The customers-filter-sidebar was full of these — a classic shadcn-template starting point that needs full conversion.
5. **Tables** — apply Section 6 baseline. Confirm thead has `bg-[#f3f3f3]`, numeric cells use `font-mono tabular-nums`, row hover is `hover:bg-[#fafafa]`.
6. **Pills** — replace shadcn `<Badge>` with the status-pill pattern (Section 8) if the badge represents live state with a color.
7. **Buttons** — header CTAs become native `<button>` with token classes (Section 2.3 / 17). Form buttons stay shadcn (Section 17).

### Step 4 — Check the four states

Section 11 — confirm loading, empty, error, and permission-denied all render. If any are missing, add them now using the templates. Don't ship a page that breaks on a network failure.

### Step 5 — Strip duplicates

If the target had its own page header AND a parent route shell also has one, kill the inner one (move state into the outer if needed). Common after a partial redesign — see Services for the canonical fix.

### Step 6 — Verify

```bash
cd apps/web && bun check-types
```

Then load the page in a browser and click through:
- Golden path
- An empty filter combination
- A failing network request (block in DevTools to simulate)
- Bulk-select if applicable

### Step 7 — Audit stubs

For every value currently rendered as a number, ask: "Is this real, or fabricated?" Anything synthetic must become `—` per Section 20. If you're tempted to leave a fake value in "for visual completeness," don't — file it in `_future/` instead.

### Anti-pattern checks specific to upgrades

- **Two paper backgrounds stacked** — the outer route shell already has paper bg, then the inner component re-wraps with `-m-6 bg-[#f3f3f3]`. Result: the inner `-m-6` punches a hole through the route padding and the page jitters. Pick one level — typically the inner component owns the wrapper, the route shell is just a routing concern.
- **Two H1s on the same page** — happens when a route shell has tabs + its own H1 and a child page also has an H1. The child should render headerless content; the shell owns the chrome.
- **Imported `<Card>` from shadcn** — replace with the tokenized div pattern. The shadcn `<Card>` ships with a default shadow we don't use.
- **`<ScrollArea>` from shadcn wrapping a table** — remove. Let the table card overflow naturally; pages should scroll the body, not nested viewports.
- **`use client` directive at the top of any file** — this is Vite + TanStack Router, not Next.js. The directive is a no-op and a tell that someone copy-pasted from a Next.js example.

### When you're done

Run `/graphify . --update` to refresh the knowledge graph so it reflects the redesigned structure. Then push the PR.

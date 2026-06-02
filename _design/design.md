# Avantej — Page Design Reference

This file is the per-page recipe book. For component-level spec (tokens, spacing, buttons, tables, pills, states, charts) see `design-guidelines.md`. That file is authoritative — read it first if you haven't.

---

## How to use this file

1. Find your page in the table below.
2. Note its **Pattern** — this maps to a section in `design-guidelines.md`.
3. Copy the starter scaffold for that pattern.
4. Fill in the eyebrow, H1, subtitle, and data.
5. Run through the [page checklist](#checklist) before opening a PR.

---

## Page catalog

| Page | Section | Pattern | Eyebrow | Subtitle |
|---|---|---|---|---|
| **Home** | Main | KPI Dashboard | `OPERATIONS OVERVIEW` | `Today · {branch}` |
| **Approvals** | Main | Inbox rows | `PENDING APPROVALS` | `{n} items need your review` |
| **Customers** | Main | Dense table + filter rail | `CUSTOMER DIRECTORY` | `{n} total · {n} active` |
| **Appointments** | Main | Master-detail split | `APPOINTMENT CALENDAR` | `{n} today · {branch}` |
| **Class Slots** | Main | KPI tiles + table | `CLASS SCHEDULE` | `{n} slots this week` |
| **Trainers** | Main | Dense table | `TRAINER DIRECTORY` | `{n} trainers · {n} active` |
| **Services** | Main | Tabs + table | `SERVICE CATALOG` | `{n} services · {n} active` |
| **POS** | Main | Full-page form (two-column) | `POINT OF SALE` | `New Sale` |
| **Reports** | Main | KPI tiles + charts | `PERFORMANCE REPORT` | `{period} · {branch}` |
| **Announcements** | Main | Inbox rows + filter rail | `INTERNAL COMMUNICATIONS` | `{n} active · {n} archived` |
| **Sales & Payments** | Finance | Dense table + filter rail | `SALES & PAYMENTS` | `{n} orders · RM {total} this month` |
| **Commissions** | Finance | KPI tiles + table | `COMMISSION SUMMARY` | `{period} · {n} staff` |
| **Tax Rates** | Finance | Settings list | `TAX CONFIGURATION` | `{n} rates configured` |
| **Expenses** | Finance | Dense table + filter rail | `EXPENSE TRACKER` | `{n} expenses · RM {total} this month` |
| **Packages** | Finance | Tabs + table | `PACKAGE CATALOG` | `{n} packages · {n} active` |
| **Payouts** | Finance | Dense table | `PAYOUT HISTORY` | `{n} payouts · RM {total} this period` |
| **Employees** | Staff & Access | Dense table | `EMPLOYEE DIRECTORY` | `{n} staff · {n} active` |
| **Attendance** | Staff & Access | KPI tiles + table | `ATTENDANCE LOG` | `{period} · {branch}` |
| **Roles** | Staff & Access | Settings list | `ROLES & PERMISSIONS` | `{n} roles configured` |
| **Staff Access** | Staff & Access | Dense table | `ACCESS CONTROL` | `{n} members · {n} pending` |
| **Branches** | Staff & Access | Dense table | `BRANCH MANAGEMENT` | `{n} branches · {n} active` |
| **Onboarding QR** | Staff & Access | Settings / card | `ONBOARDING` | `QR code for new member self-registration` |
| **Org Settings** | Settings | Full-page form sections | `ORGANISATION SETTINGS` | `{org name}` |
| **Google Calendar** | Settings | Settings / card | `INTEGRATIONS` | `Google Calendar sync` |
| **Notification Preferences** | Settings | Settings list | `NOTIFICATIONS` | `Configure alert delivery` |
| **GHL Integration** | Settings | Settings / card | `INTEGRATIONS` | `GoHighLevel CRM sync` |
| **Audit Log** | Settings | Dense table (read-only) | `AUDIT LOG` | `{n} events · last 30 days` |

---

## Pattern scaffolds

Copy the scaffold for your page's pattern. Replace `{CAPS}` placeholders.

### 1 — Dense table + filter rail

> Used by: Customers, Sales & Payments, Expenses, Payouts, Employees, Branches, Staff Access, Audit Log

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  <div className="mb-5 flex items-end justify-between">
    <div>
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">{EYEBROW}</p>
      <h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">{PAGE_TITLE}</h1>
      <p className="mt-1 text-sm text-[#737373]">{SUBTITLE}</p>
    </div>
    <button className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition">
      <Plus className="h-4 w-4" /> {PRIMARY_ACTION}
    </button>
  </div>

  {/* Search + toolbar */}
  <div className="mb-4 flex items-center gap-3">
    <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
      <Search className="h-4 w-4 text-[#737373] flex-shrink-0" />
      <input className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373]" placeholder="Search…" />
    </div>
    {/* optional secondary buttons */}
  </div>

  {/* Filter rail + content */}
  <div className="grid grid-cols-[220px_1fr] gap-5">
    {/* Rail */}
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-3 self-start space-y-1">
      <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] px-2 mb-2">{FILTER_LABEL}</p>
      {FILTER_PILLS}
    </div>

    {/* Table */}
    <div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
      <table className="w-full">
        <thead className="bg-[#f3f3f3]">
          <tr className="border-b border-[#e5e5e5]">
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">{COL}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e5e5e5]">
          {/* loading: opacity-60 pointer-events-none on tbody */}
          {/* empty: full-width td with centered empty state */}
          <tr className="hover:bg-[#fafafa] transition-colors">
            <td className="px-4 py-3 text-sm text-[#0a0a0a]">{CELL}</td>
          </tr>
        </tbody>
      </table>
      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-[#e5e5e5] bg-[#f3f3f3]/50 px-4 py-2.5 text-[13px]">
        <span className="text-[#737373]">Showing X–Y of Z</span>
        <div className="flex gap-1">{PAGINATION_BUTTONS}</div>
      </div>
    </div>
  </div>
</div>
```

---

### 2 — KPI tiles + table

> Used by: Class Slots, Commissions, Attendance

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header — same as above, no filter rail */}
  ...

  {/* KPI row */}
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-5">
    {KPIS.map((k) => (
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">{k.label}</p>
        <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a]">{k.value ?? "—"}</p>
        {k.delta && <span className="text-[11px] font-semibold">{k.delta} vs prev</span>}
      </div>
    ))}
  </div>

  {/* Table card — same structure as Dense Table above, no side rail */}
  <div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
    ...
  </div>
</div>
```

---

### 3 — Inbox rows

> Used by: Approvals, Announcements

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  ...

  {/* Optional filter pills (inline, not a side rail) */}
  <div className="mb-4 flex flex-wrap items-center gap-2">
    {FILTERS.map((f) => (
      <button className={isActive ? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold" : "rounded-full border border-[#e5e5e5] bg-white text-[#737373] px-3.5 py-1.5 text-[13px] font-medium"}>
        {f.label}
      </button>
    ))}
  </div>

  {/* Inbox list */}
  <div className="divide-y divide-[#e5e5e5] rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
    {ROWS.map((row) => (
      <div className={`flex items-start gap-3 px-4 py-3.5 border-l-2 transition cursor-pointer ${isOpen ? "border-l-[#0a0a0a] bg-[#f3f3f3]" : "border-l-transparent hover:bg-[#fafafa]"}`}>
        {/* Priority dot */}
        <span className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0" style={{ background: PRIORITY_COLOR }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#0a0a0a]">{row.title}</span>
            {STATUS_CHIP}
          </div>
          <p className="mt-0.5 text-xs text-[#737373] truncate">{row.meta}</p>
          {/* Expanded body */}
          {isOpen && (
            <div className="mt-3 text-sm text-[#404040] leading-relaxed">{row.body}</div>
          )}
        </div>
        {/* Right meta */}
        <div className="flex-shrink-0 text-right">
          <p className="text-[10px] font-mono tabular-nums text-[#737373]">{row.date}</p>
          <ChevronDown className={`h-4 w-4 text-[#737373] mt-1 transition ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </div>
    ))}
  </div>
</div>
```

---

### 4 — Tabs + table

> Used by: Services, Packages

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  ...

  {/* Tabs */}
  <div className="mb-5 flex flex-wrap items-center gap-2">
    {TABS.map((t) => (
      <button className={isActive ? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold" : "rounded-full border border-[#e5e5e5] bg-white text-[#737373] px-3.5 py-1.5 text-[13px] font-medium hover:text-[#0a0a0a] hover:bg-[#f3f3f3]"}>
        {t.label}
      </button>
    ))}
  </div>

  {/* Active tab content — table card */}
  <div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
    ...
  </div>
</div>
```

---

### 5 — Master-detail split pane

> Used by: Appointments

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  ...

  <div className="grid grid-cols-[320px_1fr] gap-0 rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden" style={{ height: "calc(100vh - 160px)" }}>
    <aside className="border-r border-[#e5e5e5] overflow-y-auto">
      {LIST_ITEMS.map((item) => (
        <div className={`flex items-start gap-3 px-4 py-3.5 border-l-2 cursor-pointer transition ${selected === item.id ? "border-l-[#0a0a0a] bg-[#d6cdb1]/20" : "border-l-transparent hover:bg-[#fafafa]"}`}>
          {ITEM_CONTENT}
        </div>
      ))}
    </aside>
    <section className="overflow-y-auto p-6">
      {selected ? DETAIL_CONTENT : (
        <div className="flex flex-col items-center justify-center h-full text-[#737373]">
          <p className="text-sm">Select an item to view details</p>
        </div>
      )}
    </section>
  </div>
</div>
```

---

### 6 — Settings list (read or edit in place)

> Used by: Tax Rates, Roles, Notification Preferences

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  ...

  <div className="max-w-[720px] space-y-5">
    {/* Each setting group is its own card */}
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#0a0a0a]">{SECTION_TITLE}</h2>
          <p className="text-sm text-[#737373] mt-0.5">{SECTION_HELPER}</p>
        </div>
        <button className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition">
          {ADD_ACTION}
        </button>
      </div>

      {/* Items list */}
      <div className="divide-y divide-[#e5e5e5]">
        {ITEMS.map((item) => (
          <div className="flex items-center justify-between py-3 group">
            <div>
              <p className="text-sm font-medium text-[#0a0a0a]">{item.name}</p>
              <p className="text-xs text-[#737373]">{item.meta}</p>
            </div>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
              {ROW_ACTIONS}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
</div>
```

---

### 7 — Settings card (single integration / QR / feature toggle)

> Used by: Google Calendar, GHL Integration, Onboarding QR

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  ...

  <div className="max-w-[720px] space-y-5">
    {/* Connection status card */}
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {INTEGRATION_ICON}
          <div>
            <p className="text-sm font-semibold text-[#0a0a0a]">{INTEGRATION_NAME}</p>
            <p className="text-xs text-[#737373]">{STATUS_DESCRIPTION}</p>
          </div>
        </div>
        {isConnected
          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Connected</span>
          : <button className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition">Connect</button>
        }
      </div>
    </div>

    {/* Settings within the integration — only shown when connected */}
    {isConnected && (
      <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
        <h2 className="text-base font-bold text-[#0a0a0a] mb-4">{SETTINGS_TITLE}</h2>
        <div className="space-y-4">{FORM_FIELDS}</div>
      </div>
    )}
  </div>
</div>
```

---

### 8 — Full-page form (Org Settings)

> Used by: Org Settings (and POS create — see `design-guidelines.md` §15)

```tsx
<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
  {/* Header */}
  ...

  <form className="max-w-[720px] space-y-5 pb-24">
    {/* Each logical group = one card */}
    <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
      <h2 className="text-base font-bold text-[#0a0a0a] mb-1">{SECTION_TITLE}</h2>
      <p className="text-sm text-[#737373] mb-4">{SECTION_HELPER}</p>
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="x">{LABEL} <span className="text-rose-600">*</span></Label>
          <Input id="x" />
          <p className="text-xs text-[#737373]">{HELPER}</p>
        </div>
      </div>
    </div>
  </form>

  {/* Sticky footer */}
  <div className="fixed bottom-0 left-0 right-0 border-t border-[#e5e5e5] bg-white px-6 py-3 flex justify-end gap-2 z-10">
    <button className="inline-flex items-center gap-1.5 bg-white border border-[#e5e5e5] text-[#0a0a0a] px-3.5 py-2 rounded-[10px] text-[13px] font-medium hover:bg-[#f3f3f3] transition">Cancel</button>
    <button type="submit" className="inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition">Save changes</button>
  </div>
</div>
```

---

## Status pills — quick copy

```tsx
// Active / success
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
</span>

// Pending / warning
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Pending
</span>

// Failed / blocked
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-600">
  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Failed
</span>

// Inactive / archived
<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Inactive
</span>
```

---

## Four required states — every page

```tsx
// 1. Loading (full-page first load)
if (isLoading) return <PageLoader />;  // @/components/ui/loading-spinner

// 2. Error
if (isError) return (
  <div className="p-6">
    <StatusCallout variant="error" onRetry={() => refetch()}>
      Failed to load {RESOURCE}. Please try again.
    </StatusCallout>
  </div>
);

// 3. Permission denied
if (!hasPermission("{resource}:read")) return (
  <div className="flex flex-col items-center justify-center min-h-96 text-[#737373]">
    <Lock className="h-8 w-8 mb-3 opacity-30" />
    <p className="text-sm font-medium text-[#0a0a0a]">You don't have access to this page</p>
    <p className="text-xs mt-1">Ask an admin to grant {PERMISSION_LABEL}.</p>
  </div>
);

// 4. Empty (inside table body)
<tr>
  <td colSpan={COL_COUNT}>
    <div className="flex flex-col items-center justify-center py-16 text-[#737373]">
      <{Icon} className="h-8 w-8 mb-3 opacity-30" />
      <p className="text-sm font-medium text-[#0a0a0a]">No {RESOURCE} yet</p>
      <p className="text-xs mt-1">{HELPFUL_NEXT_STEP}</p>
    </div>
  </td>
</tr>
```

---

## Checklist

Before opening a PR for any page:

- [ ] Outer wrapper: `-m-6 min-h-screen bg-[#f3f3f3] p-6`
- [ ] Header: eyebrow + H1 + subtitle in canonical type scale
- [ ] At most one black primary button per header
- [ ] All numbers: `font-mono tabular-nums`
- [ ] All cards: `rounded-2xl border border-[#e5e5e5] bg-white`
- [ ] No shadcn token classes (`bg-card`, `bg-muted`, `text-muted-foreground`, `text-primary`, etc.)
- [ ] No `dark:` variants
- [ ] No per-page `max-w-[NNNNpx] mx-auto` centering wrapper
- [ ] Loading / error / permission-denied / empty — all four render
- [ ] Stub values render as `—`, never `0`, `N/A`, or fake data
- [ ] Inactive rows: `opacity-60` on the `<tr>`
- [ ] Row actions: `opacity-0 group-hover:opacity-100 transition`
- [ ] Pagination footer matches canonical style
- [ ] `bun check-types` — no new errors
- [ ] Browser verify: golden path + one empty/filter edge case

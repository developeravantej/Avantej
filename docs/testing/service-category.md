# Service Category — Admin Flow Protocol

> **Page:** `/dashboard/service-category/view`
> **Covers behaviors:** SC1, SC2, SC3, SC4, SC5 (plan §4.6)
> **Prerequisite:** Full seed data loaded and admin login completed per `docs/testing/_setup.md` §0, §1, §2.1.
> **Result file:** On execution, write results to `zdocs/testing-results/<YYYY-MM-DD-HHMM>_service-category.md` per `_setup.md` §5.

Run after `_setup.md` login (§2.1 admin). All mutations made by this run are reversed in §5 Cleanup. Do not delete the seeded `E2E Category` — the cross-flow protocol depends on it.

---

## Pre-conditions

Before starting any step below, confirm:

- Admin session cookie present; URL is any `/dashboard/*` route.
- The fixture resolver (`_setup.md §1.2`) returns a non-`undefined` `categoryId` for `E2E Category`.
- No previous-run leftovers: no categories with name starting with `E2E Protocol Category` exist (run §5 Cleanup first if so).

Run this sanity probe via `mcp__claude-in-chrome__javascript_tool` once before §1:

```js
const organizationId = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const res = await fetch("/rpc/serviceCategories/list", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: { organizationId } }),
});
const list = (await res.json()).json;
return {
  total: list.length,
  hasE2E: list.some((c) => c.name === "E2E Category"),
  leftovers: list.filter((c) => c.name.startsWith("E2E Protocol Category")).map((c) => c.id),
};
```

Expected: `hasE2E === true`, `leftovers.length === 0`. If leftovers exist, run §5 Cleanup against each ID first.

---

## §1 — List + search (SC1)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Go to `http://localhost:3001/dashboard/service-category/view` | Page loads; heading "Service Categories"; table visible with at least one row including `E2E Category` | `mcp__claude-in-chrome__navigate` then `mcp__claude-in-chrome__read_page` |
| 2 | Assert at least one row rendered (table not empty) | `document.querySelector('table tbody tr')` not `null`; row count > 0 | `mcp__claude-in-chrome__javascript_tool` |
| 3 | Type `Personal Training` into the search input (top-right, placeholder `Search...`) | Input accepts text; filter is applied immediately (client-side `includesString` filter on `globalFilter` — no debounce, no network refetch) | `mcp__claude-in-chrome__form_input` (target: the input inside `.relative.w-72`) |
| 4 | Confirm no extra `serviceCategories.list` network call fired after typing | `read_network_requests` shows no new POST to `/rpc/serviceCategories/list` between the initial page-load call and the search-filter test | `mcp__claude-in-chrome__read_network_requests` |
| 5 | Read the filtered table; rows containing "Personal Training" substring remain visible; others hidden | Visible row count ≤ initial count; every visible row's name cell includes "personal training" (case-insensitive) | `mcp__claude-in-chrome__javascript_tool` → `[...document.querySelectorAll('table tbody tr')].map(r => r.textContent.toLowerCase())` |
| 6 | Clear search input (empty value) | Full list returns; row count matches step 2 | `mcp__claude-in-chrome__form_input` |

**Note:** If "Personal Training" is not in the seed set, substitute with any substring found in the step-2 row list. The assertion is behavioral (filter works), not content-specific.

---

## §2 — Create category + config dialog (SC2, SC3)

Creates a throwaway category `E2E Protocol Category` with the config fields under test. This row is deleted in §5 Cleanup.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click **Add Service Category** (top-left of the table) | `ServiceFormDialog` opens in `create` mode; form includes fields for name, duration, buffer time, max attendees, incentive, staff weightage, advance booking, cancellation window | `mcp__claude-in-chrome__find` → button text; `javascript_tool` → `.click()` |
| 2 | Fill `name` input (id=`name`) with `E2E Protocol Category` | Value set | `mcp__claude-in-chrome__form_input` |
| 3 | Set `duration` input to `60` (category-level `defaultDuration`) | Value set | `mcp__claude-in-chrome__form_input` |
| 4 | Set `maxAttendees` (category-level `defaultMaxAttendees`) to `1` | Value set | `mcp__claude-in-chrome__form_input` |
| 5 | Set `bufferTimeMinutes` (id=`bufferTimeMinutes`, name=`rules.bufferTimeMinutes`) to `15` | Value = 15 | `mcp__claude-in-chrome__form_input` |
| 6 | Ensure staff weightage sums to 100% (default single row `Head Staff` 100% is fine) | No validation error `Total weightage must equal 100%` | `mcp__claude-in-chrome__read_page` |
| 7 | Click **Save** / **Create** (submit button inside the dialog) | Toast `Service category created successfully`; dialog closes; table invalidates via `serviceCategories.list` query; new `E2E Protocol Category` row appears | `mcp__claude-in-chrome__read_page` + `mcp__claude-in-chrome__read_console_messages` |
| 8 | Confirm the save fired **two** oRPC calls: first `serviceCategories.create`, then `serviceCategoryConfig.upsert` (component calls both sequentially — see `components/forms/service-category-form.tsx:436-474`) | `read_network_requests` shows both POSTs with status 200 | `mcp__claude-in-chrome__read_network_requests` |
| 9 | Capture the new `categoryId` for §3 and §5 (via list fetch, find by name) | Return value non-null UUID; record it in the result file. | `mcp__claude-in-chrome__javascript_tool` → fetch `/rpc/serviceCategories/list` then `list.find(c => c.name === "E2E Protocol Category").id` |
| 10 | Verify config persisted: `serviceCategoryConfig.getByCategoryId` for the new id returns `bufferTimeMinutes === 15`, `defaultDuration === 60`, `defaultMaxAttendees === 1` | Server returns a row with those exact values | `mcp__claude-in-chrome__javascript_tool` → `fetch("/rpc/serviceCategoryConfig/getByCategoryId", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ json: { organizationId, categoryId } }) })` |

**Assertion payload for step 10:**

```js
const res = await fetch("/rpc/serviceCategoryConfig/getByCategoryId", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    json: {
      organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
      categoryId: "<new category id>",
    },
  }),
});
return (await res.json()).json; // expect bufferTimeMinutes === 15
```

---

## §3 — Update buffer to 0 → detail dialog shows "None" (SC4)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | From the table, click the `E2E Protocol Category` row to open the detail dialog | `ServiceCategoryDetailDialog` opens; shows category name, plus read-only fields including "Buffer Time" | `mcp__claude-in-chrome__javascript_tool` → click the row's `<tr>` |
| 2 | Click **Edit** inside the detail dialog | `ServiceFormDialog` re-opens in `edit` mode, pre-filled with duration=60, bufferTimeMinutes=15 | `mcp__claude-in-chrome__read_page` |
| 3 | Change `bufferTimeMinutes` input to `0` | Value = 0 | `mcp__claude-in-chrome__form_input` |
| 4 | Click **Save** | Toast success; dialog closes; config upserted with `bufferTimeMinutes: 0` | `mcp__claude-in-chrome__read_page` |
| 5 | Click the same row again to re-open the detail dialog | Detail dialog renders; "Buffer Time" field displays the text `None` (per `service-category-detail-dialog.tsx:269`: `config.bufferTimeMinutes ? \`${...} min\` : "None"`) | `mcp__claude-in-chrome__javascript_tool` + `read_page` |
| 6 | Verify via API: `serviceCategoryConfig.getByCategoryId` for this category returns `bufferTimeMinutes === 0` | JSON payload confirmed | `mcp__claude-in-chrome__javascript_tool` (same fetch as §2 step 10) |
| 7 | Close the detail dialog | Dialog closes; focus returns to the table | `mcp__claude-in-chrome__javascript_tool` |

---

## §4 — Deactivate → row disappears from default list (SC5)

The list query returns only active rows by default (see `serviceCategories.list` handler — filter is optional but the page does not pass `isActive: false`). Deactivate is a soft-delete via `serviceCategories.update({ isActive: false })`.

There is no Delete button in the row itself. The flow is: click the row → `ServiceCategoryDetailDialog` opens → the **Delete** button lives **inside that dialog** (`data-table.tsx:233-243` passes `handleDeleteCategory` as `onDelete`). `handleDeleteCategory` calls `serviceCategories.update({ id, isActive: false })`.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click the `E2E Protocol Category` row | `ServiceCategoryDetailDialog` opens with the category's details and a Delete / Deactivate button in its footer | `mcp__claude-in-chrome__javascript_tool` → click the `<tr>` |
| 2 | Click the **Delete** (or Deactivate) button inside the detail dialog | Toast `Category deactivated`; dialog closes; table refreshes via `onSuccess` invalidation; `E2E Protocol Category` row is **no longer visible** in the table | `mcp__claude-in-chrome__find` + `javascript_tool` click; then `mcp__claude-in-chrome__read_page` |
| 3 | Confirm via API: `serviceCategories.list({ organizationId })` (default, no `isActive` filter) does **not** include the row | Returned array has no row with the recorded id | `mcp__claude-in-chrome__javascript_tool` → fetch `/rpc/serviceCategories/list` |
| 4 | Confirm the row is soft-deleted (not hard-deleted): `serviceCategories.list({ organizationId, isActive: false })` returns the row with `isActive: false` | Payload includes the category with `isActive === false` | `mcp__claude-in-chrome__javascript_tool` → same fetch but add `isActive: false` to the input |

---

## §5 — Cleanup

Reverses every mutation this run made. Must run even on step failure.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | If `E2E Protocol Category` still exists with `isActive: true` (happens if §4 didn't run or rolled back), deactivate it via `serviceCategories.update({ organizationId, id, isActive: false })` | Returns the updated row with `isActive === false` | `mcp__claude-in-chrome__javascript_tool` |
| 2 | Re-activate any seeded categories that this run accidentally deactivated. Confirm by re-running the fixture resolver (`_setup.md §1.2`) and asserting `categoryId` (for `E2E Category`) resolves. If it does not, call `serviceCategories.update` with `{ id: <E2E Category id>, isActive: true }` to restore. | Resolver returns defined `categoryId`; seeded row visible in default list | `mcp__claude-in-chrome__javascript_tool` |
| 3 | Final assertion: `serviceCategories.list({ organizationId })` (active only) contains `E2E Category` and does **not** contain `E2E Protocol Category` | Correct post-run state | `mcp__claude-in-chrome__javascript_tool` |

**Note:** There is no hard-delete procedure for service categories. We do not attempt one — the row stays in the DB with `isActive: false`. Subsequent runs will treat it as a leftover (Pre-conditions §3 already handles this).

---

### See Also

- Integration of these three cascade levels (override → service → category default → 0) is verified end-to-end in `cross-flow_service-to-booking.md §7`.
- Raw buffer enforcement lives in `appointment-view.md §4`.

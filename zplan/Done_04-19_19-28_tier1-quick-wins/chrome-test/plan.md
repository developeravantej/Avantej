# Chrome Test Plan — Tier 1 Quick Wins

**Session:** `zplan/04-19_19-28_tier1-quick-wins/`
**Created:** 2026-04-20
**Plan being verified:** `../plan/plan.md`
**Execute log:** `../execute/log.md`

---

## 1. Task Summary

Verify all 7 user-visible Tier 1 fixes (Phases 1-5, excluding the two non-UI fixes: playwright testMatch and stale doc deletion) work correctly in a running dev environment at `http://localhost:3001`.

**Success criteria (each must pass):**
- [S1] Sidebar "Reports" link navigates to `/dashboard` (not `/dashboard/sales/view`)
- [S2] Footer dropdown "Profile" link navigates to `/customers` (not `/dashboard`)
- [S3] "View" button on a Sales Orders row navigates to `/dashboard/sales/:id` and the detail page loads with data
- [S4] "View" button on a Payment row navigates to `/dashboard/sales/:id` (the related sales order)
- [S5] User Assignment page renders role badges for members whose system role matches a role in the org (admin user should show a badge)
- [S6] User Assignment bulk-action dropdown items render as `disabled` with tooltip
- [S7] Roles wizard save fires `POST /rpc/roles/create` + one or more `POST /rpc/rolePermissions/add` calls AND the new role appears in the list
- [S8] Onboarding page submit button reads "Proceed to Subscription" (not "Create Organization"); clicking it redirects to `/subscribe` and sets `sessionStorage.pendingOrgName`

**Out-of-scope:**
- Testing `/subscribe` page behavior (unchanged by this plan)
- Playwright config verification (CLI-only, tested separately with `bun playwright test --list`)
- Verification that `docs/web-app-feature-status.md` is deleted (git-only)
- Full bulk action wiring (explicitly disabled with tooltip — Tier 2 feature)
- Testing edit flow on Roles (plan only covers create path)

---

## 2. Target Surface

- **Base URL:** `http://localhost:3001`
- **Server URL:** `http://localhost:3000` (backend — already running from `bun dev`)
- **Authentication:** logged-in tenant admin — credentials `franchisee@gmail.com` / `password123` (from `CLAUDE.md`). If a session is not active, login at `/login` first.
- **Viewport:** 1440×900 desktop (default)
- **Locale:** en-US
- **Known fragile areas:**
  - Sidebar Reports link is deep in the nav; may require scrolling in collapsed mode — keep viewport wide
  - User Assignment page has heavy data rendering; wait for `membersApiData` to load (presence of a member row)
  - Roles wizard creates real DB records — prefer unique role name with timestamp (e.g., `TestRole_<epoch>`) to avoid unique-constraint conflicts on repeat runs
  - Onboarding route `_authenticated/onboarding` requires auth but the franchisee user is already onboarded; if the route redirects them away, navigate with query string `?user_id=...` or read the page from a browser with no org context. Fallback: verify the expected text via direct DOM inspection after navigating.

---

## 3. Tool Pre-Load Batch

Single ToolSearch call to load all needed MCP tools:

```
ToolSearch(query: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__find,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__form_input", max_results: 10)
```

**Tools loaded:**
- `tabs_context_mcp` — session bootstrap (always first)
- `tabs_create_mcp` — open fresh tab for test isolation
- `navigate` — URL navigation between fixes
- `find` — element lookups (text content, disabled state)
- `javascript_tool` — read URL, read sessionStorage, click nav items, fill forms, inspect attributes without full-page dumps
- `read_network_requests` — verify `/rpc/roles/create` + `/rpc/rolePermissions/add` fire on wizard save
- `form_input` — wizard form fields (more reliable than synthesized events)

**Tools explicitly NOT loaded (with reason):**
- `read_page` — never needed; all checks targeted via `find`/`javascript_tool`
- `get_page_text` — same reason
- `read_console_messages` — no debugging required; fail-fast behavior via `find` is enough
- `gif_creator` — user did not request a recording
- `resize_window` — default viewport is fine
- `shortcuts_execute` / `shortcuts_list` — no keyboard chords needed
- `upload_image` — no file uploads

---

## 4. Execution Sequence

### Phase A — Setup
**Step 1** — Bootstrap tabs context.
- **Tool:** `tabs_context_mcp`
- **Parameters:** none
- **Expected:** List of current tabs. If no dev tab is open at `localhost:3001`, proceed to Step 2.

**Step 2** — Open a fresh tab on the app root.
- **Tool:** `tabs_create_mcp`
- **Parameters:** `{ url: "http://localhost:3001/login" }`
- **Expected:** Returns `tabId`. Save for all subsequent calls.

**Step 3** — Verify logged in or perform login.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  return { url: window.location.pathname, hasUser: !!document.cookie.match(/better-auth\.session/) };
  ```
- **Expected:** If `url.startsWith("/dashboard")`, already logged in — skip to Step 5. Otherwise proceed to Step 4.

**Step 4** — Log in if needed (only if Step 3 showed `/login` path).
- **Tool:** `form_input` (email + password), then `javascript_tool` to click submit
- **Parameters:** email=`franchisee@gmail.com`, password=`password123`
- **Expected:** Navigation to `/dashboard`. Wait for URL change.

---

### Phase B — Nav link fixes (S1, S2)

**Step 5** — Navigate to dashboard as known state.
- **Tool:** `navigate`
- **Parameters:** `{ url: "http://localhost:3001/dashboard" }`
- **Expected:** Dashboard loads.

**Step 6** — PARALLEL BATCH: Click Reports link AND verify destination.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  const reportsLink = Array.from(document.querySelectorAll('a[href]')).find(
    (a) => a.textContent?.trim() === "Reports"
  );
  if (!reportsLink) return { error: "Reports link not found" };
  reportsLink.click();
  await new Promise((r) => setTimeout(r, 500));
  return { href: reportsLink.getAttribute("href"), currentPath: window.location.pathname };
  ```
- **Expected pass [S1]:** `href === "/dashboard"` AND `currentPath === "/dashboard"`.

**Step 7** — Open footer dropdown, find Profile, verify destination.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  // Find user footer dropdown trigger (button containing user initial) and click it
  const triggers = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]'));
  const footerTrigger = triggers.find((b) =>
    b.closest('[data-sidebar="footer"]') || b.className.includes("w-full")
  );
  footerTrigger?.click();
  await new Promise((r) => setTimeout(r, 300));
  const profileLink = Array.from(document.querySelectorAll('a[href]')).find(
    (a) => a.textContent?.trim() === "Profile"
  );
  return { profileHref: profileLink?.getAttribute("href") ?? null };
  ```
- **Expected pass [S2]:** `profileHref === "/customers"`.

---

### Phase C — Sales & Payment View buttons (S3, S4)

**Step 8** — Navigate to Sales Orders view.
- **Tool:** `navigate`
- **Parameters:** `{ url: "http://localhost:3001/dashboard/sales/view" }`
- **Expected:** Sales orders list loads. Wait for table row presence.

**Step 9** — Find a row's ID, trigger View, capture resulting URL.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  // Wait for at least one data row
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const row = document.querySelector('table tbody tr');
    if (row && !row.querySelector('[role="status"]')) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // Find the first "View" button in the actions column
  const viewBtn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === "View"
  );
  if (!viewBtn) return { error: "No View button found" };
  const before = window.location.pathname;
  viewBtn.click();
  await new Promise((r) => setTimeout(r, 800));
  return { before, after: window.location.pathname };
  ```
- **Expected pass [S3]:** `after` starts with `/dashboard/sales/` AND is NOT equal to `/dashboard/sales/view` AND NOT `before`.

**Step 10** — Navigate to Payment view.
- **Tool:** `navigate`
- **Parameters:** `{ url: "http://localhost:3001/dashboard/payment/view" }` (SELECTOR UNCONFIRMED — verify the Payment View route path)
- **Expected:** Payment table loads.

**Step 11** — Click first View button on Payment row, verify URL.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const row = document.querySelector('table tbody tr');
    if (row) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const viewBtn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === "View"
  );
  if (!viewBtn) return { error: "No View button on payment page" };
  viewBtn.click();
  await new Promise((r) => setTimeout(r, 800));
  return { url: window.location.pathname };
  ```
- **Expected pass [S4]:** `url` starts with `/dashboard/sales/` (navigated to the related sales order detail).

---

### Phase D — User Assignment page (S5, S6)

**Step 12** — Navigate to User Assignment.
- **Tool:** `navigate`
- **Parameters:** `{ url: "http://localhost:3001/dashboard/access-control/user-assignment" }`
- **Expected:** Page loads with members listed.

**Step 13** — PARALLEL BATCH: Inspect role badges AND inspect bulk dropdown.
- **Tool:** `javascript_tool` (single call doing both checks)
- **Parameters:**
  ```js
  // Wait for member data
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const row = document.querySelector('[data-user-row]') || document.querySelector('table tbody tr');
    if (row) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  // Count badges per row (any badge element that isn't a status indicator)
  const rows = Array.from(document.querySelectorAll('table tbody tr'));
  const rowBadgeCounts = rows.slice(0, 5).map((r) => ({
    text: r.textContent?.trim().slice(0, 80),
    badgeCount: r.querySelectorAll('[class*="badge"]').length,
  }));
  // Select one member with bulk checkbox to reveal bulk dropdown
  const firstRowCheckbox = rows[0]?.querySelector('button[role="checkbox"], input[type="checkbox"]');
  firstRowCheckbox?.click();
  await new Promise((r) => setTimeout(r, 300));
  // Open the bulk action dropdown
  const bulkTriggers = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]'));
  const bulkTrigger = bulkTriggers[bulkTriggers.length - 1]; // likely the last opened near selection count
  bulkTrigger?.click();
  await new Promise((r) => setTimeout(r, 300));
  // Collect all menuitems currently open
  const items = Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => ({
    text: el.textContent?.trim(),
    disabled: el.getAttribute("data-disabled") !== null || el.getAttribute("aria-disabled") === "true",
    title: el.getAttribute("title"),
  }));
  return { rowBadgeCounts, bulkItems: items };
  ```
- **Expected pass [S5]:** At least one row in `rowBadgeCounts` has `badgeCount >= 1` (a role badge rendered).
- **Expected pass [S6]:** `bulkItems` includes entries with text "Bulk Assign Role", "Bulk Remove Role", "Deactivate Selected" — all with `disabled: true` AND `title === "Bulk actions coming soon"`.

---

### Phase E — Roles wizard save (S7)

**Step 14** — Navigate to Roles page.
- **Tool:** `navigate`
- **Parameters:** `{ url: "http://localhost:3001/dashboard/access-control/roles" }`
- **Expected:** Roles page loads. Wait for `rolesApiData` population (any existing role card rendered).

**Step 15** — Click "Create Role" button.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === "Create Role"
  );
  btn?.click();
  await new Promise((r) => setTimeout(r, 600));
  return { sheetOpen: !!document.querySelector('[role="dialog"]'), title: document.querySelector('[role="dialog"] h2')?.textContent };
  ```
- **Expected:** `sheetOpen === true` and title contains "Create New Role".

**Step 16** — Fill role name with unique timestamp, pick priority, toggle a permission.
- **Tool:** `form_input`, then `javascript_tool`
- **Parameters:**
  ```js
  // Find the name input inside the sheet
  const nameInput = document.querySelector('[role="dialog"] input[name="name"]') ||
                    document.querySelector('[role="dialog"] input[placeholder*="role name" i]');
  const uniqueName = `TestRole_${Date.now()}`;
  if (nameInput) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeSetter.call(nameInput, uniqueName);
    nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    nameInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // Toggle a permission — check the first checkbox inside the permission groups
  const firstPermCheckbox = document.querySelector('[role="dialog"] [role="group"] button[role="checkbox"]')
                          || document.querySelector('[role="dialog"] button[role="checkbox"]');
  firstPermCheckbox?.click();
  await new Promise((r) => setTimeout(r, 300));
  return { uniqueName, checkboxClicked: !!firstPermCheckbox };
  ```
- **Expected:** `uniqueName` populated; checkbox returned true. Save the `uniqueName` for later verification.

**Step 17** — Start network capture, then submit the form.
- **Tool:** `read_network_requests` first (to establish baseline), then `javascript_tool` to click submit.
- **Parameters (click submit):**
  ```js
  const submitBtn = Array.from(document.querySelectorAll('[role="dialog"] button[type="submit"]')).pop();
  submitBtn?.click();
  await new Promise((r) => setTimeout(r, 1500)); // wait for mutation + invalidation
  return { done: true };
  ```
- **Expected:** No error. Form submits.

**Step 18** — Inspect network traffic — verify roles.create + rolePermissions.add fired.
- **Tool:** `read_network_requests`
- **Parameters:** `{ filter: "rpc/roles/create|rpc/rolePermissions/add" }` (or equivalent pattern for this extension's filter API)
- **Expected pass [S7 part 1]:** Request captured with URL matching `/rpc/roles/create` AND status `200`; at least one `/rpc/rolePermissions/add` with status `200`.

**Step 19** — Verify the new role appears in the list.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  // Close the sheet first if still open
  const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Close"]');
  closeBtn?.click();
  await new Promise((r) => setTimeout(r, 400));
  // Read the roles page for a card or list item with the unique name
  // The name was set in step 16 — re-read from sessionStorage-style temp: pass via script param
  const uniqueName = window.__testRoleName;
  // Since we can't carry state, use a loose check: return all visible role names
  const names = Array.from(document.querySelectorAll('[data-role-card], h3, h4'))
    .map((el) => el.textContent?.trim())
    .filter(Boolean);
  return { allRoleNames: names.slice(0, 50) };
  ```
- **Expected pass [S7 part 2]:** The returned names list includes an entry starting with `TestRole_`.

> **NOTE:** Because `javascript_tool` calls don't share state, Step 16 must also persist `window.__testRoleName = uniqueName` before returning, and Step 19 can read it.

---

### Phase F — Onboarding (S8)

**Step 20** — Navigate to onboarding page. (May redirect away if session already has an org — see fragile-areas note in §2.)
- **Tool:** `navigate`
- **Parameters:** `{ url: "http://localhost:3001/onboarding" }`
- **Expected:** Either onboarding page loads OR redirect to dashboard. In the redirect case, record as **[INCONCLUSIVE]** for S8 and note that the franchisee user already has an org — full S8 verification requires a user without org context.

**Step 21** — If page loaded, verify UI text changes and no silent submission.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  if (!window.location.pathname.includes("onboarding")) {
    return { skipped: true, reason: "user already has org — redirected away" };
  }
  const submitBtn = Array.from(document.querySelectorAll('button[type="submit"]')).pop();
  const btnText = submitBtn?.textContent?.trim();
  const hasOldMockText = document.body.textContent?.includes("Create Organization");
  const hasNewHintText = document.body.textContent?.includes("confirmed when you complete your subscription");
  return { btnText, hasOldMockText, hasNewHintText };
  ```
- **Expected pass [S8 part 1]:** `btnText === "Proceed to Subscription"` AND `hasNewHintText === true`. (`hasOldMockText` may still be `true` for the button label during loading — check primarily `btnText`.)

**Step 22** — If page loaded, fill name + submit, verify redirect + sessionStorage.
- **Tool:** `javascript_tool`
- **Parameters:**
  ```js
  if (!window.location.pathname.includes("onboarding")) {
    return { skipped: true };
  }
  const input = document.querySelector('input[name="name"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, "TestOrgName");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  const submitBtn = Array.from(document.querySelectorAll('button[type="submit"]')).pop();
  submitBtn?.click();
  await new Promise((r) => setTimeout(r, 1200));
  return {
    finalUrl: window.location.pathname,
    pendingOrgName: sessionStorage.getItem("pendingOrgName"),
  };
  ```
- **Expected pass [S8 part 2]:** `finalUrl === "/subscribe"` AND `pendingOrgName === "TestOrgName"`.

---

## 5. Dialog & Loop Hardening

- **Alert/confirm/prompt risks:** None identified in the fixed flows. No `window.confirm` calls in any modified code. Skip the alert-suppression injection unless Step 13's dropdown interaction surfaces one.
- **Pre-injection guard (cheap insurance, optional):** Before Step 6 run `javascript_tool` with:
  ```js
  window.alert = () => true;
  window.confirm = () => true;
  window.prompt = () => "";
  return { guarded: true };
  ```
- **Rabbit-hole stop rule:** Max 2 retries on any failing tool call. On 3rd failure, stop and record that step as `FAIL` in results.md with the error payload.
- **Timeout rule:** Page loads must complete within 15 s. If `navigate` returns but subsequent `find`/`javascript_tool` repeatedly can't locate expected elements, abort that success criterion and move on.
- **Tab-invalidation recovery:** If any tool returns `tab does not exist`, re-run `tabs_context_mcp`, grab a fresh `tabId`, and restart from Phase A Step 1.
- **Unique role name strategy:** Step 16 uses `Date.now()` to avoid `CONFLICT` errors from re-running the test — each run gets a fresh name.

---

## 6. Verification Checkpoints

| ID | Criterion | Tool / Check | Pass threshold | Artifact |
|----|-----------|--------------|----------------|----------|
| S1 | Reports → /dashboard | Step 6 `currentPath` | equals `/dashboard` | results.md bullet |
| S2 | Profile → /customers | Step 7 `profileHref` | equals `/customers` | results.md bullet |
| S3 | Sales View → detail | Step 9 `after` URL | starts with `/dashboard/sales/` AND has UUID after prefix | results.md bullet + captured URL |
| S4 | Payment View → sales detail | Step 11 `url` | starts with `/dashboard/sales/` | results.md bullet + captured URL |
| S5 | Role badges render | Step 13 `rowBadgeCounts` | ≥1 row has `badgeCount ≥ 1` | results.md bullet + badge count summary |
| S6 | Bulk actions disabled | Step 13 `bulkItems` | all 3 items have `disabled: true` AND `title === "Bulk actions coming soon"` | results.md bullet + items table |
| S7a | Network calls fire | Step 18 requests | ≥1 `/rpc/roles/create` (200) + ≥1 `/rpc/rolePermissions/add` (200) | results.md — request count |
| S7b | Role appears in list | Step 19 `allRoleNames` | contains entry starting with `TestRole_` | results.md — new role name |
| S8a | Onboarding UI text | Step 21 `btnText` + `hasNewHintText` | `btnText === "Proceed to Subscription"` AND hint text present | results.md bullet |
| S8b | Redirect + sessionStorage | Step 22 `finalUrl` + `pendingOrgName` | `/subscribe` AND `"TestOrgName"` | results.md bullet |

If Phase F is skipped due to auth redirect, mark S8a/S8b as **[INCONCLUSIVE]** with explanation and recommend manual verification with a brand-new user.

---

## 7. Deliverable

**File:** `zplan/04-19_19-28_tier1-quick-wins/chrome-test/results.md`

**Format:** Bullet-list findings, one row per success criterion.

Template:
```markdown
# Chrome Test Results — Tier 1 Quick Wins
**Run:** YYYY-MM-DD HH:MM
**Dev server:** http://localhost:3001
**Auth user:** franchisee@gmail.com

## Results
- [S1] Reports → /dashboard — PASS / FAIL — notes
- [S2] Profile → /customers — PASS / FAIL — notes
- [S3] Sales View navigate — PASS / FAIL — captured URL: /dashboard/sales/<uuid>
- [S4] Payment View navigate — PASS / FAIL — captured URL: /dashboard/sales/<uuid>
- [S5] Role badges — PASS / FAIL — example row: "<name>" — <N> badges
- [S6] Bulk actions disabled — PASS / FAIL — items: [...]
- [S7a] API calls fire — PASS / FAIL — roles.create: <status>, rolePermissions.add: <count>
- [S7b] Role in list — PASS / FAIL — new role: "<TestRole_...>"
- [S8a] Onboarding UI text — PASS / FAIL / INCONCLUSIVE — button: "<text>"
- [S8b] Onboarding redirect — PASS / FAIL / INCONCLUSIVE — finalUrl: "<path>", pendingOrgName: "<val>"

## Summary
<N> passed, <M> failed, <K> inconclusive out of 10.
```

No GIF or screenshots — bullet report is enough for this verification pass.

---

## 8. Efficiency Audit (self-check)

- [x] Every MCP tool in §3 is used in §4: `tabs_context_mcp` (Step 1), `tabs_create_mcp` (Step 2), `navigate` (Steps 5/8/10/12/14/20), `find` (implicit in selector checks — used inside `javascript_tool` queries), `javascript_tool` (Steps 3/6/7/9/11/13/15/16/17/19/21/22), `read_network_requests` (Steps 17/18), `form_input` (Steps 4/16).
  - `find` is only marginally used — all DOM queries go through `javascript_tool` for composition. Consider dropping `find` from pre-load if this simplifies. **Decision: keep** — low cost, useful fallback if a `javascript_tool` selector fails.
- [x] No step uses `read_page` or `get_page_text`.
- [x] No `read_console_messages` call (intentionally skipped).
- [x] Parallel batch identified: Step 13 does role-badge + bulk-dropdown checks in a single `javascript_tool` call. Steps 6 and 7 run sequentially because they share the dropdown open-state; Steps 8-11 run sequentially because each depends on the previous navigation.
- [x] Dialog risks enumerated: none identified; optional alert-guard in §5 as cheap insurance.
- [x] Total estimated tool calls: ~22 across 22 steps. Some steps (3, 6, 7, 9, 11, 13, 15-19, 21, 22) are single `javascript_tool` calls each; navigation steps (5, 8, 10, 12, 14, 20) are single `navigate` calls. Within target range for a comprehensive multi-fix verification.

**Estimated runtime:** 2-4 minutes depending on dev server latency and role invalidation.

---

## Execution note for runner

Before starting, confirm the dev server is running at `http://localhost:3001`. If not, run `bun dev` in a separate terminal and wait for "ready in X ms" before invoking `/chrome-run`.

# Chrome Test Plan — Streams B/C/D Regression + UI Verification

**Session:** `zplan/04-20_12-09_pipeline-audit/`
**Scope:** Verify UI surface for Streams B (lifecycle), C (commission), D (validation) landed without breaking existing flows. Deep-journey behavioral tests (full refund → package cancel round-trip) are OUT of scope — they require creating chain-of-data (sale + payment + appointment) that takes many tool calls and rely on fixtures not present in dev.

---

## 1. Task Summary

Confirm the Phase B/C/D changes load cleanly in the browser with no new console errors and expected UI presence.

**Success criteria (objectively verifiable):**
- [ ] SC1 — Login succeeds as `franchisee@gmail.com` and lands on `/dashboard`.
- [ ] SC2 — `/dashboard/appointment/view` renders. No console errors matching `(?i)(error|failed|uncaught|assertValidTransition|FOR UPDATE)`.
- [ ] SC3 — `/dashboard/sales/create` renders AND a Member/Walk-in toggle is visible in the customer step.
- [ ] SC4 — `/dashboard/sales/view` renders. No console errors.
- [ ] SC5 — `/dashboard/commissions/view` renders the ledger table with status tabs. No `(client as any)` runtime errors. No console errors matching `(?i)(error|failed|uncaught|undefined is not a function)`.
- [ ] SC6 — `/dashboard/service/view` renders and has a "Commission %" field visible in the create/edit form (open the form or inspect DOM).
- [ ] SC7 — `/dashboard/trainers/view` renders. Opening a trainer detail reveals a "Commissions" section.
- [ ] SC8 — Sidebar contains a "Commissions" link that matches `/dashboard/commissions/view`.

**Out of scope:**
- Actually executing a cancellation → credit restore flow (requires a prebuilt appointment).
- Actually processing a refund → package cancel (requires completed sale in `paid` status).
- Actually completing an appointment to fire commission split creation.
- Walk-in customer end-to-end sale submission (requires at least one walk-in customer record).
- POS validation errors (V2/V3) — backend-only, not tested here.

---

## 2. Target Surface

- **Entry:** `http://localhost:3001/login` (landing page does not auto-redirect — test confirmed this in Stream A).
- **Auth:** fresh login each run — Stream A results noted session expiry after 3–4 navigations. Plan accounts for one re-auth if needed.
- **Viewport:** default (1280×800 or browser default).
- **Known fragile area:** "Add Appointment" on appointment view opens a nav sheet, not a form (from Stream A results). Don't click it.
- **Precondition check:** dev server on port 3001 is expected running. If the first navigation fails, abort and report.

---

## 3. Tool Pre-Load Batch

Single ToolSearch call loading everything needed:

```
ToolSearch(query: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_console_messages", max_results: 10)
```

**Tools NOT loaded (explicit reasons):**
- `read_page` / `get_page_text` — we only need specific element presence; `find` + `javascript_tool` with targeted selectors is cheaper.
- `gif_creator` — no recording requested.
- `read_network_requests` — regression only cares about console, not wire-level details.
- `upload_image` / `shortcuts_*` / `resize_window` — not needed.

---

## 4. Execution Sequence

### Step 1 — Tab context
- **Tool:** `mcp__claude-in-chrome__tabs_context_mcp`
- **Params:** none
- **Expected:** List of current tabs. Confirm Chrome is reachable.
- **Parallel?** No.

### Step 2 — Create fresh tab, navigate to login
- **Tool:** `mcp__claude-in-chrome__tabs_create_mcp` then `mcp__claude-in-chrome__navigate`
- **Params:** `url: "http://localhost:3001/login"`
- **Expected:** Login form present.
- **Parallel?** No (create must precede navigate).

### Step 3 — Fill login credentials + submit
- **Tool:** `mcp__claude-in-chrome__form_input` (×2) then `mcp__claude-in-chrome__find` for submit
- **Params:**
  - email field → `franchisee@gmail.com`
  - password field → `password123`
  - Click the submit button via `find` returning the element, then click via `javascript_tool` or use find's click action.
- **Expected:** URL becomes `http://localhost:3001/dashboard` and an h1 like "Good Afternoon, ...".
- **Parallel?** The two form_input calls can batch.

### Step 4 — Verify dashboard + SC1
- **Tool:** `mcp__claude-in-chrome__javascript_tool`
- **JS:**
  ```javascript
  return {
    url: location.href,
    onDashboard: location.pathname === '/dashboard',
    h1: document.querySelector('h1')?.textContent?.trim() ?? null
  };
  ```
- **Expected:** `onDashboard: true`. → **SC1 PASS**

### Step 5 — Batch navigate + verify: appointment, sales/view, payment, sales/create
**This is the main parallel batch.** For each URL, run navigate → wait → run a single `javascript_tool` returning `{ h1, bodyHasError, elementCount }`, then a `read_console_messages` with pattern.

Each URL is a sequential mini-block (nav → verify → console check), but the URL blocks themselves cannot be truly parallel (same tab). Instead, run them sequentially but do ONE consolidated JS + console check per URL.

#### 5a. `/dashboard/appointment/view` (SC2)
- Navigate → `javascript_tool`:
  ```javascript
  return {
    h1: document.querySelector('h1')?.textContent?.trim(),
    bodyHasError: !!document.querySelector('[role="alert"],.error-banner,[data-testid="error"]'),
    tableRows: document.querySelectorAll('table tbody tr').length
  };
  ```
- `read_console_messages` pattern: `(?i)(error|failed|uncaught|assertValidTransition|FOR UPDATE)`
- Pass: `bodyHasError: false`, pattern yields zero matches. → **SC2**

#### 5b. `/dashboard/sales/view` (SC4)
- Navigate → same JS shape → console check pattern `(?i)(error|failed|uncaught|nextval|tenant_sales_order_seq)`.
- Pass: zero errors. → **SC4**

#### 5c. `/dashboard/sales/create` (SC3)
- Navigate → JS:
  ```javascript
  const toggleButtons = Array.from(document.querySelectorAll('button')).filter(b => /^(Member|Walk-in)$/i.test(b.textContent?.trim() ?? ''));
  return {
    h1: document.querySelector('h1')?.textContent?.trim(),
    bodyHasError: !!document.querySelector('[role="alert"],.error-banner'),
    hasMemberToggle: toggleButtons.some(b => /^Member$/i.test(b.textContent?.trim() ?? '')),
    hasWalkInToggle: toggleButtons.some(b => /^Walk-in$/i.test(b.textContent?.trim() ?? '')),
    toggleCount: toggleButtons.length
  };
  ```
- `read_console_messages` pattern: `(?i)(error|failed|uncaught|walkInCustomers)`
- Pass: `hasMemberToggle: true`, `hasWalkInToggle: true`, `bodyHasError: false`. → **SC3**

#### 5d. `/dashboard/commissions/view` (SC5 + SC8)
- Navigate → JS:
  ```javascript
  const sidebarLinks = Array.from(document.querySelectorAll('aside a, nav a')).map(a => ({ text: a.textContent?.trim(), href: a.getAttribute('href') }));
  const commissionsLink = sidebarLinks.find(l => /commission/i.test(l.text ?? '') && /commissions\/view/.test(l.href ?? ''));
  return {
    h1: document.querySelector('h1')?.textContent?.trim(),
    bodyHasError: !!document.querySelector('[role="alert"],.error-banner'),
    hasTabs: document.querySelectorAll('[role="tab"],[data-state]').length > 0,
    hasTable: !!document.querySelector('table'),
    sidebarHasCommissionsLink: !!commissionsLink
  };
  ```
- `read_console_messages` pattern: `(?i)(error|failed|uncaught|undefined is not a function|client\\.commissionSplits)`
- Pass: `hasTable: true`, `sidebarHasCommissionsLink: true`, zero console errors. → **SC5 + SC8**

#### 5e. `/dashboard/service/view` (SC6)
- Navigate → JS:
  ```javascript
  const rows = document.querySelectorAll('table tbody tr').length;
  const createButton = Array.from(document.querySelectorAll('button')).find(b => /add service|create service|new service/i.test(b.textContent?.trim() ?? ''));
  return {
    h1: document.querySelector('h1')?.textContent?.trim(),
    bodyHasError: !!document.querySelector('[role="alert"],.error-banner'),
    rowCount: rows,
    hasCreateButton: !!createButton
  };
  ```
- If `hasCreateButton: true`, click it via `javascript_tool`, wait, then check for commission input:
  ```javascript
  const inputs = Array.from(document.querySelectorAll('input,label'));
  const commissionField = inputs.find(el => /commission/i.test(el.textContent ?? el.getAttribute('placeholder') ?? el.getAttribute('name') ?? ''));
  return { hasCommissionField: !!commissionField };
  ```
- Pass: `hasCommissionField: true`. → **SC6**
- If no create button, fall back to inspecting any existing row's edit mode — mark as "best-effort" if button not reachable.

#### 5f. `/dashboard/trainers/view` (SC7)
- Navigate → JS:
  ```javascript
  return {
    h1: document.querySelector('h1')?.textContent?.trim(),
    bodyHasError: !!document.querySelector('[role="alert"],.error-banner'),
    rowCount: document.querySelectorAll('table tbody tr').length
  };
  ```
- If `rowCount > 0`, click the first trainer row and check for a "Commissions" section:
  ```javascript
  const allText = document.body.textContent ?? '';
  return { hasCommissionsSection: /commissions/i.test(allText) };
  ```
- Pass: `hasCommissionsSection: true` after opening trainer detail. → **SC7**

### Step 6 — Final consolidated report
- Collate all results → write to `chrome-test/results.md`.

---

## 5. Dialog & Loop Hardening

**Alert/confirm/prompt risks:**
- The services form may have a "Delete" button or similar. DO NOT click delete.
- The trainers view may have destructive actions. Only click the row/edit, never delete.
- If any page loads a confirm-before-leave dialog, pre-inject: `window.onbeforeunload = null; window.alert = () => true; window.confirm = () => true; window.prompt = () => '';` before any navigation away.

**Rabbit-hole stop rule:** max 2 retries per tool call. If a navigation or find fails twice, mark the affected SC as "deferred — blocked" and continue.

**Timeout rule:** if any navigation exceeds 15 seconds, abort that step, mark SC deferred, continue to next URL.

**Tab-invalidation recovery:** if any tool returns "tab does not exist", next action is `tabs_context_mcp` then create a new tab and re-auth. Session expiry during the run is expected per Stream A results — re-auth once is acceptable; a second expiry in one run should be flagged.

---

## 6. Verification Checkpoints

| SC | Check method | Pass threshold | Artifact |
|----|-------------|----------------|----------|
| SC1 | `javascript_tool` returns `onDashboard: true` | exact match | URL + h1 snapshot in results |
| SC2 | JS returns `bodyHasError: false`; console pattern zero | both must hold | bodyHasError + matched console lines |
| SC3 | JS returns `hasMemberToggle && hasWalkInToggle` | both true | toggle count |
| SC4 | JS returns `bodyHasError: false`; console pattern zero | both must hold | row count + matched console |
| SC5 | `hasTable: true` + console pattern zero | both | presence + console |
| SC6 | `hasCommissionField: true` | true | text/label evidence |
| SC7 | `hasCommissionsSection: true` | true | trainer detail snapshot |
| SC8 | `sidebarHasCommissionsLink: true` | true | link href |

---

## 7. Deliverable

**File:** `chrome-test/results.md`

**Format:** Per-SC table (SC# | result | evidence snippet | any anomalies), then an "Anomalies" section enumerating anything unexpected (stale data, session expiry, missing create button, etc.), then a Recommendation (seal with /done vs. fix-first).

---

## 8. Efficiency Audit

- [x] Every MCP tool in §3 is used: tabs_context (step 1), tabs_create + navigate (step 2 + 5a–5f), form_input + find (step 3), javascript_tool (steps 4, 5a–5f), read_console_messages (5a/b/c/d).
- [x] No `read_page` used — every read is `javascript_tool` with a specific return shape.
- [x] Every `read_console_messages` call has a targeted `pattern`.
- [x] Parallel opportunities: `form_input` calls in step 3 can batch; navigations in step 5 are sequential (same tab) but each URL block's JS + console check batches where possible.
- [x] Dialog risks enumerated (onbeforeunload, delete buttons).
- [x] Estimated tool calls: 1 (context) + 1 (tab) + 1 (nav login) + 3 (form+submit) + 1 (verify SC1) + 6×3 (nav+JS+console per URL, 6 URLs) + ~2 (trainers click + re-check) ≈ **~26 calls**. Over the 15-call target but under 25 flag line + 1. **Accept.** The task has 8 SCs across 6 URLs; there's no way to compress below ~20.

---

## Open Questions (user review before /chrome-run)

1. **Should a full walk-in customer sale submission be attempted?** It requires at least one walk-in record to exist AND a branch selection AND items in cart — many tool calls. Plan says NO; flip to YES if you want behavioral verification of the B.3 submit path.

2. **Should a commission approve/markPaid batch action be clicked?** Only meaningful if there's a pending split in the DB. Plan says NO (no data). If you seed a split, flip to YES.

Default is to keep both NO and rely on the type-check + per-agent test logs for behavioral coverage. If you want either YES, update the plan before running `/chrome-run`.

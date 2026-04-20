# Chrome Test Plan — Pipeline Audit Stream A Verification

## 1. Task Summary

Verify that Stream A (safety fixes) remediation from the pipeline audit has not introduced regressions in the tenant web app. Stream A migrated sales order / payment / invoice numbering from `count()+1` to PostgreSQL sequences, added trainer-overlap exclusion constraint, wrapped commission/installment/refund flows in `FOR UPDATE` transactions, and added ownership checks on appointment creation.

**Success criteria:**
- Login as franchisee succeeds and dashboard renders.
- Appointment list page (`/dashboard/appointment/view`) loads without error and shows existing appointments.
- Sales view page (`/dashboard/sales/view`) loads and shows existing SO- numbers (legacy + any new).
- Payment view page (`/dashboard/payment/view`) loads without error.
- Commissions view page (`/dashboard/commissions/view`) loads without error.
- Booking an appointment through the UI (if reachable) succeeds without hitting the new trainer-overlap constraint on a free slot.
- No console errors of severity `error` on any of the visited pages.

**Out of scope:**
- Stream B/C/D audit items.
- Creating new customers, packages, or hierarchy nodes.
- End-to-end refund flow (covered by backend tests already).
- Mobile viewport / accessibility checks.

## 2. Target Surface

**Entry URL:** `http://localhost:3001` (redirects to login if unauthenticated).

**Expected navigation path:**
1. `http://localhost:3001/` → login page
2. Login → `/dashboard/...` (landing)
3. `/dashboard/appointment/view`
4. `/dashboard/sales/view`
5. `/dashboard/payment/view`
6. `/dashboard/commissions/view`
7. (Optional) `/dashboard/appointment/create` or appointment booking modal

**Authentication state:** Fresh login as `franchisee@gmail.com` / `password123` (tenant admin). No assumed existing session.

**Browser preconditions:** Default desktop viewport. No device emulation. No GIF recording required.

**Known fragile areas:**
- Appointment list may be empty for test tenant — still pass if page renders without error banner.
- Booking modal selectors are not confirmed — SELECTOR UNCONFIRMED. If booking UI is not trivially reachable, skip booking attempt and report that step as "deferred to manual".
- Sales table may be empty — no new SO numbers generated yet; verify page shell renders and any existing legacy `SO-...` values display correctly.

## 3. Tool Pre-Load Batch

Single ToolSearch call:

```
ToolSearch(query: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_console_messages")
```

**Tools loaded:**
- `tabs_context_mcp` — mandatory session start.
- `tabs_create_mcp` — fresh tab for this run.
- `navigate` — URL transitions.
- `find` — locate login inputs and specific page markers.
- `form_input` — type credentials reliably.
- `javascript_tool` — minimal DOM reads, alert-pre-empt, URL checks.
- `read_console_messages` — pattern-filtered error check per page.

**NOT loaded (with reason):**
- `read_page` / `get_page_text` — whole-page dumps are wasteful; targeted `find` + `javascript_tool` is enough.
- `read_network_requests` — backend errors surface in console; network dump is overkill.
- `gif_creator` — user did not request a recording.
- `computer` — pixel-level automation not needed.
- `resize_window` / `shortcuts_*` / `upload_image` / `switch_browser` — irrelevant to this task.

## 4. Execution Sequence

### Step 1 — Session context

- **Tool:** `mcp__claude-in-chrome__tabs_context_mcp`
- **Parameters:** none
- **Parallel?** no (must run first)
- **Expected result:** current tab inventory; capture no assumptions about existing tabs.

### Step 2 — Open fresh tab at login

- **Tool:** `mcp__claude-in-chrome__tabs_create_mcp`
- **Parameters:** `url: "http://localhost:3001"`
- **Parallel?** no (Steps 1→2 sequential)
- **Expected result:** new tabId; auth middleware redirects to login route.

### Step 3 — Pre-empt dialogs + confirm login form present

Run as a single parallel batch:

- **Tool A:** `mcp__claude-in-chrome__javascript_tool`
  - **JS:**
    ```js
    window.alert = () => true;
    window.confirm = () => true;
    window.prompt = () => null;
    return { url: location.href, title: document.title };
    ```
- **Tool B:** `mcp__claude-in-chrome__find`
  - **Params:** locate the email/username input. Try common selectors in order: `input[name="email"]`, `input[type="email"]`, `input[id*="email" i]`. SELECTOR UNCONFIRMED — adapt based on first-hit result.
- **Parallel?** yes
- **Expected result:** current URL contains `/login` or `/sign-in`; email input element found.

### Step 4 — Fill credentials and submit

Sequential (depends on Step 3 findings):

- **Tool:** `mcp__claude-in-chrome__form_input`
  - **Params:** email field → `franchisee@gmail.com`; password field → `password123`.
- **Tool:** `mcp__claude-in-chrome__find` → locate submit button (`button[type="submit"]` or text match "Sign in"/"Log in"). Click it.
- **Expected result:** navigation to `/dashboard/...`.

### Step 5 — Confirm dashboard loaded

- **Tool:** `mcp__claude-in-chrome__javascript_tool`
  - **JS:**
    ```js
    return {
      url: location.href,
      onDashboard: location.pathname.startsWith('/dashboard'),
      h1: document.querySelector('h1')?.textContent ?? null,
    };
    ```
- **Expected result:** `onDashboard === true`.

### Step 6 — Appointment view load check (parallel batch)

Navigate, then fire parallel reads:

- **Sequential:** `navigate` → `http://localhost:3001/dashboard/appointment/view`
- **Parallel batch:**
  - `javascript_tool` — `return { url: location.href, bodyHasError: !!document.querySelector('[role="alert"]'), h1: document.querySelector('h1,h2')?.textContent ?? null, tableRows: document.querySelectorAll('table tbody tr').length };`
  - `read_console_messages` — `pattern: "(?i)(error|failed|uncaught|23P01|FOR UPDATE)"`
- **Expected result:** URL matches, no alert banner, zero filtered console errors.

### Step 7 — Sales view load check (parallel batch)

- **Sequential:** `navigate` → `http://localhost:3001/dashboard/sales/view`
- **Parallel batch:**
  - `javascript_tool` — `return { url: location.href, bodyHasError: !!document.querySelector('[role="alert"]'), rowCount: document.querySelectorAll('table tbody tr').length, firstCell: document.querySelector('table tbody tr td')?.textContent ?? null };`
  - `read_console_messages` — `pattern: "(?i)(error|failed|uncaught|nextval|tenant_sales_order_seq)"`
- **Expected result:** page renders, no SO-number format crash, no console errors.

### Step 8 — Payment view load check (parallel batch)

- **Sequential:** `navigate` → `http://localhost:3001/dashboard/payment/view`
- **Parallel batch:**
  - `javascript_tool` — `return { url: location.href, bodyHasError: !!document.querySelector('[role="alert"]'), rowCount: document.querySelectorAll('table tbody tr').length };`
  - `read_console_messages` — `pattern: "(?i)(error|failed|uncaught)"`

### Step 9 — Commissions view load check (parallel batch)

- **Sequential:** `navigate` → `http://localhost:3001/dashboard/commissions/view`
- **Parallel batch:**
  - `javascript_tool` — `return { url: location.href, bodyHasError: !!document.querySelector('[role="alert"]'), rowCount: document.querySelectorAll('table tbody tr').length, h1: document.querySelector('h1,h2')?.textContent ?? null };`
  - `read_console_messages` — `pattern: "(?i)(error|failed|uncaught|FOR UPDATE)"`

### Step 10 — Optional: booking attempt

If steps 6–9 all passed, attempt one appointment booking against a clearly-free slot.

- **Tool:** `mcp__claude-in-chrome__find` — locate "New" / "Book" / "Create appointment" button on `/dashboard/appointment/view` or navigate to `/dashboard/appointment/create` if that route exists. SELECTOR UNCONFIRMED.
- **If booking UI is unreachable in ≤2 find calls:** stop and record "booking deferred — UI surface not located in budget". Do NOT hunt across the app.
- **If reachable:** fill minimum required fields with existing client/trainer/time, submit, then:
  - `javascript_tool` — `return { url: location.href, bodyHasError: !!document.querySelector('[role="alert"]'), alertText: document.querySelector('[role="alert"]')?.textContent ?? null };`
  - `read_console_messages` — `pattern: "(?i)(23P01|trainer.*overlap|not authorized|error|failed)"`
- **Expected result:** booking either succeeds cleanly OR surfaces a user-facing validation message (not a raw DB error / 500).

## 5. Dialog & Loop Hardening

**Alert/confirm/prompt risks:**
- Delete / cancel buttons on rows in appointment/sales/payment tables — do NOT click them in this run.
- Step 3 pre-injects `window.alert/confirm/prompt` overrides so any defensive modal is neutralized.

**Rabbit-hole stop rule:** Max 2 retries on any failing tool call. After 2 failures on the same step, stop and report the full failure in `results.md` with the last tool response.

**Timeout rule:** If any page takes >15 s to render a final URL, abort and record the page as "timed-out".

**Tab-invalidation recovery:** If any chrome tool returns "tab does not exist", the next action is `tabs_context_mcp` (fresh IDs) — not a retry of the failing call.

**Navigation divergence:** If any navigate lands on an unexpected URL (e.g., redirected to `/login`), stop and record — do not attempt re-auth mid-run.

## 6. Verification Checkpoints

| Success criterion (§1) | Tool / evidence | Pass threshold |
|---|---|---|
| Login succeeds | Step 5 JS → `onDashboard === true` | true |
| Appointment list loads | Step 6 JS → `bodyHasError === false`; console pattern returns 0 matches | both true |
| Sales view loads | Step 7 JS → `bodyHasError === false`; existing `firstCell` (if rows) starts with `SO-` or is null (empty table) | no crash; no `nextval`/sequence errors in console |
| Payment view loads | Step 8 JS → `bodyHasError === false` | no console errors matching pattern |
| Commissions view loads | Step 9 JS → `bodyHasError === false` | no console errors matching pattern |
| Booking works (optional) | Step 10 either succeeds with navigation or shows user-facing validation | no 23P01 / "not authorized" surfaced from backend for a valid booking |

**Artifact captured:** Write findings to `chrome-test/results.md` — one section per step, record: URL, bodyHasError, rowCount, relevant console matches (or "none"), verdict (pass/fail/deferred).

## 7. Deliverable

**File:** `zplan/04-20_12-09_pipeline-audit/chrome-test/results.md`

**Format:** narrative-bullets report with the following sections:
- **Summary** — overall pass/fail verdict in 2–3 sentences.
- **Per-step results** — URL, key JS return values, console matches, verdict.
- **Anomalies** — anything weird (unexpected redirect, empty table, missing route) with supporting evidence.
- **Recommendation** — either "seal session via `/done`" or "re-run /execute for <specific fix>".

**No screenshots, no GIF.** Text-only report; the JS return values and console extracts are the evidence.

## 8. Efficiency Audit

- [x] Every MCP tool listed in §3 is used in §4 — `tabs_context_mcp` (step 1), `tabs_create_mcp` (step 2), `javascript_tool` (3,5,6,7,8,9,10), `find` (3,4,10), `form_input` (4), `navigate` (6,7,8,9), `read_console_messages` (6,7,8,9,10). No dead pre-loads.
- [x] No step uses `read_page` — every check is a targeted `find` or a minimal `javascript_tool` return.
- [x] Every `read_console_messages` call specifies a `pattern`.
- [x] Parallel batches identified in §4: Step 3 (JS + find), Step 6/7/8/9 each have (JS + console read in parallel).
- [x] Dialog risks enumerated (§5) and mitigated via Step 3 pre-injection.
- [x] Estimated tool calls: Step 1 (1) + Step 2 (1) + Step 3 (2 parallel) + Step 4 (2) + Step 5 (1) + Steps 6–9 each (1 nav + 2 parallel = 3) × 4 = 12 + Step 10 optional (≤ 5) ≈ **19–24 total** — within budget (<25).

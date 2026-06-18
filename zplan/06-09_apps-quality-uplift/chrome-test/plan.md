# Chrome Verification Plan — apps-quality-uplift

> Session: zplan/06-09_apps-quality-uplift · Target: http://avantej.localhost:3021/ · Tenant: franchisee@gmail.com / password123

## 1. Task Summary

Verify the quality-uplift refactor introduced **no behavior regressions** in the browser. The risk is purely structural-move regressions (decomposed god-components) + the Phase 1 query-invalidation change. Backend logic was untouched except an auth-helper extraction (behavior-identical).

**Success criteria (objectively verifiable):**
- POS (`/dashboard/sales/create`) renders; with an installment plan selected, the amount shown is the **per-installment amount (RM 100 for RM 300 / 3 mo), NOT RM 300**.
- A POS sale completes successfully (commission routing exercised — rotation when no trainer chosen).
- Members tab (`/dashboard/access-control`) renders the member list; an action dialog (invite or role-change) opens.
- Decomposed pages render without a blank screen / error boundary: Class Slots, Announcements, Reports, Branch, POS.
- A mutation refreshes its list immediately (Phase 1 invalidation) — e.g. toggling "show deleted" or a create/cancel updates the visible list without manual refresh.
- Zero React error-boundary crashes / uncaught console errors on each page.

**Out of scope:** payment-gateway/Stripe live charge, multi-tenant isolation (covered by tests), creating real persistent data beyond what's reversible, the deferred `any`-reduction.

## 2. Target Surface

| Page | URL | Notes |
|------|-----|-------|
| Login | http://avantej.localhost:3021/ | Better-Auth; tenant login franchisee@gmail.com / password123 |
| POS workflow | /dashboard/sales/create | renders `PosWorkflow` (decomposed → components/pos/workflow/*) |
| Members tab | /dashboard/access-control | renders `MembersTabPage` (decomposed → access-control/members/*) |
| Class Slots | /dashboard/appointment/class-slots | decomposed → components/pages/class-slots/* |
| Announcements | /dashboard/announcements | decomposed → components/pages/announcements/* |
| Reports | /dashboard/reports | decomposed (concurrent) → components/pages/reports/* |
| Branch | /dashboard/branch | decomposed (concurrent) → components/pages/branch/* |

- **Auth state:** must log in first (fresh session). Tenant user (admin/staff role).
- **Viewport:** 1440×900 desktop.
- **PRECONDITION:** web dev server on 3021 is **DOWN** (server 3020 is up). Start it before any navigation: `bun dev:web` (run in background from repo root), then poll http://avantej.localhost:3021/ until 200 (up to 60s — Vite cold start). Per CLAUDE.md debugging order, also confirm no pending tenant migrations if pages 500 (check journal, run `bun db:migrate:tenant` if needed) — but only if a data page errors.
- **Known fragile areas:** Radix Select components (POS installment select, role select) cannot be driven by synthetic clicks — they check `event.isTrusted`. Use `javascript_tool` to read their state / set values via the underlying form, or assert on rendered text rather than clicking options (see MEMORY: "Radix Select can't be browser-automated"). The POS member search is a typeahead.

## 3. Tool Pre-Load Batch

Single ToolSearch call:

```
ToolSearch(query: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_console_messages", max_results: 10)
```

- `tabs_context_mcp` — required session start.
- `tabs_create_mcp` — fresh tab for login.
- `navigate` — page transitions.
- `find` — locate elements by text/testid.
- `form_input` — type into login + POS member search (real input events).
- `computer` — clicks on buttons/links (non-Radix-Select).
- `javascript_tool` — read installment amount text, member-list row count, Radix Select state; assert no error boundary.
- `read_console_messages` — error check (ALWAYS with a pattern).

**Not loading:** `read_page` / `get_page_text` (use `find` + `javascript_tool` for targeted reads — avoids context flooding); `gif_creator` (no recording requested); `read_network_requests` (not needed unless a mutation silently fails — add later if so).

## 4. Execution Sequence

> Pre-step 0 (Bash, not chrome): ensure dev server up. `bun dev:web` in background; poll until 3021 returns 200.

1. **Session + tab** — `tabs_context_mcp` then `tabs_create_mcp` to http://avantej.localhost:3021/. Expect login page.
2. **Login** — `find` email + password inputs; `form_input` franchisee@gmail.com / password123; `computer` click submit. Expect redirect to /dashboard. **Parallel?** no.
3. **Dialog pre-injection** — `javascript_tool`: `window.alert=window.confirm=window.prompt=()=>true; return true;` (guard any confirm dialogs in deactivate/cancel flows).
4. **POS render + installment invariant** — `navigate` /dashboard/sales/create. `find` `[data-testid="pos-member-search-input"]` (confirms render). Search member "Ahmad Firdaus" via `form_input`; `computer` select result. Add service: `computer` `[data-testid="pos-add-service-button"]`, pick "Body Massage 60min" catalog item. Select an installment plan (RM 300 / 3mo) — Radix select: read options via `javascript_tool`, set programmatically or assert. Then **`javascript_tool`** reads the displayed "Due Today"/amount: `return [...document.querySelectorAll('*')].filter(e=>/Due Today|Due now/i.test(e.textContent)).map(e=>e.textContent).slice(0,3)`. **PASS = shows 100 (per-installment), FAIL = shows 300 (full price).**
5. **POS complete sale (rotation)** — leave trainer blank; `computer` `[data-testid="pos-complete-sale-button"]`. Expect success toast / receipt. `read_console_messages` pattern `error|failed|500|uncaught`. **Parallel?** no.
6. **Members tab** — `navigate` /dashboard/access-control. `javascript_tool` count member rows/cards: `return document.querySelectorAll('[data-testid^="member"], [class*="card"]').length`. `find` an invite/role button; `computer` open it; confirm dialog appears via `find`. Close.
7. **Invalidation spot-check** — on members tab, `computer` toggle `[data-testid="show-deleted-members-toggle"]`; `javascript_tool` re-count rows → list changes WITHOUT manual reload. **PASS = count differs / deleted badge appears.**
8. **Decomposed pages smoke (PARALLEL batch where possible)** — for each of /dashboard/appointment/class-slots, /dashboard/announcements, /dashboard/reports, /dashboard/branch: `navigate` then `javascript_tool` assert no error boundary: `return { hasErr: !!document.body.textContent.match(/Something went wrong|Error boundary|Unexpected/i), title: document.title, nodes: document.querySelectorAll('main *').length }`. nodes>50 & hasErr=false = render OK. (Sequential navigations, but each check is one JS call.)
9. **Final console sweep** — `read_console_messages` pattern `error|uncaught|cannot read|undefined is not` across the session.

## 5. Dialog & Loop Hardening

- **Alert/confirm risks:** deactivate-member, cancel-sale, clear-cart, delete confirmations. Mitigated by step 3 pre-injection (`window.confirm=()=>true`).
- **Radix Select:** do NOT synthetic-click options (event.isTrusted gate). Read/assert via `javascript_tool`; if a value must be set, dispatch on the underlying element or assert the rendered summary text instead.
- **Retry rule:** max 2 retries per failing tool call, then stop and record the failure in results.md.
- **Timeout rule:** page load > 15s → abort that step, record, continue to next page (don't hang the whole run).
- **Tab-invalidation:** any "tab does not exist" → next action is a fresh `tabs_context_mcp`, not a blind retry.
- **Server-down recovery:** if 3021 never comes up within 60s, stop and report "dev server failed to start" — do not attempt browser steps.

## 6. Verification Checkpoints

| Criterion (§1) | Tool / check | Pass threshold | Artifact |
|---|---|---|---|
| POS installment amount | `javascript_tool` reads Due-Today text | contains "100", not "300" | screenshot pos-installment |
| POS sale completes | success toast via `find` + console clean | toast present, 0 console errors | screenshot pos-complete |
| Members list renders | `javascript_tool` row count | > 0 rows | screenshot members |
| Invite/role dialog opens | `find` dialog after click | dialog node present | — |
| Invalidation refresh | row count before/after toggle | count changes, no reload | — |
| Decomposed pages render | `javascript_tool` hasErr/nodes per page | hasErr=false, nodes>50 (×4 pages) | screenshot each |
| No crashes | `read_console_messages` pattern | 0 matches of error pattern | console excerpt in results |

## 7. Deliverable

- `zplan/06-09_apps-quality-uplift/chrome-test/results.md` — narrative + per-criterion PASS/FAIL table + any console errors captured.
- Screenshots (computer screenshot) at the POS installment step, POS completion, members tab, and one decomposed page — referenced in results.md.
- No GIF.

## 8. Efficiency Audit

- [x] Every preloaded tool used in §4 (tabs_context, tabs_create, navigate, find, form_input, computer, javascript_tool, read_console_messages).
- [x] No `read_page` — targeted `find` + `javascript_tool` only.
- [x] Every `read_console_messages` has a pattern (`error|uncaught|...`).
- [x] Parallel batch: step 8's per-page JS checks are independent (navigate is sequential, but no cross-page dependency); flagged.
- [x] Dialog risks enumerated + mitigated (step 3 pre-injection; Radix caveat).
- [x] Estimated chrome tool calls: ~22 (login 3, POS 6, members 3, invalidation 2, 4 pages ×1.5, console 2). Slightly above 15 due to 6 pages of coverage — acceptable for a multi-page regression sweep; could split POS into its own phase if it runs long.

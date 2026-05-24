# Admin Flow Test Protocols — Shared Setup

> **Purpose:** Every protocol in `docs/testing/*.md` assumes this file. It defines the environment, seeded fixtures, login routines, cleanup convention, MCP tool cheat sheet, and results-file location. Do not duplicate any of these in individual protocol files — link back here instead.
>
> **Execution vehicle:** Claude + Chrome MCP (`mcp__claude-in-chrome__*`) via the `/chrome` skill. No Playwright, no CI, no runner. A human invokes a Claude session and asks it to run one of the protocols.

---

## 0. Prerequisites

### 0.1 Dev stack

Start the full stack (web + server) from the repo root:

```bash
bun dev          # web :3021, server :3020 (avantej.localhost)
# or individually:
bun dev:web
bun dev:server
```

Sanity-check before any protocol:

```bash
curl -I http://avantej.localhost:3021          # expect HTTP/1.1 200 OK
curl http://avantej.localhost:3020/health      # expect 200
```

If either fails, stop — the protocol cannot run. Fix the stack first.

### 0.2 Seed data

Seeds are **idempotent** (upsert by unique key). Safe to re-run anytime:

```bash
cd apps/server
bun run scripts/seed-business-data.ts
```

The script covers the Test Fitness Franchise org only (ID: `996febce-aaad-4ded-8f47-02d2b566c8ee`). If you need a fresh state for a specific fixture row (e.g. you mutated the deterministic client's package during a failed run), delete that row manually in Drizzle Studio first — the seeder will skip existing rows.

### 0.3 Browser state

Start every protocol from a clean session:

- New incognito window, OR
- Logged-out tab with cookies cleared for `http://localhost:3001`

This guarantees the login routine (§2) exercises a real sign-in and that `accessibleNodeIds` is rebuilt from the DB rather than a stale cached `userContext`.

---

## 1. Seeded Fixtures

Fixture **emails and names are stable**. Fixture **UUIDs are resolved at runtime** — never hard-code a UUID in a protocol; always resolve it via the snippet below or by filtering `services.list` / `members.list` on name/email.

### 1.1 Fixture inventory

| Role / entity | Email / name | Password | Scope / notes |
|---|---|---|---|
| Platform admin (franchise owner) | `franchisee@gmail.com` | `password123` | Admin role in Test Fitness Franchise. Sees all hierarchy nodes. |
| Staff member (scoped) | `staff.deterministic@test.com` | `password123` | Staff role. Scoped to a single branch node — cannot see other branches. |
| Trainer member | `trainer.deterministic@test.com` | `password123` | Role `trainer`. Availability seeded: Mon–Fri 09:00–17:00. Assigned to "E2E Test Session". |
| Client user | `e2e.client@test.com` | `password123` | Registered end-customer. Owns the seeded package instance. |
| Organization | Test Fitness Franchise | — | ID: `996febce-aaad-4ded-8f47-02d2b566c8ee` |
| Branch node | "Tenant Test Fitness Franchise Branch" | — | Depth 4. Parent: Kota Kinabalu. Primary branch for all fixtures. |
| Service category | "E2E Category" | — | `service_category_config.bufferTimeMinutes = 15` (upserted). |
| Service | "E2E Test Session" | — | `duration = 60`, `sessionCount = 10`, `availablePaymentPlans = ["full", "half"]`, linked to E2E Category. |
| Room | "Main Room - <Branch Name>" | — | Type: training. Capacity: 20. Scoped to the primary branch. |
| Package instance | service = E2E Test Session, client = e2e.client | — | `paymentPlanType = "half"`, `creditsTotal = 10`, `creditsUsed = 0`, `creditsUnlocked = 0` until §5 of the cross-flow run. |
| Installment plan | `full` (default), `half`, `quarterly` | — | Seeded in installment-plan seeder. `full.isDefault = true`. |
| Installments (for the seeded package instance above) | 2 rows | — | Installment 1 = `paid`, Installment 2 = `pending`. |

### 1.2 Runtime UUID resolution

Paste this into `mcp__claude-in-chrome__javascript_tool` after login to resolve fixture IDs for any protocol:

```js
// Run inside the logged-in dashboard (so cookies are attached).
// Resolves stable names → UUIDs you can reuse for the rest of the run.
//
// organizationId is hard-coded: the Test Fitness Franchise org is fixed.
const organizationId = "996febce-aaad-4ded-8f47-02d2b566c8ee";

async function rpc(path, input) {
  const res = await fetch(`/rpc/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { ...input, organizationId } }),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return (await res.json()).json;
}

const [services, members, rooms, plans, cats] = await Promise.all([
  rpc("services/list", {}),
  rpc("members/list", {}),
  rpc("rooms/list", {}),
  rpc("installmentPlans/list", {}),
  rpc("serviceCategories/list", {}),
]);

const out = {
  organizationId,
  serviceId: services.find((s) => s.name === "E2E Test Session")?.id,
  categoryId: cats.find((c) => c.name === "E2E Category")?.id,
  roomId: rooms.find((r) => r.name?.startsWith("Main Room"))?.id,
  trainerMemberId: members.find((m) => m.email === "trainer.deterministic@test.com")?.id,
  staffMemberId: members.find((m) => m.email === "staff.deterministic@test.com")?.id,
  clientUserId: members.find((m) => m.email === "e2e.client@test.com")?.userId,
  planFullId: plans.find((p) => p.code === "full")?.id,
  planHalfId: plans.find((p) => p.code === "half")?.id,
};
console.log(out);
return out;
```

Record the returned object at the top of your run report (see §5). Every subsequent step in the protocol references these keys (`serviceId`, `trainerMemberId`, etc.) rather than re-querying.

### 1.3 Pre-condition assertions

Every protocol's Pre-conditions block MUST assert:

1. The expected fixture exists (use the resolver above; fail fast if any key is `undefined`).
2. No leftover rows from a previous run exist (e.g. no appointments linked to the seeded trainer on the test day). If found, run the Cleanup section (§3) of the last-failed protocol before starting.

---

## 2. Login Routines

All three blocks assume: starting from a cold browser state (§0.3) and stack sanity (§0.1) passed.

### 2.1 Admin login — `franchisee@gmail.com`

**Landing expectation:** `/dashboard` (generic dashboard home). Top-right nav shows the franchise owner's name. Sidebar includes "Business" and "Access Control" groups.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Go to login page | Page loads, email + password fields visible | `mcp__claude-in-chrome__navigate` → `http://localhost:3001/login` |
| 2 | Fill email | Field value = `franchisee@gmail.com` | `mcp__claude-in-chrome__form_input` |
| 3 | Fill password | Field value = `password123` | `mcp__claude-in-chrome__form_input` |
| 4 | Submit | Redirect to `/dashboard` within ~3s; no error toast | `mcp__claude-in-chrome__find` → Sign In button; click via `javascript_tool` if `click` unavailable |
| 5 | Verify landing | URL is `/dashboard/...`; page contains the franchise owner's display name | `mcp__claude-in-chrome__read_page` |
| 6 | Verify cookie | `document.cookie` includes `better-auth.session_token` | `mcp__claude-in-chrome__javascript_tool` → `document.cookie` |

### 2.2 Staff login — `staff.deterministic@test.com`

**Landing expectation:** `/dashboard`. Sidebar hides hierarchy-admin entries (no "Branches" CRUD for non-admins). Staff sees only items scoped to their branch.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Go to login page | Email + password fields visible | `mcp__claude-in-chrome__navigate` |
| 2 | Fill email | `staff.deterministic@test.com` | `mcp__claude-in-chrome__form_input` |
| 3 | Fill password | `password123` | `mcp__claude-in-chrome__form_input` |
| 4 | Submit | Redirect to `/dashboard` within ~3s | click Sign In |
| 5 | Verify RBAC scope | Open `/dashboard/appointment/view` and confirm only appointments for the seeded branch are visible; calendar does not list trainers from other branches | `mcp__claude-in-chrome__read_page` |
| 6 | Optional: assert `accessibleNodeIds` | Run the resolver snippet and `fetch("/rpc/auth/userContext", ...)` — returned `accessibleNodeIds` has length equal to one branch sub-tree | `mcp__claude-in-chrome__javascript_tool` |

### 2.3 Trainer login — `trainer.deterministic@test.com`

**Landing expectation:** `/dashboard/appointment/view`. Page title is **"My Schedule"** (not "Appointments"). TrainerSidebar is **hidden** — trainer sees only their own appointments. "My Work → My Services" link visible in sidebar.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Go to login page | Form visible | `mcp__claude-in-chrome__navigate` |
| 2 | Fill email | `trainer.deterministic@test.com` | `mcp__claude-in-chrome__form_input` |
| 3 | Fill password | `password123` | `mcp__claude-in-chrome__form_input` |
| 4 | Submit | Redirect to `/dashboard` within ~3s | click Sign In |
| 5 | Navigate to calendar | URL = `/dashboard/appointment/view`; heading = "My Schedule" | `mcp__claude-in-chrome__navigate`, then `read_page` |
| 6 | Assert trainer sidebar hidden | No list of other trainers on the page | `mcp__claude-in-chrome__javascript_tool` → `document.querySelector('[data-testid="trainer-sidebar"]')` returns `null` |
| 7 | Assert "My Work → My Services" link visible | Sidebar contains "My Services" | `mcp__claude-in-chrome__read_page` |

### 2.4 Role switching inside a single run

Some protocols (e.g. appointment-view §4 A10) require switching roles mid-run. Do this by:

1. Navigate to `/rpc/auth/signOut` via `fetch` (sends POST), OR click the sign-out link.
2. Clear cookies for `localhost:3001` (via DevTools or `document.cookie = "better-auth.session_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";`).
3. Re-run the appropriate login block.

**Do not** try to "impersonate" via API tokens — Better-Auth does not support that here. Always go through the login form.

---

## 3. Cleanup Convention

Every protocol file ends with a section named **"Cleanup"**. That section reverses only that protocol's own mutations. It does **not** delete seed rows — they persist across runs so subsequent protocols start from a known state.

Rules:

1. **LIFO order.** Reverse in the opposite order of creation. Example: appointment → package instance (refund) → service → category. Reversing in creation order can violate foreign-key constraints.
2. **Run on failure too.** If a step fails, the executor still runs Cleanup before filing the result file. Leaving orphan rows contaminates the next run.
3. **Prefer soft-delete over hard-delete** where the model supports it (`isActive: false` on services/categories/rooms/plans). Hard-delete only for rows you created within the run (appointments, installments you manually confirmed, etc.).
4. **Verify with a post-cleanup assertion.** The final step of every Cleanup should re-run a narrow `*.list` query and confirm the protocol's created rows are gone.
5. **Never touch seed rows.** Do not delete the E2E Category, E2E Test Session, deterministic trainer/staff/client, Main Room, or the seeded package instance. If a protocol needs to mutate one of those (e.g. confirm an installment), the Cleanup step must restore the original state (un-confirm the installment, reset `creditsUnlocked` to 0 via direct SQL if oRPC has no reverse).

If a fixture's state is hopelessly corrupted mid-run (e.g. package instance got cancelled and you can't restore), delete the affected rows manually and re-seed:

```bash
cd apps/server && bun run scripts/seed-business-data.ts
```

---

## 4. MCP Tool Cheat Sheet

Chrome MCP tools must be loaded via `ToolSearch` (`select:<tool_name>`) before first use in a session. Once loaded they persist for the session.

| Action | Tool | Notes |
|---|---|---|
| Open URL | `mcp__claude-in-chrome__navigate` | Wait for load before next step. |
| Find element (by text / selector) | `mcp__claude-in-chrome__find` | Use before clicks when a selector isn't obvious. |
| Click | `mcp__claude-in-chrome__find` + `javascript_tool` | No dedicated click tool today — find then dispatch `.click()` via `javascript_tool` ( `document.querySelector("...").click()` ). |
| Type into input | `mcp__claude-in-chrome__form_input` | Provide `name` or `id` of the field. |
| Read visible page | `mcp__claude-in-chrome__read_page` / `mcp__claude-in-chrome__get_page_text` | `read_page` returns a structured summary; `get_page_text` returns raw text. |
| Query a specific element | `mcp__claude-in-chrome__javascript_tool` | e.g. `document.querySelector('[data-testid="row-0"]').textContent` |
| Inspect network | `mcp__claude-in-chrome__read_network_requests` | Verify "manual-apply" behavior (no refetch until Apply clicked). |
| Inspect console | `mcp__claude-in-chrome__read_console_messages` | Catch novel error patterns. |
| Capture failure region | `mcp__claude-in-chrome__gif_creator` | Optional, only on fail. |
| Resize viewport | `mcp__claude-in-chrome__resize_window` | For responsive assertions. |
| Switch between tabs | `mcp__claude-in-chrome__tabs_context_mcp` / `mcp__claude-in-chrome__tabs_create_mcp` | Rarely needed. |

**Selector preference order** (highest stability first):

1. `data-testid="..."` (add if missing via the web app if repeated assertion is required).
2. ARIA (`aria-label`, `role`, `aria-labelledby`).
3. Visible text (`find` with `text` option).
4. CSS class (fragile — only if nothing better exists).

---

## 5. Results File Format

Every protocol run produces exactly one markdown file in `zdocs/testing-results/`:

```
zdocs/testing-results/<YYYY-MM-DD-HHMM>_<protocol-slug>.md
```

Examples:
- `zdocs/testing-results/2026-04-17-1430_appointment-view.md`
- `zdocs/testing-results/2026-04-17-1615_cross-flow_service-to-booking.md`

The template (content + headings) is specified verbatim in `zdocs/testing-results/README.md`. Do not duplicate it here — always fill in from that file so tooling can parse runs consistently.

The folder is checked into git for regression history. Keep the **last 10 passing runs per protocol**; older passing runs may be pruned in a cleanup PR. Failing runs are never pruned — they document regressions.

---

## 6. Verify Setup

Run through this checklist before declaring the environment ready for any protocol:

- [ ] `curl -I http://localhost:3001` returns `200`.
- [ ] `curl http://localhost:3000/ping` returns a `200` with body `pong` (or equivalent).
- [ ] `cd apps/server && bun run scripts/seed-business-data.ts` completes without error.
- [ ] Admin login (§2.1) succeeds; dashboard home loads; cookie `better-auth.session_token` present.
- [ ] Staff login (§2.2) succeeds; `accessibleNodeIds` scoped to one branch.
- [ ] Trainer login (§2.3) lands on `/dashboard/appointment/view` with title **"My Schedule"**.
- [ ] The runtime-UUID resolver (§1.2) returns non-undefined values for all six keys (serviceId, categoryId, roomId, trainerMemberId, staffMemberId, clientUserId, planHalfId).
- [ ] `fetch("/rpc/services/list", { ...organizationId in body })` returns an array that includes a row with `name === "E2E Test Session"`.
- [ ] `fetch("/rpc/installmentPlans/list", ...)` returns at least three rows: `full` (default), `half`, `quarterly`.

If any box is unchecked, fix it before executing a protocol. A partial setup guarantees a partial (and misleading) result file.

---

## Appendix A — Known blockers (read before writing a new protocol)

- **Access Control pages** redirect with `?unauthorized=true` for admins today (`zdocs/dashboard-test-results.md` §3). Out of scope for all protocols in this suite.
- **`requirePermission` route guard is a stub** (`packages/api/src/services/route-guards.ts`). Real RBAC checks happen inside handlers — assert errors at the API response level, not route-level redirects.
- **Class Slots filters are manual-apply** (not reactive). Wait for the Apply button click before asserting filter effects.
- **Multi-appointment mode in `AddAppointmentModal`** (~line 1828) uses the old always-empty dropdowns. Test single-appointment mode only; the multi path is out of scope pending a codepath update.
- **Native app still uses hardcoded `PLAN_CONFIG`** (`apps/native/app/(app)/dashboard/buy-package/plan.tsx`). Tests are web-only.

## Appendix B — Cross-references

- Auth and cookie model: `zhub/shared/auth-flow.md`
- Page inventory: `zhub/index.md`
- Buffer-cascade reference: `docs/BUFFER_TIME_TESTING.md`
- Installment reference: `docs/INSTALLMENT_TESTING.md`
- Master plan: `zplan/17-04_13-00_admin-flow-test-coverage/plan.md`

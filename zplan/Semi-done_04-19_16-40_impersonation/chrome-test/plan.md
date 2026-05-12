# Chrome Test Plan: Platform & Tenant Admin Impersonation

**Session:** zplan/04-19_16-40_impersonation
**Created:** 2026-04-19
**Plan source:** ../plan/plan.md
**Execute log:** ../execute/log.md

---

## 1. Task Summary

End-to-end browser verification of the "Login as User" impersonation feature delivered across phases 1–7. The feature lets (a) platform admins (super_admin/support roles) impersonate any non-admin tenant user and (b) tenant admins (member.role === 'admin') impersonate staff members in their own organization. While impersonating, a persistent yellow banner shows the active session and a "Stop impersonating" button restores the original admin session via hard reload.

**Success criteria** (each independently verifiable):

- [ ] Logged-in super_admin (developer.avantej@gmail.com) sees `/dashboard/platform-admin/users` and `/dashboard/platform-admin/admins` in the sidebar.
- [ ] Clicking "Login as" on a user row in `/dashboard/platform-admin/users` triggers a confirmation dialog, then performs impersonation, replaces the cookie, and lands on the impersonated user's tenant dashboard with the yellow banner visible.
- [ ] The banner reads `Impersonating <impersonated.email> as <admin.email>` and contains a working "Stop impersonating" button that restores the admin session via hard reload (window.location.href change observed).
- [ ] Super admin can grant a platform admin role on `/dashboard/platform-admin/admins` and the row updates without page reload (TanStack Query invalidation).
- [ ] Self-revoke is blocked: the revoke control for the currently logged-in super_admin is either hidden or disabled.
- [ ] Tenant admin (franchisee@gmail.com when role==='admin') sees a "Login as" inline button on `/dashboard/user/view` for staff rows; clicking impersonates that staff member with the same banner UX.
- [ ] When NOT impersonating, the banner does NOT render anywhere in the dashboard layout.
- [ ] Console contains no React/runtime errors during the flows (filtered with pattern).

**Out-of-scope:**
- Audit log inspection in the database (verified separately at server-side; not part of this browser run).
- Billing-role behavior (no billing user seeded; covered as edge case to confirm UI gating logic in the route guard, but skipped if no test account exists).
- Tenant migration execution and platform-admin seeding (precondition; user must run scripts before /chrome-run).

---

## 2. Target Surface

**Entry URLs:**
- Web app: `http://localhost:3001` (Vite dev server)
- Server: `http://localhost:3000` (Hono / oRPC). Web proxies `/rpc` and `/api/auth` to this.
- Sign-in page: `http://localhost:3001/sign-in`
- Platform admin users: `http://localhost:3001/dashboard/platform-admin/users`
- Platform admin admins: `http://localhost:3001/dashboard/platform-admin/admins`
- Tenant user view: `http://localhost:3001/dashboard/user/view`

**Authentication state assumed:**
- Fresh tab with no cookies (will sign in inside the run).
- Test accounts (from CLAUDE.md / MEMORY.md):
  - `developer.avantej@gmail.com` / `password1234` — control-panel super_admin (must be seeded via `apps/server/scripts/seed-platform-admin.ts`).
  - `franchisee@gmail.com` / `password123` — tenant user; member.role must be 'admin' on at least one organization for tenant-admin path.

**Browser preconditions:**
- Default viewport (no special emulation needed).
- English locale.
- Both `bun dev:web` and `bun dev:server` running locally before /chrome-run starts.

**Preconditions the user must complete BEFORE /chrome-run:**
1. `cd apps/server && bun run scripts/seed-platform-admin.ts` (idempotent — promotes developer.avantej@gmail.com to super_admin).
2. Tenant migration applied: the new `MIGRATION_0025_MEMBER_SESSIONS` runs automatically on the next request that hits `migrate-tenant.ts`, but a smoke test of `/dashboard/user/view` after sign-in is enough to trigger it.
3. Both dev servers running (`bun dev` in repo root).

**Known fragile areas:**
- Hard reload after "Stop impersonating" — the test must wait for the navigation event, then re-read the page. Do NOT chain another tool call assuming the SPA state persists.
- TanStack Query staleTime is 60s on the impersonation status query — if a stale state is observed, refetch by reloading.
- Better-Auth Set-Cookie merger lives in the Hono response wrapper; if cookies don't replace cleanly, the banner won't show. This is the highest-risk integration point.

---

## 3. Tool Pre-Load Batch (CRITICAL)

Single ToolSearch call to load every chrome MCP tool the run needs:

```
ToolSearch(query: "select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_console_messages")
```

**Tools loaded and why:**
| Tool | Why |
|------|-----|
| `tabs_context_mcp` | Mandatory first call to get fresh tab IDs. |
| `tabs_create_mcp` | Open a fresh tab for the run (no cookie reuse). |
| `navigate` | Move between sign-in / dashboard / platform-admin pages. |
| `find` | Locate buttons, banner, dialog elements by accessible attributes. |
| `form_input` | Fill the sign-in form (email + password). |
| `javascript_tool` | Read banner text, document.cookie, query DOM nodes precisely, dismiss any pre-injected dialogs. |
| `read_console_messages` | Confirm zero React/runtime errors during flows (filtered by pattern). |

**Tools NOT loaded and why:**
- `read_page` / `get_page_text` — full-page dumps flood context; `find` + targeted JS reads suffice.
- `gif_creator` — user did not request a recording.
- `read_network_requests` — could be useful for verifying Set-Cookie, but `document.cookie` via JS is cheaper and sufficient.
- `computer` / `shortcuts_*` / `upload_image` / `resize_window` — not needed.
- `switch_browser` — single browser only.

---

## 4. Execution Sequence

> **Convention:** Each step lists the tool, exact parameters, parallelism, and expected result. Selectors marked `SELECTOR UNCONFIRMED` need verification at runtime before the click — fall back to `find` with role/name if the selector misses.

### Phase A — Setup

**Step 1** — Get current tab context.
- Tool: `tabs_context_mcp`
- Parameters: none
- Parallel? No (must run first).
- Expected: tab list returned; pick a candidate tab id only if user explicitly asked, otherwise create new in step 2.

**Step 2** — Open fresh tab on sign-in page.
- Tool: `tabs_create_mcp`
- Parameters: `{ url: "http://localhost:3001/sign-in" }`
- Parallel? No (depends on step 1).
- Expected: new tab id; sign-in form rendered.

### Phase B — Golden Path 1: Platform Admin Impersonates a User

**Step 3** — Sign in as super_admin.
- Tool: `form_input` (email field), `form_input` (password field)
- Parameters:
  - email selector: `input[type="email"]` (SELECTOR UNCONFIRMED — fallback `find` with name=email)
  - password selector: `input[type="password"]`
  - email value: `developer.avantej@gmail.com`
  - password value: `password1234`
- Parallel? Yes — both inputs can fire in one assistant turn (independent fields).
- Expected: form populated.

**Step 4** — Submit sign-in form.
- Tool: `find` then click via `javascript_tool`
- Selector: `button[type="submit"]` (SELECTOR UNCONFIRMED)
- JS fallback: `document.querySelector('button[type="submit"]')?.click()`
- Parallel? No.
- Expected: navigation to `/dashboard/...` (default landing route).

**Step 5** — Confirm sidebar shows Platform Admin section.
- Tool: `javascript_tool`
- Snippet:
  ```js
  return {
    usersLink: !!document.querySelector('a[href="/dashboard/platform-admin/users"]'),
    adminsLink: !!document.querySelector('a[href="/dashboard/platform-admin/admins"]'),
  };
  ```
- Parallel? Yes — can run with step 6 (console read).
- Expected: `{ usersLink: true, adminsLink: true }` for super_admin.

**Step 6** — Console health check (filtered).
- Tool: `read_console_messages`
- Pattern: `error|Error|warn` (case-insensitive)
- Parallel? Yes (with step 5).
- Expected: no React/runtime errors. Hydration warnings tolerated, real errors fail.

**Step 7** — Navigate to platform-admin users list.
- Tool: `navigate`
- URL: `http://localhost:3001/dashboard/platform-admin/users`
- Parallel? No.
- Expected: DataTable with users.

**Step 8** — Find a non-admin target user (franchisee).
- Tool: `javascript_tool`
- Snippet:
  ```js
  const rows = Array.from(document.querySelectorAll('tr'));
  const target = rows.find(r => r.textContent?.includes('franchisee@gmail.com'));
  return { found: !!target, rowText: target?.textContent?.slice(0, 200) ?? null };
  ```
- Parallel? No.
- Expected: `{ found: true, ... }`. If false, abort and report.

**Step 9** — Click "Login as" on the franchisee row.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const rows = Array.from(document.querySelectorAll('tr'));
  const target = rows.find(r => r.textContent?.includes('franchisee@gmail.com'));
  const btn = target?.querySelector('button');
  // Find button whose text matches "Login as" specifically
  const loginBtn = Array.from(target?.querySelectorAll('button') ?? [])
    .find(b => /login as/i.test(b.textContent ?? ''));
  loginBtn?.click();
  return { clicked: !!loginBtn };
  ```
- Parallel? No.
- Expected: `{ clicked: true }`. Confirmation dialog appears.

**Step 10** — Confirm impersonation dialog.
- Tool: `find` + `javascript_tool`
- Snippet:
  ```js
  // Find the dialog confirm button (text includes 'Confirm' or 'Login as')
  const dialogBtns = Array.from(document.querySelectorAll('[role="dialog"] button'));
  const confirm = dialogBtns.find(b => /confirm|login as/i.test(b.textContent ?? ''));
  confirm?.click();
  return { confirmed: !!confirm };
  ```
- Parallel? No.
- Expected: `{ confirmed: true }`. Hard navigation begins.

**Step 11** — Wait briefly, then verify banner present.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const banner = Array.from(document.querySelectorAll('div'))
    .find(d => /impersonating/i.test(d.textContent ?? '') && d.className.includes('bg-yellow'));
  const stopBtn = banner ? Array.from(banner.querySelectorAll('button'))
    .find(b => /stop impersonating/i.test(b.textContent ?? '')) : null;
  return {
    bannerVisible: !!banner,
    bannerText: banner?.textContent?.trim().slice(0, 200) ?? null,
    stopButtonPresent: !!stopBtn,
    cookies: document.cookie,
  };
  ```
- Parallel? No.
- Expected: `bannerVisible: true`, text contains both `franchisee@gmail.com` and `developer.avantej@gmail.com`, `stopButtonPresent: true`.

**Step 12** — Click "Stop impersonating".
- Tool: `javascript_tool`
- Snippet:
  ```js
  const banner = Array.from(document.querySelectorAll('div'))
    .find(d => /impersonating/i.test(d.textContent ?? '') && d.className.includes('bg-yellow'));
  const stopBtn = banner ? Array.from(banner.querySelectorAll('button'))
    .find(b => /stop impersonating/i.test(b.textContent ?? '')) : null;
  stopBtn?.click();
  return { clicked: !!stopBtn };
  ```
- Parallel? No.
- Expected: `{ clicked: true }`. Hard reload triggers (window.location.href change).

**Step 13** — Verify admin session restored.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const banner = Array.from(document.querySelectorAll('div'))
    .find(d => /impersonating/i.test(d.textContent ?? '') && d.className.includes('bg-yellow'));
  return {
    bannerStillVisible: !!banner,
    pathname: window.location.pathname,
    sidebarHasPlatformAdmin: !!document.querySelector('a[href="/dashboard/platform-admin/users"]'),
  };
  ```
- Parallel? No.
- Expected: `bannerStillVisible: false`, `sidebarHasPlatformAdmin: true` (admin restored).

### Phase C — Golden Path 2: Grant + Revoke Platform Admin Role

**Step 14** — Navigate to admins page.
- Tool: `navigate`
- URL: `http://localhost:3001/dashboard/platform-admin/admins`
- Expected: admins DataTable; current super_admin row visible.

**Step 15** — Verify self-revoke is blocked.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const rows = Array.from(document.querySelectorAll('tr'));
  const selfRow = rows.find(r => r.textContent?.includes('developer.avantej@gmail.com'));
  const buttons = Array.from(selfRow?.querySelectorAll('button') ?? []);
  const revokeBtn = buttons.find(b => /revoke/i.test(b.textContent ?? ''));
  return {
    selfRowFound: !!selfRow,
    revokeBtnExists: !!revokeBtn,
    revokeBtnDisabled: revokeBtn?.disabled ?? null,
  };
  ```
- Expected: either `revokeBtnExists: false` (hidden) OR `revokeBtnDisabled: true`. Either is acceptable per plan §5 Phase 5.

**Step 16** — (Skipped automated grant) Manually verify there is at least one Grant control on the page.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const grantBtns = Array.from(document.querySelectorAll('button'))
    .filter(b => /grant|add admin|invite/i.test(b.textContent ?? ''));
  return { grantControlCount: grantBtns.length };
  ```
- Expected: `grantControlCount >= 1`. Actual grant flow is not exercised here to avoid creating throwaway admin records.

### Phase D — Golden Path 3: Tenant Admin Impersonates Staff

**Step 17** — Sign out current super_admin.
- Tool: `javascript_tool`
- Snippet:
  ```js
  // Better-Auth sign-out via fetch — avoids any UI menu navigation
  const res = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
  return { status: res.status };
  ```
- Expected: 200. Session cookie cleared.

**Step 18** — Navigate to sign-in.
- Tool: `navigate`
- URL: `http://localhost:3001/sign-in`
- Expected: sign-in form re-rendered.

**Step 19** — Sign in as franchisee tenant admin.
- Tool: `form_input` (email), `form_input` (password)
- Email: `franchisee@gmail.com`
- Password: `password123`
- Parallel? Yes (independent fields).

**Step 20** — Submit and land on dashboard.
- Tool: `javascript_tool`
- Snippet: `document.querySelector('button[type="submit"]')?.click()`
- Expected: redirect to `/dashboard/...`.

**Step 21** — Navigate to staff list.
- Tool: `navigate`
- URL: `http://localhost:3001/dashboard/user/view`
- Expected: staff DataTable.

**Step 22** — Verify "Login as" button is visible only when caller is admin.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const buttons = Array.from(document.querySelectorAll('button'))
    .filter(b => /login as/i.test(b.textContent ?? ''));
  return { loginAsButtonCount: buttons.length };
  ```
- Expected: `> 0` if franchisee has admin role on this org; `0` otherwise. If `0`, log warning and skip steps 23–26.

**Step 23** — Click "Login as" on first staff row.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => /login as/i.test(b.textContent ?? ''));
  btn?.click();
  return { clicked: !!btn };
  ```
- Expected: confirmation dialog opens.

**Step 24** — Confirm dialog.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const dialogBtns = Array.from(document.querySelectorAll('[role="dialog"] button'));
  const confirm = dialogBtns.find(b => /confirm|login as/i.test(b.textContent ?? ''));
  confirm?.click();
  return { confirmed: !!confirm };
  ```
- Expected: hard navigation begins.

**Step 25** — Verify banner appears with tenant-admin context.
- Tool: `javascript_tool`
- Snippet:
  ```js
  const banner = Array.from(document.querySelectorAll('div'))
    .find(d => /impersonating/i.test(d.textContent ?? '') && d.className.includes('bg-yellow'));
  return {
    bannerVisible: !!banner,
    bannerText: banner?.textContent?.trim().slice(0, 200) ?? null,
  };
  ```
- Expected: `bannerVisible: true`, text mentions franchisee email as the admin.

**Step 26** — Stop impersonating, verify restoration.
- Tool: `javascript_tool`
- Snippet: same as steps 12 + 13 combined.
- Expected: banner removed, original franchisee session restored.

### Phase E — Final Console Sweep

**Step 27** — Read console errors across the entire run.
- Tool: `read_console_messages`
- Pattern: `error|Error|Uncaught|Failed`
- Parallel? No.
- Expected: zero unexpected errors. React Suspense fallbacks and TanStack Query devtools logs are tolerated.

---

## 5. Dialog & Loop Hardening

**Alert/confirm/prompt risks:**
- The "Login as" confirmation in `users-table.tsx` and `actions-cell.tsx` uses shadcn `Dialog` (in-DOM, not browser-native). Safe. No `window.confirm` usage in either component (verified during execute phase).
- Sign-out via fetch avoids any logout dropdown that might use a native dialog.
- **Pre-emptive safety:** Step 1 (after `tabs_create_mcp`) optionally inject:
  ```js
  window.alert = window.confirm = window.prompt = () => true;
  ```
  to no-op any unexpected native dialog. Run via `javascript_tool` immediately after `navigate` to sign-in.

**Rabbit-hole stop rule:**
- Maximum 2 retries on any failing chrome tool call. After the second failure, abort the run and write findings to `results.md` listing what was attempted and the failure mode.

**Timeout rule:**
- Page loads expected within 15 seconds. If `navigate` does not return within that window or DOM remains empty, abort.

**Tab-invalidation recovery:**
- If any tool returns "tab does not exist", the next action MUST be `tabs_context_mcp` (not retry). If no tab from this session is recoverable, abort and report.

**Hard-reload caveat:**
- After clicking "Stop impersonating", the page does `window.location.href = result.redirectTo`. This is a full reload — do NOT assume the previous DOM is queryable. Subsequent steps use a fresh `javascript_tool` read which implicitly waits for the new DOM.

---

## 6. Verification Checkpoints

| Success criterion (from §1) | Evidence captured by | Pass threshold |
|---|---|---|
| Sidebar shows Platform Admin links for super_admin | Step 5 — JS check on `a[href]` selectors | both `usersLink` and `adminsLink` are `true` |
| "Login as" → impersonate → banner appears | Steps 9–11 — click + JS read of banner | `bannerVisible: true`, text contains both emails |
| Banner shows correct emails | Step 11 — JS textContent | regex match for impersonated + admin email |
| Stop button restores admin session via hard reload | Steps 12–13 — click + JS recheck | `bannerStillVisible: false`, sidebar admin links present |
| Self-revoke blocked | Step 15 — JS read of revoke control state | revoke button hidden OR disabled for self row |
| Banner absent when not impersonating | Step 13 — `bannerStillVisible: false` | strict false |
| Tenant admin "Login as" gated by role | Step 22 — count of buttons | `> 0` only when caller is admin |
| Tenant admin impersonation flow works | Steps 23–26 — full mini-flow | banner appears, Stop restores |
| No console errors | Steps 6 + 27 — filtered console reads | zero matches for `error|Uncaught|Failed` |

---

## 7. Deliverable

**Output file:** `chrome-test/results.md` (in the same session folder).

**Format — bullet list of findings, structured per success criterion:**

```markdown
# Chrome Test Results: Platform & Tenant Admin Impersonation

**Executed:** YYYY-MM-DD HH:MM
**Plan:** chrome-test/plan.md
**Status:** pass | fail | partial

## Pre-flight
- [ ] Both dev servers reachable (web 3001, server 3000)
- [ ] developer.avantej@gmail.com seeded as super_admin
- [ ] franchisee@gmail.com has member.role=admin somewhere

## Golden Path 1 — Platform admin impersonates user
- Sign-in: pass | fail (notes)
- Sidebar gating: pass | fail
- Login-as click + dialog: pass | fail
- Banner visible with correct emails: pass | fail
- Stop impersonating restores admin: pass | fail

## Golden Path 2 — Grant/revoke admin role
- Self-revoke blocked: pass | fail
- Grant control present: pass | fail (count)

## Golden Path 3 — Tenant admin impersonates staff
- Tenant-admin login-as button visibility: pass | fail
- Impersonation banner appears: pass | fail
- Stop restores tenant admin: pass | fail

## Edge Cases
- Banner hidden when not impersonating: pass | fail
- Console errors: zero | list

## Failures and Anomalies
- (free-form)

## Artifacts
- (any captured selectors, error messages, network calls)
```

No screenshots or GIFs requested. JSON dumps from `javascript_tool` should be quoted inline in the relevant section if useful for debugging.

---

## 8. Efficiency Audit (self-check)

- [x] Every MCP tool listed in §3 is used in §4: `tabs_context_mcp` (step 1), `tabs_create_mcp` (step 2), `navigate` (steps 7, 14, 18, 21), `find` (step 4 + step 10 fallback), `form_input` (steps 3, 19), `javascript_tool` (everywhere), `read_console_messages` (steps 6, 27).
- [x] No step uses `read_page` — every DOM read uses `javascript_tool` with a precise query and minimal return shape.
- [x] Both `read_console_messages` calls have explicit `pattern` filters.
- [x] Parallel batches identified: steps 3 (two `form_input`), steps 5+6 (DOM check + console read), step 19 (two `form_input`).
- [x] Dialog risks enumerated; pre-emptive `window.confirm` no-op available if needed.
- [x] **Estimated total tool calls:** ~28 (1 ToolSearch + 27 chrome tool calls). Slightly above the 15-call target for a focused task because the run covers three independent golden paths in one pass. Acceptable since splitting would require re-authentication overhead.

**Pre-test checklist for the user (before /chrome-run):**
1. `bun dev` running in repo root (web on 3001, server on 3000).
2. `cd apps/server && bun run scripts/seed-platform-admin.ts` (one-time).
3. Confirm franchisee@gmail.com is `member.role === 'admin'` on at least one tenant org (otherwise step 22 returns `loginAsButtonCount: 0` and steps 23–26 are skipped — this is reported, not a hard failure).
4. Open Chrome with the claude-in-chrome extension installed and connected.

**After /chrome-run completes:** results land at `zplan/04-19_16-40_impersonation/chrome-test/results.md`. Then run `/done` to seal the session.

# Avantej Web — Actionable Gaps

**Scope:** `apps/web` only. Generated 2026-04-19.
**What's here:** Items that can be planned and executed as web app work today.
**What's not here:** Deferred/skipped items → see `web-gaps-skipped.md`.

Pick a bucket, then `/plan` it.

---

## Tier 1 — Immediate (small effort, high pain)

### Critical broken flow
- **Onboarding** (`/onboarding`) — org creation is mocked with `setTimeout`; slug generation not implemented. New tenants cannot actually onboard.

### Stub buttons / broken lists
- **Sales View** (`/dashboard/sales/view`) — "View"/"Edit" buttons are `console.log` stubs. Sales detail only reachable by direct URL.
- **Payment View** — View/Edit buttons are stubs (read-only ledger only).
- **Access Control – User Assignment** — role badges never render (`members.list` doesn't return role IDs); bulk actions are UI-only no-ops.
- **Access Control – Invitations** — list filtered by `invitedBy: current member`; admins can't see each other's invites.
- **Access Control – Roles** — wizard-selected permissions not carried into `RoleEditor`.

### 1-line fixes
- **"Reports" nav → Sales page** (`app-sidebar.tsx:428`) — `url: "/dashboard/sales/view"` for Reports nav item. No `/dashboard/reports` route. Every tenant will file "Reports is broken."
- **"Profile" footer link → Dashboard home** (`app-sidebar.tsx:492`) — `<Link to="/dashboard">Profile</Link>`. No profile page for logged-in user.
- **Fix `playwright.config.ts` `testMatch`** — currently only matches `fixes-verification.spec.ts`; `smoke.spec.ts` has never run. Auth regressions undetected since file was written.

### Stale/harmful docs (delete now)
- **`docs/web-app-feature-status.md`** — 4 source-verified wrong claims: route guards described as stubs (fully implemented), appointment modal described as using mock arrays (uses real oRPC), `packages/view.tsx` described as existing (it doesn't), `verify-email` open-redirect marked Critical (already mitigated). Using this for planning wastes work. Delete it; `zhub/index.md` is canonical.

---

## Tier 2 — Structural cleanup (medium effort, compounds value)

### Data / UX correctness
- **Expenses** — `currency` column defaults to `"usd"` but UI shows MYR.
- **Payouts** — hard 50-record limit, no pagination.
- **Commissions Ledger** — empty until `commissionPercentage` config exists per service/staff.
- **Class Slots / Walk-in Customers / Purchase Orders** — branch is a raw UUID text input (no combobox).
- **Package Installments** — all `installments.*` calls cast as `any` (router not typed).
- **Cancelled Sales** — errors silently return `[]`.
- **Customers** (`/customers`) — `requirePermission` string/object mismatch.
- **Announcements** — audience filter is client-side only.
- **My Commissions** — no permission gate.

### Topbar title hardcoded
- **`_authenticated.tsx:32`** — `const title = "Dashboard"` across all 51 pages. Comment says "can be overridden by child routes" but no child route does. Wire each route to pass its own title.

### Notification bell unread badge
- **`app-topbar.tsx:130`** — bell icon renders but `notifications.getUnreadCount` is never called. Users must navigate to Notifications page to discover unread items.

### Security
- **Session cached in localStorage** (`useUserContext` reads it) — XSS-exploitable + recurring stale-permission-cache bug (per memory: hit this repeatedly).
- **PII visibility** — customer phone/email rendered in tables without masking; no audit-logged "view sensitive field" action.
- **File upload story absent** — trainer `imageUrl`, invoice receipts, PO attachments: R2? Signed URLs? Validation? Size limits? No zhub page covers it.
- **Test credentials in `CLAUDE.md`** — fine for dev, dangerous if prod ever shares environment.

### Repo health
- **Delete legacy duplicate routes** — `/appointment/view`, `/service/view`, `/service-category/view`, `/user/view`, `/role/view` overlap with `/dashboard/*` versions.
- **Root-level junk** — `MEMBER_ASSIGNMENT_FIX.md`, `MEMBER_REASSIGNMENT_TESTING.md`, `MEMBER_SELECTOR_IMPLEMENTATION.md` clutter the repo entrypoint.
- **`docs/FEATURE_WIRING_AUDIT.md`, `FORM_WIRING_AUDIT.md`** — overlap with `zhub/` and rot.
- **`apps/server/src/Untitled` folder** — leftover; delete or rename.
- **`zplan/04-19_16-40_impersonation/`** — sitting uncommitted but `zplan/AUDIT.md` says 0 active sessions. Fix the ledger.
- **No seed data script** — every developer reinvents test fixtures.

### Pagination contract
- Standardize pagination across all tables. Payouts caps at 50; others unknown. No shared contract.

---

## Tier 3 — Quality bets (bigger effort, prevents regressions)

### Error boundaries
- **`dashboard/_layout.tsx` is a pure `<Outlet />` passthrough** — no error boundary. Any route error white-screens the whole app. Add an intermediate boundary at `_layout.tsx` so non-failing sections stay visible.
- **`RootErrorBoundary` `componentDidCatch` is empty** — this is where Sentry wires in. Currently no external reporting.
- *(Note: `__root.tsx` root boundary EXISTS — gap is the missing intermediate dashboard-level boundary.)*

### Observability
- **No error tracking** (Sentry, etc.) — Cloudflare Workers logs are transient. Wire into `RootErrorBoundary.componentDidCatch`.
- **No product analytics** — can't tell which pages are used. Legacy duplicate routes can't be defended/removed without data.

### Cross-cutting UX
- No consistent **empty / loading / skeleton** pattern across pages.
- No shared **toast / notification** strategy for mutation success/failure.
- **TanStack Query invalidation is bespoke** — no shared invalidation contract. Hub flags one confirmed mismatched key.
- **Unsaved-changes guard** missing on long flows (Sales POS, Branch Create wizard, Roles wizard). Browser refresh = data lost.
- **Print stylesheet** — Sales Detail has "Print Receipt" with no shared print CSS.

### Auth hardening
- **No MFA** for admin roles handling money (Better-Auth supports it).
- **No build-version tag** in client — reported bugs can't be tied to a deploy.

### Performance
- **No evidence of route-level code-splitting** — 51 dashboard pages in one Vite bundle. Verify TanStack Router lazy routes are used; add if not.
- **No bundle-size budget or CI gate** — easy to silently regress.

### Accessibility + mobile
- Keyboard nav, focus traps in Dialogs (POS, customer drawer), ARIA on DataTable, light-theme contrast — never audited.
- **Responsive / mobile browser** — 51 dashboard pages, none iPad-tested. Franchisees use POS on tablets.

### Timezone & locale
- Malaysia tenants render dates with no `Intl.DateTimeFormat` audit. Inconsistency corrupts financial reporting.

---

## Tier 4 — New surfaces (actionable but larger scope)

### Unwired API routers (working backend, zero web UI)
- **`organizationSettings`** (`get` / `upsert`) — grace period, commission %, locale only changeable via raw API. Natural home: a new `/dashboard/settings/organization` page.
- **`waitlist`** (`list` / `add` / `remove` / `promote`) — no page for class/appointment waitlists. Daily operational need.
- **`notificationPreferences`** (`get` / `update`) — users can't opt out of email/push. GDPR / CAN-SPAM risk. Natural home: Profile page (also fixes dead "Profile" sidebar link).
- **`preferredTimes`** (`list` / `upsert`) — no UI; data goes stale with no correction path.
- **`userActivityLog`** (`list`) — security review of admin actions requires this. Table accrues data nobody can read.

### Product spec gaps (web UI only)
- **Spec §9 — Coach installment view** — coaches should see assigned clients' installment schedules. No coach-specific view exists. Coaches ask admin staff to check payment status before allowing a client in.
- **Spec §11 — Org-level grace period config** — global setting with per-service overrides. Per-service edit exists (`service-form.tsx`); global org setting doesn't (root cause: `organizationSettings` router unwired above).

### Missing product surfaces
- **Customer 360 page** — unify profile + memberships + bookings + invoices + notes (drawer isn't enough).
- **Global ⌘K search** across customers, sales, members.
- **Inline audit-log on entity pages** — customer/sale drawers should show "what happened here." (`userActivityLog` router above serves this.)
- **First-run / onboarding checklist** for new tenants ("set up first branch, invite first staff, create first service").

---

## Top three by immediate leverage

1. **Tier 1 stub buttons + sidebar misdirections** — Sales View, User Assignment, Roles wizard, Reports link. High daily-use pain, small diffs.
2. **Error boundary at `dashboard/_layout.tsx` + Sentry wiring** — one oRPC failure currently white-screens a paying tenant.
3. **Unwired `organizationSettings` + `notificationPreferences` routers** — backend is done; org admins can't self-serve their own config, and users can't opt out of comms (compliance risk).

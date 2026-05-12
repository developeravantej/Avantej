## Run: 2026-04-20
**Trigger:** /execute
**Plan version:** zplan/04-19_19-31_tier4-new-surfaces/plan/plan.md

### Phase outcomes
- Phase 1 (4A, 4B, 4C, 4D, 4F — parallel): pass — all 5 agents completed, web tsc clean, lint clean
- Phase 2 (4G): pass — CommandPalette component created, web tsc clean, lint clean

### Final build status
- type check: pass (web 0 errors; server errors are all pre-existing in scripts)
- lint: pass (0 new errors in any Tier 4 files)
- tests: N/A (frontend only; no test suite for new components)

### Deferred
- Phase 4E (Coach Installments): deferred — package_instances has no staffId column
- All app-sidebar.tsx wiring: deferred to Tier 5 (04-19_19-35_tier5-sidebar-consolidation)

### Cross-agent decisions
- OQ2-B approved: added clientUserId param to appointments.list router + service call
- S1–S4 scalability fixes applied in all new components
- MemberRow.joinedAt (not createdAt), CustomerProfileRow.phone (not phoneNumber), installments.amount (not amountCents) — corrected by 4F agent during implementation

---

## Agent: 4A (Organization Settings) — Phase 1
**Completed:** 2026-04-20T00:00:00Z

### What I Did
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/organization.tsx`: Created Organization Settings page with 3 parallel `useQuery` calls for `grace_period_days`, `commission_percentage`, and `locale` keys; react-hook-form + zod schema with coerce validators; `useEffect` pre-fill on query resolution; `Promise.all` save with rollback on failure; skeleton loading state; admin-only save button with Badge indicator.

### Decisions Made
- Used `Form`/`FormField`/`FormItem`/`FormControl` from shadcn/ui for consistent field error display alongside react-hook-form — matches the zod integration pattern better than raw `<input>` elements.
- `staleTime: 60_000` added to all three queries per S4 fix requirement to avoid unnecessary refetches on tab focus.
- Guard for `!organizationId` renders a centered message (same pattern as tax-rates.tsx) rather than a skeleton, since skeleton would be misleading when no org is selected.
- Rollback uses `form.reset(previousValues)` where `previousValues` is captured via `form.getValues()` before the async save — this restores the form to the exact pre-submit state if any of the 3 upserts fail.

### Issues Encountered
- None

---

## Agent: 4B (Notification Preferences) — Phase 1
**Completed:** 2026-04-20T00:00:00Z

### What I Did
- `apps/web/src/routes/_authenticated/dashboard/_layout/settings/notifications.tsx`: Created notification preferences page with two Card sections (Channels + Content), auto-save on Switch toggle, save state indicator, and skeleton loading state.

### Decisions Made
- Used `Partial<NotifPrefs>` as the mutation field type so each toggle fires `update` with only the changed key — avoids overwriting other fields if the server does partial updates.
- Skeleton loading renders the Bell icon header so the page doesn't feel completely blank during load.
- `staleTime: 60_000` applied to the query per spec (S4 fix).
- Save state indicator uses a small colored dot + text rather than a toast to avoid notification spam on every toggle.
- `disabled={mutation.isPending}` on all switches prevents race conditions from rapid toggling.

### Issues Encountered
- None

---

## Agent: 4C (Waitlist Management) — Phase 1
**Completed:** 2026-04-20T00:00:00Z

### What I Did
- `apps/web/src/components/class-slots/waitlist-panel.tsx`: Created new WaitlistPanel component — `useQuery` for `waitlist.list` (staleTime 30_000) and `members.list` (staleTime 60_000); builds `Map<userId, name>` for cross-referencing waitlist entry userIds; table with Position/Member/Added/Status/Actions columns; Promote First button (disabled when no "waiting" entries); per-row Remove button; Add to Waitlist section with Select combobox (sliced to 50 members); loading skeleton; empty state; error state with retry.
- `apps/web/src/routes/_authenticated/dashboard/_layout/appointment/class-slots/view.tsx`: Added `WaitlistPanel` import; added `waitlistSlotId` + `waitlistSheetOpen` state; added "Waitlist" Button in actions column; added Waitlist Sheet at bottom of JSX rendering WaitlistPanel when slot is selected.

### Decisions Made
- `entry.userId` (waitlist) and `member.userId` (members.list) are both the control panel user ID (text) — the lookup map key is `member.userId → member.name`, not `member.id`.
- `members.list` has no `limit` param — sliced memberOptions to 50 in the component with a comment noting the S1 scalability constraint.
- Used a plain HTML `<table>` inside a `rounded-md border` div rather than DataTable to keep the panel lightweight (no pagination needed for a waitlist).
- Error handling for `addMutation` uses `err.message` directly (covers BAD_REQUEST duplicates surfaced by the server).

### Issues Encountered
- None — web app type check passes (exit code 0).

---

## Agent: 4D (Activity Feed + Onboarding) — Phase 1
**Completed:** 2026-04-21T00:00:00Z

### What I Did
- `apps/web/src/components/dashboard/recent-activity-widget.tsx`: Created RecentActivityWidget — `useQuery` calling `client.userActivityLog.list` with limit 10 and staleTime 60_000; inline `relativeTime()` helper using arithmetic (no date-fns); `ScrollText` lucide icon for all activity types; skeleton loading (3 rows); empty state; Card with "My Recent Activity" title.
- `apps/web/src/components/dashboard/onboarding-checklist.tsx`: Created OnboardingChecklist — queries `organizationSettings.get` for "onboarding_dismissed" key; returns null when dismissed or loading; 4 completion queries (members.list, hierarchy.listNodes, services.list, salesOrders.list) all disabled when dismissed; progress bar showing X/4 complete; TanStack Router `Link` rows with `CheckCircle2` (done) / `Link2` (not done) icons; Dismiss button mutates `organizationSettings.upsert` then invalidates the dismissed query.
- `apps/web/src/routes/_authenticated/dashboard/_layout/index.tsx`: Added imports for both new widgets; changed `organizationId` from `?? ""` to `?? null`; updated KPI queries to use `organizationId!` non-null assertion (still guarded by `enabled: !!organizationId`); added `<OnboardingChecklist>` immediately after `<GreetingBanner>` and before `<QuickActions>`; added `<RecentActivityWidget>` as a 3rd column (lg:col-span-3) in the Activity section, with AnnouncementsWidget reduced to lg:col-span-5.

### Decisions Made
- OnboardingChecklist returns `null` during the dismissed-state loading phase to avoid a flash of the checklist before the dismiss state is known.
- `nodes.some((n: { type?: string }) => n.type === "branch")` typed inline to keep the component self-contained.
- Activity section layout changed from 4+8 to 4+5+3 split to fit RecentActivityWidget without removing existing widgets.
- `organizationId` changed to `string | null` to match new widget prop signatures and avoid empty-string edge cases in enabled checks.

### Issues Encountered
- Pre-existing server-side TypeScript errors in `apps/server` test files (unrelated). Web app type check passes cleanly (exit code 0).

---

## Agent: 4F (Customer 360) — Phase 1
**Completed:** 2026-04-20T12:00:00Z

### What I Did
- `apps/web/src/routes/_authenticated/dashboard/_layout/customers/$id.tsx`: Created Customer 360 full-page view with CustomerHeader (avatar + name/email/phone/joined date/status badge), 4-card KPI strip (LTV, Outstanding, Active Packages, Appointments), and shadcn Tabs for Overview / Packages / Payments / Appointments tabs.
- `apps/web/src/components/customers/customer-360/package-row.tsx`: Created expandable PackageRow sub-component that lazily fetches installments (`client.installments.listByPackageInstance`) and preferred times (`client.preferredTimes.list`) when expanded. Renders installments as a mini table and preferred times as day+time chips sorted by priority.
- `apps/web/src/routes/_authenticated/dashboard/_layout/customers/view.tsx`: Added `useNavigate` import and a second "Profile" outline button in the actions column that navigates to `/dashboard/customers/$id`.

### Decisions Made
- Used `member.joinedAt` (not `createdAt`) for joined date — confirmed from type error that MemberRow only has `joinedAt`.
- Used `profile.phone` (not `phoneNumber`) — the actual CustomerProfileRow field from the detail sheet schema.
- Used `installments.amount` (not `amountCents`) — confirmed from schema (`packages/db/src/schema/tenant/installments.ts`).
- Cast `appt.serviceName` as `{ serviceName?: string | null }` intersection since the appointments router enriches the base row but TypeScript infers the base type.
- Kept LTV as "N/A" per plan spec (not in `getById` response).

### Issues Encountered
- Initial type errors on `amountCents` (installments field is `amount`), `profile.phoneNumber` (actual field is `phone`), and `member.createdAt` (actual field is `joinedAt`) — all fixed before final type check.
- Web `tsc --noEmit` passed with zero errors after fixes. All remaining errors in the build are pre-existing in server scripts and other web pages.

---

## Agent: 4G (Global Search Palette) — Phase 2
**Completed:** 2026-04-20T12:00:00Z

### What I Did
- `apps/web/src/components/global-search/command-palette.tsx`: Created CommandPalette component using shadcn CommandDialog

### Decisions Made
- **Sales order field**: DB schema uses `salesOrderNumber` (Drizzle camelCase of `sales_order_number`); display label and client-side filter use this field
- **salesOrders.list has no limit param**: The API schema omits `limit`, so the sales query fetches all accessible orders and filters client-side (staleTime: 60_000 to avoid hammering)
- **membersList returns enriched rows**: Each row has `{ id, userId, role, hierarchyScopeId, status, joinedAt, name, email }` — name/email come from cross-DB join to control panel; fallback is "Unknown"
- **Member navigation**: No member detail page exists yet — routes to `/dashboard/user/view` as specified
- **CommandItem value prop**: Each item gets a prefixed unique value (`customer-{id}`, `member-{id}`, `sale-{id}`) to prevent cmdk de-duplication collisions across groups
- **Hint vs CommandEmpty**: When query < 2 chars, renders a plain div hint (not CommandEmpty) so cmdk does not incorrectly show "No results" before the user types
- **customerResults type**: Typed as `{ rows: CustomerRow[], total: number }` matching `listCustomerDirectory` service return shape

### Issues Encountered
- Pre-existing type errors in `packages/api/src/routers/members.ts` (implicit `any` on `.map` param) and other server packages — none introduced by this agent

---

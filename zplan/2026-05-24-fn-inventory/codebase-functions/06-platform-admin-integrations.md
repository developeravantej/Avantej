# Domain 06 — Platform-Admin, Billing, Subscriptions, Integrations & Cross-cutting

Scope: server-only routers in `apps/server/src/routers/` (platform-admin, billing, integrations, auth, invitations) + tenant cross-cutting routers in `packages/api/src/routers/` + backing services in `packages/services/src/`. `payments.ts` deliberately skipped (owned by money-flow agent).

Citations are `file:line`. "Uncatalogued" = not present in `zhub/shared/api-overview.md` (only `admin`, `auth`, `invitations`, `tenant-admin` from the server side, plus the tenant cross-cutting routers, appear there; all `platform-admin-*`, `subscriptions`, `stripe-connect`, `ghl`, `scheduled-reports`, `onboarding` are absent).

---

## Routers & Procedures

### Server: subscriptions.ts (SaaS billing lifecycle) — uncatalogued
Factory `createSubscriptionsRouter(stripeOverride?)`; default export `subscriptionsRouter`.

| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `createCheckoutSession` | protected | Build Stripe Checkout URL for tier (`subscriptions.ts:58`) | inline Stripe `checkout.sessions.create`; price IDs from env `STRIPE_PRICE_*` |
| `getStatus` | protected | Current sub state + access decision/banner (`:114`) | `evaluateAccess` (require-active-saas-sub.middleware) |
| `billingPortal` | protected | Stripe Customer Portal URL (`:223`) | inline Stripe `billingPortal.sessions.create` |

### Server: stripe-connect.ts (tenant Connect onboarding) — uncatalogued
Factory `createStripeConnectRouter`; exports HMAC helpers `signOAuthState` (`:109`), `verifyOAuthState` (`:126`).

| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `createOnboardingUrl` | protected | Build Stripe OAuth authorize URL, signed state (`:190`) | inline; no SDK call |
| `getAccountStatus` | protected | charges/payouts/details flags, prefers charges-enabled row (`:260`) | reads `orgCountryStripeAccounts` |
| `listCountryAccounts` | protected | All Connect accounts per country (`:302`) | reads `orgCountryStripeAccounts` |

### Server: ghl.ts (GoHighLevel integration) — uncatalogued
| Procedure | Auth | Purpose | Backing |
|---|---|---|---|
| `connectBranch` | protected + `user_management:update` | Validate key, bootstrap custom fields, upsert `ghl_branch_links` (`:42`) | `validateGhlApiKey`, `ensureCustomFieldsExist` (server `@/services/ghl/setup`) |
| `disconnectBranch` | protected + perm | Soft-disable link (`isActive=false`) (`:125`) | inline |
| `listBranchLinks` | protected | List links + per-branch error counts (`:163`) | inline cross-DB query |
| `retryFailedSyncs` | protected + perm | Re-fire `syncCustomerToGhl` for errored links, cap 50 (`:215`) | `syncCustomerToGhl` (server `@/services/ghl/sync-customer`) |
| `connectOrgShared` | protected + perm | Org-level shared GHL connection on `organizations` row (`:349`) | inline + GHL setup |
| `disconnectOrgShared` | protected + perm | Clear org-shared fields (`:410`) | inline |
| `getOrgShared` | protected | Read org-shared config (`:450`) | inline |

### Server: admin.ts (platform admin core) — catalogued (`## admin`)
`requirePlatformAdmin(allowRoles?)` middleware factory (`:48`). Procedures: `me`, `listUsers`, `listAdmins`(super), `impersonateUser`(super/support), `stopImpersonating`, `getImpersonationStatus`, `grantPlatformAdmin`(super), `revokePlatformAdmin`(super), `listTenants`, `getTenant`, `suspendTenant`, `unsuspendTenant`, `getStats`. Backing: `getPlatformAdmin`, `syncUserRole`, `getFirstActiveOrgForUser` (server `admin.service`), Better-Auth `impersonateUser`/`stopImpersonating`.

### Server: tenant-admin.ts — catalogued (`## tenant-admin`)
`impersonateMember` (`:69`), `stopImpersonating` (`:216`). Backing: `assertTenantAdminCanImpersonate` (`tenant-admin.service.ts:34`) + Better-Auth. Note caller-role elevation hack at `:124-141` (temporarily sets `user.role='admin'` then restores in `finally`).

### Server: auth.ts — catalogued (`## auth`)
`login`, `userContext`, `verifyEmail`. Backing: Better-Auth handler, `getDescendantNodeIds`, `verifyEmailToken` (server `auth.service`).

### Server: invitations.ts + invitation-acceptance.ts — catalogued (`## invitations`)
`serverInvitationRouter` = `sendEmail` (`:60`), `accept` (`:108`, overrides base), `acceptWithSignup` (`:237`, public). Backing: `sendInvitationEmail`, `MembershipService.createMember`, `getInvitationByToken`/`validateInvitation`, `fireCustomerSync`, `dispatchStaffSync`. `validateAcceptanceInput` (pure helper, `invitation-acceptance.ts:29`).

### Server: platform-admin-* group (treat as one group; all uncatalogued)
- **dashboard.ts**: `getOverview` — counts + MRR estimate from tier prices.
- **revenue.ts**: `getKpis`, `getCohortRetention`, `getRecentChurn` — all from `subscriptions.tier × TIER_PRICES_USD_CENTS`.
- **renewals.ts**: `getCalendar` — upcoming renewals valued at placeholder tier prices.
- **health.ts**: `getScoreboard`; **tenants-health.ts**: `get`, `history`, `listAtRisk` — back `computeHealthScore` (`health-score.ts:102`).
- **webhooks.ts**: `getOverview`, `listEvents` (Stripe webhook event inspection).
- **payments.ts**: `overview`, `listDrift`, `markDriftResolved`, `listDisputes`, `markDisputeHandled`, `listStuckOnboardings`, `runReconciliationNow`(super), `runWebhookBackfillNow`(super).
- **coupons.ts**: `listCoupons`, `createCoupon`(super), `deleteCoupon`(super), `applyCoupon`(super), `removeCoupon`(super), `getCustomerCoupon` — real Stripe coupons SDK.
- **billing.ts**: `getOverview`, `listInvoicesCrossTenant` — Stripe invoices/coupons via DI factory.
- **tenants.ts**: `listTenants`, `getTenantDetail`, `getTenantUsageHistory`, `suspendTenant`(super), `resumeTenant`(super), `forceCancelTenant`(super), `issueTenantCredit`(super), `reTrialTenant`(super), `getTenantFunnel`, `runTenantUsageSnapshotsNow`.
- **tenants-billing.ts**: `listInvoices`, `getInvoice`, `refundInvoice`(super), `getCustomerSummary`, `changeTier`(super) — real Stripe refunds/subscription update.
- **tenants-comms.ts**: `sendTenantDirectMessage`, `createTenantAnnouncement`, `bulkSendDirectMessage`(super), `bulkSendAnnouncement`(super) — **real email + in-app delivery** (see Gaps note, this is the positive contrast to tenant notifications).
- **comms.ts**: `listOutbox`, `listTemplates`, `getTemplate`, `createTemplate`(super), `updateTemplate`(super), `archiveTemplate`(super), `unarchiveTemplate`(super) — outbox is a read view over `adminSessionActions`.
- **tenants-feature-flags.ts**: `get`, `listOverrides`, `setOverride`(super), `clearOverride`(super).
- **tenants-tags.ts**: `list`, `listForOrg`, `add`, `remove`, `bulkAdd`(super), `bulkRemove`(super), `bulkSuspend`(super).
- **tenants-members.ts**: `list`, `getCounts`. **tenants-notes.ts**: `list`, `create`, `update`, `delete`. **tenants-search.ts**: `search`. **tenants-provision.ts**: `provisionTenant`(super).
- **tenants-deletion.ts**: `requestTenantExport`(super), `requestTenantDeletion`(super), `restoreTenantDeletion`(super), `listTenantDeletions`(super), `runHardDeleteSweeperNow`(super) → `hardDeleteOverdueTenants` (server `tenant-deletion.service`, needs `NEON_API_KEY`).
- **audit.ts**: `listAdminActions`, `listActionTypes` — canonical platform audit (reads `adminSessionActions`+`adminSessions`).
- **migrations.ts**: `listMigrations`, `getMigrationFile`.

### Tenant cross-cutting routers (catalogued where noted)
| Router | Procedures | Backing service |
|---|---|---|
| announcements.ts (catalogued) | `list`, `listActive`, `create`, `update`, `delete` | `announcements.service` |
| notifications.ts (catalogued) | `list`, `getUnreadCount`, `markRead`, `markAllRead` | `notification.service` |
| notification-preferences.ts (catalogued) | `get`, `update` | `notification-preference.service` |
| audit-logs.ts (catalogued) | `list`, `exportCsv` | `audit-log.service` (`listAudit`, `exportAuditCsv`) |
| user-activity-log.ts (catalogued) | `list` | `user-activity-log.service` (`listUserActivityLog`) |
| scheduled-reports.ts (uncatalogued) | `list`, `create`, `delete`, `toggle` | `scheduled-reports.service` |
| analytics.ts (catalogued) | `getDashboardKpis`, `getStaffPerformance`, `getRevenueSeries`, `getMemberCountSeries`, `getChurnSeries`, `getLtvSeries`, `getClassFillRateSeries` | `analytics.service` |
| google-calendar.ts (catalogued) | `status`, `disconnect`, `orgStatus`, `updateSettings`, `syncNow`, `listConnectedCalendars` | `google-calendar.service` + `google-calendar-sync.service` |
| registration.ts (catalogued) | `listCountries`(public), `listBranches`(public), `complete` | inline + `MembershipService` |
| onboarding.ts (uncatalogued) | `getInviteContext`(public), `redeemInvite`(public) | `onboarding.service` |

---

## Service Functions

**announcements.service.ts**: `listAnnouncements`, `listActiveAnnouncements`, `createAnnouncement`, `updateAnnouncement`, `deleteAnnouncement` — all exposed.

**notification.service.ts**: `listNotifications`, `getUnreadCount`, `markNotificationRead`, `markAllNotificationsRead` (all exposed via notifications router). Package-flow producers `notifyStaffOfPendingPackage` (`:113`), `notifyCustomerPackageAssigned` (`:179`), `notifyCustomerPackageRejected` (`:201`), `clearPendingReviewNotifications` (`:226`) — not exposed via this router but called from package-instance flows (cross-domain callers, NOT orphans).

**notification-preference.service.ts**: `getNotificationPreferences`, `upsertNotificationPreferences` — both exposed.

**audit-log.service.ts**: `getActionSeverity`/`deriveSeverity` (alias), `writeAudit`, `listAudit`, `exportAuditCsv`. `listAudit`+`exportAuditCsv` exposed; `writeAudit` is called from ~20 mutation services (members, refunds, pos, etc.) — actively wired, NOT orphan.

**user-activity-log.service.ts**: `listUserActivityLog` only — exposed. **No writer function exists.**

**scheduled-reports.service.ts**: `computeNextRunAt`, `createScheduledReport`, `listScheduledReports`, `deleteScheduledReport`, `toggleScheduledReportActive` (CRUD exposed); `listDueScheduledReports`, `markScheduledReportSent`, `markScheduledReportFailed` — consumed by the cron in `apps/server/src/services/scheduled-reports.service.ts` (`runScheduledReports`), NOT orphans.

**analytics.service.ts**: `getDashboardKpis`, `getStaffPerformance`, `getRevenueSeries`, `getMemberCountSeries`, `getChurnSeries`, `getLtvSeries`, `getClassFillRateSeries` — all exposed; all query real tenant tables (sales_orders, appointments, commission_splits, class_slots).

**google-calendar.service.ts**: `getGoogleAuthUrl`, `exchangeCodeForTokens`, `refreshAccessToken`, `getGoogleUserInfo`, `revokeGoogleToken`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`, `listGoogleCalendars`, `checkSyncNowRateLimit`. `revokeGoogleToken`, `listGoogleCalendars`, `checkSyncNowRateLimit` used by router. `getGoogleAuthUrl`/`exchangeCodeForTokens`/`getGoogleUserInfo` are used by the OAuth **REST** connect/callback routes (not the oRPC router) — verify those routes exist (see Gaps).

**google-calendar-sync.service.ts**: `syncAppointmentToGoogleCalendar` (`:112`) — wired into `appointments/crud.procedures.ts:131,249` (create/update). Active.

**ghl-staff-sync.service.ts**: `dispatchStaffSync` (`:97`), `dispatchProfileSync` (`:270`). `dispatchStaffSync` wired into members router (create/role/scope/archive/sync procedures) + `acceptWithSignup`. `dispatchProfileSync` — see Gaps (likely orphan / unwired profile hook).

**onboarding.service.ts**: `getInviteContext`, `redeemBranchInvite` — both exposed.

**tenant-admin.service.ts**: `assertTenantAdminCanImpersonate` — exposed via tenant-admin router.

**health-score.ts**: `computeHealthScore` — exposed via platform-admin health routers.

---

## Gaps (prioritized)

### DEFINITELY-BROKEN / dead-ends

1. **Tenant notifications have NO delivery channel — DB-rows-only.** `notification.service.ts` only `INSERT`s into the `notifications` table (`:162`, `:188`, `:211`) and updates `isRead`. No email/push/SMS is ever sent for tenant notifications. Grep for `sendEmail`/`resend`/`push`/`twilio` in `packages/services/src` finds **zero** delivery calls outside invitation/scheduled-report flows. The bell-icon list works (in-DB), but customers/staff get no out-of-band alert for `package_pending_review`, `package_assigned`, `package_rejected`. Contrast: `platform-admin-tenants-comms.ts:164` DOES call `sendEmail` (Resend) for tenant DMs — so the platform→tenant channel is real, but tenant→user is not.

2. **`notificationPreferences` toggles are dead config.** `notification-preference.service.ts:20-26` stores `emailEnabled`/`smsEnabled`/`pushEnabled`/`bookingReminders`/`bookingConfirmations`/`promotionalEmails`/`packageExpiry`, but no code reads any of these flags to gate a send (no consumer found anywhere in `packages/services`). Users can toggle preferences that have no effect. This is a UI/data dead-end pending the delivery layer in gap #1.

3. **`user_activity_log` table has a reader but NO writer.** `user-activity-log.service.ts` exports only `listUserActivityLog`. Grep for `insert(userActivityLog)` across the whole repo returns **zero** matches. The "Recent Activity" widget (`userActivityLogRouter.list`) will always return an empty list — nothing ever populates the table. Either a writer was never built or the widget is permanently empty.

4. **`onboarding.ts` downgrades HTTP 410 GONE to 404.** Both `getInviteContext` (`onboarding.ts:94-100`) and `redeemInvite` (`:171-176`) catch service `GONE` errors (revoked/expired/max-uses-reached invite) and re-throw `ORPCError("NOT_FOUND")` with only a `cause.httpCode:410` hint that oRPC will not surface as a 410 status. The frontend cannot distinguish "invalid token" from "expired/used invite" by status code — both arrive as 404. Comment at `:95` acknowledges this ("GONE is not a standard ORPC code"). Possibly-intentional but a real UX gap.

### POSSIBLY-INTENTIONAL / placeholder data

5. **Platform-admin revenue/MRR is computed from placeholder tier prices, not Stripe.** `platform-admin-dashboard.ts:213`, `platform-admin-revenue.ts:9`, `platform-admin-renewals.ts:10` all derive MRR/KPIs/renewal value from `subscriptions.tier × TIER_PRICES_USD_CENTS` (constants in `@avantej-core/types`) rather than actual Stripe invoice amounts. `dashboard.ts:220` even hardcodes `mrrEstimateAvailable = true`. Comments mark these as "placeholders until Stripe is wired in." Numbers will be wrong for any tenant on a coupon/custom price. (Tenant analytics KPIs in `analytics.service.ts` are NOT mock — they query real data.)

6. **`google-calendar.syncNow` does not actually sync — it only bumps `updatedAt`.** `google-calendar.ts:196-205`: the comment says "Bump updatedAt as the sync signal (no dedicated queue table per D2)". There is no consumer that watches `updatedAt` to perform a pull/push sync. Real sync only happens inline on appointment create/update via `syncAppointmentToGoogleCalendar`. So the "Sync Now" button is effectively a no-op for back-filling existing appointments or pulling Google→Avantej changes.

7. **`orgStatus` returns null for `eventsSyncedToday` and `conflictsDetected`.** `google-calendar.ts:129-130` hardcodes both to `null` — the org-wide Google Calendar dashboard cannot show sync volume or conflict counts. No backing aggregation exists.

8. **`dispatchProfileSync` (GHL) appears unwired.** `ghl-staff-sync.service.ts:270` exports `dispatchProfileSync`, intended (per `docs/superpowers/specs/...ghl-staff-sync-wiring-design.md`) to fire from a Better-Auth `user.update.after` hook or a `users.updateProfile` procedure. Grep finds it only in docs/tests, never called from a router or auth hook in `packages/`/`apps/server`. Likely **ORPHAN** — staff profile edits (name change) won't propagate to GHL. (Sibling `dispatchStaffSync` IS wired — members router + invite accept.)

### Integration completeness (mostly OK — noted for verification)

9. **Google Calendar OAuth connect/callback is NOT in the oRPC router.** The router has `status`/`disconnect`/`updateSettings`/`syncNow`/`listConnectedCalendars` but no `connect`. `getGoogleAuthUrl`/`exchangeCodeForTokens`/`getGoogleUserInfo` (`google-calendar.service.ts`) must be invoked by a REST route (e.g. `*.routes.ts`) — not verified within owned files. If that REST route is missing/half-wired, connect is broken. Recommend the routes-owning agent confirm. Disconnect + token refresh ARE present (`disconnect` revokes + deletes; `ensureValidToken` in sync service refreshes proactively at `google-calendar-sync.service.ts:44`).

10. **Stripe Connect / Subscription webhook + OAuth callback handlers are outside owned scope.** `subscriptions.ts:98` and `stripe-connect.ts:16` both rely on webhook handlers (`webhooks.routes.ts`) and the OAuth callback to persist `stripeCustomerId`/`stripeConnectAccountId` — `account.updated` is "source of truth." Not in owned files; flagged so the routes/webhooks agent confirms they exist and are wired (otherwise Connect onboarding and subscription activation silently never complete). `stripe-connect.ts` itself makes no SDK calls anymore (reads DB only) — status is fully webhook-driven.

11. **GHL custom-field bootstrap is best-effort/non-fatal.** `ghl.ts:87-94` and `:385-392`: `ensureCustomFieldsExist` failures are caught and only `console.warn`'d. A branch can be marked "connected" with custom fields missing; only basic name/email/phone sync works. Documented behavior, but means branch-differentiation via custom fields can silently be absent. Possibly-intentional.

### Catalog discrepancies (vs `zhub/shared/api-overview.md`)

12. All `platform-admin-*` routers, `subscriptions`, `stripe-connect`, `ghl`, `scheduled-reports`, and `onboarding` are **uncatalogued** in `api-overview.md`. Catalogued from this domain: `admin`, `auth`, `invitations`, `tenant-admin` (server) + the tenant cross-cutting routers (announcements, notifications, notification-preferences, audit-logs, user-activity-log, analytics, google-calendar, registration). The catalog claims "47 routers" but the platform-admin surface (20+ routers, ~80 procedures) and the integration/billing routers are entirely undocumented there. The hub needs a `/hub-update` pass to add these.

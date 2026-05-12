# Avantej Web — Skipped / Deferred Gaps

**Scope:** `apps/web` only. Generated 2026-04-19.
**What's here:** Items deliberately deferred — too architectural, server-side, requires separate product decision, or explicitly excluded by user direction.
**What's not here:** Actionable items → see `web-gaps-actionable.md`.

Nothing here is forgotten. Each section records *why* it's deferred so the decision can be revisited.

---

## Explicitly excluded (user direction)

### Commercial model surfaces
- Subscription / billing management page for org admins
- Feature / plan gating UI (what each subscription tier unlocks)
- Platform-admin console (cross-tenant view, impersonation)
- Trial countdown / payment-past-due self-service banner
- Tenant offboarding / data-export / GDPR erasure flow

*Why deferred:* User explicitly skipped this bucket. Revisit when subscription model is being built out.

---

## Architectural / too complex for a web-only plan

### Real-time fanout
- No SSE / WebSocket — two managers don't see each other's actions until refresh.
- No real-time notification push; Notifications page is poll-only.

*Why deferred:* Requires server infrastructure decision (Cloudflare Durable Objects? SSE endpoint? third-party?). Not a web-only change.

### Offline queue + idempotency
- Gym wifi drops mid-POS; mutation is lost. No client-side mutation queue.
- No idempotency keys on client mutations — retries can double-charge.

*Why deferred:* Requires both a server-side idempotency key design and a client-side queue library decision. Architectural; not a web-only fix.

### Optimistic concurrency
- Two staff editing the same sale, member, or schedule simultaneously — last-write-wins silently.

*Why deferred:* Requires server-side versioning or locking strategy before the web layer can surface conflicts.

---

## Server-side / infrastructure (out of web scope)

### Cron / scheduled jobs
- Expiring memberships, freeze auto-thaw, daily commission calc, overdue installment reminders, expense SLA escalation, audit-log retention.
- Cloudflare Workers Cron Triggers — not used anywhere today.

*Why deferred:* Pure server-side work. No web UI dependency; separate server plan required.

### Spec §7 — Stripe retry logic for installment payments
- 4 retries over 8 days with exponential backoff; final failure triggers member lock.

*Why deferred:* Server-side scheduler + Stripe integration. The web UI surfaces the result (member locked status) but the logic lives on the server.

### Spec §8 — 6-event installment notification cadence
- 14-day reminder, 3-day reminder, 1-day final, 7-day grace escalations, lock/unlock notifications.

*Why deferred:* Requires cron scheduler + email/push dispatch + `notificationPreferences` opt-out — server-side plan first.

### Webhook idempotency
- Stripe webhooks: replay-safe? Signature-verified?

*Why deferred:* Server-side only. No web surface.

### Resend outbound deliverability
- Bounces, complaints, suppression list monitoring.

*Why deferred:* Server/ops concern. No web surface.

### Neon connection-pooling
- `dbMiddleware` creates per-request pools; at scale the serverless driver / pooler choice matters.

*Why deferred:* Infrastructure decision; no web-app change involved.

### Tenant lifecycle ops
- Tenant provisioning script (Neon branch + migrations + seed defaults atomically).
- Schema drift detection across N tenant DBs.
- Migration batch rollout strategy.
- Restore drill (backup covers 2 of 60+ tables).

*Why deferred:* Infrastructure / DevOps scope. No web surface.

---

## Large scope / requires product decision before implementing

### Financial integrity
- **Close-of-month / financial-close report** — no "lock the books for March" view. Requires product decision on what "locked" means, who can lock, what happens to amendments.
- **Refund ↔ commission reconciliation** — when a sale is refunded, what happens to the earned commission? No policy exists. Web UI can't be designed until the policy is settled.
- **Tax model redesign** — Malaysian SST + service-charge stacking, tax-inclusive vs tax-exclusive, per-line tax. Requires schema + API changes before web changes.
- **Multi-currency** — expenses in `"usd"`, sales in MYR. Cross-border franchise currency model needs an architectural decision first.
- **CSV / PDF export** — depends on what data model "export" means (filtered view? period close? full ledger?). Product decision required.

*Why deferred:* Each item requires a product/accounting policy decision before UI can be designed.

### Multi-everything
- **i18n** — Bahasa Malaysia, Mandarin, Tamil. Requires i18n library choice, translation pipeline, and content work. Large scope.
- **Per-branch timezone** — every branch should store its own TZ; missing schema column. Schema change required first.
- **Currency-per-branch** — requires schema + API changes.
- **Tenant locale settings** — central `dd/mm/yyyy` / currency / TZ config. Depends on `organizationSettings` router (actionable, in `web-gaps-actionable.md` Tier 4) but the multi-tenant locale model needs design.

*Why deferred:* Each item requires schema changes and/or a design spec before web work begins.

### Soft-delete & lifecycle
- **Trash / Archive UI** — `isActive` is everywhere but no restore path. Requires product decision: who can restore what, for how long, with what audit trail.
- **Hierarchy edge cases** — moving branches between districts, archiving regions with active members, members pointing at deleted nodes. Requires service-layer logic changes first.
- **Audit-log retention policy** — how long to keep records, who can purge. Legal / compliance decision.

*Why deferred:* Policy decisions required before UI design.

### SMS / WhatsApp
- Malaysian gyms run on WhatsApp; competitive table-stakes.

*Why deferred:* Third-party integration (Twilio / WhatsApp Business API). Significant scope; separate initiative.

### SSO
- Google Workspace SSO for larger franchise customers.

*Why deferred:* Commercial-model adjacent. Significant Better-Auth configuration + enterprise sales process.

### In-app help / tooltips / docs
- No in-app documentation; support burden = high.

*Why deferred:* Content work, not engineering. Requires a documentation strategy decision.

### PWA / installable
- No service worker; franchisees would benefit from "install Avantej."

*Why deferred:* Requires cache-bust strategy design + service worker architecture. Low urgency vs other items.

### Transactional email template system
- Where do "expense approved" / "invitation" / "refund processed" templates live? Branded per tenant?

*Why deferred:* Requires a template storage and per-tenant branding design decision. Server + web scope.

---

## Deferred from tier-1 quick-wins (2026-04-19)

### Playwright testMatch config gap

**Problem**: `playwright.config.ts` has `testMatch: /fixes-verification\.spec\.ts/` — only that one spec file runs. All `*.smoke.spec.ts` files are silently skipped when running `bun playwright test`.

**Fix** (1 line): Change `testMatch` from `/fixes-verification\.spec\.ts/` to `/\.(smoke|fixes-verification)\.spec\.ts/`.

**Verification**: `bun playwright test --list` should show smoke tests.

**Risk**: Low — more tests run, not fewer.

*Why deferred:* Low priority vs the functional fixes in the same plan. No user-visible impact.

---

## Deferred from tier-1 chrome verification (2026-04-20)

### user-assignment page — React "Maximum update depth exceeded" crash

**Page:** `/dashboard/access-control/user-assignment`

**Symptom:** Page crashes immediately with "Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate." No content renders.

**Why pre-existing:** The page was previously unreachable — the franchisee user lacked `role_management:read` permission (a seed-data gap fixed during this run). Once access was granted, the crash surfaced for the first time. Phase 3's change (mapping role IDs in `initialUsers`) does not introduce a setState loop.

**Likely root cause (unconfirmed):** Unstable reference in the single `useEffect(() => setUsers(initialUsers), [membersApiData])` in `UserAssignmentPage`, or a child component effect with improper deps. Needs profiler investigation.

**Impact:** S5 (role badges) and S6 (bulk-action disabled state) cannot be verified in-browser until fixed.

*Why deferred:* Root cause not confirmed; fix requires React profiler investigation. Out of scope for Tier 1.

---

### PermissionGroupCollapsible — "Enable All" button missing `type="button"`

**File:** `apps/web/src/components/access-control/permission-cards/PermissionGroupCollapsible.tsx` ~line 299

**Symptom:** Clicking "Enable All" inside the RoleEditor form submits the form immediately (before any permissions are enabled) because the button defaults to `type="submit"` in an HTML form context.

**Fix applied (2026-04-20):** Added `type="button"` to the Button element. Verified — wizard now enables permissions correctly and `roles/create` + `rolePermissions/add` both fire with 200.

**Status: FIXED** — included here for traceability.

---

## When to revisit

| Item | Trigger to undefer |
|------|--------------------|
| Real-time fanout | When Cloudflare Durable Objects or SSE endpoint is decided |
| Offline / idempotency | When POS reliability becomes a customer complaint |
| Cron jobs | When first membership expiry bug is reported in prod |
| Financial close | When first accountant asks for period close |
| i18n | When first non-English-speaking franchise signs |
| Per-branch timezone | When first Singapore or international branch is created |
| Soft-delete / Trash | When first "I accidentally deleted X" support ticket arrives |
| SMS / WhatsApp | When sales identifies it as a deal-blocker |
| SSO | When first enterprise customer requests it |
| Playwright testMatch fix | When E2E smoke tests need to be run |
| user-assignment React crash | When access-control pages need to be tested / used |

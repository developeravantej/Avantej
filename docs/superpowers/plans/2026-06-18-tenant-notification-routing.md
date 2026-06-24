# Tenant Notification Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tenant bind each tenant-facing notification type to a sending-address alias + from-name + subject override, so all coach/customer/staff email goes from the tenant's verified business domain — closing the platform-sender gaps along the way.

**Architecture:** New control-panel table `email_notification_routes` keyed `(organizationId, notificationType)`. A pure module (`notification-routing.ts`) holds the type enum + subject-template render/sanitize. A DB service (`notification-route.service.ts`) holds `resolveNotificationRoute` (core select + leftJoin) + CRUD. `sendTenantEmail` gains `notificationType` + `subjectVars` and applies the route (alias/local-part only when a verified domain exists; from-name + subject overrides in both branches). All five tenant-facing send-sites pass a `notificationType`. An admin UI panel in `settings/email.tsx` edits the routes.

**Tech Stack:** Drizzle ORM (control-panel Postgres), oRPC, Better-Auth, Bun test (unit + integration), TanStack Form/Query + shadcn, Resend.

**Spec:** `docs/superpowers/specs/2026-06-18-tenant-notification-routing-design.md`

**Conventions used throughout:**
- Server tests run from `apps/server`: `bun test <path>` (unit) / `bun test <path>` with `DATABASE_URL` set (integration; auto-skips otherwise).
- Service tests run from repo root or `packages/services`: `bun test <path>`.
- Lint/type: `bun check` (oxlint) and `bun check-types` from repo root.
- Commit messages end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer (omitted from the snippets below for brevity — add it).
- Branch: continue on `feat/tenant-email-resend`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `packages/db/src/schema/control-panel/email-notification-routes.ts` | create | Drizzle table def + relations |
| `packages/db/src/schema/control-panel/email-logs.ts` | modify | add `notificationType` column |
| `packages/db/src/schema/control-panel/index.ts` | modify | barrel export new table |
| `packages/db/src/migrations/control-panel/0036_email_notification_routes.sql` | create | hand-authored SQL |
| `packages/services/src/notification-routing.ts` | create | pure: `NotificationType`, `NOTIFICATION_TYPES`, `SUBJECT_TOKENS`, `renderSubjectTemplate`, `sanitizeSubject` |
| `packages/services/src/notification-routing.test.ts` | create | unit tests for the pure module |
| `packages/services/src/notification-route.service.ts` | create | DB: `resolveNotificationRoute`, `listNotificationRoutes`, `upsertNotificationRoute`, `deleteNotificationRoute` |
| `packages/services/src/email-domain.service.ts` | modify | `RecordEmailLogParams.notificationType` + insert |
| `apps/server/src/lib/email-send-tenant.ts` | modify | `notificationType` + `subjectVars` params + resolution + tag + log |
| `apps/server/src/lib/email-send-tenant.test.ts` | modify | route-resolution unit tests |
| `apps/server/src/routers/email-domains.ts` | modify | 3 new procs + audit action |
| `apps/server/src/routers/email-domains.integration.test.ts` | modify | route CRUD + gate + alias-ownership tests |
| `packages/services/src/audit-log.service.ts` | modify | add `email_route.changed` to vocabulary |
| `apps/server/src/routers/invitations.ts` | modify | wire `member_invitation` |
| `apps/server/src/routes/invitations.routes.ts` | modify | wire `member_invitation` (REST parity) |
| `apps/server/src/services/tenant-provisioning.service.ts` | modify | wire `member_invitation` |
| `apps/server/src/lib/better-auth.ts` | modify | org-plugin invite + `dispatchAuthEmail` auth types |
| `apps/server/src/services/payment-side-effects.service.ts` | modify | wire `payment_receipt` |
| `apps/web/src/routes/_authenticated/dashboard/_layout/settings/email.tsx` | modify | `NotificationRoutingCard` panel |

---

## Task 1: DB schema + migration

**Files:**
- Create: `packages/db/src/schema/control-panel/email-notification-routes.ts`
- Modify: `packages/db/src/schema/control-panel/email-logs.ts`
- Modify: `packages/db/src/schema/control-panel/index.ts`
- Create: `packages/db/src/migrations/control-panel/0036_email_notification_routes.sql`

- [ ] **Step 1: Create the Drizzle schema file**

`packages/db/src/schema/control-panel/email-notification-routes.ts`:

```typescript
/**
 * Control Panel — Per-tenant notification → sender routing.
 *
 * One row binds a notification type (member_invitation, payment_receipt,
 * auth_*) for an org to an optional sending-address alias + from-name +
 * subject-line override. Unbound types fall through to the domain default
 * sender. Lives in control-panel DB so routing resolves before any tenant
 * connection (auth callbacks, webhook).
 *
 * Resolution order (see apps/server/src/lib/email-send-tenant.ts):
 *   local-part: params.localPart > route.alias.localPart > params.aliasLabel
 *               > email_domains.defaultLocalPart > "support"
 *   from-name:  params.fromName > route.fromNameOverride > domain.fromName > platform
 *   subject:    route.subjectOverride (rendered + sanitized) > caller subject
 */

import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { organizations } from "./organizations";
import { emailDomainAliases } from "./email-domain-aliases";

export const emailNotificationRoutes = pgTable("email_notification_routes", {
	id: uuid("id").primaryKey().defaultRandom(),
	organizationId: uuid("organization_id")
		.notNull()
		.references(() => organizations.id, { onDelete: "cascade" }),
	// member_invitation | payment_receipt | auth_verification |
	// auth_password_reset | auth_magic_link (plain text — house style).
	notificationType: text("notification_type").notNull(),
	// Nullable: null = "use the domain default sender". ON DELETE SET NULL so
	// deleting/re-registering a domain (which cascade-deletes its aliases)
	// silently falls the route back to the default instead of dangling.
	aliasId: uuid("alias_id").references(() => emailDomainAliases.id, {
		onDelete: "set null",
	}),
	fromNameOverride: text("from_name_override"),
	subjectOverride: text("subject_override"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	organizationIdIdx: index("email_notification_routes_organization_idx").on(
		table.organizationId,
	),
	// One route per (org, type) — the upsert conflict target.
	orgTypeUniqueIdx: uniqueIndex("email_notification_routes_org_type_unique_idx").on(
		table.organizationId,
		table.notificationType,
	),
}));

export const emailNotificationRoutesRelations = relations(
	emailNotificationRoutes,
	({ one }) => ({
		organization: one(organizations, {
			fields: [emailNotificationRoutes.organizationId],
			references: [organizations.id],
		}),
		alias: one(emailDomainAliases, {
			fields: [emailNotificationRoutes.aliasId],
			references: [emailDomainAliases.id],
		}),
	}),
);
```

- [ ] **Step 2: Add `notificationType` to the `email_logs` schema**

In `packages/db/src/schema/control-panel/email-logs.ts`, add the column right after `subject` (line ~31):

```typescript
	subject: text("subject").notNull(),
	// Notification type that produced this send (member_invitation,
	// payment_receipt, auth_*). Null for diagnostic/test sends + legacy rows.
	notificationType: text("notification_type"),
```

- [ ] **Step 3: Register the new table in the barrel**

In `packages/db/src/schema/control-panel/index.ts`, append after line 31 (`export * from "./email-domain-aliases";`):

```typescript
export * from "./email-notification-routes";
```

- [ ] **Step 4: Hand-author the migration SQL**

`packages/db/src/migrations/control-panel/0036_email_notification_routes.sql` (plain `CREATE TABLE`, matching the 0035 style; control-panel migrations are hand-authored — `_journal.json` is stale at 0018, and `bun db:generate`/`bun db:migrate` bare scripts are no-ops):

```sql
-- 0036_email_notification_routes.sql
-- Per-tenant notification -> sender routing (alias + from-name + subject
-- override). See docs/superpowers/specs/2026-06-18-tenant-notification-routing-design.md

CREATE TABLE email_notification_routes (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
	notification_type text NOT NULL,
	alias_id uuid REFERENCES email_domain_aliases(id) ON DELETE SET NULL,
	from_name_override text,
	subject_override text,
	created_at timestamp DEFAULT now() NOT NULL,
	updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX email_notification_routes_org_type_unique_idx
	ON email_notification_routes (organization_id, notification_type);
CREATE INDEX email_notification_routes_organization_idx
	ON email_notification_routes (organization_id);

ALTER TABLE email_logs ADD COLUMN notification_type text;
```

- [ ] **Step 5: Apply the migration to the dev control-panel DB**

Apply the SQL against the control-panel database (the `DATABASE_URL` in `apps/server/.dev.vars`). Use the Neon MCP `run_sql` against the control-panel project, OR:

Run: `cd apps/server && set -a && source .dev.vars && set +a && psql "$DATABASE_URL" -f ../../packages/db/src/migrations/control-panel/0036_email_notification_routes.sql`
Expected: `CREATE TABLE`, `CREATE INDEX` ×2, `ALTER TABLE` — no errors.

(If `psql` is unavailable, paste the SQL into Neon MCP `run_sql`.)

- [ ] **Step 6: Verify schema compiles + table exists**

Run: `bun check-types`
Expected: PASS (the new table object + `email_logs.notificationType` typecheck across the monorepo).

Run (control-panel DB): `SELECT to_regclass('email_notification_routes');`
Expected: returns `email_notification_routes` (not null).

- [ ] **Step 7: Drift check**

Run: `bun scripts/gen-erd.ts && bun scripts/check-drift.ts`
Expected: exit 0; the `controlPanel` section reports no `missing_in_live` / `extra_in_live` / `action_mismatches` (schema, SQL, and live DB agree: org FK = CASCADE, alias FK = SET NULL).

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/schema/control-panel/email-notification-routes.ts \
        packages/db/src/schema/control-panel/email-logs.ts \
        packages/db/src/schema/control-panel/index.ts \
        packages/db/src/migrations/control-panel/0036_email_notification_routes.sql \
        zhub/shared/schema-erd-auto.md zhub/shared/schema-drift.json
git commit -m "feat(email): email_notification_routes table + email_logs.notification_type"
```

---

## Task 2: Pure notification-routing module (types + subject helpers)

**Files:**
- Create: `packages/services/src/notification-routing.ts`
- Test: `packages/services/src/notification-routing.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/services/src/notification-routing.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import {
	NOTIFICATION_TYPES,
	renderSubjectTemplate,
	sanitizeSubject,
} from "./notification-routing";

describe("NOTIFICATION_TYPES", () => {
	test("contains the five tenant-facing types", () => {
		expect(NOTIFICATION_TYPES).toEqual([
			"member_invitation",
			"payment_receipt",
			"auth_verification",
			"auth_password_reset",
			"auth_magic_link",
		]);
	});
});

describe("renderSubjectTemplate", () => {
	test("substitutes known tokens", () => {
		expect(renderSubjectTemplate("Payment receipt — {amount}", { amount: "MYR 50.00" }))
			.toBe("Payment receipt — MYR 50.00");
	});

	test("replaces unknown / missing tokens with empty string", () => {
		expect(renderSubjectTemplate("Hi {orgName} {missing}", { orgName: "Acme" }))
			.toBe("Hi Acme ");
	});

	test("leaves a template with no tokens unchanged", () => {
		expect(renderSubjectTemplate("Verify your email", {})).toBe("Verify your email");
	});
});

describe("sanitizeSubject", () => {
	test("strips CR/LF/tab and other control chars", () => {
		expect(sanitizeSubject("Hello\r\nBcc: evil@x.com")).toBe("Hello Bcc: evil@x.com");
	});

	test("strips control chars injected via a token value (post-interpolation)", () => {
		const rendered = renderSubjectTemplate("Hi {name}", { name: "Bob\r\nSubject: x" });
		expect(sanitizeSubject(rendered)).toBe("Hi Bob Subject: x");
	});

	test("collapses whitespace, trims, and caps length at 255", () => {
		const long = "a".repeat(300);
		expect(sanitizeSubject(`  ${long}  `).length).toBe(255);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/services && bun test src/notification-routing.test.ts`
Expected: FAIL — `Cannot find module './notification-routing'`.

- [ ] **Step 3: Write the module**

`packages/services/src/notification-routing.ts`:

```typescript
/**
 * Pure notification-routing helpers — no DB, no env, no IO. Safe to import in
 * any context (Workers send layer, oRPC router write-time validation, tests).
 */

export const NOTIFICATION_TYPES = [
	"member_invitation",
	"payment_receipt",
	"auth_verification",
	"auth_password_reset",
	"auth_magic_link",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Tokens a tenant may use in a per-type subject override. Callers pass the
 * matching values via `subjectVars`. Documented in the UI under the input.
 */
export const SUBJECT_TOKENS: Record<NotificationType, string[]> = {
	member_invitation: ["organizationName", "role", "inviterName"],
	payment_receipt: ["amount", "appointmentId"],
	auth_verification: ["appName"],
	auth_password_reset: ["appName"],
	auth_magic_link: ["appName"],
};

/**
 * Replace each `{token}` with its value from `vars`. Unknown / missing tokens
 * render to "" so a live subject never contains a literal "{amount}".
 */
export function renderSubjectTemplate(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? "");
}

/**
 * Header-injection guard + tidy. Strip all control chars (incl. CR/LF/tab),
 * collapse runs of whitespace, trim, cap at 255. Apply to the FINAL subject
 * (after token interpolation) so malicious token values can't inject headers.
 */
export function sanitizeSubject(subject: string): string {
	return subject
		// eslint-disable-next-line no-control-regex
		.replace(/[\x00-\x1F\x7F]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 255);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/services && bun test src/notification-routing.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/notification-routing.ts packages/services/src/notification-routing.test.ts
git commit -m "feat(email): pure notification-routing module (types + subject render/sanitize)"
```

---

## Task 3: `notification-route.service.ts` (resolve + CRUD)

**Files:**
- Create: `packages/services/src/notification-route.service.ts`

No standalone test here — these are thin Drizzle wrappers exercised end-to-end by the router integration tests (Task 5) and the send integration (Task 4). This task is implementation + typecheck only.

- [ ] **Step 1: Write the service**

`packages/services/src/notification-route.service.ts`:

```typescript
/**
 * Notification-route service — DB helpers over `email_notification_routes`.
 *
 * `resolveNotificationRoute` uses CORE select + leftJoin (NOT db.query.*) so it
 * works on any Drizzle client, including the narrow ad-hoc clients the
 * Better-Auth callbacks build (org-plugin invite, dispatchAuthEmail) whose
 * schema map does not register these tables.
 */

import { and, asc, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { emailNotificationRoutes } from "@avantej-core/db/schema/control-panel/email-notification-routes";
import { emailDomainAliases } from "@avantej-core/db/schema/control-panel/email-domain-aliases";
import type { NotificationType } from "./notification-routing";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export type EmailNotificationRouteRow = typeof emailNotificationRoutes.$inferSelect;

export interface ResolvedNotificationRoute {
	aliasId: string | null;
	aliasLocalPart: string | null;
	fromNameOverride: string | null;
	subjectOverride: string | null;
}

/** Route row joined with its alias label/local-part for list/UI display. */
export interface NotificationRouteWithAlias extends EmailNotificationRouteRow {
	aliasLocalPart: string | null;
	aliasLabel: string | null;
}

/**
 * Resolve the effective route for (org, type), including the bound alias's
 * local-part (via leftJoin). Returns null when no route row exists.
 */
export async function resolveNotificationRoute(
	controlPanelDb: ControlPanelDb,
	organizationId: string,
	notificationType: NotificationType,
): Promise<ResolvedNotificationRoute | null> {
	const rows = await controlPanelDb
		.select({
			aliasId: emailNotificationRoutes.aliasId,
			aliasLocalPart: emailDomainAliases.localPart,
			fromNameOverride: emailNotificationRoutes.fromNameOverride,
			subjectOverride: emailNotificationRoutes.subjectOverride,
		})
		.from(emailNotificationRoutes)
		.leftJoin(
			emailDomainAliases,
			eq(emailNotificationRoutes.aliasId, emailDomainAliases.id),
		)
		.where(
			and(
				eq(emailNotificationRoutes.organizationId, organizationId),
				eq(emailNotificationRoutes.notificationType, notificationType),
			),
		)
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	return {
		aliasId: row.aliasId ?? null,
		aliasLocalPart: row.aliasLocalPart ?? null,
		fromNameOverride: row.fromNameOverride ?? null,
		subjectOverride: row.subjectOverride ?? null,
	};
}

export async function listNotificationRoutes(
	controlPanelDb: ControlPanelDb,
	organizationId: string,
): Promise<NotificationRouteWithAlias[]> {
	const rows = await controlPanelDb
		.select({
			route: emailNotificationRoutes,
			aliasLocalPart: emailDomainAliases.localPart,
			aliasLabel: emailDomainAliases.label,
		})
		.from(emailNotificationRoutes)
		.leftJoin(
			emailDomainAliases,
			eq(emailNotificationRoutes.aliasId, emailDomainAliases.id),
		)
		.where(eq(emailNotificationRoutes.organizationId, organizationId))
		.orderBy(asc(emailNotificationRoutes.notificationType));
	return rows.map((r) => ({
		...r.route,
		aliasLocalPart: r.aliasLocalPart ?? null,
		aliasLabel: r.aliasLabel ?? null,
	}));
}

export interface UpsertNotificationRouteParams {
	organizationId: string;
	notificationType: NotificationType;
	aliasId?: string | null;
	fromNameOverride?: string | null;
	subjectOverride?: string | null;
}

/**
 * Atomic upsert keyed on the (organization_id, notification_type) unique
 * index — safe under concurrent admin saves.
 */
export async function upsertNotificationRoute(
	controlPanelDb: ControlPanelDb,
	params: UpsertNotificationRouteParams,
): Promise<EmailNotificationRouteRow> {
	const [row] = await controlPanelDb
		.insert(emailNotificationRoutes)
		.values({
			organizationId: params.organizationId,
			notificationType: params.notificationType,
			aliasId: params.aliasId ?? null,
			fromNameOverride: params.fromNameOverride ?? null,
			subjectOverride: params.subjectOverride ?? null,
		})
		.onConflictDoUpdate({
			target: [
				emailNotificationRoutes.organizationId,
				emailNotificationRoutes.notificationType,
			],
			set: {
				aliasId: params.aliasId ?? null,
				fromNameOverride: params.fromNameOverride ?? null,
				subjectOverride: params.subjectOverride ?? null,
				updatedAt: new Date(),
			},
		})
		.returning();
	if (!row) throw new Error("Failed to upsert email_notification_routes row");
	return row;
}

export async function deleteNotificationRoute(
	controlPanelDb: ControlPanelDb,
	params: { organizationId: string; notificationType: NotificationType },
): Promise<EmailNotificationRouteRow | null> {
	const [row] = await controlPanelDb
		.delete(emailNotificationRoutes)
		.where(
			and(
				eq(emailNotificationRoutes.organizationId, params.organizationId),
				eq(emailNotificationRoutes.notificationType, params.notificationType),
			),
		)
		.returning();
	return row ?? null;
}
```

- [ ] **Step 2: Typecheck**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/services/src/notification-route.service.ts
git commit -m "feat(email): notification-route service (resolve + CRUD)"
```

---

## Task 4: `sendTenantEmail` — route resolution + subject override + log/tag

**Files:**
- Modify: `packages/services/src/email-domain.service.ts` (RecordEmailLogParams + insert)
- Modify: `apps/server/src/lib/email-send-tenant.ts`
- Test: `apps/server/src/lib/email-send-tenant.test.ts`

- [ ] **Step 1: Add `notificationType` to `RecordEmailLogParams` + insert**

In `packages/services/src/email-domain.service.ts`, `RecordEmailLogParams` (line ~449), add after `subject`:

```typescript
	subject: string;
	/** Notification type that produced the send (null for diagnostic sends). */
	notificationType?: string | null;
```

And in `recordEmailLog`'s `.values({...})` (line ~473), add:

```typescript
			subject: params.subject,
			notificationType: params.notificationType ?? null,
```

- [ ] **Step 2: Write the failing tests (route resolution)**

In `apps/server/src/lib/email-send-tenant.test.ts`, add a mock for the new service module next to the existing service mock (after line 37), then new test cases. First, the mock + import:

```typescript
// (after the existing mock.module("@avantej-core/services/email-domain.service", ...))
const mockResolveRoute = mock(async (..._args: unknown[]): Promise<unknown> => null);
mock.module("@avantej-core/services/notification-route.service", () => ({
	resolveNotificationRoute: mockResolveRoute,
}));
```

Add `mockResolveRoute.mockClear();` inside the existing `beforeEach`.

Then append this describe block:

```typescript
describe("sendTenantEmail — notification route resolution", () => {
	test("applies the route's alias local-part, from-name and subject override on a verified domain", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "Default Name",
				defaultLocalPart: "support",
			}) as never,
		);
		mockResolveRoute.mockReturnValueOnce(
			Promise.resolve({
				aliasId: "alias_1",
				aliasLocalPart: "billing",
				fromNameOverride: "Acme Billing",
				subjectOverride: "Receipt for {amount}",
			}) as never,
		);

		const result = await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "customer@example.com",
			subject: "fallback subject",
			html: "<p>hi</p>",
			notificationType: "payment_receipt",
			subjectVars: { amount: "MYR 50.00" },
		});

		expect(result.fromAddress).toBe("Acme Billing <billing@mail.example.com>");
		const call = mockResendSend.mock.calls[0]![0] as { subject: string; tags: unknown };
		expect(call.subject).toBe("Receipt for MYR 50.00");
		expect(call.tags).toEqual([
			{ name: "organization_id", value: ORG_ID },
			{ name: "notification_type", value: "payment_receipt" },
		]);
	});

	test("on platform fallback (no verified domain) still applies from-name + subject override but not alias", async () => {
		mockGetVerified.mockReturnValueOnce(Promise.resolve(null) as never);
		mockResolveRoute.mockReturnValueOnce(
			Promise.resolve({
				aliasId: "alias_1",
				aliasLocalPart: "billing",
				fromNameOverride: "Acme Billing",
				subjectOverride: "Receipt {amount}",
			}) as never,
		);

		const result = await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "customer@example.com",
			subject: "fallback subject",
			html: "<p>hi</p>",
			notificationType: "payment_receipt",
			subjectVars: { amount: "MYR 9.00" },
		});

		expect(result.usedFallback).toBe(true);
		// platform email address, but the override from-name is applied
		expect(result.fromAddress).toBe("Acme Billing <platform@example.com>");
		const call = mockResendSend.mock.calls[0]![0] as { subject: string; from: string };
		expect(call.subject).toBe("Receipt MYR 9.00");
	});

	test("sanitizes CRLF injected via a subject token value", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "N",
				defaultLocalPart: "support",
			}) as never,
		);
		mockResolveRoute.mockReturnValueOnce(
			Promise.resolve({
				aliasId: null,
				aliasLocalPart: null,
				fromNameOverride: null,
				subjectOverride: "Hi {name}",
			}) as never,
		);

		await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "x@example.com",
			subject: "fallback",
			html: "<p>hi</p>",
			notificationType: "member_invitation",
			subjectVars: { name: "Bob\r\nBcc: evil@x.com" },
		});

		const call = mockResendSend.mock.calls[0]![0] as { subject: string };
		expect(call.subject).toBe("Hi Bob Bcc: evil@x.com");
	});

	test("without notificationType, behaves exactly as before (no route lookup)", async () => {
		mockGetVerified.mockReturnValueOnce(
			Promise.resolve({
				id: "dom_1",
				domain: "mail.example.com",
				fromName: "N",
				defaultLocalPart: "support",
			}) as never,
		);
		await sendTenantEmail(fakeDb, {
			organizationId: ORG_ID,
			to: "x@example.com",
			subject: "plain",
			html: "<p>hi</p>",
		});
		expect(mockResolveRoute).not.toHaveBeenCalled();
		const call = mockResendSend.mock.calls[0]![0] as { subject: string; tags: unknown };
		expect(call.subject).toBe("plain");
		expect(call.tags).toEqual([{ name: "organization_id", value: ORG_ID }]);
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/server && bun test src/lib/email-send-tenant.test.ts`
Expected: FAIL — `notificationType`/`subjectVars` not accepted; subject not overridden; `notification_type` tag absent.

- [ ] **Step 4: Implement the resolution in `sendTenantEmail`**

In `apps/server/src/lib/email-send-tenant.ts`:

(a) Add imports near the top:

```typescript
import { resolveNotificationRoute } from "@avantej-core/services/notification-route.service";
import {
	type NotificationType,
	renderSubjectTemplate,
	sanitizeSubject,
} from "@avantej-core/services/notification-routing";
```

(b) Add to `SendTenantEmailParams` (after `aliasLabel`):

```typescript
	/**
	 * When set, look up the org's `email_notification_routes` row for this type
	 * and apply its alias (local-part, verified domain only), from-name, and
	 * subject overrides.
	 */
	notificationType?: NotificationType;
	/** Token values for a route's subject override template (e.g. {amount}). */
	subjectVars?: Record<string, string>;
```

(c) In the destructure (line ~83), add `notificationType` and `subjectVars`.

(d) After `const verified = await getVerifiedEmailDomainForOrg(...)` (line ~99), resolve the route:

```typescript
	const route = notificationType
		? await resolveNotificationRoute(controlPanelDb, organizationId, notificationType)
		: null;
```

(e) In the **verified** branch, change local-part + name resolution:

```typescript
	if (verified) {
		let resolvedLocalPart = localPart;
		if (!resolvedLocalPart && route?.aliasLocalPart) {
			resolvedLocalPart = route.aliasLocalPart;
		}
		if (!resolvedLocalPart && aliasLabel) {
			resolvedLocalPart =
				(await resolveAliasLocalPart(controlPanelDb, {
					emailDomainId: verified.id,
					label: aliasLabel,
				})) ?? undefined;
		}
		resolvedLocalPart = resolvedLocalPart ?? verified.defaultLocalPart ?? "support";
		fromEmail = `${resolvedLocalPart}@${verified.domain}`;
		const name = fromName ?? route?.fromNameOverride ?? verified.fromName;
		fromAddress = `${name} <${fromEmail}>`;
		emailDomainId = verified.id;
	} else {
```

(f) In the **fallback** branch, apply the override from-name:

```typescript
		const platform = platformFromAddress();
		fromEmail = platform.fromEmail;
		const fallbackName = fromName ?? route?.fromNameOverride;
		fromAddress = fallbackName
			? `${fallbackName} <${platform.fromEmail}>`
			: platform.fromAddress;
		emailDomainId = null;
		usedFallback = true;
```

(g) After computing `recipients`/`textBody` (line ~136), compute the final subject:

```typescript
	const finalSubject = sanitizeSubject(
		route?.subjectOverride
			? renderSubjectTemplate(route.subjectOverride, subjectVars ?? {})
			: subject,
	);
```

(h) Replace every later use of `subject` with `finalSubject` — in `resend.emails.send({...subject...})`, in all three `safeWriteLog({...subject...})` calls, and in the success-path `recordEmailCapture`. Build the tags array conditionally:

```typescript
		const tags = [{ name: "organization_id", value: organizationId }];
		if (notificationType) tags.push({ name: "notification_type", value: notificationType });
		// ...
		result = await resend.emails.send({
			from: fromAddress,
			to: recipients,
			subject: finalSubject,
			html,
			text: textBody,
			tags,
		});
```

(i) Pass `notificationType` into the success-path `safeWriteLog`:

```typescript
	await safeWriteLog(controlPanelDb, {
		organizationId,
		emailDomainId,
		resendMessageId: messageId,
		fromAddress,
		toAddress: recipients.join(", "),
		subject: finalSubject,
		notificationType: notificationType ?? null,
		status: "sent",
	});
```

(The two failed-path `safeWriteLog` calls only need `subject: finalSubject`; `notificationType` is optional.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/server && bun test src/lib/email-send-tenant.test.ts`
Expected: PASS (new block + all pre-existing tests still green — the no-`notificationType` test confirms backward-compat).

- [ ] **Step 6: Typecheck + commit**

Run: `bun check-types`
Expected: PASS.

```bash
git add packages/services/src/email-domain.service.ts \
        apps/server/src/lib/email-send-tenant.ts \
        apps/server/src/lib/email-send-tenant.test.ts
git commit -m "feat(email): sendTenantEmail applies notification route (alias/from-name/subject) + tags+logs type"
```

---

## Task 5: oRPC procedures + audit action

**Files:**
- Modify: `packages/services/src/audit-log.service.ts` (vocabulary)
- Modify: `apps/server/src/routers/email-domains.ts` (3 procs)
- Test: `apps/server/src/routers/email-domains.integration.test.ts`

- [ ] **Step 1: Add the audit action to the canonical vocabulary**

In `packages/services/src/audit-log.service.ts`, append to the comment block (after line 32):

```
 * "email_route.changed"      — Notification routing updated (email settings)
```

(No `DANGER_ACTIONS`/`WARNING_ACTIONS` change — it defaults to `info`.)

- [ ] **Step 2: Write failing integration tests**

In `apps/server/src/routers/email-domains.integration.test.ts`:

(a) Add imports at the top with the others:

```typescript
import { emailDomainAliases } from "@avantej-core/db/schema/control-panel/email-domain-aliases";
import { emailNotificationRoutes } from "@avantej-core/db/schema/control-panel/email-notification-routes";
```

(b) Extend `afterAll` to clean routes:

```typescript
	await cpDb
		.delete(emailNotificationRoutes)
		.where(eq(emailNotificationRoutes.organizationId, TEST_ORG_ID));
```

(c) Append a describe block (it seeds its own verified domain + alias so it's order-independent):

```typescript
describe("emailDomainsRouter — notification routing", () => {
	let domainId: string;
	let aliasId: string;

	test("setup: verified domain + alias", async () => {
		if (shouldSkipIntegration()) return;
		const [dom] = await cpDb!
			.insert(emailDomains)
			.values({
				organizationId: TEST_ORG_ID,
				resendDomainId: `dom_route_${crypto.randomUUID()}`,
				domain: `route-test-${Date.now()}.example.com`,
				fromName: "Route Test",
				defaultLocalPart: "support",
				status: "verified",
				verifiedAt: new Date(),
			})
			.returning();
		domainId = dom!.id;
		const [alias] = await cpDb!
			.insert(emailDomainAliases)
			.values({ emailDomainId: domainId, localPart: "billing", label: "Billing dept" })
			.returning();
		aliasId = alias!.id;
		expect(aliasId).toBeTruthy();
	});

	test("getNotificationRouting returns empty routes + the org's aliases", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler<{
			routes: unknown[];
			aliases: Array<{ id: string }>;
			verifiedDomain: { domain: string } | null;
		}>(emailDomainsRouter.getNotificationRouting);
		const res = await handler({ context: fakeContext(), input: { organizationId: TEST_ORG_ID } });
		expect(res.routes).toEqual([]);
		expect(res.aliases.some((a) => a.id === aliasId)).toBe(true);
		expect(res.verifiedDomain?.domain).toContain("route-test-");
	});

	test("upsertNotificationRoute binds an alias + overrides (idempotent)", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler<{ notificationType: string; aliasId: string | null }>(
			emailDomainsRouter.upsertNotificationRoute,
		);
		const first = await handler({
			context: fakeContext(),
			input: {
				organizationId: TEST_ORG_ID,
				notificationType: "payment_receipt",
				aliasId,
				fromNameOverride: "Acme Billing",
				subjectOverride: "Receipt {amount}",
			},
		});
		expect(first.aliasId).toBe(aliasId);
		// upsert again → no duplicate-key error
		const second = await handler({
			context: fakeContext(),
			input: {
				organizationId: TEST_ORG_ID,
				notificationType: "payment_receipt",
				aliasId: null,
				fromNameOverride: "Acme",
			},
		});
		expect(second.aliasId).toBeNull();
		const rows = await cpDb!
			.select()
			.from(emailNotificationRoutes)
			.where(
				and(
					eq(emailNotificationRoutes.organizationId, TEST_ORG_ID),
					eq(emailNotificationRoutes.notificationType, "payment_receipt"),
				),
			);
		expect(rows).toHaveLength(1);
	});

	test("upsert rejects an aliasId that does not belong to the org", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler(emailDomainsRouter.upsertNotificationRoute);
		await expect(
			handler({
				context: fakeContext(),
				input: {
					organizationId: TEST_ORG_ID,
					notificationType: "member_invitation",
					aliasId: "00000000-0000-4000-8000-0000000000aa",
				},
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("deleteNotificationRoute resets the type", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler<{ deleted: boolean }>(emailDomainsRouter.deleteNotificationRoute);
		const res = await handler({
			context: fakeContext(),
			input: { organizationId: TEST_ORG_ID, notificationType: "payment_receipt" },
		});
		expect(res.deleted).toBe(true);
	});

	test("non-admin is rejected", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler(emailDomainsRouter.getNotificationRouting);
		await expect(
			handler({
				context: fakeContext("00000000-0000-4000-8000-000000000099"),
				input: { organizationId: TEST_ORG_ID },
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("cleanup domain", async () => {
		if (shouldSkipIntegration()) return;
		await cpDb!.delete(emailDomains).where(eq(emailDomains.id, domainId));
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/server && bun test src/routers/email-domains.integration.test.ts`
Expected: FAIL — `emailDomainsRouter.getNotificationRouting` is undefined (auto-skips only if no DATABASE_URL; ensure `.dev.vars` is loaded so they actually run).

- [ ] **Step 4: Implement the three procedures**

In `apps/server/src/routers/email-domains.ts`:

(a) Extend the service import block (line ~19) with:

```typescript
	getVerifiedEmailDomainForOrg,
```

and add new imports:

```typescript
import {
	deleteNotificationRoute,
	listNotificationRoutes,
	resolveNotificationRoute,
	upsertNotificationRoute,
} from "@avantej-core/services/notification-route.service";
import { NOTIFICATION_TYPES } from "@avantej-core/services/notification-routing";
```

(b) Generalize the audit helper so it can record route changes. Change the `auditEmailDomainChange` `action`/`entityType` to accept the new action, OR add a sibling. Minimal approach — widen the existing helper's `action` union + add an `entityType` param defaulting to `"email_domain"`:

```typescript
	params: {
		action: "email_domain.registered" | "email_domain.deleted" | "email_route.changed";
		entityType?: "email_domain" | "email_notification_route";
		entityId: string;
		summary: string;
		changes: Record<string, unknown>;
	},
```

and in the `writeAudit` call use `entityType: params.entityType ?? "email_domain"`.

(c) Add the three procedures inside the `emailDomainsRouter` object (e.g. after `removeAlias`):

```typescript
	/**
	 * One-shot config for the Notification routing panel: existing routes (with
	 * joined alias info), the org's verified-domain aliases (dropdown options),
	 * and the verified domain meta for the live "Will send as" preview.
	 */
	getNotificationRouting: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const routes = await listNotificationRoutes(cpDb, input.organizationId);
			const verified = await getVerifiedEmailDomainForOrg(cpDb, input.organizationId);
			const aliases = verified
				? await listAliasesForDomain(cpDb, verified.id)
				: [];
			return {
				routes,
				aliases: aliases.map((a) => ({
					id: a.id,
					localPart: a.localPart,
					label: a.label,
				})),
				verifiedDomain: verified
					? {
							id: verified.id,
							domain: verified.domain,
							fromName: verified.fromName,
							defaultLocalPart: verified.defaultLocalPart,
						}
					: null,
			};
		}),

	/**
	 * Create/replace the route for a notification type. Validates that a
	 * supplied aliasId belongs to the org's verified domain.
	 */
	upsertNotificationRoute: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				notificationType: z.enum(NOTIFICATION_TYPES),
				aliasId: z.string().uuid().nullable().optional(),
				fromNameOverride: z.string().min(1).max(100).nullable().optional(),
				subjectOverride: z.string().min(1).max(255).nullable().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			if (input.aliasId) {
				const verified = await getVerifiedEmailDomainForOrg(cpDb, input.organizationId);
				const aliases = verified
					? await listAliasesForDomain(cpDb, verified.id)
					: [];
				if (!aliases.some((a) => a.id === input.aliasId)) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Alias does not belong to this organization's verified domain",
					});
				}
			}

			const row = await upsertNotificationRoute(cpDb, {
				organizationId: input.organizationId,
				notificationType: input.notificationType,
				aliasId: input.aliasId,
				fromNameOverride: input.fromNameOverride,
				subjectOverride: input.subjectOverride,
			});

			await auditEmailDomainChange(context, {
				action: "email_route.changed",
				entityType: "email_notification_route",
				entityId: row.id,
				summary: `Updated notification routing for "${input.notificationType}"`,
				changes: {
					notificationType: input.notificationType,
					aliasId: input.aliasId ?? null,
					fromNameOverride: input.fromNameOverride ?? null,
					subjectOverride: input.subjectOverride ?? null,
				},
			});

			return row;
		}),

	/**
	 * Reset a notification type back to the domain default sender.
	 */
	deleteNotificationRoute: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				notificationType: z.enum(NOTIFICATION_TYPES),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			await deleteNotificationRoute(cpDb, {
				organizationId: input.organizationId,
				notificationType: input.notificationType,
			});

			await auditEmailDomainChange(context, {
				action: "email_route.changed",
				entityType: "email_notification_route",
				entityId: input.organizationId,
				summary: `Reset notification routing for "${input.notificationType}"`,
				changes: { notificationType: input.notificationType, reset: true },
			});

			return { deleted: true as const, notificationType: input.notificationType };
		}),
```

> Note: `resolveNotificationRoute` is imported here only if you want a future `get`-single proc; the panel uses `getNotificationRouting`. If unused, drop it from the import to satisfy oxlint.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/server && bun test src/routers/email-domains.integration.test.ts`
Expected: PASS (new block + the pre-existing domain CRUD tests).

- [ ] **Step 6: Typecheck + lint + commit**

Run: `bun check-types && bun check`
Expected: PASS.

```bash
git add packages/services/src/audit-log.service.ts \
        apps/server/src/routers/email-domains.ts \
        apps/server/src/routers/email-domains.integration.test.ts
git commit -m "feat(email): notification-routing oRPC procs (get/upsert/delete) + audit action"
```

---

## Task 6: Wire all five tenant-facing send-sites

Each sub-step is an independent edit; commit once at the end.

**Files:**
- Modify: `apps/server/src/routers/invitations.ts`
- Modify: `apps/server/src/routes/invitations.routes.ts`
- Modify: `apps/server/src/services/tenant-provisioning.service.ts`
- Modify: `apps/server/src/lib/better-auth.ts`
- Modify: `apps/server/src/services/payment-side-effects.service.ts`

- [ ] **Step 1: oRPC invitation handler (`invitations.ts`)**

Replace the `sendEmail` handler body (lines ~74-95). Add imports:

```typescript
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { renderInvitationEmail } from "@/lib/email";
import { sendTenantEmail } from "@/lib/email-send-tenant";
```

(remove the now-unused `sendInvitationEmail` import if nothing else uses it). New handler:

```typescript
	.handler(async ({ input, context }) => {
		const { invitation, organizationId, organizationName, inviterName } = input;

		const frontendURL =
			getEnvVar("CORS_ORIGIN") || getEnvVar("FRONTEND_URL") || "http://localhost:3001";
		const invitationLink = `${frontendURL}/accept-invitation?token=${invitation.token}&orgId=${organizationId}`;

		const orgName = organizationName || "the organization";
		const { subject, html, text } = renderInvitationEmail(
			invitationLink,
			orgName,
			inviterName,
			invitation.role,
		);

		const cpDb = getControlPanelDb(context);
		await sendTenantEmail(cpDb, {
			organizationId,
			to: invitation.email,
			subject,
			html,
			text,
			notificationType: "member_invitation",
			subjectVars: {
				organizationName: orgName,
				role: invitation.role,
				inviterName: inviterName ?? "",
			},
			allowPlatformFallback: true,
		});

		return { success: true, message: "Invitation email sent successfully" };
	});
```

- [ ] **Step 2: REST invite route (`invitations.routes.ts`)**

`dbMiddleware` is global (`index.ts:144`) so `c.get("controlPanelDb")` is available here. Replace the send call (lines ~60-67). Add imports:

```typescript
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { renderInvitationEmail, sendInvitationEmail } from "@/lib/email";
import { sendTenantEmail } from "@/lib/email-send-tenant";
```

Replace the `await sendInvitationEmail(...)` block with:

```typescript
				const orgName = organizationName || "the organization";
				const { subject, html, text } = renderInvitationEmail(
					invitationLink,
					orgName,
					inviterName,
					invitation.role,
				);

				const cpDb = c.get("controlPanelDb") as
					| NeonDatabase<typeof controlPanelSchema>
					| undefined;
				if (cpDb) {
					await sendTenantEmail(cpDb, {
						organizationId,
						to: invitation.email,
						subject,
						html,
						text,
						notificationType: "member_invitation",
						subjectVars: {
							organizationName: orgName,
							role: invitation.role ?? "",
							inviterName: inviterName ?? "",
						},
						allowPlatformFallback: true,
					});
				} else {
					// No control-panel DB on context (shouldn't happen) — platform sender.
					await sendInvitationEmail(
						invitation.email,
						invitationLink,
						orgName,
						inviterName,
						invitation.role,
					);
				}
```

- [ ] **Step 3: Tenant provisioning (`tenant-provisioning.service.ts`)**

`controlPanelDb` is already a param in scope. Replace the `sendInvitationEmail(...)` call (lines ~203-209). Add imports at the top of the file:

```typescript
import { renderInvitationEmail } from "@/lib/email";
import { sendTenantEmail } from "@/lib/email-send-tenant";
```

(keep the existing `sendInvitationEmail` import only if used elsewhere; otherwise remove). New body inside the existing `try`:

```typescript
			const { subject, html, text } = renderInvitationEmail(
				invitationLink,
				name,
				inviterName,
				"admin",
			);
			await sendTenantEmail(controlPanelDb, {
				organizationId: organization.id,
				to: ownerEmail,
				subject,
				html,
				text,
				notificationType: "member_invitation",
				subjectVars: {
					organizationName: name,
					role: "admin",
					inviterName: inviterName ?? "",
				},
				allowPlatformFallback: true,
			});
```

(At provisioning time the org has no verified domain → this platform-falls-back today, which is correct; it auto-upgrades once a domain verifies.)

- [ ] **Step 4: Org-plugin invite + auth dispatch (`better-auth.ts`)**

(a) Org-plugin `sendInvitationEmail` (line ~569): add the type + vars to the existing `sendTenantEmail` call:

```typescript
				await sendTenantEmail(tempDb as never, {
					organizationId: invitation.organizationId,
					to: email,
					subject,
					html,
					text,
					notificationType: "member_invitation",
					subjectVars: {
						organizationName,
						role: role ?? "",
						inviterName: inviterName ?? "",
					},
					allowPlatformFallback: true,
				});
```

(b) `dispatchAuthEmail`: derive the notification type from `capture.type` (one place covers all 6 auth call-sites — no per-caller edits). In the `sendTenantEmail` call inside `dispatchAuthEmail` (line ~173), add:

```typescript
			const authNotificationType =
				opts.capture.type === "verification"
					? "auth_verification"
					: opts.capture.type === "password-reset"
						? "auth_password_reset"
						: "auth_magic_link";
			await sendTenantEmail(db, {
				organizationId,
				to: opts.email,
				subject: opts.subject,
				html: opts.html,
				text: opts.text,
				notificationType: authNotificationType,
				allowPlatformFallback: false,
			});
```

(Keep `allowPlatformFallback: false` + the existing `opts.fallback()` in the catch — the auth path's contract is unchanged; the route still applies from-name/subject overrides when a verified domain exists.)

- [ ] **Step 5: Payment receipt (`payment-side-effects.service.ts`)**

Swap the import (line 37): replace `import { sendEmail } from "@/lib/email";` with:

```typescript
import { sendTenantEmail } from "@/lib/email-send-tenant";
```

Replace the send call (line ~263):

```typescript
	await sendTenantEmail(controlPanelDb, {
		organizationId,
		to: email,
		subject,
		html,
		notificationType: "payment_receipt",
		subjectVars: { amount: formattedAmount, appointmentId },
		allowPlatformFallback: true,
	});
```

(`controlPanelDb`, `organizationId`, `formattedAmount`, `appointmentId` are all already in scope. The surrounding best-effort try/catch in `onAppointmentPaid` is unchanged.)

- [ ] **Step 6: Typecheck + lint + run affected tests**

Run: `bun check-types && bun check`
Expected: PASS (watch for unused-import lint errors — remove any leftover `sendInvitationEmail`/`sendEmail` imports).

Run: `cd apps/server && bun test src/lib/email-send-tenant.test.ts src/routers/email-domains.integration.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routers/invitations.ts \
        apps/server/src/routes/invitations.routes.ts \
        apps/server/src/services/tenant-provisioning.service.ts \
        apps/server/src/lib/better-auth.ts \
        apps/server/src/services/payment-side-effects.service.ts
git commit -m "feat(email): route invitations + receipts + auth emails through tenant notification routes"
```

---

## Task 7: Webhook preserves `notification_type`

**Files:**
- Modify: `packages/services/src/email-domain.service.ts` (`UpdateEmailLogFromWebhookParams` + insert branch)
- Modify: `apps/server/src/routes/webhooks.routes.ts` (read the tag)

- [ ] **Step 1: Add `notificationType` to the webhook upsert insert branch**

In `packages/services/src/email-domain.service.ts`, add to `UpdateEmailLogFromWebhookParams` (after `subject?`):

```typescript
	notificationType?: string | null;
```

In `upsertEmailLogFromWebhook`, the INSERT-branch `.values({...})` (line ~539), add:

```typescript
			subject: params.subject ?? "",
			notificationType: params.notificationType ?? null,
```

(The UPDATE branch needs no change — a webhook-after-send row already carries the type from the original `recordEmailLog` write.)

- [ ] **Step 2: Read the `notification_type` tag in the webhook handler**

In `apps/server/src/routes/webhooks.routes.ts`, where `organization_id` is read from `data.tags` (line ~966), add alongside:

```typescript
		const notificationTypeTag = data.tags?.find(
			(t: { name: string; value: string }) => t.name === "notification_type",
		)?.value;
```

and pass `notificationType: notificationTypeTag ?? null` into the `upsertEmailLogFromWebhook(...)` call.

- [ ] **Step 3: Typecheck + run webhook integration test**

Run: `bun check-types`
Expected: PASS.

Run: `cd apps/server && bun test src/routes/webhooks.resend.integration.test.ts`
Expected: PASS (existing behavior unbroken; the new field is optional).

- [ ] **Step 4: Commit**

```bash
git add packages/services/src/email-domain.service.ts apps/server/src/routes/webhooks.routes.ts
git commit -m "feat(email): preserve notification_type through the Resend webhook upsert"
```

---

## Task 8: Notification routing UI panel

**Files:**
- Modify: `apps/web/src/routes/_authenticated/dashboard/_layout/settings/email.tsx`

This file uses TanStack Form for all forms, `useApiMutation` for mutations (auto toast + invalidate), `useQuery` with module-level key prefixes, and threads `isAdmin` as a prop. Mirror those patterns.

- [ ] **Step 1: Add imports + query-key prefix + label map**

At the top of `email.tsx`, add the `Select` import and the notification-type label map (module-level, near the other consts like `LOCAL_PART_REGEX`):

```typescript
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const NOTIFICATION_ROUTES_QUERY_KEY_PREFIX = "emailNotificationRoutes";

const NOTIFICATION_TYPE_META: Array<{
	type: "member_invitation" | "payment_receipt" | "auth_verification" | "auth_password_reset" | "auth_magic_link";
	label: string;
	tokens: string[];
}> = [
	{ type: "member_invitation", label: "Member invitation", tokens: ["organizationName", "role", "inviterName"] },
	{ type: "payment_receipt", label: "Payment receipt", tokens: ["amount", "appointmentId"] },
	{ type: "auth_verification", label: "Email verification", tokens: ["appName"] },
	{ type: "auth_password_reset", label: "Password reset", tokens: ["appName"] },
	{ type: "auth_magic_link", label: "Magic-link sign-in", tokens: ["appName"] },
];
```

- [ ] **Step 2: Render `NotificationRoutingCard` as a third top-level card**

In `EmailSettingsPage`, inside the `<div className="mt-6 space-y-6">` stack (after `<CreateDomainCard ... />`), add:

```tsx
				<NotificationRoutingCard organizationId={organizationId} isAdmin={isAdmin} />
```

- [ ] **Step 3: Implement the card component**

Add at the end of the file:

```tsx
function NotificationRoutingCard({
	organizationId,
	isAdmin,
}: {
	organizationId: string;
	isAdmin: boolean;
}) {
	const { data, isLoading } = useQuery({
		queryKey: [NOTIFICATION_ROUTES_QUERY_KEY_PREFIX, organizationId],
		queryFn: () => client.emailDomains.getNotificationRouting({ organizationId }),
		staleTime: 30_000,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notification routing</CardTitle>
				<CardDescription>
					Choose which sending address, name, and subject each notification uses.
					Unset rows fall back to your domain's default sender.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : (
					NOTIFICATION_TYPE_META.map((meta) => (
						<NotificationRoutingRow
							key={meta.type}
							meta={meta}
							organizationId={organizationId}
							isAdmin={isAdmin}
							route={data?.routes.find((r) => r.notificationType === meta.type) ?? null}
							aliases={data?.aliases ?? []}
							verifiedDomain={data?.verifiedDomain ?? null}
						/>
					))
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 4: Implement the per-type row (form + preview + save/reset)**

```tsx
function NotificationRoutingRow({
	meta,
	organizationId,
	isAdmin,
	route,
	aliases,
	verifiedDomain,
}: {
	meta: (typeof NOTIFICATION_TYPE_META)[number];
	organizationId: string;
	isAdmin: boolean;
	route: { aliasId: string | null; fromNameOverride: string | null; subjectOverride: string | null } | null;
	aliases: Array<{ id: string; localPart: string; label: string | null }>;
	verifiedDomain: { domain: string; fromName: string; defaultLocalPart: string | null } | null;
}) {
	const saveMutation = useApiMutation({
		mutationFn: (vars: {
			aliasId: string | null;
			fromNameOverride: string | null;
			subjectOverride: string | null;
		}) =>
			client.emailDomains.upsertNotificationRoute({
				organizationId,
				notificationType: meta.type,
				...vars,
			}),
		successMessage: "Routing saved.",
		errorMessage: (err: Error) => err.message || "Failed to save routing.",
		invalidate: [[NOTIFICATION_ROUTES_QUERY_KEY_PREFIX, organizationId]],
	});

	const resetMutation = useApiMutation({
		mutationFn: () =>
			client.emailDomains.deleteNotificationRoute({ organizationId, notificationType: meta.type }),
		successMessage: "Routing reset.",
		errorMessage: (err: Error) => err.message || "Failed to reset routing.",
		invalidate: [[NOTIFICATION_ROUTES_QUERY_KEY_PREFIX, organizationId]],
	});

	const form = useForm({
		defaultValues: {
			aliasId: route?.aliasId ?? "",
			fromNameOverride: route?.fromNameOverride ?? "",
			subjectOverride: route?.subjectOverride ?? "",
		},
		onSubmit: async ({ value }) => {
			await saveMutation.mutateAsync({
				aliasId: value.aliasId || null,
				fromNameOverride: value.fromNameOverride.trim() || null,
				subjectOverride: value.subjectOverride.trim() || null,
			});
		},
	});

	const selectedAliasId = form.state.values.aliasId;
	const selectedAlias = aliases.find((a) => a.id === selectedAliasId);
	const effectiveLocalPart =
		selectedAlias?.localPart ?? verifiedDomain?.defaultLocalPart ?? "support";
	const effectiveFromName =
		form.state.values.fromNameOverride.trim() || verifiedDomain?.fromName || "Avantej Core";
	const previewDomain = verifiedDomain?.domain ?? "(no verified domain)";

	return (
		<form
			className="space-y-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
		>
			<p className="text-sm font-medium">{meta.label}</p>
			<div className="flex flex-wrap items-end gap-2">
				<form.Field name="aliasId">
					{(field) => (
						<div className="w-44">
							<Select
								value={field.state.value || "__default__"}
								onValueChange={(v) => field.handleChange(v === "__default__" ? "" : v)}
								disabled={!isAdmin || !verifiedDomain}
							>
								<SelectTrigger>
									<SelectValue placeholder="Default sender" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__default__">Use domain default</SelectItem>
									{aliases.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.localPart}
											{a.label ? ` · ${a.label}` : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>
				<form.Field name="fromNameOverride">
					{(field) => (
						<Input
							className="w-40"
							placeholder="From name (optional)"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={!isAdmin}
						/>
					)}
				</form.Field>
				<form.Field name="subjectOverride">
					{(field) => (
						<Input
							className="w-56"
							placeholder="Subject override (optional)"
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={(e) => field.handleChange(e.target.value)}
							disabled={!isAdmin}
						/>
					)}
				</form.Field>
				<Button type="submit" disabled={!isAdmin || saveMutation.isPending}>
					Save
				</Button>
				{route ? (
					<Button
						type="button"
						variant="ghost"
						disabled={!isAdmin || resetMutation.isPending}
						onClick={() => resetMutation.mutate(undefined)}
					>
						Reset
					</Button>
				) : null}
			</div>
			<p className="font-mono text-xs text-muted-foreground">
				Will send as: {effectiveFromName} &lt;{effectiveLocalPart}@{previewDomain}&gt;
				{!selectedAlias && verifiedDomain ? " (falls back to default sender)" : ""}
			</p>
			{meta.tokens.length > 0 ? (
				<p className="text-xs text-muted-foreground">
					Subject tokens: {meta.tokens.map((t) => `{${t}}`).join(", ")}
				</p>
			) : null}
		</form>
	);
}
```

- [ ] **Step 5: Typecheck + web tests + lint**

Run: `bun check-types`
Expected: PASS.

Run: `cd apps/web && bun test`
Expected: PASS (no web unit test targets this panel; confirms no regressions).

Run: `bun check`
Expected: PASS.

- [ ] **Step 6: Manual smoke (dev server)**

Run: `bun dev` then open `http://localhost:3021/dashboard/settings/email` as a tenant admin.
Expected: a "Notification routing" card with 5 rows; selecting an alias / typing a from-name updates the "Will send as" preview; Save toasts "Routing saved."; Reset appears after a save and toasts "Routing reset."

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/_authenticated/dashboard/_layout/settings/email.tsx
git commit -m "feat(email): notification routing admin panel in email settings"
```

---

## Task 9: e2e screencast (optional, matches existing email e2e suite)

**Files:**
- Create: `e2e-web/settings/email-notification-routing.journey.json`
- Update: `e2e-web/run-results.json`, `docs/test-plan/e2e.html`

- [ ] **Step 1: Author the journey**

Record (chrome-devtools screencast, same approach as the existing 8 email tests): sign in as the seeded tenant admin → open `/dashboard/settings/email` → in Notification routing, bind `Payment receipt` to the `billing` alias + a from-name + subject `Receipt {amount}` → observe the "Will send as" preview update → Save (toast) → reload → confirm persisted → Reset (toast).

- [ ] **Step 2: Run + capture, update the HTML report**

Run: follow the `/e2e` flow used for the existing email specs; append the new test to `run-results.json` and regenerate `docs/test-plan/e2e.html`.

- [ ] **Step 3: Commit**

```bash
git add e2e-web/settings/email-notification-routing.journey.json e2e-web/run-results.json docs/test-plan/e2e.html
git commit -m "test(email): e2e screencast for notification routing panel"
```

---

## Final verification

- [ ] `bun check-types` — PASS
- [ ] `bun check` — PASS
- [ ] `cd apps/server && bun test src/lib/email-send-tenant.test.ts src/routers/email-domains.integration.test.ts src/routes/webhooks.resend.integration.test.ts` — PASS
- [ ] `cd packages/services && bun test src/notification-routing.test.ts` — PASS
- [ ] `bun scripts/gen-erd.ts && bun scripts/check-drift.ts` — exit 0, controlPanel clean
- [ ] Push branch; PR #36 picks up the commits.

---

## Self-review notes (author)

- **Spec coverage:** table + `email_logs` column (T1), pure helpers (T2), service (T3), send resolution incl. fallback-branch override split + injection sanitize (T4), procs + admin gate + alias-ownership + audit (T5), all 5 send-sites incl. the 2 extra invite sites + auth-type derivation (T6), webhook type preservation (T7), UI panel (T8), e2e (T9). All spec sections mapped.
- **Type consistency:** `NotificationType`/`NOTIFICATION_TYPES` defined once in `notification-routing.ts`, consumed by the service, router zod enum, and send layer. `resolveNotificationRoute` returns `{aliasId, aliasLocalPart, fromNameOverride, subjectOverride}` — matches the send-layer usage and the test mocks. `renderSubjectTemplate`/`sanitizeSubject` signatures match across Task 2 (def) and Task 4 (use).
- **No placeholders:** every code step shows real code; commands have expected output.

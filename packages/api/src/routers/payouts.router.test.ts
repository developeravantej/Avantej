/**
 * Payouts router — API-boundary guard tests.
 *
 * The payout lifecycle mutations move money, so the two perimeter guards every
 * one of them runs — `assertOrgContextMatch` (cross-tenant spoof) and
 * `requirePermissionOrpc("commission_payout","process")` — must fire BEFORE the
 * service is invoked. Both run ahead of the service call, so these tests need
 * no service mock (avoiding the documented @avantej-core/services subpath
 * mock.module conflict). The service logic itself is covered in
 * payouts.state-machine.test.ts.
 *
 * Run: bun test src/routers/payouts.router.test.ts
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { payoutsRouter } from "./payouts";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PAYOUT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/**
 * tenantDb whose role lookups all miss (so hasPermission falls back to the
 * `member.role === "admin"` rule). Its transaction throws a BAD_REQUEST-coded
 * error — standing in for the service reaching its own state check. So a call
 * that passes both guards surfaces as BAD_REQUEST (service reached), while a
 * call a guard rejects surfaces as FORBIDDEN. That contrast is what makes the
 * FORBIDDEN assertions meaningful (vs. a procedure that rejects everything).
 */
function makeGuardDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
		transaction: () => {
			throw Object.assign(new Error("service reached"), {
				code: "BAD_REQUEST",
			});
		},
	} as unknown as never;
}

const STAFF_MEMBER = {
	id: "member-staff",
	userId: "user-staff",
	role: "staff" as const,
	status: "active" as const,
	hierarchyScopeId: "node-root",
	roleId: null,
};

// Each lifecycle procedure with a minimal zod-valid input (org filled per case).
const PROCEDURES = [
	{ name: "markPaid", extra: { id: PAYOUT_ID, paymentReference: "WIRE-1" } },
	{ name: "markFailed", extra: { id: PAYOUT_ID, reason: "bounced" } },
	{ name: "retry", extra: { id: PAYOUT_ID } },
	{ name: "cancel", extra: { id: PAYOUT_ID, reason: "terminated" } },
] as const;

describe("payouts lifecycle — cross-tenant org guard", () => {
	for (const { name, extra } of PROCEDURES) {
		it(`${name} rejects an organizationId that mismatches the tenant context`, async () => {
			await expect(
				call(
					// biome-ignore lint/suspicious/noExplicitAny: dynamic procedure access
					(payoutsRouter as any)[name],
					{ organizationId: OTHER_ORG, ...extra },
					{
						context: createMockContext({
							organizationId: ORG_ID,
							tenantDb: makeGuardDb(),
						}),
					},
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});
	}
});

describe("payouts lifecycle — commission_payout:process permission guard", () => {
	for (const { name, extra } of PROCEDURES) {
		it(`${name} rejects a member lacking commission_payout:process`, async () => {
			await expect(
				call(
					// biome-ignore lint/suspicious/noExplicitAny: dynamic procedure access
					(payoutsRouter as any)[name],
					{ organizationId: ORG_ID, ...extra },
					{
						context: createMockContext({
							organizationId: ORG_ID,
							tenantDb: makeGuardDb(),
							member: STAFF_MEMBER,
						}),
					},
				),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
		});
	}
});

describe("payouts lifecycle — positive control + perimeter edges", () => {
	// Positive control: an admin (default member) with a matching org passes
	// BOTH guards and reaches the service, which here surfaces as BAD_REQUEST.
	// Without this, the FORBIDDEN tests above could pass on a procedure that
	// rejects everything.
	for (const { name, extra } of PROCEDURES) {
		it(`${name} passes both guards for a permitted admin and reaches the service`, async () => {
			await expect(
				call(
					// biome-ignore lint/suspicious/noExplicitAny: dynamic procedure access
					(payoutsRouter as any)[name],
					{ organizationId: ORG_ID, ...extra },
					{
						context: createMockContext({
							organizationId: ORG_ID,
							tenantDb: makeGuardDb(),
						}),
					},
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});
	}

	it("markPaid rejects when the caller is not a member (null member)", async () => {
		await expect(
			call(
				payoutsRouter.markPaid,
				{ organizationId: ORG_ID, id: PAYOUT_ID, paymentReference: "WIRE-1" },
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeGuardDb(),
						member: null,
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("markPaid rejects an empty paymentReference at input validation (before the handler)", async () => {
		// zod runs before the handler; an empty ref must not reach the guards/service.
		await expect(
			call(
				payoutsRouter.markPaid,
				{ organizationId: ORG_ID, id: PAYOUT_ID, paymentReference: "" },
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeGuardDb(),
					}),
				},
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

// ── Tenant-isolation: batch procedures must reject out-of-scope staffIds ──────
//
// previewBatch / runBatch / processForRecipient accept a list of staff
// (control-panel user IDs) or a single recipientId. For a non-admin caller,
// every targeted staff member's hierarchyScopeId must be inside
// context.accessibleNodeIds — otherwise a scoped manager could pay out (or
// preview) commissions for staff in a branch they cannot access. Mirrors the
// recipientSummary non-admin guard.

const STAFF_USER_IN = "11111111-1111-4111-8111-111111111111"; // control-panel user id, in scope
const STAFF_USER_OUT = "22222222-2222-4222-8222-222222222222"; // control-panel user id, out of scope
const NODE_IN = "node-root"; // default accessibleNodeIds entry
const NODE_OUT = "33333333-3333-4333-8333-333333333333"; // not in accessibleNodeIds

const NON_ADMIN_MEMBER = {
	id: "member-mgr",
	userId: "user-mgr",
	role: "manager" as const,
	status: "active" as const,
	hierarchyScopeId: NODE_IN,
	roleId: null,
};

/**
 * makeGuardDb() + a chainable, awaitable select() that resolves the targeted
 * staff user ids to their member.hierarchyScopeId in ONE query:
 *   select({userId, hierarchyScopeId}).from(members).where(inArray(userId, ids))
 * The builder is a thenable resolving to all mapped rows; a user id with no
 * mapping simply has no row, which the guard must also reject. The chain also
 * supports the downstream service select()/innerJoin() shape so the admin
 * positive control reaches the service (transaction → BAD_REQUEST).
 *
 * query.roles.findFirst returns a priority>=100 role so the NON_ADMIN_MEMBER
 * (role "manager") PASSES the commission_payout permission gate. This is
 * essential: the new staff-scope guard runs ahead of requirePermissionOrpc, so
 * the permission gate must not be the thing that rejects — otherwise the test
 * could not distinguish the guard from the permission check (and would not be
 * red before the fix).
 */
function makeStaffScopeDb(scopeByUser: Record<string, string>) {
	const base = makeGuardDb() as unknown as Record<string, unknown>;
	(base.query as Record<string, unknown>).roles = {
		findFirst: mock(() =>
			Promise.resolve({ id: "role-mgr", name: "manager", priority: 100 }),
		),
	};
	const rows = Object.entries(scopeByUser).map(
		([userId, hierarchyScopeId]) => ({ userId, hierarchyScopeId }),
	);
	const builder: Record<string, unknown> = {
		from: () => builder,
		where: () => builder,
		innerJoin: () => builder,
		leftJoin: () => builder,
		orderBy: () => builder,
		limit: () => Promise.resolve(rows),
		then: (resolve: (v: unknown) => unknown) =>
			Promise.resolve(rows).then(resolve),
	};
	base.select = () => builder;
	return base as unknown as never;
}

describe("payouts batch — non-admin out-of-scope staff guard", () => {
	it("previewBatch rejects a staffId whose member is outside accessibleNodeIds", async () => {
		await expect(
			call(
				payoutsRouter.previewBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_OUT]: NODE_OUT }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("runBatch rejects a staffId whose member is outside accessibleNodeIds", async () => {
		await expect(
			call(
				payoutsRouter.runBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
					paymentMethod: "bank_transfer" as const,
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_OUT]: NODE_OUT }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("processForRecipient rejects a recipientId whose member is outside accessibleNodeIds", async () => {
		await expect(
			call(
				payoutsRouter.processForRecipient,
				{
					organizationId: ORG_ID,
					recipientId: STAFF_USER_OUT,
					paymentMethod: "bank_transfer" as const,
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_OUT]: NODE_OUT }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("previewBatch rejects a staffId with no member row (enumeration guard)", async () => {
		await expect(
			call(
				payoutsRouter.previewBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({}), // no mapping → [] → reject
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

describe("payouts batch — positive control (in-scope + admin bypass)", () => {
	// In-scope non-admin: the staff-scope guard passes, so execution proceeds
	// PAST the guard. previewBatch then calls getControlPanelDb(context), which
	// throws INTERNAL_SERVER_ERROR because the mock context has no controlPanelDb
	// binding. The point is that the guard does NOT reject (not FORBIDDEN) for an
	// in-scope staff id.
	it("previewBatch passes the scope guard for an in-scope staffId (non-admin)", async () => {
		await expect(
			call(
				payoutsRouter.previewBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_IN],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({ [STAFF_USER_IN]: NODE_IN }),
						member: NON_ADMIN_MEMBER,
						accessibleNodeIds: [NODE_IN],
					}),
				},
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("runBatch reaches the service for an admin (scope walk bypassed)", async () => {
		await expect(
			call(
				payoutsRouter.runBatch,
				{
					organizationId: ORG_ID,
					staffIds: [STAFF_USER_OUT],
					periodStart: new Date("2026-06-01"),
					periodEnd: new Date("2026-06-30"),
					paymentMethod: "bank_transfer" as const,
				},
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeStaffScopeDb({}), // admin → never queried
						// default member = admin
					}),
				},
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

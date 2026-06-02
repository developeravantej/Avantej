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
 * `member.role === "admin"` rule) and whose transaction throws a marker — if
 * a guard failed to reject and the service ran, we'd see SERVICE_REACHED rather
 * than FORBIDDEN.
 */
function makeGuardDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
		transaction: () => {
			throw new Error("SERVICE_REACHED");
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

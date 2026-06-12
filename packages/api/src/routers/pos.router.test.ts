/**
 * POS Router — unit tests for recordSale guards and delegation.
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import { call } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_BRANCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LOW_PRIORITY_ROLE = { id: "role-staff", name: "staff", priority: 50 };

const mockRecordPosSale = mock(() =>
	Promise.resolve({ salesOrderId: "so-1", salesOrderNumber: "SO-001" }),
);
const mockSearchPosCustomers = mock(() => Promise.resolve([]));

mock.module("@avantej-core/services/pos.service", () => ({
	recordPosSale: mockRecordPosSale,
	searchPosCustomers: mockSearchPosCustomers,
}));

import { posRouter } from "./pos";

function makeAdminDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

function makeStaffDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(LOW_PRIORITY_ROLE)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

const validInput = {
	organizationId: ORG_ID,
	customerType: "member" as const,
	customerId: "user-client-1",
	customerName: "Test Client",
	branchId: BRANCH_ID,
	items: [
		{
			type: "service" as const,
			description: "PT Session",
			quantity: 1,
			unitPriceCents: 5000,
		},
	],
	paymentMethod: "cash" as const,
};

describe("posRouter.recordSale", () => {
	beforeEach(() => {
		mockRecordPosSale.mockClear();
	});

	it("delegates to recordPosSale on happy path", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		const result = await call(posRouter.recordSale, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ salesOrderId: "so-1" });
		expect(mockRecordPosSale).toHaveBeenCalledTimes(1);
	});

	it("rejects when tenantDb is missing", async () => {
		const ctx = createMockContext({ tenantDb: undefined });
		await expect(
			call(posRouter.recordSale, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("rejects when member is missing", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			member: null,
		});
		await expect(
			call(posRouter.recordSale, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when branchId is outside accessibleNodeIds", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			accessibleNodeIds: [OTHER_BRANCH],
		});
		await expect(
			call(posRouter.recordSale, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when caller lacks pos:create permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: {
				id: "m1",
				userId: "u1",
				role: "staff",
				status: "active",
				hierarchyScopeId: BRANCH_ID,
			},
			accessibleNodeIds: [BRANCH_ID],
		});
		await expect(
			call(posRouter.recordSale, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("propagates walk-in package rejection from recordPosSale", async () => {
		mockRecordPosSale.mockImplementation(() => {
			throw new ORPCError("BAD_REQUEST", {
				message: "Walk-in customers cannot purchase packages",
			});
		});
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			accessibleNodeIds: [BRANCH_ID],
		});
		await expect(
			call(
				posRouter.recordSale,
				{
					...validInput,
					customerType: "walk_in",
					customerId: "walk-in-1",
					items: [
						{
							type: "package" as const,
							description: "Package",
							quantity: 1,
							unitPriceCents: 10000,
						},
					],
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Walk-in customers cannot purchase packages",
		});
	});
});

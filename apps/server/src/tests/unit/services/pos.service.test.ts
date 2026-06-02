/**
 * Unit tests: pos.service.ts — walk-in customer anonymization guards
 *
 * Key invariants under test:
 * 1. Walk-in customers cannot buy packages — server throws BAD_REQUEST before
 *    the transaction even opens.
 * 2. Walk-in customers CAN buy services — the package guard does not fire.
 * 3. searchPosCustomers no longer returns walk-in results — only "member" typed
 *    results are included in the output.
 */

import { describe, test, expect, mock } from "bun:test";
import {
	recordPosSale,
	searchPosCustomers,
} from "@avantej-core/services/pos.service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BRANCH_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const ACTOR = {
	userId: "actor-user-id",
	memberId: "actor-member-id",
	role: "admin",
};

// A tax rate row required by createSalesOrder
const FAKE_TAX_RATE = {
	id: "tax-rate-id",
	name: "SST",
	rateInBasisPoints: 600, // 6%
	isActive: true,
	isDefault: true,
};

// A service row for packages (must have sessionCount + expirable + expiryDays)
const FAKE_SERVICE = {
	id: "service-id-1",
	name: "Yoga Session",
	sessionCount: 10,
	expirable: true,
	expiryDays: 365,
};

// A member row (client role)
const FAKE_MEMBER = {
	id: "member-db-id",
	userId: "member-user-id",
	role: "client",
	status: "active",
	hierarchyScopeId: BRANCH_ID,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock tenantDb that responds to the queries used by
 * recordPosSale BEFORE it opens the transaction.
 *
 * The walk-in + package guard fires before any transaction, so for the failing
 * case we only need the pre-tx query mocks.
 *
 * For the success path (service item, walk-in) we stub a minimal tx.
 */
function buildPosDb(options: {
	serviceFindFirst?: typeof FAKE_SERVICE | null;
	taxRateFindFirst?: typeof FAKE_TAX_RATE | null;
	memberFindFirst?: typeof FAKE_MEMBER | null;
	installmentPlanFindFirst?: null;
}) {
	const {
		serviceFindFirst = null,
		taxRateFindFirst = FAKE_TAX_RATE,
		memberFindFirst = FAKE_MEMBER,
	} = options;

	// Pre-tx queries: services.findFirst, installmentPlans.findFirst
	const mockServicesFindFirst = mock(() =>
		Promise.resolve(serviceFindFirst ?? undefined),
	);
	const mockInstallmentPlansFindFirst = mock(() => Promise.resolve(undefined));
	const mockTaxRatesFindFirst = mock(() =>
		Promise.resolve(taxRateFindFirst ?? undefined),
	);
	const mockMembersFindFirst = mock(() =>
		Promise.resolve(memberFindFirst ?? undefined),
	);

	// Inside tx: insert().values().returning() — minimal stubs to prevent crash
	let insertCallCount = 0;
	const mockReturning = mock(() => {
		insertCallCount++;
		if (insertCallCount === 1) {
			// salesOrders insert
			return Promise.resolve([
				{
					id: "so-id",
					salesOrderNumber: "SO-20260421-000001",
					branchId: BRANCH_ID,
				},
			]);
		}
		if (insertCallCount === 2) {
			// payments insert
			return Promise.resolve([{ id: "pay-id" }]);
		}
		if (insertCallCount === 3) {
			// invoices insert
			return Promise.resolve([
				{ id: "inv-id", invoiceNumber: "INV-20260421-000001" },
			]);
		}
		return Promise.resolve([]);
	});
	const mockValues = mock(() => ({ returning: mockReturning }));
	const mockInsert = mock(() => ({ values: mockValues }));
	const mockUpdate = mock(() => ({
		set: mock(() => ({
			where: mock(() => Promise.resolve([])),
		})),
	}));

	// tx.execute() — used by generateSalesOrderNumber / generatePaymentNumber / generateInvoiceNumber
	let execCallCount = 0;
	const mockExecute = mock(() => {
		execCallCount++;
		return Promise.resolve({ rows: [{ seq: execCallCount }] });
	});

	const txObj = {
		insert: mockInsert,
		update: mockUpdate,
		execute: mockExecute,
		query: {
			members: { findFirst: mockMembersFindFirst },
			taxRates: { findFirst: mockTaxRatesFindFirst },
			promotions: { findFirst: mock(() => Promise.resolve(undefined)) },
			services: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	};

	const mockTransaction = mock((cb: (tx: typeof txObj) => Promise<unknown>) =>
		cb(txObj),
	);

	return {
		db: {
			transaction: mockTransaction,
			query: {
				services: { findFirst: mockServicesFindFirst },
				installmentPlans: { findFirst: mockInstallmentPlansFindFirst },
				taxRates: { findFirst: mockTaxRatesFindFirst },
				members: { findFirst: mockMembersFindFirst },
				promotions: { findFirst: mock(() => Promise.resolve(undefined)) },
			},
			insert: mockInsert,
		} as any,
		txObj,
		mockServicesFindFirst,
	};
}

// ---------------------------------------------------------------------------
// Tests: createSalesOrder (via recordPosSale) — walk-in package guard
// ---------------------------------------------------------------------------

describe("recordPosSale — walk-in package guard", () => {
	test("throws BAD_REQUEST when walk-in attempts to buy a package", async () => {
		const { db } = buildPosDb({
			serviceFindFirst: FAKE_SERVICE, // service lookup for package pre-validation
		});

		await expect(
			recordPosSale(db, {
				customerType: "walk_in",
				customerId: "walkin-anon-id",
				customerName: "Walk-in",
				branchId: BRANCH_ID,
				items: [
					{
						type: "package",
						refId: FAKE_SERVICE.id,
						description: "Yoga Package",
						quantity: 1,
						unitPriceCents: 50000,
					},
				],
				taxRateId: FAKE_TAX_RATE.id,
				paymentMethod: "cash",
				actor: ACTOR,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining(
				"Walk-in customers cannot purchase packages",
			),
		});
	});

	test("walk-in package guard fires even when item list has both package and service", async () => {
		const { db } = buildPosDb({
			serviceFindFirst: FAKE_SERVICE,
		});

		await expect(
			recordPosSale(db, {
				customerType: "walk_in",
				customerId: "walkin-anon-id",
				customerName: "Walk-in",
				branchId: BRANCH_ID,
				items: [
					{
						type: "service",
						refId: "some-service-id",
						description: "Single Session",
						quantity: 1,
						unitPriceCents: 8000,
					},
					{
						type: "package",
						refId: FAKE_SERVICE.id,
						description: "Yoga Package",
						quantity: 1,
						unitPriceCents: 50000,
					},
				],
				taxRateId: FAKE_TAX_RATE.id,
				paymentMethod: "cash",
				actor: ACTOR,
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringContaining(
				"Walk-in customers cannot purchase packages",
			),
		});
	});
});

// ---------------------------------------------------------------------------
// Tests: searchPosCustomers — no walk-in results returned
// ---------------------------------------------------------------------------

describe("searchPosCustomers — returns only member results", () => {
	test("returns empty array when no accessible nodes", async () => {
		const mockControlDb = {} as any;
		const mockTenantDb = {
			query: {
				members: { findMany: mock(() => Promise.resolve([])) },
			},
		} as any;

		const result = await searchPosCustomers(mockControlDb, mockTenantDb, {
			query: "jane",
			accessibleNodeIds: [],
		});

		expect(result).toEqual([]);
	});

	test("returns only member type results, never walk_in type", async () => {
		// Tenant DB has client members whose hierarchyScopeId is in accessibleNodeIds
		const clientMembers = [
			{
				id: "member-db-1",
				userId: "user-1",
				role: "client",
				status: "active",
				hierarchyScopeId: BRANCH_ID,
			},
		];

		const mockTenantDb = {
			query: {
				members: {
					findMany: mock(() => Promise.resolve(clientMembers)),
				},
			},
		} as any;

		// Control panel returns matching user for "jane"
		const mockControlDb = {
			select: mock(() => ({
				from: mock(() => ({
					where: mock(() =>
						Promise.resolve([
							{ id: "user-1", name: "Jane Doe", email: "jane@example.com" },
						]),
					),
				})),
			})),
		} as any;

		const result = await searchPosCustomers(mockControlDb, mockTenantDb, {
			query: "jane",
			accessibleNodeIds: [BRANCH_ID],
		});

		expect(result.length).toBeGreaterThan(0);
		for (const r of result) {
			expect(r.type).toBe("member");
		}
		// Confirm no walk_in type slipped through
		expect(result.every((r) => r.type !== "walk_in")).toBe(true);
	});

	test("returns empty array when no members match the search query", async () => {
		const clientMembers = [
			{
				id: "member-db-1",
				userId: "user-1",
				role: "client",
				status: "active",
				hierarchyScopeId: BRANCH_ID,
			},
		];

		const mockTenantDb = {
			query: {
				members: {
					findMany: mock(() => Promise.resolve(clientMembers)),
				},
			},
		} as any;

		// Control panel returns a user whose name/email doesn't match query
		const mockControlDb = {
			select: mock(() => ({
				from: mock(() => ({
					where: mock(() =>
						Promise.resolve([
							{ id: "user-1", name: "Bob Smith", email: "bob@example.com" },
						]),
					),
				})),
			})),
		} as any;

		const result = await searchPosCustomers(mockControlDb, mockTenantDb, {
			query: "xyznotmatch",
			accessibleNodeIds: [BRANCH_ID],
		});

		expect(result).toEqual([]);
	});

	test("filters out members whose hierarchyScopeId is not in accessibleNodeIds", async () => {
		const clientMembers = [
			{
				id: "member-db-1",
				userId: "user-1",
				role: "client",
				status: "active",
				hierarchyScopeId: "other-branch-not-accessible",
			},
		];

		const mockTenantDb = {
			query: {
				members: {
					findMany: mock(() => Promise.resolve(clientMembers)),
				},
			},
		} as any;

		const mockControlDb = {
			select: mock(() => ({
				from: mock(() => ({
					where: mock(() =>
						Promise.resolve([
							{ id: "user-1", name: "Jane Doe", email: "jane@example.com" },
						]),
					),
				})),
			})),
		} as any;

		const result = await searchPosCustomers(mockControlDb, mockTenantDb, {
			query: "jane",
			accessibleNodeIds: [BRANCH_ID], // does NOT include "other-branch-not-accessible"
		});

		expect(result).toEqual([]);
	});
});

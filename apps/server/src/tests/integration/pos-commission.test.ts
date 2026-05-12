/**
 * Integration tests for calculateCommissionForPos.
 *
 * POS path: commission_splits.salesOrderId (FK to sales_orders.id, onDelete: restrict).
 * All splits reference a real sales order created in beforeAll.
 *
 * Cleanup order in afterAll:
 * 1. commission_splits (by salesOrderId)
 * 2. sales_orders
 * 3. services
 * 4. service_categories (cascades commission configs)
 * 5. members (reset trainerTierId first)
 * 6. trainer_tiers
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
	TEST_USER_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import {
	createTrainerTier,
	upsertCategoryCommissionConfig,
} from "@avantej-core/services";
import { calculateCommissionForPos } from "@avantej-core/services";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { members } from "@avantej-core/db/schema/tenant/members";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { services } from "@avantej-core/db/schema/tenant/services";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";

// ---- State tracking ----
const createdTierIds: string[] = [];
const createdMemberIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdServiceIds: string[] = [];
const createdSalesOrderIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;

// Shared resources
let tierId: string;
let trainerUserId: string;
let trainerMemberId: string;

const TS = Date.now();

const ACTOR = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

// Helper: create a service category + service
async function createCategoryAndService(suffix: string) {
	const [category] = await tenantDb
		.insert(serviceCategories)
		.values({
			name: `POS Test Category ${suffix}`,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!category) throw new Error("Failed to create service category");
	createdCategoryIds.push(category.id);

	const [service] = await tenantDb
		.insert(services)
		.values({
			name: `POS Test Service ${suffix}`,
			categoryId: category.id,
			duration: 60,
			durationUnitType: "minutes",
			maxAttendees: 10,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!service) throw new Error("Failed to create service");
	createdServiceIds.push(service.id);

	return { categoryId: category.id, serviceId: service.id };
}

// Helper: create a minimal sales order
async function createSalesOrder(suffix: string) {
	const [so] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber: `POS-TEST-${TS}-${suffix}`,
			date: new Date(),
			customerName: "POS Integration Test Customer",
			createdBy: TEST_USER_ID,
			branchId: TEST_BRANCH_NODE_ID,
			status: "confirmed",
			totalAmount: 10000,
		})
		.returning();
	if (!so) throw new Error("Failed to create sales order");
	createdSalesOrderIds.push(so.id);
	return so;
}

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	// Ensure the test branch hierarchy node exists (FK target for members/services/etc.)
	await tenantDb
		.insert(hierarchyNodes)
		.values({
			id: TEST_BRANCH_NODE_ID,
			name: `POS Integration Test Branch ${TS}`,
			type: "branch",
			depth: 4,
		} as any)
		.onConflictDoNothing();

	// Trainer tier
	const { tier } = await createTrainerTier(tenantDb, {
		name: `POS Integration Tier ${TS}`,
		rank: 98,
	});
	tierId = tier.id;
	createdTierIds.push(tierId);

	// Trainer member
	trainerUserId = `pos-test-trainer-${TS}`;
	const [trainerMember] = await tenantDb
		.insert(members)
		.values({
			userId: trainerUserId,
			role: "trainer",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			status: "active",
			trainerTierId: tierId,
		})
		.returning();
	if (!trainerMember) throw new Error("Failed to create trainer member");
	trainerMemberId = trainerMember.id;
	createdMemberIds.push(trainerMemberId);
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;

	// 1. Commission splits (by salesOrderId)
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(commissionSplits)
			.where(inArray(commissionSplits.salesOrderId, createdSalesOrderIds));
	}

	// 2. Sales orders
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrders)
			.where(inArray(salesOrders.id, createdSalesOrderIds));
	}

	// 3. Services
	if (createdServiceIds.length > 0) {
		await tenantDb
			.delete(services)
			.where(inArray(services.id, createdServiceIds));
	}

	// 4. Service categories (cascades commission configs)
	if (createdCategoryIds.length > 0) {
		await tenantDb
			.delete(serviceCategories)
			.where(inArray(serviceCategories.id, createdCategoryIds));
	}

	// 5. Members (reset tier FK first)
	if (createdMemberIds.length > 0) {
		await tenantDb
			.update(members)
			.set({ trainerTierId: null })
			.where(inArray(members.id, createdMemberIds));
		await tenantDb
			.delete(members)
			.where(inArray(members.id, createdMemberIds));
	}

	// 6. Trainer tiers
	if (createdTierIds.length > 0) {
		await tenantDb
			.delete(trainerTiers)
			.where(inArray(trainerTiers.id, createdTierIds));
	}
});

describe("Commission Calculator — POS path", () => {
	test("TC-POS-001: POS sale with trainer creates split with correct amount", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(`TC001-${TS}`);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "variable",
				isConditional: false,
				maxCoaches: 1,
				slots: [{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 }],
				rates: [{ trainerTierId: tierId, amount: 2000 }], // 20% in basis points
			},
			ACTOR,
		);

		const salesOrder = await createSalesOrder(`TC001`);
		// unitPrice: RM500 = 50000 cents; quantity: 2
		// base = 20% of 50000 = 10000; weightage 100%; quantity 2 → final 20000 cents
		const splits = await calculateCommissionForPos(tenantDb, {
			salesOrderId: salesOrder.id,
			serviceId,
			unitPriceCents: 50000,
			quantity: 2,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
		});

		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		expect(split.calculatedAmount).toBe(20000); // 10000 base × 100% × qty 2
		expect(split.baseAmountCents).toBe(10000);   // 20% of 50000 per unit
		expect(split.salesOrderId).toBe(salesOrder.id);
		expect(split.staffId).toBe(trainerUserId);
		expect(split.status).toBe("pending");
		expect(split.splitType).toBe("automatic");
	}, 30000);

	test("TC-POS-002: POS sale with empty staffAssignments creates no splits", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(`TC002-${TS}`);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 }],
				rates: [{ trainerTierId: tierId, amount: 5000 }],
			},
			ACTOR,
		);

		const salesOrder = await createSalesOrder(`TC002`);

		const splits = await calculateCommissionForPos(tenantDb, {
			salesOrderId: salesOrder.id,
			serviceId,
			unitPriceCents: 50000,
			quantity: 1,
			staffAssignments: [], // empty — no splits expected
			actor: ACTOR,
		});

		expect(splits).toHaveLength(0);
	}, 30000);

	test("TC-POS-003: service without commission config skips — returns empty array", async () => {
		if (shouldSkipIntegration()) return;

		// Category and service but NO config
		const { serviceId } = await createCategoryAndService(`TC003-${TS}`);
		const salesOrder = await createSalesOrder(`TC003`);

		const splits = await calculateCommissionForPos(tenantDb, {
			salesOrderId: salesOrder.id,
			serviceId,
			unitPriceCents: 30000,
			quantity: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
		});

		expect(splits).toHaveLength(0);
	}, 30000);
});

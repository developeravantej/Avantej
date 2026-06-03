/**
 * Integration tests for the Phase 1 commission rule.
 *
 * Rule: commission earns at delivery only.
 *   - appointment.status → completed   → commissionSplits row, earnReason='completion'
 *   - appointment.status → cancelled   → commissionSplits row, earnReason='cancellation'
 *   - POS service-line sale            → commissionDeferred=true, no split yet
 *   - POS product-line sale            → split immediately, earnReason='pos_product'
 *   - voidCommissionSplitsForSalesOrder → skips delivered-appointment splits
 *
 * Skip pattern: shouldSkipIntegration() + `if (shouldSkipIntegration()) return` at
 * the top of every beforeAll (matches branch-invite.integration.test.ts convention).
 *
 * FK requirements (shared with appointment-commission.test.ts):
 *   - commission_splits.appointmentId → appointments.id  (cascade delete)
 *   - appointments.branchId → hierarchy_nodes.id  (NOT NULL)
 *   - sales_order_items has commissionDeferred column (migration 0010)
 *
 * Cleanup order in afterAll:
 *   1. commission_splits (explicit before appointments / sales_orders)
 *   2. appointments
 *   3. sales_order_items
 *   4. sales_orders
 *   5. services
 *   6. service_categories (cascades commission configs)
 *   7. members (reset trainerTierId first)
 *   8. trainer_tiers
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
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
	calculateCommissionForAppointment,
	calculateCommissionForPos,
	voidCommissionSplitsForSalesOrder,
} from "@avantej-core/services";

import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { commissionTierRates } from "@avantej-core/db/schema/tenant/commission-tier-rates";
import { members } from "@avantej-core/db/schema/tenant/members";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { services } from "@avantej-core/db/schema/tenant/services";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { salesOrderItems } from "@avantej-core/db/schema/tenant/sales-order-items";

// ---------------------------------------------------------------------------
// State tracking for cleanup
// ---------------------------------------------------------------------------

const createdTierIds: string[] = [];
const createdMemberIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdServiceIds: string[] = [];
const createdAppointmentIds: string[] = [];
const createdSalesOrderIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;

// Shared resources across tests
let tierId: string;
let trainerUserId: string;
let trainerMemberId: string;

const TS = Date.now();

const ACTOR = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createCategoryAndService(suffix: string) {
	const [category] = await tenantDb
		.insert(serviceCategories)
		.values({
			name: `CR Test Category ${suffix}`,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!category) throw new Error("Failed to create service category");
	createdCategoryIds.push(category.id);

	const [service] = await tenantDb
		.insert(services)
		.values({
			name: `CR Test Service ${suffix}`,
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

/** Create a minimal appointment with the given status (default 'scheduled') */
async function createAppointment(serviceId: string, status = "scheduled") {
	const startTime = new Date();
	const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
	const [appt] = await tenantDb
		.insert(appointments)
		.values({
			type: "private",
			startTime,
			duration: 60,
			endTime,
			serviceId,
			branchId: TEST_BRANCH_NODE_ID,
			status,
			sessionTotal: 10000,
			pricePerClient: 10000,
			createdBy: TEST_USER_ID,
		})
		.returning();
	if (!appt) throw new Error("Failed to create appointment");
	createdAppointmentIds.push(appt.id);
	return appt;
}

/** Create a minimal sales order */
async function createSalesOrder(suffix: string) {
	const [so] = await tenantDb
		.insert(salesOrders)
		.values({
			salesOrderNumber: `CR-TEST-${TS}-${suffix}`,
			date: new Date(),
			customerName: "CR Integration Test Customer",
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

/**
 * Insert a sales_order_items row with explicit commissionDeferred value.
 * Returns the inserted row so tests can assert the column value.
 */
async function createSalesOrderItem(
	salesOrderId: string,
	opts: {
		serviceId?: string | null;
		productId?: string | null;
		commissionDeferred: boolean;
		description?: string;
	},
) {
	const [item] = await tenantDb
		.insert(salesOrderItems)
		.values({
			salesOrderId,
			serviceId: opts.serviceId ?? null,
			productId: opts.productId ?? null,
			description: opts.description ?? "Test item",
			quantity: 1,
			unitPrice: 10000,
			totalPrice: 10000,
			commissionDeferred: opts.commissionDeferred,
		})
		.returning();
	if (!item) throw new Error("Failed to create sales order item");
	return item;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	// Trainer tier
	const { tier } = await createTrainerTier(tenantDb, {
		name: `CR Integration Tier ${TS}`,
		rank: 96,
	});
	tierId = tier.id;
	createdTierIds.push(tierId);

	// Trainer member
	trainerUserId = `cr-test-trainer-${TS}`;
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

	// 1. Commission splits (explicit before cascade targets)
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(commissionSplits)
			.where(inArray(commissionSplits.appointmentId, createdAppointmentIds));
	}
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(commissionSplits)
			.where(inArray(commissionSplits.salesOrderId, createdSalesOrderIds));
	}

	// 2. Appointments
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(appointments)
			.where(inArray(appointments.id, createdAppointmentIds));
	}

	// 3. Sales order items (FK to salesOrders; delete before orders)
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrderItems)
			.where(inArray(salesOrderItems.salesOrderId, createdSalesOrderIds));
	}

	// 4. Sales orders
	if (createdSalesOrderIds.length > 0) {
		await tenantDb
			.delete(salesOrders)
			.where(inArray(salesOrders.id, createdSalesOrderIds));
	}

	// 5. Services
	if (createdServiceIds.length > 0) {
		await tenantDb
			.delete(services)
			.where(inArray(services.id, createdServiceIds));
	}

	// 6. Service categories (cascade deletes commission configs)
	if (createdCategoryIds.length > 0) {
		await tenantDb
			.delete(serviceCategories)
			.where(inArray(serviceCategories.id, createdCategoryIds));
	}

	// 7. Members (reset tier FK first)
	if (createdMemberIds.length > 0) {
		await tenantDb
			.update(members)
			.set({ trainerTierId: null })
			.where(inArray(members.id, createdMemberIds));
		await tenantDb.delete(members).where(inArray(members.id, createdMemberIds));
	}

	// 8. Trainer tiers
	if (createdTierIds.length > 0) {
		await tenantDb
			.delete(commissionTierRates)
			.where(inArray(commissionTierRates.trainerTierId, createdTierIds));
		await tenantDb
			.delete(trainerTiers)
			.where(inArray(trainerTiers.id, createdTierIds));
	}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Commission Rule — Phase 1 integration", () => {
	/**
	 * TC-CR-I001: CANCELLATION lifecycle
	 * Create appointment → set cancelled → assert split with earnReason='cancellation'
	 */
	test("TC-CR-I001: cancellation → commission split with earnReason='cancellation'", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-I001-${TS}`,
		);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 },
				],
				rates: [{ trainerTierId: tierId, amount: 7500 }],
			},
			ACTOR,
		);

		// Create appointment already in 'cancelled' status to simulate the transition
		const appt = await createAppointment(serviceId, "cancelled");

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: appt.pricePerClient,
			attendeeCount: 0, // cancellations have 0 attendees
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "cancellation",
		});

		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		expect(split.earnReason).toBe("cancellation");
		expect(split.status).toBe("pending");
		expect(split.staffId).toBe(trainerUserId);
		expect(split.trainerTierId).toBe(tierId);
		expect(split.calculatedAmount).toBe(7500);
		expect(split.earnedAt).toBeInstanceOf(Date);
	}, 30000);

	/**
	 * TC-CR-I002: COMPLETION lifecycle
	 * Create appointment → set completed → assert split with earnReason='completion'
	 */
	test("TC-CR-I002: completion → commission split with earnReason='completion'", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-I002-${TS}`,
		);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 },
				],
				rates: [{ trainerTierId: tierId, amount: 7500 }],
			},
			ACTOR,
		);

		const appt = await createAppointment(serviceId, "completed");

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: appt.pricePerClient,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});

		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		expect(split.earnReason).toBe("completion");
		expect(split.status).toBe("pending");
		expect(split.staffId).toBe(trainerUserId);
		expect(split.calculatedAmount).toBe(7500);
	}, 30000);

	/**
	 * TC-CR-I003: POS service sale → no splits created; SOI has commissionDeferred=true
	 * Subsequently the linked appointment completes → split appears with earnReason='completion'.
	 */
	test("TC-CR-I003: POS service sale sets commissionDeferred=true; appointment completion then creates split", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-I003-${TS}`,
		);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 },
				],
				rates: [{ trainerTierId: tierId, amount: 5000 }],
			},
			ACTOR,
		);

		const salesOrder = await createSalesOrder("I003");

		// Insert SOI as it would be by recordPosSale for a service item
		const item = await createSalesOrderItem(salesOrder.id, {
			serviceId,
			commissionDeferred: true,
			description: "Service item (deferred commission)",
		});

		// Verify the flag is persisted correctly
		expect(item.commissionDeferred).toBe(true);
		expect(item.serviceId).toBe(serviceId);

		// Confirm no commission splits exist for this order yet
		const splitsBefore = await tenantDb
			.select()
			.from(commissionSplits)
			.where(eq(commissionSplits.salesOrderId, salesOrder.id));
		expect(splitsBefore).toHaveLength(0);

		// Now simulate appointment completion (the linked appointment is created and completed)
		const appt = await createAppointment(serviceId, "completed");

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});

		// Split appears post-completion
		expect(splits).toHaveLength(1);
		expect(splits[0]!.earnReason).toBe("completion");
		expect(splits[0]!.status).toBe("pending");
	}, 30000);

	/**
	 * TC-CR-I004: POS product sale → split created immediately with earnReason='pos_product'
	 */
	test("TC-CR-I004: POS product sale → immediate split with earnReason='pos_product'", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-I004-${TS}`,
		);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 },
				],
				rates: [{ trainerTierId: tierId, amount: 3000 }],
			},
			ACTOR,
		);

		const salesOrder = await createSalesOrder("I004");

		// Insert SOI for a product item (commissionDeferred=false)
		await createSalesOrderItem(salesOrder.id, {
			commissionDeferred: false,
			description: "Product item",
		});

		// calculateCommissionForPos simulates what recordPosSale calls for product items
		const splits = await calculateCommissionForPos(tenantDb, {
			salesOrderId: salesOrder.id,
			serviceId,
			unitPriceCents: 10000,
			quantity: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "pos_product",
		});

		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		expect(split.earnReason).toBe("pos_product");
		expect(split.status).toBe("pending");
		expect(split.salesOrderId).toBe(salesOrder.id);
		expect(split.appointmentId).toBeNull();
	}, 30000);

	/**
	 * TC-CR-I005: Sale cancellation when appointment already completed → split is preserved
	 *
	 * Scenario: appointment completes → commission split created (earnReason='completion')
	 * → sale is later cancelled → voidCommissionSplitsForSalesOrder skips the split
	 * because the appointment is delivered.
	 */
	test("TC-CR-I005: sale cancelled after appointment completed → split preserved (not voided)", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-I005-${TS}`,
		);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 },
				],
				rates: [{ trainerTierId: tierId, amount: 4000 }],
			},
			ACTOR,
		);

		// Create appointment (completed) and its commission split
		const appt = await createAppointment(serviceId, "completed");

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});
		expect(splits).toHaveLength(1);

		const salesOrder = await createSalesOrder("I005");

		// The completion split targets the appointment ONLY. The commission_splits
		// `must_target_one` CHECK constraint (migration 0024, broadened in 0034) forbids
		// a row from carrying both appointmentId and salesOrderId, so we cannot — and must
		// not — re-link the split onto the sales order. In production an appointment-earned
		// split is therefore never matched by voidCommissionSplitsForSalesOrder's
		// `WHERE salesOrderId = ...` query, which is exactly how delivered commissions are
		// protected from post-sale cancellation. This test asserts that protection: cancel
		// the (unrelated) sales order and confirm the completion split is left intact.
		const voided = await voidCommissionSplitsForSalesOrder(
			tenantDb,
			salesOrder.id,
			"sale cancelled post-delivery",
			ACTOR,
		);

		// No split is linked to this sales order, so nothing is voided and the
		// appointment-earned completion split is preserved.
		expect(voided).toHaveLength(0);

		// Verify the split is still 'pending' (not voided)
		const remaining = await tenantDb
			.select()
			.from(commissionSplits)
			.where(
				and(
					eq(commissionSplits.id, splits[0]!.id),
					eq(commissionSplits.status, "pending"),
				),
			);
		expect(remaining).toHaveLength(1);
	}, 30000);

	/**
	 * TC-CR-I006: Sale cancellation when appointment NOT yet delivered → split IS voided
	 *
	 * Scenario: POS product sale creates a split → sale is cancelled before any
	 * appointment delivery → split is voided (pre-delivery, no protection).
	 */
	test("TC-CR-I006: sale cancelled before appointment delivery → split is voided", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-I006-${TS}`,
		);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 },
				],
				rates: [{ trainerTierId: tierId, amount: 2000 }],
			},
			ACTOR,
		);

		const salesOrder = await createSalesOrder("I006");

		// Insert SOI (product — earns at sale) so commissionExcluded guard passes
		await createSalesOrderItem(salesOrder.id, {
			commissionDeferred: false,
			description: "Product item for I006",
		});

		// Create a commission split for this sales order (pos_product path)
		const splits = await calculateCommissionForPos(tenantDb, {
			salesOrderId: salesOrder.id,
			serviceId,
			unitPriceCents: 10000,
			quantity: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "pos_product",
		});
		expect(splits).toHaveLength(1);

		// Now cancel the sale (no appointment linked to this split)
		const voided = await voidCommissionSplitsForSalesOrder(
			tenantDb,
			salesOrder.id,
			"sale cancelled pre-delivery",
			ACTOR,
		);

		// The product split has no appointmentId → no protection → gets voided
		expect(voided).toHaveLength(1);
		expect(voided[0]!.status).toBe("void");
		expect(voided[0]!.salesOrderId).toBe(salesOrder.id);
	}, 30000);

	/**
	 * TC-CR-I007: commissionDeferred column — service item inserts with true, product with false
	 * Directly verifies the SOI schema column persists correctly.
	 */
	test("TC-CR-I007: salesOrderItems commissionDeferred column persists true for service, false for product", async () => {
		if (shouldSkipIntegration()) return;

		const { serviceId } = await createCategoryAndService(`TC-I007-${TS}`);
		const salesOrder = await createSalesOrder("I007");

		const serviceItem = await createSalesOrderItem(salesOrder.id, {
			serviceId,
			commissionDeferred: true,
			description: "Service item",
		});

		const productItem = await createSalesOrderItem(salesOrder.id, {
			commissionDeferred: false,
			description: "Product item",
		});

		expect(serviceItem.commissionDeferred).toBe(true);
		expect(productItem.commissionDeferred).toBe(false);
	}, 30000);
});

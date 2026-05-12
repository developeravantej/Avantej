/**
 * Integration tests for the commission calculator service.
 *
 * Setup per test suite:
 * - Creates a trainer tier
 * - Creates a service category and service
 * - Creates a commission config via upsertCategoryCommissionConfig
 * - Creates a trainer member (unique userId) with tier assigned (via direct insert)
 * - Creates real appointments (for FK compliance on commission_splits.appointmentId)
 *
 * Cleanup in afterAll:
 * - Deletes commission_splits (cascade via appointments, but explicit for safety)
 * - Deletes appointments
 * - Deletes services
 * - Deletes service categories (cascades commission configs → slots/rates)
 * - Resets member.trainerTierId to null, then deletes members
 * - Deletes trainer tiers
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_USER_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";

let TEST_BRANCH_NODE_ID: string;
const createdBranchNodeIds: string[] = [];
import {
	createTrainerTier,
	upsertCategoryCommissionConfig,
} from "@avantej-core/services";
import { calculateCommissionForAppointment } from "@avantej-core/services";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { members } from "@avantej-core/db/schema/tenant/members";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { services } from "@avantej-core/db/schema/tenant/services";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";

// ---- State tracking for cleanup ----
const createdTierIds: string[] = [];
const createdMemberIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdServiceIds: string[] = [];
const createdAppointmentIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;

// Shared test data (set in beforeAll)
let tierId: string;
let trainerUserId: string;
let trainerMemberId: string;

// ---- Unique timestamp suffix for this test run ----
const TS = Date.now();

const ACTOR = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin",
};

// Helper: create a service category + service, return { categoryId, serviceId }
async function createCategoryAndService(suffix: string) {
	const [category] = await tenantDb
		.insert(serviceCategories)
		.values({
			name: `CC Test Category ${suffix}`,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!category) throw new Error("Failed to create service category");
	createdCategoryIds.push(category.id);

	const [service] = await tenantDb
		.insert(services)
		.values({
			name: `CC Test Service ${suffix}`,
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

// Helper: create a minimal appointment for FK compliance
async function createAppointment(serviceId: string) {
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
			status: "completed",
			sessionTotal: 10000,
			pricePerClient: 10000,
			createdBy: TEST_USER_ID,
		})
		.returning();
	if (!appt) throw new Error("Failed to create appointment");
	createdAppointmentIds.push(appt.id);
	return appt;
}

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	// Seed a hierarchy node for FK compliance
	const [branchNode] = await tenantDb
		.insert(hierarchyNodes)
		.values({
			name: `CC Test Branch ${TS}`,
			type: "branch",
			depth: 4,
		})
		.returning();
	if (!branchNode) throw new Error("Failed to create branch node");
	TEST_BRANCH_NODE_ID = branchNode.id;
	createdBranchNodeIds.push(branchNode.id);

	// Create a unique trainer tier for this test run
	const { tier } = await createTrainerTier(tenantDb, {
		name: `CC Integration Tier ${TS}`,
		description: "Commission calculator integration test tier",
		rank: 99,
	});
	tierId = tier.id;
	createdTierIds.push(tierId);

	// Create a unique trainer member for this test run
	// (members.userId has a unique index — use a synthetic test userId)
	trainerUserId = `cc-test-trainer-${TS}`;
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

	// 1. Delete commission splits (cascaded by appointments, but explicit for safety)
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(commissionSplits)
			.where(inArray(commissionSplits.appointmentId, createdAppointmentIds));
	}

	// 2. Delete appointments
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(appointments)
			.where(inArray(appointments.id, createdAppointmentIds));
	}

	// 3. Delete services (must go before categories due to FK restrict)
	if (createdServiceIds.length > 0) {
		await tenantDb
			.delete(services)
			.where(inArray(services.id, createdServiceIds));
	}

	// 4. Delete service categories (cascades commission configs + slots/rates/conditions)
	if (createdCategoryIds.length > 0) {
		await tenantDb
			.delete(serviceCategories)
			.where(inArray(serviceCategories.id, createdCategoryIds));
	}

	// 5. Reset member trainerTierId before deleting (schema: onDelete set null for members → trainerTiers)
	if (createdMemberIds.length > 0) {
		await tenantDb
			.update(members)
			.set({ trainerTierId: null })
			.where(inArray(members.id, createdMemberIds));
		await tenantDb
			.delete(members)
			.where(inArray(members.id, createdMemberIds));
	}

	// 6. Delete trainer tiers
	if (createdTierIds.length > 0) {
		await tenantDb
			.delete(trainerTiers)
			.where(inArray(trainerTiers.id, createdTierIds));
	}

	// 7. Delete branch hierarchy nodes
	if (createdBranchNodeIds.length > 0) {
		await tenantDb
			.delete(hierarchyNodes)
			.where(inArray(hierarchyNodes.id, createdBranchNodeIds));
	}
});

describe("Commission Calculator — appointment path", () => {
	test("TC-CC-001: fixed non-conditional — creates split with correct amount (cents)", async () => {
		if (shouldSkipIntegration()) return;

		// Setup: category + service + config
		const { categoryId, serviceId } = await createCategoryAndService(`TC001-${TS}`);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 }],
				rates: [{ trainerTierId: tierId, amount: 5000 }], // RM50 = 5000 cents
			},
			ACTOR,
		);

		// Create a real appointment for FK compliance
		const appt = await createAppointment(serviceId);

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 20000, // RM200 (fixed type ignores this)
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
		});

		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		// Fixed RM50 × 100% weightage = 5000 cents
		expect(split.calculatedAmount).toBe(5000);
		expect(split.baseAmountCents).toBe(5000);
		expect(split.weightageBasisPoints).toBe(10000);
		expect(split.splitType).toBe("automatic");
		expect(split.status).toBe("pending");
		expect(split.staffId).toBe(trainerUserId);
		expect(split.appointmentId).toBe(appt.id);
	}, 30000);

	test("TC-CC-002: variable non-conditional — 10% of session total", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(`TC002-${TS}`);

		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "variable",
				isConditional: false,
				maxCoaches: 1,
				slots: [{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 }],
				rates: [{ trainerTierId: tierId, amount: 1000 }], // 10% in basis points
			},
			ACTOR,
		);

		const appt = await createAppointment(serviceId);

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 100000, // RM1000
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
		});

		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		// 10% of 100000 = 10000 cents (RM100), 100% effective weightage
		expect(split.calculatedAmount).toBe(10000);
		expect(split.baseAmountCents).toBe(10000);
		expect(split.weightageBasisPoints).toBe(10000);
	}, 30000);

	test("TC-CC-003: unfilled slot redistribution — single trainer absorbs 100% weightage", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(`TC003-${TS}`);

		// 2 slots: Head (60%), Asst (40%). Only Head present → Head gets 100%.
		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 2,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 6000 },
					{ slotIndex: 1, label: "Assistant", weightageBasisPoints: 4000 },
				],
				rates: [{ trainerTierId: tierId, amount: 10000 }], // RM100 base
			},
			ACTOR,
		);

		const appt = await createAppointment(serviceId);

		// Only Head (slotIndex 0) present
		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
		});

		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		// Effective weightage: 6000 (own) + 4000 (unclaimed from slot 1) = 10000
		expect(split.weightageBasisPoints).toBe(10000);
		// RM100 base × 100% = RM100 = 10000 cents
		expect(split.calculatedAmount).toBe(10000);
	}, 30000);

	test("TC-CC-004: no commission config for category — returns empty array", async () => {
		if (shouldSkipIntegration()) return;

		// Create category+service but NO commission config
		const { serviceId } = await createCategoryAndService(`TC004-${TS}`);
		const appt = await createAppointment(serviceId);

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 50000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
		});

		expect(splits).toHaveLength(0);
	}, 30000);

	test("TC-CC-005: trainer without tier — no split created", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(`TC005-${TS}`);

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

		// Create a trainer member WITHOUT a tier
		const noTierUserId = `cc-test-notier-${TS}`;
		const [noTierMember] = await tenantDb
			.insert(members)
			.values({
				userId: noTierUserId,
				role: "trainer",
				hierarchyScopeId: TEST_BRANCH_NODE_ID,
				status: "active",
				trainerTierId: null,
			})
			.returning();
		if (!noTierMember) throw new Error("Failed to create no-tier member");
		createdMemberIds.push(noTierMember.id);

		const appt = await createAppointment(serviceId);

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 50000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: noTierUserId, slotIndex: 0 }],
			actor: ACTOR,
		});

		expect(splits).toHaveLength(0);
	}, 30000);
});

/**
 * Integration tests for calculateCommissionForAppointment — appointment-specific scenarios.
 *
 * Covers:
 * 1. Commission created on completion — valid setup creates the expected split
 * 2. Conditional config with attendeeCount=0 / threshold gte 1 — no matching condition → no split
 * 3. Double commission guard — DB unique index prevents duplicate (appointment_id, staff_id) inserts
 *
 * FK requirements:
 * - commission_splits.appointmentId → appointments.id (onDelete: cascade)
 * - appointments.branchId → hierarchy_nodes.id (NOT NULL)
 *
 * Cleanup order in afterAll:
 * 1. commission_splits (cascade-deleted with appointments, but explicit for certainty)
 * 2. appointments (cascade-deletes their commission_splits)
 * 3. sales_orders
 * 4. services
 * 5. service_categories (cascades commission configs → slots/rates/conditions)
 * 6. members (reset trainerTierId first)
 * 7. trainer_tiers
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
import { commissionTierRates } from "@avantej-core/db/schema/tenant/commission-tier-rates";
import { members } from "@avantej-core/db/schema/tenant/members";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { services } from "@avantej-core/db/schema/tenant/services";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";

// ---- State tracking ----
const createdTierIds: string[] = [];
const createdMemberIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdServiceIds: string[] = [];
const createdAppointmentIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;

// Shared test resources
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
			name: `AC Test Category ${suffix}`,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!category) throw new Error("Failed to create service category");
	createdCategoryIds.push(category.id);

	const [service] = await tenantDb
		.insert(services)
		.values({
			name: `AC Test Service ${suffix}`,
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

// Helper: create a minimal appointment
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
			name: `AC Test Branch ${TS}`,
			slug: `ac-test-branch-${TS}`,
			type: "branch",
			depth: 4,
		})
		.returning();
	if (!branchNode) throw new Error("Failed to create branch node");
	TEST_BRANCH_NODE_ID = branchNode.id;
	createdBranchNodeIds.push(branchNode.id);

	// Trainer tier
	const { tier } = await createTrainerTier(tenantDb, {
		name: `AC Integration Tier ${TS}`,
		rank: 97,
	});
	tierId = tier.id;
	createdTierIds.push(tierId);

	// Trainer member with tier
	trainerUserId = `ac-test-trainer-${TS}`;
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

	// 1. Appointments cascade-delete their commission_splits; still explicit for safety
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(commissionSplits)
			.where(inArray(commissionSplits.appointmentId, createdAppointmentIds));
		await tenantDb
			.delete(appointments)
			.where(inArray(appointments.id, createdAppointmentIds));
	}

	// 2. Services
	if (createdServiceIds.length > 0) {
		await tenantDb
			.delete(services)
			.where(inArray(services.id, createdServiceIds));
	}

	// 3. Service categories (cascade deletes commission configs + child tables)
	if (createdCategoryIds.length > 0) {
		await tenantDb
			.delete(serviceCategories)
			.where(inArray(serviceCategories.id, createdCategoryIds));
	}

	// 4. Members (reset tier FK first)
	if (createdMemberIds.length > 0) {
		await tenantDb
			.update(members)
			.set({ trainerTierId: null })
			.where(inArray(members.id, createdMemberIds));
		await tenantDb.delete(members).where(inArray(members.id, createdMemberIds));
	}

	// 5. Trainer tiers
	if (createdTierIds.length > 0) {
		await tenantDb
			.delete(commissionTierRates)
			.where(inArray(commissionTierRates.trainerTierId, createdTierIds));
		await tenantDb
			.delete(trainerTiers)
			.where(inArray(trainerTiers.id, createdTierIds));
	}

	// 6. Delete branch hierarchy nodes
	if (createdBranchNodeIds.length > 0) {
		await tenantDb
			.delete(hierarchyNodes)
			.where(inArray(hierarchyNodes.id, createdBranchNodeIds));
	}
});

describe("Commission Calculator — appointment path", () => {
	test("TC-AC-001: commission created on appointment completion — valid setup inserts split", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC001-${TS}`,
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
				rates: [{ trainerTierId: tierId, amount: 7500 }], // RM75
			},
			ACTOR,
		);

		const appt = await createAppointment(serviceId);

		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 15000,
			attendeeCount: 2,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});

		// Expect exactly one split
		expect(splits).toHaveLength(1);
		const split = splits[0]!;
		expect(split.appointmentId).toBe(appt.id);
		expect(split.staffId).toBe(trainerUserId);
		expect(split.calculatedAmount).toBe(7500);
		expect(split.trainerTierId).toBe(tierId);
		expect(split.status).toBe("pending");
		expect(split.earnedAt).toBeInstanceOf(Date);
	}, 30000);

	test("TC-AC-002: conditional config — attendeeCount=0, threshold gte 1 → no split", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC002-${TS}`,
		);

		// Conditional config: only fires when attendeeCount >= 1
		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: true,
				maxCoaches: 1,
				slots: [
					{ slotIndex: 0, label: "Head Trainer", weightageBasisPoints: 10000 },
				],
				conditions: [
					{
						conditionIndex: 0,
						operator: "gte",
						threshold: 1,
						label: "1 or more attendees",
						rates: [{ trainerTierId: tierId, amount: 5000 }],
					},
				],
			},
			ACTOR,
		);

		const appt = await createAppointment(serviceId);

		// attendeeCount=0 — does not match gte 1 — no split
		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 0,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});

		expect(splits).toHaveLength(0);
	}, 30000);

	test("TC-AC-003: double commission guard — DB unique index prevents duplicate (appointment_id, staff_id)", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC003-${TS}`,
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

		const appt = await createAppointment(serviceId);

		// First call should succeed and insert 1 split
		const first = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});
		expect(first).toHaveLength(1);

		// Second call with same (appointmentId, staffId): the 23505 unique-violation
		// is now caught and swallowed (concurrent-cancel race guard, audit P2-19).
		// The call must NOT throw; it returns an empty array for the duplicate staff.
		const second = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});
		expect(second).toHaveLength(0);
	}, 30000);
});

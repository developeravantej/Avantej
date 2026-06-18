/**
 * Integration tests for approveCommissionSplits batch invariants.
 *
 * Reference: packages/services/src/commission-splits.service.ts:643-713
 *
 * Invariants enforced by approveCommissionSplits:
 *   - All splits must be status='pending'
 *   - All splits must be for a single staff member (no cross-trainer batches)
 *   - All splits must fall within a 31-day window (no cross-period batches)
 *   - Empty input returns []
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { commissionTierRates } from "@avantej-core/db/schema/tenant/commission-tier-rates";
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
	approveCommissionSplits,
} from "@avantej-core/services";

import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { members } from "@avantej-core/db/schema/tenant/members";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { services } from "@avantej-core/db/schema/tenant/services";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";

// ---------------------------------------------------------------------------
// State tracking for cleanup
// ---------------------------------------------------------------------------

const createdTierIds: string[] = [];
const createdMemberIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdServiceIds: string[] = [];
const createdAppointmentIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;

let tierId: string;
// Two trainers for the mixed-staff invariant test
let trainerUserId1: string;
let trainerMemberId1: string;
let trainerUserId2: string;
let trainerMemberId2: string;

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
			name: `AI Test Category ${suffix}`,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!category) throw new Error("Failed to create service category");
	createdCategoryIds.push(category.id);

	const [service] = await tenantDb
		.insert(services)
		.values({
			name: `AI Test Service ${suffix}`,
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

async function createAppointment(serviceId: string, status = "scheduled") {
	const startTime = new Date();
	const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
	// Use raw SQL to avoid Drizzle expanding schema columns not yet in the live DB
	const result = await tenantDb.execute(sql`
		INSERT INTO appointments (type, start_time, duration, end_time, service_id, branch_id, status, session_total, price_per_client, created_by)
		VALUES ('private', ${startTime.toISOString()}, 60, ${endTime.toISOString()}, ${serviceId}, ${TEST_BRANCH_NODE_ID}, ${status}, 10000, 10000, ${TEST_USER_ID})
		RETURNING id, type, start_time AS "startTime", duration, end_time AS "endTime", service_id AS "serviceId", branch_id AS "branchId", status, session_total AS "sessionTotal", price_per_client AS "pricePerClient", created_by AS "createdBy", sales_order_id AS "salesOrderId"
	`);
	const appt = result.rows[0] as {
		id: string;
		type: string;
		startTime: Date;
		duration: number;
		endTime: Date;
		serviceId: string;
		branchId: string;
		status: string;
		sessionTotal: number;
		pricePerClient: number;
		createdBy: string;
		salesOrderId: string | null;
	};
	if (!appt) throw new Error("Failed to create appointment");
	createdAppointmentIds.push(appt.id);
	return appt;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	const { tier } = await createTrainerTier(tenantDb, {
		name: `AI Integration Tier ${TS}`,
		rank: 98,
	});
	tierId = tier.id;
	createdTierIds.push(tierId);

	// Trainer 1
	trainerUserId1 = `ai-test-trainer1-${TS}`;
	const [tm1] = await tenantDb
		.insert(members)
		.values({
			userId: trainerUserId1,
			role: "trainer",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			status: "active",
			trainerTierId: tierId,
		})
		.returning();
	if (!tm1) throw new Error("Failed to create trainer member 1");
	trainerMemberId1 = tm1.id;
	createdMemberIds.push(trainerMemberId1);

	// Trainer 2 (needed for TC-AI-002 mixed-staff batch)
	trainerUserId2 = `ai-test-trainer2-${TS}`;
	const [tm2] = await tenantDb
		.insert(members)
		.values({
			userId: trainerUserId2,
			role: "trainer",
			hierarchyScopeId: TEST_BRANCH_NODE_ID,
			status: "active",
			trainerTierId: tierId,
		})
		.returning();
	if (!tm2) throw new Error("Failed to create trainer member 2");
	trainerMemberId2 = tm2.id;
	createdMemberIds.push(trainerMemberId2);
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;

	// 1. Commission splits
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(commissionSplits)
			.where(inArray(commissionSplits.appointmentId, createdAppointmentIds));
	}
	// 2. Appointments
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(appointments)
			.where(inArray(appointments.id, createdAppointmentIds));
	}

	// 3. Services
	if (createdServiceIds.length > 0) {
		await tenantDb
			.delete(services)
			.where(inArray(services.id, createdServiceIds));
	}

	// 6. Service categories
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

	// 8. Commission tier rates scaffolded by createTrainerTier for other configs
	if (createdTierIds.length > 0) {
		await tenantDb
			.delete(commissionTierRates)
			.where(inArray(commissionTierRates.trainerTierId, createdTierIds));
	}

	// 9. Trainer tiers
	if (createdTierIds.length > 0) {
		await tenantDb
			.delete(trainerTiers)
			.where(inArray(trainerTiers.id, createdTierIds));
	}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("approveCommissionSplits — batch invariants", () => {
	/**
	 * TC-AI-001: legal batch (single trainer, ≤31 day spread)
	 * → returns approved splits, all have status='approved' and approvedBy set.
	 */
	test("TC-AI-001: legal batch → all splits approved with approvedBy set", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-AI-001-${TS}`,
		);
		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{
						slotIndex: 0,
						label: "Head Trainer",
						weightageBasisPoints: 10000,
					},
				],
				rates: [{ trainerTierId: tierId, amount: 5000 }],
			},
			ACTOR,
		);

		const appt = await createAppointment(serviceId, "completed");
		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId1, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});
		expect(splits).toHaveLength(1);

		const approved = await approveCommissionSplits(
			tenantDb,
			splits.map((s) => s.id),
			ACTOR,
		);

		expect(approved).toHaveLength(1);
		expect(approved[0]!.status).toBe("approved");
		expect(approved[0]!.approvedBy).toBe(TEST_USER_ID);
		expect(approved[0]!.approvedAt).toBeInstanceOf(Date);
	}, 30000);

	/**
	 * TC-AI-002: mixed-staff batch → throws ORPCError with code='MIXED_BATCH_STAFF'
	 * and data.staffIds containing both trainer IDs.
	 */
	test("TC-AI-002: mixed-staff batch → BAD_REQUEST with code MIXED_BATCH_STAFF and staffIds", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId: cat1, serviceId: svc1 } =
			await createCategoryAndService(`TC-AI-002a-${TS}`);
		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId: cat1,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{
						slotIndex: 0,
						label: "Head Trainer",
						weightageBasisPoints: 10000,
					},
				],
				rates: [{ trainerTierId: tierId, amount: 5000 }],
			},
			ACTOR,
		);

		const { categoryId: cat2, serviceId: svc2 } =
			await createCategoryAndService(`TC-AI-002b-${TS}`);
		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId: cat2,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{
						slotIndex: 0,
						label: "Head Trainer",
						weightageBasisPoints: 10000,
					},
				],
				rates: [{ trainerTierId: tierId, amount: 5000 }],
			},
			ACTOR,
		);

		const appt1 = await createAppointment(svc1, "completed");
		const splits1 = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt1.id,
			serviceId: svc1,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId1, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});

		const appt2 = await createAppointment(svc2, "completed");
		const splits2 = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt2.id,
			serviceId: svc2,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId2, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});

		const mixedIds = [splits1[0]!.id, splits2[0]!.id];

		let caughtError: unknown;
		try {
			await approveCommissionSplits(tenantDb, mixedIds, ACTOR);
		} catch (e) {
			caughtError = e;
		}

		expect(caughtError).toBeDefined();
		const err = caughtError as {
			code: string;
			data?: { code: string; staffIds: string[] };
		};
		expect(err.code).toBe("BAD_REQUEST");
		expect(err.data?.code).toBe("MIXED_BATCH_STAFF");
		expect(Array.isArray(err.data?.staffIds)).toBe(true);
		expect(err.data?.staffIds).toContain(trainerUserId1);
		expect(err.data?.staffIds).toContain(trainerUserId2);
	}, 30000);

	/**
	 * TC-AI-003: single-staff but >31-day spread
	 * → throws ORPCError with code='MIXED_BATCH_PERIOD' and data.spreadDays number.
	 *
	 * Strategy: create one split normally, then insert a second split directly with
	 * an earnedAt date 35 days in the past to simulate a cross-period batch.
	 */
	test("TC-AI-003: >31-day spread → BAD_REQUEST with code MIXED_BATCH_PERIOD and spreadDays", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-AI-003-${TS}`,
		);
		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{
						slotIndex: 0,
						label: "Head Trainer",
						weightageBasisPoints: 10000,
					},
				],
				rates: [{ trainerTierId: tierId, amount: 5000 }],
			},
			ACTOR,
		);

		// Create two appointments each producing a split for trainerUserId1.
		// Then update the earnedAt of the second split to 35 days in the past
		// to simulate a cross-period batch.
		const appt1 = await createAppointment(serviceId, "completed");
		const splits1 = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt1.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId1, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});
		expect(splits1).toHaveLength(1);
		const split1Id = splits1[0]!.id;

		const appt2 = await createAppointment(serviceId, "completed");
		const splits2 = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt2.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId1, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});
		expect(splits2).toHaveLength(1);
		const split2Id = splits2[0]!.id;

		// Backdate split2's earnedAt to 35 days ago to create the >31-day spread
		const earnedAt35DaysAgo = new Date(Date.now() - 35 * 86_400_000);
		await tenantDb.execute(sql`
				UPDATE commission_splits SET earned_at = ${earnedAt35DaysAgo.toISOString()} WHERE id = ${split2Id}
			`);

		let caughtError: unknown;
		try {
			await approveCommissionSplits(tenantDb, [split1Id, split2Id], ACTOR);
		} catch (e) {
			caughtError = e;
		}

		expect(caughtError).toBeDefined();
		const err = caughtError as {
			code: string;
			data?: { code: string; spreadDays: number };
		};
		expect(err.code).toBe("BAD_REQUEST");
		expect(err.data?.code).toBe("MIXED_BATCH_PERIOD");
		expect(typeof err.data?.spreadDays).toBe("number");
		expect(err.data!.spreadDays).toBeGreaterThan(31);
	}, 30000);

	/**
	 * TC-AI-004: non-pending split in batch
	 * → BAD_REQUEST with message containing "not in 'pending' status".
	 */
	test("TC-AI-004: non-pending split in batch → BAD_REQUEST about pending status", async () => {
		if (shouldSkipIntegration()) return;

		const { categoryId, serviceId } = await createCategoryAndService(
			`TC-AI-004-${TS}`,
		);
		await upsertCategoryCommissionConfig(
			tenantDb,
			{
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 1,
				slots: [
					{
						slotIndex: 0,
						label: "Head Trainer",
						weightageBasisPoints: 10000,
					},
				],
				rates: [{ trainerTierId: tierId, amount: 5000 }],
			},
			ACTOR,
		);

		const appt = await createAppointment(serviceId, "completed");
		const splits = await calculateCommissionForAppointment(tenantDb, {
			appointmentId: appt.id,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [{ staffId: trainerUserId1, slotIndex: 0 }],
			actor: ACTOR,
			earnReason: "completion",
		});
		expect(splits).toHaveLength(1);
		const splitId = splits[0]!.id;

		// Manually set the split to 'void' so it's non-pending
		await tenantDb
			.update(commissionSplits)
			.set({ status: "void", updatedAt: new Date() })
			.where(eq(commissionSplits.id, splitId));

		let caughtError: unknown;
		try {
			await approveCommissionSplits(tenantDb, [splitId], ACTOR);
		} catch (e) {
			caughtError = e;
		}

		expect(caughtError).toBeDefined();
		const err = caughtError as { code: string; message?: string };
		expect(err.code).toBe("BAD_REQUEST");
		expect(err.message).toMatch(/not in 'pending' status/i);
	}, 30000);

	/**
	 * TC-AI-005: empty ids array → returns [].
	 */
	test("TC-AI-005: empty ids array → returns empty array without error", async () => {
		if (shouldSkipIntegration()) return;

		const result = await approveCommissionSplits(tenantDb, [], ACTOR);
		expect(result).toEqual([]);
	}, 30000);
});

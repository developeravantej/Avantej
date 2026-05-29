/**
 * Integration tests for no-show commission policy.
 *
 * Business policy: when a client is a no-show, the trainer still attended and
 * still earns commission (earnReason='no_show').
 *
 * Reference: packages/services/src/appointment.service.ts:747-765
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray, sql } from "drizzle-orm";
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
			name: `NS Test Category ${suffix}`,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!category) throw new Error("Failed to create service category");
	createdCategoryIds.push(category.id);

	const [service] = await tenantDb
		.insert(services)
		.values({
			name: `NS Test Service ${suffix}`,
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
	// (e.g. reschedule_history is in schema but missing from the dev tenant DB).
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
		name: `NS Integration Tier ${TS}`,
		rank: 97,
	});
	tierId = tier.id;
	createdTierIds.push(tierId);

	trainerUserId = `ns-test-trainer-${TS}`;
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

	// 4. Service categories
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
		await tenantDb
			.delete(members)
			.where(inArray(members.id, createdMemberIds));
	}

	// 8. Commission tier rates scaffolded by createTrainerTier for other configs
	// (the test's own commission_tier_rates are cascade-deleted by service_categories,
	// but createTrainerTier also scaffolds rows for all existing active configs which
	// do NOT get cascade-deleted when our categories are removed).
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

describe("No-Show Commission Policy", () => {
	/**
	 * TC-NS-001: appointment set to no-show → calculateCommissionForAppointment with
	 * earnReason='no_show' → split has earnReason='no_show', status='pending',
	 * calculatedAmount matches config.
	 */
	test(
		"TC-NS-001: no-show appointment → commission split with earnReason='no_show', correct amount, pending",
		async () => {
			if (shouldSkipIntegration()) return;

			const { categoryId, serviceId } = await createCategoryAndService(
				`TC-NS-001-${TS}`,
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
					rates: [{ trainerTierId: tierId, amount: 6000 }],
				},
				ACTOR,
			);

			// Create appointment already in 'no-show' status to simulate the transition
			const appt = await createAppointment(serviceId, "no-show");

			const splits = await calculateCommissionForAppointment(tenantDb, {
				appointmentId: appt.id,
				serviceId,
				sessionTotalCents: appt.pricePerClient,
				// no-show: 0 client attendees (client did not show up)
				attendeeCount: 0,
				staffAssignments: [{ staffId: trainerUserId, slotIndex: 0 }],
				actor: ACTOR,
				earnReason: "no_show",
			});

			expect(splits).toHaveLength(1);
			const split = splits[0]!;
			// The trainer still earns commission — policy: trainer attended
			expect(split.earnReason).toBe("no_show");
			expect(split.status).toBe("pending");
			expect(split.staffId).toBe(trainerUserId);
			expect(split.trainerTierId).toBe(tierId);
			// Fixed rate of 6000 cents configured above
			expect(split.calculatedAmount).toBe(6000);
			expect(split.earnedAt).toBeInstanceOf(Date);
			// appointmentId must be linked so void guards work correctly
			expect(split.appointmentId).toBe(appt.id);
		},
		30000,
	);
});

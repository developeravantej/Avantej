/**
 * Integration regression guard: staffId convention for commission calculator.
 *
 * Background (see plan.md §3.2):
 *   appointment_staff.staffId must be members.userId (control-panel user ID, a text value).
 *   commission-calculator.service.ts: eq(members.userId, assignment.staffId)
 *
 * This test asserts that calculateCommissionForAppointment returns 0 commission splits when
 * staffId is set to members.id (UUID — the WRONG value) instead of members.userId (the CORRECT value).
 * A companion assertion verifies the correct value does produce splits, confirming the setup is valid.
 *
 * Why this test matters:
 *   If future code accidentally passes members.id instead of members.userId as staffId, the
 *   commission calculator silently skips that staff member (commission_skipped_member_not_found).
 *   This test locks in that behavior as a regression guard.
 *
 * Setup:
 *   - Creates trainer tier, service category + service, commission config, trainer member, appointment
 *   - Calls calculateCommissionForAppointment with staffId = trainerMemberId (members.id, WRONG format)
 *   - Asserts result is empty []
 *   - Then calls with staffId = trainerUserId (members.userId, CORRECT format)
 *   - Asserts result is non-empty
 *
 * Cleanup: all created rows deleted in reverse FK order.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
	TEST_USER_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import {
	calculateCommissionForAppointment,
	createTrainerTier,
	upsertCategoryCommissionConfig,
} from "@avantej-core/services";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { members } from "@avantej-core/db/schema/tenant/members";
import { serviceCategories } from "@avantej-core/db/schema/tenant/service-categories";
import { services } from "@avantej-core/db/schema/tenant/services";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { commissionSplits } from "@avantej-core/db/schema/tenant/commission-splits";

// ---- Unique suffix for this run to avoid collisions ----
const TS = Date.now();

const ACTOR = {
	userId: TEST_USER_ID,
	memberId: TEST_MEMBER_ID,
	role: "admin" as const,
};

// ---- State tracking for cleanup ----
const createdTierIds: string[] = [];
const createdMemberIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdServiceIds: string[] = [];
const createdAppointmentIds: string[] = [];

let tenantDb: ReturnType<typeof createTenantDb>;

// Shared test state (populated in beforeAll)
let tierId: string;
let trainerMemberId: string; // members.id — UUID (the WRONG value to pass as staffId)
let trainerUserId: string;   // members.userId — text (the CORRECT value)
let serviceId: string;
let appointmentId: string;

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();

	// ── 1. Create trainer tier ──
	const { tier } = await createTrainerTier(tenantDb, {
		name: `StaffConvention-Tier-${TS}`,
		description: "Tier for staff-id-convention regression test",
		rank: 99,
	});
	tierId = tier.id;
	createdTierIds.push(tierId);

	// ── 2. Create trainer member ──
	trainerUserId = `staff-conv-user-${TS}`;
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

	// ── 3. Create service category ──
	const [cat] = await tenantDb
		.insert(serviceCategories)
		.values({
			name: `StaffConvention-Cat-${TS}`,
			branchId: TEST_BRANCH_NODE_ID,
		})
		.returning();
	if (!cat) throw new Error("Failed to create service category");
	createdCategoryIds.push(cat.id);

	// ── 4. Create service under that category ──
	const [svc] = await tenantDb
		.insert(services)
		.values({
			name: `StaffConvention-Svc-${TS}`,
			duration: 60,
			durationUnitType: "minutes",
			maxAttendees: 1,
			branchId: TEST_BRANCH_NODE_ID,
			categoryId: cat.id,
		})
		.returning();
	if (!svc) throw new Error("Failed to create service");
	serviceId = svc.id;
	createdServiceIds.push(serviceId);

	// ── 5. Create commission config with a slot and tier rate ──
	await upsertCategoryCommissionConfig(
		tenantDb,
		{
			categoryId: cat.id,
			paymentType: "fixed",
			isConditional: false,
			maxCoaches: 1,
			slots: [
				{
					slotIndex: 0,
					label: "Trainer",
					weightageBasisPoints: 10000, // 100%
				},
			],
			rates: [
				{
					trainerTierId: tierId,
					amount: 5000, // RM50 flat
				},
			],
		},
		ACTOR,
	);

	// ── 6. Create appointment (real row needed for FK on commission_splits.appointmentId) ──
	const startTime = new Date("2099-06-01T10:00:00Z");
	const endTime = new Date("2099-06-01T11:00:00Z");
	const [appt] = await tenantDb
		.insert(appointments)
		.values({
			type: "private",
			startTime,
			duration: 60,
			endTime,
			branchId: TEST_BRANCH_NODE_ID,
			status: "completed",
			sessionTotal: 10000,
			pricePerClient: 10000,
			createdBy: TEST_USER_ID,
			serviceId: serviceId,
			trainerId: trainerMemberId,
		})
		.returning();
	if (!appt) throw new Error("Failed to create appointment");
	appointmentId = appt.id;
	createdAppointmentIds.push(appointmentId);
});

afterAll(async () => {
	if (shouldSkipIntegration() || !tenantDb) return;

	// Clean up in reverse FK order
	if (createdAppointmentIds.length > 0) {
		await tenantDb
			.delete(commissionSplits)
			.where(inArray(commissionSplits.appointmentId, createdAppointmentIds));
		await tenantDb
			.delete(appointments)
			.where(inArray(appointments.id, createdAppointmentIds));
	}
	if (createdServiceIds.length > 0) {
		await tenantDb
			.delete(services)
			.where(inArray(services.id, createdServiceIds));
	}
	if (createdCategoryIds.length > 0) {
		// Commission configs cascade-delete via categoryId FK (onDelete: "cascade" on configs)
		await tenantDb
			.delete(serviceCategories)
			.where(inArray(serviceCategories.id, createdCategoryIds));
	}
	if (createdMemberIds.length > 0) {
		// Reset trainerTierId to null first (FK constraint before tier delete)
		for (const memberId of createdMemberIds) {
			await tenantDb
				.update(members)
				.set({ trainerTierId: null })
				.where(eq(members.id, memberId));
		}
		await tenantDb
			.delete(members)
			.where(inArray(members.id, createdMemberIds));
	}
	if (createdTierIds.length > 0) {
		await tenantDb
			.delete(trainerTiers)
			.where(inArray(trainerTiers.id, createdTierIds));
	}
});

describe("staffId convention regression guard", () => {
	test("commission calculator returns 0 splits when staffId is members.id instead of members.userId", async () => {
		if (shouldSkipIntegration()) {
			console.log("Skipping: TENANT_DATABASE_URL not set");
			return;
		}

		// Pass trainerMemberId (members.id — UUID) as staffId.
		// The calculator does: eq(members.userId, assignment.staffId)
		// No member row has userId equal to a UUID-format members.id,
		// so the lookup returns nothing → logs commission_skipped_member_not_found → skips the staff.
		const splitsWrong = await calculateCommissionForAppointment(tenantDb, {
			appointmentId,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [
				{
					staffId: trainerMemberId, // WRONG: members.id (UUID), not members.userId
					slotIndex: 0,
				},
			],
			actor: ACTOR,
			earnedAt: new Date(),
			earnReason: "completion",
		});

		// Should be empty: staffId does not match any members.userId
		expect(splitsWrong).toHaveLength(0);

		// Companion: using the CORRECT userId produces > 0 splits (validates the setup)
		const splitsCorrect = await calculateCommissionForAppointment(tenantDb, {
			appointmentId,
			serviceId,
			sessionTotalCents: 10000,
			attendeeCount: 1,
			staffAssignments: [
				{
					staffId: trainerUserId, // CORRECT: members.userId (control-panel text ID)
					slotIndex: 0,
				},
			],
			actor: ACTOR,
			earnedAt: new Date(),
			earnReason: "completion",
		});
		expect(splitsCorrect.length).toBeGreaterThan(0);

		// Clean up splits inserted by the companion call
		if (splitsCorrect.length > 0) {
			const splitIds = splitsCorrect.map((s) => s.id);
			await tenantDb
				.delete(commissionSplits)
				.where(inArray(commissionSplits.id, splitIds));
		}
	}, 30000);
});

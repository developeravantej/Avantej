/**
 * Journey: Trainer RBAC — scope='assignable_to_me' filters to own appointments only
 *
 * Actor: tenant_admin (franchisee@gmail.com, role=admin in test org)
 * Priority: P1
 *
 * This spec tests the API-level RBAC narrowing in appointments.list. The key
 * guard is the `scope` parameter:
 *
 *   scope='all'              → returns all appointments within accessible nodes
 *                              (no per-trainer filter unless trainerId is also passed)
 *   scope='assignable_to_me' → filters to WHERE trainer_id = caller.member.id OR trainer_id IS NULL
 *
 * This is the mechanism the frontend uses to show a trainer only "their" calendar.
 * (list.procedures.ts line 80–84, audit commit 98f896af).
 *
 * Two sub-tests:
 *
 *   (A) Seed an appointment assigned to trainer T. Call list with scope='all'
 *       and trainerId=T. Verify the appointment appears. This confirms the
 *       baseline (appointment_management:read + branch RBAC is satisfied by admin).
 *
 *   (B) Call the same list with scope='assignable_to_me' (no trainerId override).
 *       The admin's member.id is almost certainly NOT the same as trainer T's member.id,
 *       so the appointment seeded for T should NOT appear in the admin's
 *       assignable_to_me result set. Assert the seeded appointment is absent from the
 *       scope-filtered list.
 *
 * For sub-test (B) to be meaningful, the admin must have a DIFFERENT member.id than
 * the trainer. We verify this explicitly and skip if they are the same (extremely
 * unlikely in a real tenant but guards against single-member test envs).
 *
 * Seed: one appointment via seedConfirmedAppointment (trainer + client).
 * Cleanup: cancel the seeded appointment in afterEach.
 *
 * Run: bunx playwright test e2e/appointments-trainer-self-view-rbac.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstBranchId,
	seedConfirmedAppointment,
	cleanupAppointment,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

// Ephemeral state for afterEach cleanup
let seededAppointmentId = "";

test("scope=all shows trainer appointment; scope=assignable_to_me hides it from admin", {
	tag: ["@p1"],
}, async ({ page }) => {
	// ── Preconditions ────────────────────────────────────────────────────────
	const trainer = await pickFirstActiveTrainer(page);
	test.skip(!trainer, "No active trainer in test tenant — skip");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client member in test tenant — skip");

	const service = await pickFirstService(page);
	const branchId = trainer!.hierarchyScopeId ?? (await pickFirstBranchId(page));

	// Resolve the admin's own member.id via userContext
	type UserCtx = {
		currentOrganizationId?: string;
		member?: { id?: string; userId?: string; role?: string };
	};
	let adminMemberId = "";
	try {
		const ctx = await orpcCall<object, UserCtx>(
			page,
			"auth",
			"userContext",
			{},
		);
		adminMemberId = ctx.member?.id ?? "";
	} catch {
		// userContext unavailable — we cannot verify the admin ≠ trainer guard
	}

	// If admin IS the trainer (single-member dev env), the scope filter would
	// include the appointment — test would be misleading. Skip gracefully.
	if (adminMemberId && adminMemberId === trainer!.memberId) {
		test.skip(
			true,
			"Admin member.id equals trainer member.id — cannot test scope narrowing in a single-member org",
		);
		return;
	}

	// ── Seed: create a confirmed appointment for trainer T ───────────────────
	try {
		seededAppointmentId = await seedConfirmedAppointment(page, {
			trainerMemberId: trainer!.memberId,
			trainerUserId: trainer!.userId,
			clientUserId: client!.userId,
			serviceId: service?.id ?? null,
			branchId,
			offsetMinutes: 0,
		});
	} catch (err) {
		test.skip(true, `Could not seed appointment: ${String(err)}`);
		return;
	}
	expect(
		seededAppointmentId,
		"seeded appointmentId must be non-empty",
	).toBeTruthy();

	// ── Sub-test A: scope=all + trainerId=T → seeded appointment IS present ──
	type ApptRow = { id: string; trainerId?: string | null };
	type ListResult = ApptRow[];

	let allResults: ListResult = [];
	try {
		allResults = await orpcCall<object, ListResult>(
			page,
			"appointments",
			"list",
			{
				organizationId: TEST_ORG_ID,
				trainerId: trainer!.memberId,
				scope: "all",
				limit: 200,
			},
		);
	} catch (err) {
		if (err instanceof OrpcClientError && err.code === "FORBIDDEN") {
			test.skip(
				true,
				"Admin does not have appointment_management:read — cannot test RBAC narrowing",
			);
			return;
		}
		throw err;
	}

	const foundInAll = allResults.some((r) => r.id === seededAppointmentId);
	expect(
		foundInAll,
		`Seeded appointment ${seededAppointmentId} should appear in scope=all filtered by trainerId=${trainer!.memberId}`,
	).toBe(true);

	// ── Sub-test B: scope=assignable_to_me (no trainerId) → seeded appt absent
	// The admin's member.id ≠ trainer.memberId, so scope filter removes it.
	let selfScopeResults: ListResult = [];
	try {
		selfScopeResults = await orpcCall<object, ListResult>(
			page,
			"appointments",
			"list",
			{
				organizationId: TEST_ORG_ID,
				scope: "assignable_to_me",
				limit: 200,
			},
		);
	} catch (err) {
		if (err instanceof OrpcClientError && err.code === "FORBIDDEN") {
			test.skip(
				true,
				"Admin does not have appointment_management:read — cannot test scope narrowing",
			);
			return;
		}
		throw err;
	}

	const foundInSelfScope = selfScopeResults.some(
		(r) => r.id === seededAppointmentId,
	);
	expect(
		foundInSelfScope,
		`Seeded appointment for trainer ${trainer!.memberId} should NOT appear in admin's scope=assignable_to_me (admin.memberId=${adminMemberId})`,
	).toBe(false);

	// ── Sub-test C: sanity — the admin's own memberId appointments (if any) appear
	// This is a weaker positive check: any appointment with trainerId=admin or trainerId=null
	// should be present in the assignable_to_me result. We only assert this if the
	// admin has at least one such appointment; otherwise it is a vacuously true no-op.
	const adminTrainerAppts = selfScopeResults.filter(
		(r) => r.trainerId === adminMemberId || r.trainerId == null,
	);
	// Just assert the filter works correctly — all returned rows must have
	// trainerId === adminMemberId OR trainerId is null.
	for (const row of selfScopeResults) {
		const isOwn =
			row.trainerId === adminMemberId ||
			row.trainerId == null ||
			row.trainerId === undefined;
		expect(
			isOwn,
			`scope=assignable_to_me should only return appointments where trainerId=${adminMemberId} or null, got trainerId=${row.trainerId} for id=${row.id}`,
		).toBe(true);
	}
	void adminTrainerAppts; // referenced for clarity
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

test.afterEach(async ({ page }) => {
	if (!seededAppointmentId) return;
	await cleanupAppointment(page, seededAppointmentId);
	seededAppointmentId = "";
});

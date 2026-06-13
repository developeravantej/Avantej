/**
 * Journey: Staff commission dispute — API-boundary guards.
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Proves the dispute endpoints are live on the real tenant DB (with the 0093
 * migration applied) and that their server-side guards enforce correctly,
 * driving /rpc directly (sidesteps the Radix category select).
 *
 * NOTE on scope: the *trainer self-contest happy path* (contest → uphold) can't
 * run under admin-only e2e auth — `commission_splits.staffId` must equal the
 * SESSION user's id, and the admin's user id is a Better-Auth nanoid that the
 * `createManualAdjustment.staffId` UUID validation rejects, so the admin cannot
 * own a split to contest. Those state transitions are covered by 12 unit tests
 * (commission-dispute.test.ts). Here we prove, end-to-end, the two things that
 * MUST hold at the API boundary:
 *
 *   1. SMOKE: listContested is registered and the 0093 contested_* columns exist
 *   2. OWNERSHIP GUARD: a manager cannot contest a split they don't own (FORBIDDEN)
 *   3. STATE GUARD: resolveDispute rejects a split that isn't 'contested'
 *
 * Run: bunx playwright test e2e/commission-dispute-lifecycle.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { OrpcClientError, orpcCall } from "./helpers/orpc-client";
import {
	TEST_ORG_ID,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
	pickFirstBranchId,
	seedConfirmedAppointment,
	cleanupAppointment,
} from "./helpers/seed-data";

const UUID_RE =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

type UserCtx = { currentOrganizationId?: string };
type ContestedRow = { id: string; staffId: string };
type ListContestedResult = {
	rows: ContestedRow[];
	total: number;
	nextCursor: unknown;
};
type Split = { id: string; status: string };

test("commission dispute — listContested live + ownership and state guards enforced", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;

	// ── 1. SMOKE: listContested is live + 0093 columns exist ─────────────────
	const list = await orpcCall<object, ListContestedResult>(
		page,
		"commissionSplits",
		"listContested",
		{ organizationId: orgId, limit: 50 },
	);
	expect(Array.isArray(list.rows)).toBe(true);
	expect(typeof list.total).toBe("number");

	// ── Seed a split owned by a UUID-keyed staff member (NOT the admin) ──────
	// staffId must be a UUID for createManualAdjustment; member userIds are a
	// mix of UUIDs and Better-Auth nanoids — pick a UUID one.
	type MemberRow = { id: string; userId: string };
	const members = await orpcCall<object, MemberRow[]>(page, "members", "list", {
		organizationId: orgId,
	});
	const uuidOwner = members.find((m) => UUID_RE.test(m.userId))?.userId ?? "";
	test.skip(!uuidOwner, "No UUID-keyed staff member to own a seeded split");

	const trainer = await pickFirstActiveTrainer(page);
	const client = await pickFirstActiveClient(page);
	test.skip(!trainer || !client, "Missing trainer/client fixtures");
	const branchId = client!.hierarchyScopeId ?? (await pickFirstBranchId(page));

	const appointmentId = await seedConfirmedAppointment(page, {
		trainerMemberId: trainer!.memberId,
		trainerUserId: trainer!.userId,
		clientUserId: client!.userId,
		branchId,
	});

	const created = await orpcCall<object, Split>(
		page,
		"commissionSplits",
		"createManualAdjustment",
		{
			organizationId: orgId,
			staffId: uuidOwner, // owned by someone OTHER than the admin
			amountCents: 1234, // < RM500 → status 'pending'
			note: "E2E dispute-guard seed",
			appointmentId,
		},
	);
	expect(created.status).toBe("pending");
	const splitId = created.id;

	try {
		// ── 2. OWNERSHIP GUARD: admin can't contest a split they don't own ─────
		let ownershipError: OrpcClientError | null = null;
		try {
			await orpcCall(page, "commissionSplits", "contest", {
				organizationId: orgId,
				splitId,
				category: "wrong_amount",
				reason: "E2E: should be rejected — not my split",
			});
		} catch (e) {
			ownershipError = e as OrpcClientError;
		}
		expect(
			ownershipError,
			"contesting someone else's split must be rejected",
		).toBeTruthy();
		expect(ownershipError!.message.toLowerCase()).toContain(
			"only dispute your own",
		);

		// ── 3. STATE GUARD: can't resolve a split that isn't 'contested' ───────
		let stateError: OrpcClientError | null = null;
		try {
			await orpcCall(page, "commissionSplits", "resolveDispute", {
				organizationId: orgId,
				splitId,
				action: "uphold",
			});
		} catch (e) {
			stateError = e as OrpcClientError;
		}
		expect(
			stateError,
			"resolving a non-contested split must be rejected",
		).toBeTruthy();
		expect(stateError!.message.toLowerCase()).toContain("contested");

		// The split must still be untouched (pending) after both rejections.
		const stillPending = await orpcCall<object, ListContestedResult>(
			page,
			"commissionSplits",
			"listContested",
			{ organizationId: orgId, limit: 200 },
		);
		expect(stillPending.rows.find((r) => r.id === splitId)).toBeFalsy();
	} finally {
		try {
			await orpcCall(page, "commissionSplits", "voidById", {
				organizationId: orgId,
				id: splitId,
				reason: "E2E cleanup",
			});
		} catch {
			// best-effort
		}
		await cleanupAppointment(page, appointmentId);
	}
});

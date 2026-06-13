/**
 * Journey: Staff commission dispute lifecycle + API-boundary guards.
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Drives /rpc directly (sidesteps the Radix category select), against the real
 * test tenant DB with the 0093 migration applied. Two tests:
 *
 *  A) HAPPY PATH — the admin owns a split (staffId === their own Better-Auth
 *     user id, a nanoid) → contest → listContested → resolveDispute 'uphold'
 *     restores the exact prior status. This exercises the full lifecycle and
 *     also regression-guards the createManualAdjustment staffId fix (it used to
 *     reject non-UUID staff ids).
 *
 *  B) GUARDS — ownership (can't contest a split you don't own) and state
 *     (can't resolve a split that isn't 'contested').
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

type UserCtx = { currentOrganizationId?: string; user?: { id?: string } };
type ContestedRow = {
	id: string;
	staffId: string;
	contestedReason: string | null;
};
type ListContestedResult = {
	rows: ContestedRow[];
	total: number;
	nextCursor: unknown;
};
type Split = { id: string; status: string };
type MyComms = { splits: Array<{ id: string; status: string }> };

async function seedAppointmentTarget(page: import("@playwright/test").Page) {
	const trainer = await pickFirstActiveTrainer(page);
	const client = await pickFirstActiveClient(page);
	if (!trainer || !client) return null;
	const branchId = client.hierarchyScopeId ?? (await pickFirstBranchId(page));
	const appointmentId = await seedConfirmedAppointment(page, {
		trainerMemberId: trainer.memberId,
		trainerUserId: trainer.userId,
		clientUserId: client.userId,
		branchId,
	});
	return appointmentId;
}

test("commission dispute happy path — contest own split → uphold restores prior status", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;
	// staffId === the session user's id (a Better-Auth nanoid, NOT a UUID) so the
	// admin owns the split and may contest it. Relies on the staffId .uuid() fix.
	const myUserId = ctx.user?.id ?? "";
	test.skip(!myUserId, "no session user id");

	const appointmentId = await seedAppointmentTarget(page);
	test.skip(!appointmentId, "Missing trainer/client fixtures");

	const created = await orpcCall<object, Split>(
		page,
		"commissionSplits",
		"createManualAdjustment",
		{
			organizationId: orgId,
			staffId: myUserId,
			amountCents: 1234, // < RM500 → status 'pending'
			note: "E2E happy-path seed",
			appointmentId: appointmentId!,
		},
	);
	expect(created.status).toBe("pending");
	const splitId = created.id;

	try {
		await orpcCall(page, "commissionSplits", "contest", {
			organizationId: orgId,
			splitId,
			category: "wrong_amount",
			reason: "E2E happy-path dispute",
		});

		const contested = await orpcCall<object, ListContestedResult>(
			page,
			"commissionSplits",
			"listContested",
			{ organizationId: orgId, limit: 200 },
		);
		const found = contested.rows.find((r) => r.id === splitId);
		expect(found, "my contested split should be listed").toBeTruthy();
		expect(found!.contestedReason).toContain("E2E");

		const mine = await orpcCall<object, MyComms>(
			page,
			"commissionSplits",
			"getMyCommissions",
			{ organizationId: orgId },
		);
		expect(mine.splits.find((s) => s.id === splitId)?.status).toBe("contested");

		const resolved = await orpcCall<
			object,
			{ resolved: { status: string }; adjustment: unknown }
		>(page, "commissionSplits", "resolveDispute", {
			organizationId: orgId,
			splitId,
			action: "uphold",
			note: "E2E: original stands",
		});
		expect(resolved.resolved.status).toBe("pending");
		expect(resolved.adjustment).toBeNull();

		const mine2 = await orpcCall<object, MyComms>(
			page,
			"commissionSplits",
			"getMyCommissions",
			{ organizationId: orgId },
		);
		expect(mine2.splits.find((s) => s.id === splitId)?.status).toBe("pending");
		const after = await orpcCall<object, ListContestedResult>(
			page,
			"commissionSplits",
			"listContested",
			{ organizationId: orgId, limit: 200 },
		);
		expect(after.rows.find((r) => r.id === splitId)).toBeFalsy();
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
		await cleanupAppointment(page, appointmentId!);
	}
});

test("commission dispute — listContested live + ownership and state guards enforced", {
	tag: ["@p1"],
}, async ({ page }) => {
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	const orgId = ctx.currentOrganizationId ?? TEST_ORG_ID;

	// SMOKE: listContested is live + 0093 columns exist.
	const list = await orpcCall<object, ListContestedResult>(
		page,
		"commissionSplits",
		"listContested",
		{ organizationId: orgId, limit: 50 },
	);
	expect(Array.isArray(list.rows)).toBe(true);
	expect(typeof list.total).toBe("number");

	// Seed a split owned by a UUID-keyed member OTHER than the admin.
	type MemberRow = { id: string; userId: string };
	const members = await orpcCall<object, MemberRow[]>(page, "members", "list", {
		organizationId: orgId,
	});
	const otherOwner =
		members.find((m) => UUID_RE.test(m.userId))?.userId ??
		members.find((m) => m.userId !== ctx.user?.id)?.userId ??
		"";
	test.skip(!otherOwner, "No other staff member to own a seeded split");

	const appointmentId = await seedAppointmentTarget(page);
	test.skip(!appointmentId, "Missing trainer/client fixtures");

	const created = await orpcCall<object, Split>(
		page,
		"commissionSplits",
		"createManualAdjustment",
		{
			organizationId: orgId,
			staffId: otherOwner,
			amountCents: 1234,
			note: "E2E dispute-guard seed",
			appointmentId: appointmentId!,
		},
	);
	expect(created.status).toBe("pending");
	const splitId = created.id;

	try {
		// OWNERSHIP GUARD: admin can't contest a split they don't own.
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

		// STATE GUARD: can't resolve a split that isn't 'contested'.
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
		await cleanupAppointment(page, appointmentId!);
	}
});

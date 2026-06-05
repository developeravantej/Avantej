import { test, expect } from "@playwright/test";
import {
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
	expectRejected,
} from "../_safe-mutation";

// Deep, API-driven + API-verified, self-cleaning check-in (attendance) tests.
//
// Two business-rule invariants from check-ins router + service:
//   1. A member-type check-in WITHOUT a clientId fails the zod superRefine -> 400.
//   2. A second drop-in for the SAME client within 30 minutes -> 409 ALREADY_CHECKED_IN.
//
// NOTE on rule 2: the 30-minute anti-duplicate window only applies to MEMBER
// drop-ins. Walk-in drop-ins synthesize a fresh random clientId per check-in
// (check-ins.service.ts), so two walk-in drop-ins never collide. The test
// therefore uses the caller's own members.userId — a real member — which the
// service validates exists before recording. Each created check-in is removed
// via deleteCheckIn on teardown.
test.describe("attendance/check-ins", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Check-in rule — member check-in without clientId is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// clientType 'member' with no clientId fails the input superRefine before
		// any handler logic runs.
		await expectRejected(
			page.request,
			"checkIns/recordCheckIn",
			{
				organizationId,
				clientType: "member",
				branchId,
				source: "drop_in",
			},
			[400],
		);
	});

	// SKIP: a member check-in requires clientId to be a UUID (customer profile id),
	// but members.userId is a Better-Auth nanoid (non-uuid), so we can't supply a
	// valid member clientId without seeding a real customer profile. Deferred to a
	// seeded loop. (The "member without clientId → 400" rule above still runs.)
	test.skip("Check-in rule — duplicate member drop-in within 30 min is rejected (409)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// Resolve the caller's own member userId — a real member the service can
		// validate. clientId on a member check-in is members.userId.
		const selfRows = await rpc(page.request, "members/list", {
			organizationId,
			scope: "self",
		});
		const clientId = Array.isArray(selfRows) ? selfRows[0]?.userId : undefined;
		expect(
			clientId,
			`members/list self: ${JSON.stringify(selfRows)}`,
		).toBeTruthy();

		// First drop-in succeeds and returns the inserted check-in row.
		const first = await rpc(page.request, "checkIns/recordCheckIn", {
			organizationId,
			clientType: "member",
			clientId,
			branchId,
			source: "drop_in",
		});
		const firstId = first?.id ?? first?.checkIn?.id;
		expect(firstId, `first check-in: ${JSON.stringify(first)}`).toBeTruthy();
		cleanup.add(`check-in ${firstId}`, async () => {
			await rpcRaw(page.request, "checkIns/deleteCheckIn", {
				organizationId,
				id: firstId,
			});
		});

		// A second drop-in for the same member within 30 min -> 409 ALREADY_CHECKED_IN.
		// (No second row is created, so no extra teardown is registered. If the
		// server unexpectedly created one, the deleteCheckIn of the first id leaves
		// it — but the assertion below fails first, surfacing the regression.)
		await expectRejected(
			page.request,
			"checkIns/recordCheckIn",
			{
				organizationId,
				clientType: "member",
				clientId,
				branchId,
				source: "drop_in",
			},
			[409],
		);
	});
});

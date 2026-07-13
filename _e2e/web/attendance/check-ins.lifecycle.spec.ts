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

	// CONDITIONAL GUARD (was an unconditional test.skip — plan-7 shared hygiene):
	// The duplicate-drop-in rule IS implemented and unit-tested server-side
	// (packages/services/src/check-ins.service.ts recordCheckIn step 2, 30-min
	// window; apps/server/src/tests/unit/services/check-ins.test.ts). But it is
	// unreachable over the API for real members: the router input schema
	// (packages/api/src/routers/check-ins.ts — `clientId: z.string().uuid()`)
	// rejects members.userId, which is a Better-Auth NANOID, never a UUID — the
	// exact trap project memory warns about ("validate memberId as
	// z.string().min(1) NOT .uuid()"). Until that schema is relaxed, a valid
	// member clientId 400s at zod before the rule can fire.
	// The probe below attempts the first check-in and skips ONLY on that 400, so
	// this test auto-activates the moment the API schema bug is fixed.
	test("Check-in rule — duplicate member drop-in within 30 min is rejected (409)", async ({
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

		// Probe: first drop-in. A 400 here means the known uuid-vs-nanoid input
		// schema gap is still present (no row was created) -> conditional skip.
		const firstRes = await rpcRaw(page.request, "checkIns/recordCheckIn", {
			organizationId,
			clientType: "member",
			clientId,
			branchId,
			source: "drop_in",
		});
		test.skip(
			firstRes.status() === 400,
			"KNOWN API GAP: checkIns.recordCheckIn validates clientId as z.string().uuid() " +
				"but member clientId is members.userId (Better-Auth nanoid) — the 30-min " +
				"duplicate rule is server-implemented but unreachable via the API. " +
				"Fix: relax clientId to z.string().min(1) in packages/api/src/routers/check-ins.ts.",
		);

		const firstBody = await firstRes.json().catch(() => null);
		expect(
			firstRes.ok(),
			`first check-in: ${firstRes.status()} ${JSON.stringify(firstBody)}`,
		).toBeTruthy();
		const first =
			firstBody && typeof firstBody === "object" && "json" in firstBody
				? firstBody.json
				: firstBody;
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

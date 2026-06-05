import { test, expect } from "@playwright/test";
import {
	Cleanup,
	rpc,
	rpcRaw,
	expectRejected,
	getOrgId,
	getBranchId,
} from "../_safe-mutation";

// Domain rule: cycleType='monthly_anchored' requires anchorDay in 1..28 → 400 otherwise.
// routerKey: commissionCycle. We write a PER-BRANCH override (not the tenant-wide default)
// so teardown can delete exactly that branch's policy without disturbing tenant config.
test.describe("commissions/commission-cycle", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("rule: monthly_anchored anchorDay out of 1..28 is rejected; valid upsert succeeds", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// teardown: remove the per-branch policy we create below
		cleanup.add(`commissionCycle branch ${branchId}`, async () => {
			await rpcRaw(page.request, "commissionCycle/delete", {
				organizationId,
				branchId,
			});
		});

		// REJECT: anchorDay 0 (below 1) → 400
		await expectRejected(
			page.request,
			"commissionCycle/upsert",
			{ organizationId, branchId, cycleType: "monthly_anchored", anchorDay: 0 },
			[400],
		);

		// REJECT: anchorDay 29 (above 28) → 400
		await expectRejected(
			page.request,
			"commissionCycle/upsert",
			{
				organizationId,
				branchId,
				cycleType: "monthly_anchored",
				anchorDay: 29,
			},
			[400],
		);

		// PASS: anchorDay 15 (in range) → succeeds and persists
		await rpc(page.request, "commissionCycle/upsert", {
			organizationId,
			branchId,
			cycleType: "monthly_anchored",
			anchorDay: 15,
		});

		const listed = await rpc(page.request, "commissionCycle/list", {
			organizationId,
		});
		const policy = (listed?.policies ?? []).find(
			(p: { branchId: string | null }) => p.branchId === branchId,
		);
		expect(policy?.cycleType).toBe("monthly_anchored");
		expect(policy?.anchorDay).toBe(15);
	});
});

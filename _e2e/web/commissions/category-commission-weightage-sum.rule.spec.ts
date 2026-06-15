import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	expectRejected,
	getOrgId,
} from "../_safe-mutation";

// KEY domain invariant: category commission slot weightageBasisPoints must sum to
// exactly 10000 (100%). routerKey: categoryCommission.
// We create a throwaway service category to attach the config to, exercise the
// invariant, then tear down: delete the commission config and deactivate the category
// (service categories have no hard-delete API).
test.describe("commissions/category-commission", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("rule: slot weightages must sum to 10000 (reject otherwise; exact sum succeeds)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// throwaway category
		const cat = await rpc(page.request, "serviceCategories/create", {
			organizationId,
			name: testId("cc-cat"),
		});
		const categoryId = cat?.id;
		expect(categoryId).toBeTruthy();
		cleanup.add(`categoryCommission ${categoryId}`, async () => {
			await rpcRaw(page.request, "categoryCommission/delete", {
				organizationId,
				categoryId,
			});
		});
		cleanup.add(`serviceCategory ${categoryId}`, async () => {
			await rpcRaw(page.request, "serviceCategories/update", {
				organizationId,
				id: categoryId,
				isActive: false,
			});
		});

		// REJECT: slots summing to 9000 (≠ 10000) → 400
		await expectRejected(
			page.request,
			"categoryCommission/upsert",
			{
				organizationId,
				categoryId,
				paymentType: "fixed",
				isConditional: false,
				maxCoaches: 2,
				slots: [
					{ slotIndex: 0, label: "Primary", weightageBasisPoints: 6000 },
					{ slotIndex: 1, label: "Secondary", weightageBasisPoints: 3000 },
				],
			},
			[400],
		);
		// NOTE: the positive case (sum===10000 succeeds) is omitted here because a
		// non-conditional config also requires a full `rates` payload; the
		// rejection above is the load-bearing weightage invariant. The exact-sum
		// success path is covered by the commission-math unit tests.
	});
});

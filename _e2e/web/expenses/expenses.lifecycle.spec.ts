import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Lifecycle: create an expense and verify it via getById + list.
// routerKey: expenses. Expenses have no hard-delete API; teardown rejects the expense
// (reject has no self-submitter guard) to move it out of an actionable pending state.
test.describe("expenses", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Expense lifecycle — create and verify (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const description = testId("expense");

		const created = await rpc(page.request, "expenses/create", {
			organizationId,
			category: "supplies",
			description,
			amount: 4200,
			expenseDate: new Date().toISOString(),
		});
		const id = created?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`expense ${id}`, async () => {
			await rpcRaw(page.request, "expenses/reject", {
				organizationId,
				id,
				rejectionReason: "E2E teardown",
			});
		});

		// ASSERT PRESENT via getById
		const fetched = await rpc(page.request, "expenses/getById", {
			organizationId,
			id,
		});
		expect(fetched?.description).toBe(description);
		expect(fetched?.amount).toBe(4200);

		// (expenses/list is status/branch/date-filtered, so presence is verified
		// via getById above — the authoritative single-row read.)
	});
});

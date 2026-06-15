import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	expectRejected,
	getOrgId,
} from "../_safe-mutation";

// Domain rule (separation of duties): the user who submitted an expense cannot approve
// their own submission → 403 FORBIDDEN. routerKey: expenses.
// The admin storageState is both submitter and approver here, which is exactly the
// case the guard blocks. Teardown rejects the expense (no delete API exists).
test.describe("expenses", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("rule: submitter cannot approve their own expense (403)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const description = testId("expense-sod");

		const created = await rpc(page.request, "expenses/create", {
			organizationId,
			category: "travel",
			description,
			amount: 5000,
			expenseDate: new Date().toISOString(),
		});
		const id = created?.id;
		expect(id).toBeTruthy();
		cleanup.add(`expense ${id}`, async () => {
			await rpcRaw(page.request, "expenses/reject", {
				organizationId,
				id,
				rejectionReason: "E2E teardown",
			});
		});

		// Same user (submitter) approving → 403 FORBIDDEN
		await expectRejected(
			page.request,
			"expenses/approve",
			{ organizationId, id },
			[403],
		);

		// Expense must still be pending (not approved by the self-approval attempt)
		const after = await rpc(page.request, "expenses/getById", {
			organizationId,
			id,
		});
		expect(after?.status).toBe("pending");
	});
});

import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Deep CRUD lifecycle for invoices — API-driven + API-verified, self-cleaning.
// Unlocks the previously-deferred payment/invoice create+update row: a standalone
// `invoices.create`/`invoices.update` DOES exist (base-router.ts → invoices:
// invoicesRouter), contrary to the old defer note ("no standalone procedure").
// invoices has no hard delete, so teardown is status -> "cancelled" (mirrors the
// suppliers deactivate pattern). The row stays test-prefixed + cancelled.
test.describe("payment / invoices", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("Invoice lifecycle — create(draft) -> update(sent) -> cancel (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const customerName = testId("invoice-cust");
		const date = new Date().toISOString();

		// CREATE (draft)
		const created = await rpc(page.request, "invoices/create", {
			organizationId,
			date,
			customerName,
			createdBy: "E2E-DEEP",
			totalAmount: 12345,
			status: "draft",
		});
		const id = created?.id ?? created?.invoice?.id;
		expect(id, `create returned: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`invoice ${id}`, async () => {
			await rpcRaw(page.request, "invoices/update", {
				organizationId,
				id,
				status: "cancelled",
			});
		});

		// ASSERT PRESENT via getById (create persisted the real values)
		const got = await rpc(page.request, "invoices/getById", {
			organizationId,
			id,
		});
		expect(got?.customerName).toBe(customerName);
		expect(got?.status).toBe("draft");
		expect(got?.totalAmount).toBe(12345);

		// UPDATE (draft -> sent, change total) and re-verify at the API boundary
		await rpc(page.request, "invoices/update", {
			organizationId,
			id,
			status: "sent",
			totalAmount: 20000,
		});
		const edited = await rpc(page.request, "invoices/getById", {
			organizationId,
			id,
		});
		expect(edited?.status).toBe("sent");
		expect(edited?.totalAmount).toBe(20000);

		// CANCEL (terminal state — no hard delete exists) + assert
		await rpc(page.request, "invoices/update", {
			organizationId,
			id,
			status: "cancelled",
		});
		expect(
			(await rpc(page.request, "invoices/getById", { organizationId, id }))
				?.status,
		).toBe("cancelled");
	});
});

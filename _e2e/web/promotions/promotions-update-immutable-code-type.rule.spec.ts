import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Domain rule: promotions/update only mutates name/description/isActive/validFrom/validUntil.
// `code` and `type` are NOT in the update input schema, so attempts to change them are
// ignored (the values are unchanged after the update). routerKey: promotions.
// Self-cleaning: the created promotion is deactivated in afterEach.
test.describe("promotions", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("rule: update cannot change code or type (ignored)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const code = testId("promo-imm");

		const created = await rpc(page.request, "promotions/create", {
			organizationId,
			code,
			name: `${code}-name`,
			type: "percentage",
			value: 10,
			validFrom: new Date().toISOString(),
		});
		const id = created?.id;
		expect(id).toBeTruthy();
		expect(created?.code).toBe(code);
		expect(created?.type).toBe("percentage");
		cleanup.add(`promotion ${id}`, async () => {
			await rpcRaw(page.request, "promotions/deactivate", {
				organizationId,
				id,
			});
		});

		// Attempt to change code + type alongside a legitimate name change.
		const newName = `${code}-renamed`;
		await rpc(page.request, "promotions/update", {
			organizationId,
			id,
			name: newName,
			// these extra fields are not in the update schema and must be ignored:
			code: "E2E-DEEP-HIJACK-CODE",
			type: "fixed_amount",
		} as Record<string, unknown>);

		// Re-read via list and confirm code/type are untouched but name applied.
		const list = await rpc(page.request, "promotions/list", {
			organizationId,
			isActive: true,
		});
		const rows = Array.isArray(list)
			? list
			: (list?.items ?? list?.promotions ?? []);
		const found = (
			rows as Array<{ id: string; code?: string; type?: string; name?: string }>
		).find((p) => p.id === id);
		expect(found, "updated promotion should still be listed").toBeTruthy();
		expect(found?.code).toBe(code);
		expect(found?.type).toBe("percentage");
		expect(found?.name).toBe(newName);
	});
});

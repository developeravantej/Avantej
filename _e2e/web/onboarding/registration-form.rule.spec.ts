import { test, expect } from "@playwright/test";
import { rpc } from "../_safe-mutation";

/**
 * UAT §2 — Client onboarding: registration form. The registration form loads its
 * country + branch options via the public registration router
 * (registration/listCountries → listBranches). Covers "registration form loads"
 * at the API boundary (the full PDF-signing / payment-proof upload flow is
 * deferred — infra).
 */
test.describe("§2 onboarding — registration form data", () => {
	test("registration form loads country + branch options", async ({ page }) => {
		const countries = await rpc(page.request, "registration/listCountries", {});
		const list = Array.isArray(countries)
			? countries
			: (countries?.items ?? countries?.countries ?? []);
		expect(Array.isArray(list), "listCountries returns a list").toBeTruthy();

		if (list.length) {
			const first = list[0];
			const country =
				typeof first === "string"
					? first
					: (first.country ?? first.name ?? first.code);
			const branches = await rpc(page.request, "registration/listBranches", {
				country,
			});
			expect(branches, `listBranches(${country}) should return`).toBeTruthy();
		}
	});
});

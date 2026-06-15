/**
 * Journey: Tenant guard — a write aimed at a non-accessible org is rejected (403)
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P0 — multi-tenant isolation (the project's #1 rule)
 *
 * orpc-tenant.middleware (orpc-tenant.middleware.ts:123-170) runs a suspension /
 * org-resolution check BEFORE any handler. The SAME 403 block that rejects
 * suspended/cancelled tenants also rejects a write whose organizationId doesn't
 * resolve to an org the caller can reach ("Forbidden: organization not accessible").
 * This verifies that guard fires for a POS write, without mutating the live org's
 * payment status (which would risk leaving the tenant suspended for other tests).
 *
 * Run: bunx playwright test e2e/tenant-write-guard.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveClient,
	pickFirstBranchId,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

// A well-formed UUID that is NOT the caller's org (and not a real tenant).
const FOREIGN_ORG_ID = "00000000-0000-4000-8000-0000deadbeef";

test("POS write to a non-accessible organization is rejected (403/FORBIDDEN)", {
	tag: ["@p0"],
}, async ({ page }) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client — skip");
	const branchId = await pickFirstBranchId(page);

	// Sanity: the SAME payload against the caller's real org would be accepted by
	// the tenant guard (it may still fail later for business reasons, but it is
	// NOT blocked at the org-resolution gate). We only assert the foreign-org case.
	let blocked = false;
	let code = "";
	try {
		await orpcCall(page, "pos", "recordSale", {
			organizationId: FOREIGN_ORG_ID,
			customerType: "member",
			customerId: client!.userId,
			customerName: client!.name,
			branchId,
			items: [
				{
					type: "custom",
					description: "E2E Guard Item",
					quantity: 1,
					unitPriceCents: 1000,
				},
			],
			paymentMethod: "cash",
			amountTenderedCents: 2000,
		});
	} catch (err) {
		if (err instanceof OrpcClientError) {
			blocked = true;
			code = err.code;
		} else {
			throw err;
		}
	}

	expect(
		blocked,
		"Write to a foreign org must be rejected by the tenant guard",
	).toBe(true);
	// The org-resolution / suspension gate returns HTTP 403; orpcCall surfaces it
	// as "403" or "FORBIDDEN" depending on the envelope.
	expect(["403", "FORBIDDEN"]).toContain(code);

	// Guard against a false pass: confirm TEST_ORG_ID is a real, different value.
	expect(FOREIGN_ORG_ID).not.toBe(TEST_ORG_ID);
});

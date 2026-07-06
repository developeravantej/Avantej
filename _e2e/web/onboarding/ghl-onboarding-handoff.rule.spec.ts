import { test, expect } from "@playwright/test";
import { getOrgId, rpc, rpcRaw } from "../_safe-mutation";

/**
 * GHL approval → onboarding hand-off — API-boundary contract (no writes, no
 * emails). Locks in the wiring for the durable approved-row lifecycle so a
 * future change can't silently regress it to a 500. The happy-path
 * send+stamp+registered transition needs a pending-GHL-contact fixture (only a
 * real inbound webhook creates one) and dispatches a real email, so it is
 * deferred — see _e2e/ledger-defer.json.
 */
test.describe("ghl onboarding hand-off — API boundary", () => {
	test("listApprovedContacts returns the lifecycle shape (admin scope)", async ({
		page,
	}) => {
		const rows = await rpc(page.request, "ghl/listApprovedContacts", {
			organizationId: getOrgId(),
		});
		expect(Array.isArray(rows), "returns an array").toBeTruthy();
		// If the dev tenant has approved contacts, each row must carry the
		// lifecycle fields the queue renders (booleans present, not undefined).
		for (const r of rows) {
			expect(typeof r.id).toBe("string");
			expect(typeof r.registered).toBe("boolean");
			expect(typeof r.emailIsPlaceholder).toBe("boolean");
			expect(typeof r.hasLinkedUser).toBe("boolean");
			// onboardingLinkSentAt is null until a link is sent (never undefined).
			expect(r.onboardingLinkSentAt === null || !!r.onboardingLinkSentAt).toBe(
				true,
			);
		}
	});

	test("sendOnboardingLink for an unknown contact is a clean NOT_FOUND (never 500)", async ({
		page,
	}) => {
		const res = await rpcRaw(page.request, "ghl/sendOnboardingLink", {
			organizationId: getOrgId(),
			pendingId: "00000000-0000-0000-0000-000000000000",
		});
		expect(res.status(), "unknown contact -> 404, not 500").toBe(404);
		expect(JSON.stringify(await res.json())).toContain("not found");
	});
});

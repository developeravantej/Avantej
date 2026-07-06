import { test, expect } from "@playwright/test";
import { getOrgId, rpc, rpcRaw } from "../_safe-mutation";
import { waitForWithReload } from "../_helpers";

/**
 * Web member-registration (/register) — invariants for the GHL onboarding form
 * port. Read-only: every API probe uses a bogus/empty invite token so nothing
 * is ever created. The happy-path member creation lives in
 * registration-complete.lifecycle.spec.ts.
 *
 * Rules covered (ledger-parts/registration-web.json):
 *  - token preserved across the unauthenticated /register → /login bounce
 *  - missing-token notice shown/hidden
 *  - step-1 required-field validation blocks progress
 *  - registration.complete: empty token -> 400 validation; bogus token ->
 *    passes validation, rejected FORBIDDEN (403) at invite redemption
 */

function fullPayload(organizationId: string, branchId: string, token: string) {
	return {
		inviteToken: token,
		phone: "+60123456789",
		idPassportNo: "990101-14-5678",
		addressType: "home" as const,
		streetAddress: "12 Jalan Test",
		city: "Kota Kinabalu",
		state: "Sabah",
		country: "Malaysia",
		postalCode: "88000",
		dateOfBirth: "2000-01-15",
		emergencyContactName: "Siti Aminah",
		emergencyContactRelationship: "Spouse",
		emergencyContactPhone: "+60198765432",
		branchId,
		organizationId,
	};
}

/** The tenant's own branch from the public listBranches endpoint. */
async function getOrgPublicBranch(request: Parameters<typeof rpc>[0]) {
	const organizationId = getOrgId();
	const branches = await rpc(request, "registration/listBranches", {
		country: "Malaysia",
	});
	const arr = Array.isArray(branches) ? branches : [];
	return arr.find((b) => b.organizationId === organizationId) ?? null;
}

test.describe("registration web — token preservation (unauthenticated)", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test("unauthenticated /register?token=X bounces to /login carrying registrationToken=X", async ({
		page,
	}) => {
		await page.goto("/register?token=RULE-TOKEN-123", {
			waitUntil: "domcontentloaded",
		});
		await page.waitForURL(/\/login/, { timeout: 30_000 });
		const url = new URL(page.url());
		expect(url.pathname).toBe("/login");
		expect(
			url.searchParams.get("registrationToken"),
			"invite token must survive the auth redirect",
		).toBe("RULE-TOKEN-123");
	});
});

test.describe("registration web — form invariants (admin session)", () => {
	test("missing token shows the invite-required notice; a token hides it", async ({
		page,
	}) => {
		await page.goto("/register", { waitUntil: "domcontentloaded" });
		await waitForWithReload(
			page,
			page.getByTestId("reg-missing-token-notice"),
			{ url: "/register" },
		);
		await expect(page.getByTestId("reg-missing-token-notice")).toContainText(
			"Registration invite required",
		);

		await page.goto("/register?token=some-token", {
			waitUntil: "domcontentloaded",
		});
		await waitForWithReload(page, page.getByTestId("reg-first-name"), {
			url: "/register?token=some-token",
		});
		await expect(page.getByTestId("reg-missing-token-notice")).toHaveCount(0);
	});

	test("step 1 Continue with empty required fields blocks progress with per-field errors", async ({
		page,
	}) => {
		await page.goto("/register?token=some-token", {
			waitUntil: "domcontentloaded",
		});
		await waitForWithReload(page, page.getByTestId("reg-first-name"), {
			url: "/register?token=some-token",
		});

		// name/email prefill from the session; the rest start empty.
		await page.getByTestId("reg-next-button").click();

		for (const message of [
			"Phone is required",
			"ID / Passport No. is required",
			"Street Address is required",
			"City is required",
			"State is required",
			"Postal Code is required",
			"Date of Birth is required",
		]) {
			await expect(page.getByText(message)).toBeVisible();
		}
		// Still on step 1 — progress blocked.
		await expect(page.getByText("Step 1 of 3")).toBeVisible();
	});
});

test.describe("registration.complete — API validation boundary (no writes)", () => {
	test("empty inviteToken is rejected by input validation (400)", async ({
		page,
	}) => {
		const branch = await getOrgPublicBranch(page.request);
		test.skip(!branch, "tenant has no Malaysia branch in listBranches");
		const res = await rpcRaw(
			page.request,
			"registration/complete",
			fullPayload(getOrgId(), branch.id, ""),
		);
		expect(res.status(), "empty token must fail validation").toBe(400);
		const body = await res.json().catch(() => null);
		expect(JSON.stringify(body)).toContain("inviteToken");
	});

	test("well-formed payload with a bogus token passes validation and is rejected FORBIDDEN", async ({
		page,
	}) => {
		const branch = await getOrgPublicBranch(page.request);
		test.skip(!branch, "tenant has no Malaysia branch in listBranches");
		const res = await rpcRaw(
			page.request,
			"registration/complete",
			fullPayload(getOrgId(), branch.id, "bogus-invite-token-e2e-deep"),
		);
		// 403 specifically: the payload passed Zod (not 400/422) and reached the
		// atomic invite-redemption step, which rejected the unknown token.
		expect(res.status(), "bogus token -> FORBIDDEN at redemption").toBe(403);
		const body = await res.json().catch(() => null);
		expect(JSON.stringify(body)).toContain("Invite token");
	});

	test("listCountries + listBranches back the branch step with real data", async ({
		page,
	}) => {
		const countries = await rpc(page.request, "registration/listCountries", {});
		expect(Array.isArray(countries)).toBeTruthy();
		expect(
			countries.length,
			"at least one country has branches",
		).toBeGreaterThan(0);
		const branch = await getOrgPublicBranch(page.request);
		test.skip(!branch, "tenant has no Malaysia branch in listBranches");
		expect(branch.name?.length).toBeGreaterThan(0);
		expect(branch.organizationId).toBe(getOrgId());
	});
});

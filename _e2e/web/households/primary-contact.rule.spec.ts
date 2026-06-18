import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, getOrgId } from "../_safe-mutation";

// Household invariant: removing the profile that is its household's primary
// contact nulls the household's primaryContactProfileId (no dangling ref).
test.describe("households — primary contact integrity", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("removing the primary-contact profile nulls household.primaryContactProfileId", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Find a client to use as the household's primary contact.
		const dir = await rpc(page.request, "customerDirectory/list", {
			organizationId,
			limit: 5,
		});
		const rows = Array.isArray(dir) ? dir : (dir?.rows ?? dir?.items ?? []);
		const customer = rows[0];
		test.skip(!customer?.userId, "no customer in directory");

		// Ensure a customer_profiles row exists (idempotent; omitting fields leaves
		// them unchanged) and capture its id.
		const profile = await rpc(
			page.request,
			"customerProfiles/upsertForCustomer",
			{
				organizationId,
				targetUserId: customer.userId,
			},
		);
		const profileId = profile?.id ?? profile?.profile?.id;
		expect(
			profileId,
			`upsertForCustomer: ${JSON.stringify(profile)}`,
		).toBeTruthy();

		// Create a household with that profile as the primary contact.
		const household = await rpc(page.request, "households/create", {
			organizationId,
			name: testId("household"),
			primaryContactProfileId: profileId,
		});
		const householdId = household?.id ?? household?.household?.id;
		expect(householdId, `create: ${JSON.stringify(household)}`).toBeTruthy();
		// No household delete proc — detach the member on teardown so it's inert.
		cleanup.add(`household member ${profileId}`, async () => {
			await rpc(page.request, "households/removeMember", {
				organizationId,
				customerProfileId: profileId,
			}).catch(() => {});
		});

		// Precondition: the household's primary contact is our profile.
		const before = await rpc(page.request, "households/get", {
			organizationId,
			householdId,
		});
		expect(
			before?.primaryContactProfileId ??
				before?.household?.primaryContactProfileId,
		).toBe(profileId);

		// Remove the primary-contact profile from the household.
		await rpc(page.request, "households/removeMember", {
			organizationId,
			customerProfileId: profileId,
		});

		// The household's primaryContactProfileId must now be null (no dangling ref).
		const after = await rpc(page.request, "households/get", {
			organizationId,
			householdId,
		});
		const primaryAfter =
			after?.primaryContactProfileId ??
			after?.household?.primaryContactProfileId;
		expect(primaryAfter ?? null).toBeNull();
	});
});

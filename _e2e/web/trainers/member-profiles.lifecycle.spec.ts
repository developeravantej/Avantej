import { test, expect } from "@playwright/test";
import { withRestored, rpc, getOrgId } from "../_safe-mutation";

// memberProfiles.upsert is keyed on an EXISTING member (members.id). We must NOT
// create new members here, so we pick an existing one from members/list and do a
// read -> modify -> restore on its profile's `bio` field. The profile row is a
// 1:1 sidecar on the member, so upsert mutates in place and we put it back.
test.describe("trainers / member-profiles", () => {
	test("Member profile upsert — set bio then restore (read-modify-restore)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Find a non-client member to attach a profile to. Prefer trainer, then
		// staff/admin — any existing member works for the upsert contract.
		const all = await rpc(page.request, "members/list", { organizationId });
		const rows = Array.isArray(all) ? all : [];
		const target =
			rows.find((m: any) => m.role === "trainer") ??
			rows.find((m: any) => m.role === "staff") ??
			rows.find((m: any) => m.role === "admin") ??
			rows[0];

		test.skip(!target?.id, "no existing member found to attach a profile to");

		const memberId = target.id as string;
		const marker = `E2E-DEEP bio ${Date.now()}`;

		await withRestored(
			// READ current bio (profile may not exist yet -> undefined)
			async () => {
				const cur = await rpc(page.request, "memberProfiles/get", {
					organizationId,
					memberId,
				});
				return cur?.bio ?? undefined;
			},
			// RESTORE original bio
			async (originalBio) => {
				await rpc(page.request, "memberProfiles/upsert", {
					organizationId,
					memberId,
					bio: originalBio ?? "",
				});
			},
			// BODY: write marker bio, re-query, assert persisted
			async () => {
				const updated = await rpc(page.request, "memberProfiles/upsert", {
					organizationId,
					memberId,
					bio: marker,
				});
				expect(updated?.bio).toBe(marker);

				const got = await rpc(page.request, "memberProfiles/get", {
					organizationId,
					memberId,
				});
				expect(got?.bio).toBe(marker);
			},
		);
	});
});

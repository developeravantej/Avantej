import { test } from "@playwright/test";
import { expectRejected, getOrgId } from "../_safe-mutation";

// RULE: serviceMembers.updateMyBuffer must reject a service the caller is NOT
// assigned to. The handler verifies the (member, service) assignment exists and
// throws NOT_FOUND (404) otherwise. A random serviceId is never assigned to the
// caller, so this provably hits the guard and writes nothing.
test.describe("my-services rule", () => {
	test("updateMyBuffer rejects a service the caller is not assigned to (404)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		await expectRejected(
			page.request,
			"serviceMembers/updateMyBuffer",
			{
				organizationId,
				serviceId: "00000000-0000-4000-8000-0000000000aa",
				bufferTimeMinutes: 30,
			},
			[404],
		);
	});
});

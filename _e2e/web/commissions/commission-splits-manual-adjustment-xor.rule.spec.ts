import { test } from "@playwright/test";
import { expectRejected, getOrgId } from "../_safe-mutation";

// Domain rule (XOR): createManualAdjustment must target EXACTLY ONE of
// appointmentId / salesOrderId / packageInstanceId. More than one → 400.
// routerKey: commissionSplits. The request is rejected at the XOR guard, BEFORE any
// DB write, so nothing is created and no cleanup is required.
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

test.describe("commissions/commission-splits", () => {
	test("rule: manual adjustment targeting more than one entity is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// two targets (salesOrderId + appointmentId) → 400 (XOR violation)
		await expectRejected(
			page.request,
			"commissionSplits/createManualAdjustment",
			{
				organizationId,
				staffId: ZERO_UUID,
				amountCents: 1000,
				note: "E2E xor-violation",
				salesOrderId: ZERO_UUID,
				appointmentId: ZERO_UUID,
			},
			[400],
		);
	});
});

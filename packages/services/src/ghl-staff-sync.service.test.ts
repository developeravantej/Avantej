import { describe, expect, it, mock } from "bun:test";
import { dispatchStaffSync } from "./ghl-staff-sync.service";

describe("dispatchStaffSync", () => {
	it("returns skipped/non-staff-role when member.role is not admin/staff/trainer", async () => {
		const tenantDb = {
			query: {
				members: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "m-1",
							userId: "u-1",
							role: "client",
							status: "active",
							hierarchyScopeId: "n-1",
						}),
					),
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: test stub
		} as any;

		const result = await dispatchStaffSync({
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			controlPanelDb: {} as any,
			tenantDb,
			organizationId: "org-1",
			memberId: "m-1",
			operation: "create",
			env: { GHL_AGENCY_ID: "agency", ENCRYPTION_KEY: "key" },
		});

		expect(result).toEqual({ status: "skipped", reason: "non-staff-role" });
	});
});

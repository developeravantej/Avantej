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

	it("on operation=delete, marks existing ghl_user_links inactive and returns deactivate-skip", async () => {
		const whereMock = mock(() => Promise.resolve(undefined));
		const setMock = mock(() => ({ where: whereMock }));
		const updateMock = mock(() => ({ set: setMock }));

		const tenantDb = {
			query: {
				members: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "m-1",
							userId: "u-1",
							role: "trainer",
							status: "active",
							hierarchyScopeId: "n-1",
						}),
					),
				},
				ghlUserLinks: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "link-1",
							ghlUserId: "ghl-u-1",
							userId: "u-1",
							memberId: "m-1",
							branchNodeId: "n-1",
							ghlLocationId: "loc-1",
							syncStatus: "active",
						}),
					),
				},
			},
			update: updateMock,
			// biome-ignore lint/suspicious/noExplicitAny: test stub
		} as any;

		const result = await dispatchStaffSync({
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			controlPanelDb: {} as any,
			tenantDb,
			organizationId: "org-1",
			memberId: "m-1",
			operation: "delete",
			env: { GHL_AGENCY_ID: "agency", ENCRYPTION_KEY: "key" },
		});

		expect(result).toEqual({ status: "skipped", reason: "deactivate-skip" });
		expect(updateMock).toHaveBeenCalledTimes(1);
	});

	it("returns non-branch-scope when member.hierarchyScopeId is not a branch node", async () => {
		const tenantDb = {
			query: {
				members: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "m-1",
							userId: "u-1",
							role: "trainer",
							status: "active",
							hierarchyScopeId: "n-region",
						}),
					),
				},
				hierarchyNodes: {
					findFirst: mock(() =>
						Promise.resolve({ id: "n-region", type: "region" }),
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

		expect(result).toEqual({ status: "skipped", reason: "non-branch-scope" });
	});

	it("returns branch-not-connected when no active ghl_branch_links row exists", async () => {
		const tenantDb = {
			query: {
				members: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "m-1",
							userId: "u-1",
							role: "staff",
							status: "active",
							hierarchyScopeId: "b-1",
						}),
					),
				},
				hierarchyNodes: {
					findFirst: mock(() =>
						Promise.resolve({ id: "b-1", type: "branch", name: "KL" }),
					),
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: test stub
		} as any;

		const controlPanelDb = {
			query: {
				users: {
					findFirst: mock(() =>
						Promise.resolve({ id: "u-1", email: "a@b.com" }),
					),
				},
				ghlBranchLinks: {
					findFirst: mock(() => Promise.resolve(null)),
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: test stub
		} as any;

		const result = await dispatchStaffSync({
			controlPanelDb,
			tenantDb,
			organizationId: "org-1",
			memberId: "m-1",
			operation: "create",
			env: { GHL_AGENCY_ID: "agency", ENCRYPTION_KEY: "key" },
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "branch-not-connected",
		});
	});
});

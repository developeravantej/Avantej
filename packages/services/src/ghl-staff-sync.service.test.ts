import { describe, expect, it, mock } from "bun:test";
import {
	dispatchProfileSync,
	dispatchStaffSync,
} from "./ghl-staff-sync.service";

// biome-ignore lint/suspicious/noExplicitAny: shared test stubs
const noopSyncStaffToGhl = mock((_args: any) =>
	Promise.resolve({ status: "synced" as const }),
);
const noopDecryptApiKey = (e: string) => e;
const noopPutGhlUser = mock(() => Promise.resolve({ id: "x" }));

const baseInjected = {
	syncStaffToGhl: noopSyncStaffToGhl,
	decryptApiKey: noopDecryptApiKey,
	putGhlUser: noopPutGhlUser,
};

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
			env: { GHL_AGENCY_ID: "agency" },
			...baseInjected,
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
			env: { GHL_AGENCY_ID: "agency" },
			...baseInjected,
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
			env: { GHL_AGENCY_ID: "agency" },
			...baseInjected,
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
			env: { GHL_AGENCY_ID: "agency" },
			...baseInjected,
		});

		expect(result).toEqual({
			status: "skipped",
			reason: "branch-not-connected",
		});
	});

	it("on create, calls syncStaffToGhl with resolved branch + companyId", async () => {
		const syncStaffToGhl = mock(() =>
			Promise.resolve({ status: "synced" as const, ghlUserId: "g-new" }),
		);
		const tenantDb = {
			query: {
				members: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "m-1",
							userId: "u-1",
							role: "trainer",
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
				ghlUserLinks: {
					findFirst: mock(() => Promise.resolve(null)),
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: test stub
		} as any;
		const controlPanelDb = {
			query: {
				users: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "u-1",
							email: "a@b.com",
							firstName: "A",
							lastName: "B",
						}),
					),
				},
				ghlBranchLinks: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "bl-1",
							ghlLocationId: "loc-1",
							ghlApiKey: "enc",
							isActive: true,
							tenantBranchId: "b-1",
						}),
					),
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
			env: { GHL_AGENCY_ID: "agency-1" },
			syncStaffToGhl,
			decryptApiKey: (e) => `dec(${e})`,
			putGhlUser: mock(() => Promise.resolve({ id: "x" })),
		});

		expect(syncStaffToGhl).toHaveBeenCalledTimes(1);
		const call = syncStaffToGhl.mock.calls[0][0] as {
			organizationId: string;
			branchNodeId: string;
			companyId: string;
			operation: string;
			user: { id: string; email: string };
			member: { id: string; role: string };
		};
		expect(call.organizationId).toBe("org-1");
		expect(call.branchNodeId).toBe("b-1");
		expect(call.companyId).toBe("agency-1");
		expect(call.operation).toBe("create");
		expect(call.user.id).toBe("u-1");
		expect(call.user.email).toBe("a@b.com");
		expect(call.member.id).toBe("m-1");
		expect(call.member.role).toBe("trainer");
		expect(result).toEqual({ status: "synced", ghlUserId: "g-new" });
	});

	it("on update with branch reassignment, PUTs to new location and updates link row (without calling syncStaffToGhl)", async () => {
		const putGhlUser = mock(() => Promise.resolve({ id: "g-existing" }));
		const whereMock = mock(() => Promise.resolve(undefined));
		const setMock = mock(() => ({ where: whereMock }));
		const updateMock = mock(() => ({ set: setMock }));
		const syncStaffToGhl = mock(() =>
			Promise.resolve({ status: "synced" as const }),
		);

		const tenantDb = {
			query: {
				members: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "m-1",
							userId: "u-1",
							role: "staff",
							status: "active",
							hierarchyScopeId: "b-NEW",
						}),
					),
				},
				hierarchyNodes: {
					findFirst: mock(() =>
						Promise.resolve({ id: "b-NEW", type: "branch", name: "Sabah" }),
					),
				},
				ghlUserLinks: {
					findFirst: mock(() =>
						Promise.resolve({
							id: "l-1",
							memberId: "m-1",
							branchNodeId: "b-OLD",
							ghlUserId: "g-existing",
							ghlLocationId: "loc-OLD",
						}),
					),
				},
			},
			update: updateMock,
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
					findFirst: mock(() =>
						Promise.resolve({
							id: "bl-NEW",
							ghlLocationId: "loc-NEW",
							ghlApiKey: "enc-NEW",
							isActive: true,
							tenantBranchId: "b-NEW",
						}),
					),
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: test stub
		} as any;

		const result = await dispatchStaffSync({
			controlPanelDb,
			tenantDb,
			organizationId: "org-1",
			memberId: "m-1",
			operation: "update",
			env: { GHL_AGENCY_ID: "agency-1" },
			syncStaffToGhl,
			decryptApiKey: (e) => `dec(${e})`,
			putGhlUser,
		});

		expect(syncStaffToGhl).not.toHaveBeenCalled();
		expect(putGhlUser).toHaveBeenCalledTimes(1);
		const putCall = putGhlUser.mock.calls[0][0] as {
			apiKey: string;
			ghlUserId: string;
			payload: { locationIds: string[] };
		};
		expect(putCall.apiKey).toBe("dec(enc-NEW)");
		expect(putCall.ghlUserId).toBe("g-existing");
		expect(putCall.payload).toEqual({ locationIds: ["loc-NEW"] });
		expect(updateMock).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ status: "synced", ghlUserId: "g-existing" });
	});
});

describe("dispatchProfileSync", () => {
	it("dispatchProfileSync iterates orgs, opens tenant DBs, dispatches per link", async () => {
		const links = [
			{
				id: "l-A",
				memberId: "m-A",
				branchNodeId: "b-A",
				ghlUserId: "g-A",
				ghlLocationId: "loc-A",
				syncStatus: "active",
				userId: "u-1",
			},
			{
				id: "l-B",
				memberId: "m-B",
				branchNodeId: "b-B",
				ghlUserId: "g-B",
				ghlLocationId: "loc-B",
				syncStatus: "active",
				userId: "u-1",
			},
		];
		const dispatch = mock(() => Promise.resolve({ status: "synced" as const }));
		const tenantDbStub = {
			query: {
				ghlUserLinks: { findMany: mock(() => Promise.resolve(links)) },
			},
		};
		const close = mock(() => Promise.resolve());
		const openTenantDb = mock(() =>
			Promise.resolve({ db: tenantDbStub, close }),
		);
		let orgCallCount = 0;
		const findFirst = mock(() => {
			orgCallCount++;
			return Promise.resolve(
				orgCallCount === 1
					? { id: "org-1", connectionString: "enc-1" }
					: { id: "org-2", connectionString: "enc-2" },
			);
		});
		const controlPanelDb = {
			query: {
				organizationMembers: {
					findMany: mock(() =>
						Promise.resolve([
							{ organizationId: "org-1" },
							{ organizationId: "org-2" },
						]),
					),
				},
				organizations: {
					findFirst,
				},
			},
		};

		const results = await dispatchProfileSync({
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			controlPanelDb: controlPanelDb as any,
			userId: "u-1",
			env: { GHL_AGENCY_ID: "agency-1" },
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			openTenantDb: openTenantDb as any,
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			dispatchStaffSync: dispatch as any,
			decryptConnectionString: (e) => `dec(${e})`,
			decryptApiKey: (e) => `dec(${e})`,
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			syncStaffToGhl: mock(() =>
				Promise.resolve({ status: "synced" as const }),
			) as any,
			// biome-ignore lint/suspicious/noExplicitAny: test stub
			putGhlUser: mock(() => Promise.resolve({ id: "x" })) as any,
		});

		expect(openTenantDb).toHaveBeenCalledTimes(2);
		expect(dispatch).toHaveBeenCalledTimes(4);
		expect(results).toHaveLength(4);
		expect(close).toHaveBeenCalledTimes(2);
	});
});

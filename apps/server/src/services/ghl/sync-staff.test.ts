// apps/server/src/services/ghl/sync-staff.test.ts
import { describe, test, expect, mock } from "bun:test";
import { syncStaffToGhl } from "./sync-staff";

const baseUser = {
	id: "u_1",
	email: "sarah@example.com",
	firstName: "Sarah",
	lastName: "Lee",
	name: "Sarah Lee",
};
const baseMember = {
	id: "m_1",
	userId: "u_1",
	role: "trainer",
	status: "active",
	hierarchyScopeId: "branch_1",
};

const baseArgs = {
	controlPanelDb: {} as any,
	tenantDb: {} as any,
	organizationId: "org_1",
	branchNodeId: "branch_1",
	companyId: "agency_xyz",
	user: baseUser,
	member: baseMember,
	operation: "create" as const,
	decryptApiKey: (s: string) => s,
};

describe("syncStaffToGhl", () => {
	test("skipped when branch not connected", async () => {
		const args = {
			...baseArgs,
			controlPanelDb: {
				query: {
					ghlBranchLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
		};
		const result = await syncStaffToGhl(args);
		expect(result.status).toBe("skipped");
	});

	test("creates GHL User and links it on happy path", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ id: "ghluser_new", email: "sarah@example.com" }),
					{ status: 200 },
				),
			),
		);
		const tenantInsert = mock(() => Promise.resolve());
		const args = {
			...baseArgs,
			controlPanelDb: {
				query: {
					ghlBranchLinks: {
						findFirst: mock(() =>
							Promise.resolve({
								organizationId: "org_1",
								tenantBranchId: "branch_1",
								ghlLocationId: "loc_1",
								ghlApiKey: "k",
								isActive: true,
							}),
						),
					},
				},
			} as any,
			tenantDb: {
				insert: () => ({
					values: () => ({ onConflictDoUpdate: tenantInsert }),
				}),
				query: {
					ghlUserLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
		};
		const result = await syncStaffToGhl(args);
		expect(result.status).toBe("synced");
		expect(result.ghlUserId).toBe("ghluser_new");
		expect(tenantInsert).toHaveBeenCalled();
	});

	test("records error on 401 (failure mode B)", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(new Response("", { status: 401 })),
		);
		const tenantInsert = mock(() => Promise.resolve());
		const args = {
			...baseArgs,
			controlPanelDb: {
				query: {
					ghlBranchLinks: {
						findFirst: mock(() =>
							Promise.resolve({
								organizationId: "org_1",
								tenantBranchId: "branch_1",
								ghlLocationId: "loc_1",
								ghlApiKey: "k",
								isActive: true,
							}),
						),
					},
				},
			} as any,
			tenantDb: {
				insert: () => ({
					values: () => ({ onConflictDoUpdate: tenantInsert }),
				}),
				query: {
					ghlUserLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
		};
		const result = await syncStaffToGhl(args);
		expect(result.status).toBe("error");
		expect(result.error).toContain("unauthorized");
		expect(tenantInsert).toHaveBeenCalled();
	});
});

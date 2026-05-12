// apps/server/src/services/ghl/sync-customer.test.ts
import { describe, test, expect, mock } from "bun:test";
import { syncCustomerToGhl } from "./sync-customer";

describe("syncCustomerToGhl", () => {
	const baseArgs = {
		controlPanelDb: {} as any,
		tenantDb: {} as any,
		organizationId: "org_1",
		branchNodeId: "branch_1",
		customerProfile: {
			id: "cp_1",
			userId: "user_1",
			phone: "+60123",
			dateOfBirth: null,
			gender: null,
			address: null,
			emergencyContactName: null,
			emergencyContactPhone: null,
			medicalNotes: null,
			fitnessGoals: null,
			creditPoints: 0,
			notes: null,
			isDeleted: false,
			deletedAt: null,
			deletedSource: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		user: {
			id: "user_1",
			email: "a@b.com",
			firstName: "A",
			lastName: "B",
			name: "A B",
		},
		memberStatus: "active" as const,
		operation: "create" as const,
		decryptApiKey: (s: string) => s,
	};

	test("returns status='skipped' when no ghl_branch_links row exists", async () => {
		const args = {
			...baseArgs,
			controlPanelDb: {
				query: { ghlBranchLinks: { findFirst: mock(() => Promise.resolve(null)) } },
			} as any,
		};
		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("branch-not-connected");
	});

	test("returns status='synced' on happy path create", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ id: "ct_new", email: "a@b.com" }),
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
								id: "lnk_1",
								organizationId: "org_1",
								tenantBranchId: "branch_1",
								ghlLocationId: "loc_1",
								ghlApiKey: "encrypted_key",
								isActive: true,
							}),
						),
					},
				},
			} as any,
			tenantDb: {
				insert: () => ({ values: () => ({ onConflictDoUpdate: tenantInsert }) }),
				query: { ghlContactLinks: { findFirst: mock(() => Promise.resolve(null)) } },
			} as any,
			decryptApiKey: (s: string) => s.replace("encrypted_", ""),
		};
		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("synced");
		expect(result.ghlContactId).toBe("ct_new");
		expect(tenantInsert).toHaveBeenCalled();
	});

	test("returns status='error' and writes last_error when GHL API fails (mode B)", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(new Response("", { status: 429 })),
		);
		const tenantInsert = mock(() => Promise.resolve());
		const args = {
			...baseArgs,
			controlPanelDb: {
				query: {
					ghlBranchLinks: {
						findFirst: mock(() =>
							Promise.resolve({
								id: "lnk_1",
								organizationId: "org_1",
								tenantBranchId: "branch_1",
								ghlLocationId: "loc_1",
								ghlApiKey: "encrypted_key",
								isActive: true,
							}),
						),
					},
				},
			} as any,
			tenantDb: {
				insert: () => ({ values: () => ({ onConflictDoUpdate: tenantInsert }) }),
				query: { ghlContactLinks: { findFirst: mock(() => Promise.resolve(null)) } },
			} as any,
			decryptApiKey: (s: string) => s,
		};
		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("error");
		expect(result.error).toContain("rate_limited");
		// Avantej write does NOT throw — caller never sees an exception.
		// When there's no prior link AND the create fails, we deliberately
		// SKIP writing a placeholder row (writing 'pending' there broke
		// retry: orchestrator would then PUT /contacts/pending → 400).
		// User can re-trigger by saving again.
		expect(tenantInsert).not.toHaveBeenCalled();
	});

	test("treats existing link with syncStatus='deleted' as no-existing on update (post-restore POST flow)", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ contact: { id: "ct_new_after_restore", email: "a@b.com" } }),
					{ status: 200 },
				),
			),
		);
		const tenantInsert = mock(() => Promise.resolve());
		const args = {
			...baseArgs,
			operation: "update" as const,
			controlPanelDb: {
				query: {
					ghlBranchLinks: {
						findFirst: mock(() =>
							Promise.resolve({
								id: "lnk_1",
								organizationId: "org_1",
								tenantBranchId: "branch_1",
								ghlLocationId: "loc_1",
								ghlApiKey: "encrypted_key",
								isActive: true,
							}),
						),
					},
				},
			} as any,
			tenantDb: {
				insert: () => ({ values: () => ({ onConflictDoUpdate: tenantInsert }) }),
				query: {
					ghlContactLinks: {
						findFirst: mock(() =>
							Promise.resolve({
								id: "link_old",
								ghlContactId: "ct_old_deleted",
								customerProfileId: "cp_1",
								branchNodeId: "branch_1",
								ghlLocationId: "loc_1",
								syncStatus: "deleted",  // ← key: link exists but marked deleted
							}),
						),
					},
				},
			} as any,
			decryptApiKey: (s: string) => s,
		};

		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("synced");
		// POST path was taken (new contact id), NOT PUT to old deleted contact
		expect(result.ghlContactId).toBe("ct_new_after_restore");
		expect(tenantInsert).toHaveBeenCalled();
	});

	test("returns status='skipped' when isActive=false on the branch link", async () => {
		const args = {
			...baseArgs,
			controlPanelDb: {
				query: {
					ghlBranchLinks: {
						findFirst: mock(() =>
							Promise.resolve({
								id: "lnk_1",
								organizationId: "org_1",
								tenantBranchId: "branch_1",
								ghlLocationId: "loc_1",
								ghlApiKey: "k",
								isActive: false,
							}),
						),
					},
				},
			} as any,
		};
		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("branch-not-connected");
	});
});

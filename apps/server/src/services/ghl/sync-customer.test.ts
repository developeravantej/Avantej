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
				query: {
					ghlBranchLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
		};
		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("skipped");
		expect(result.reason).toBe("branch-not-connected");
	});

	test("returns status='synced' on happy path create", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ id: "ct_new", email: "a@b.com" }), {
					status: 200,
				}),
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
				insert: () => ({
					values: () => ({ onConflictDoUpdate: tenantInsert }),
				}),
				query: {
					ghlContactLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
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
				insert: () => ({
					values: () => ({ onConflictDoUpdate: tenantInsert }),
				}),
				query: {
					ghlContactLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
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
					JSON.stringify({
						contact: { id: "ct_new_after_restore", email: "a@b.com" },
					}),
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
				insert: () => ({
					values: () => ({ onConflictDoUpdate: tenantInsert }),
				}),
				query: {
					ghlContactLinks: {
						findFirst: mock(() =>
							Promise.resolve({
								id: "link_old",
								ghlContactId: "ct_old_deleted",
								customerProfileId: "cp_1",
								branchNodeId: "branch_1",
								ghlLocationId: "loc_1",
								syncStatus: "deleted", // ← key: link exists but marked deleted
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

	test("org-shared: stamps global custom fields from org.ghlGlobalFieldMap even when caller passes no customFieldIds (B4)", async () => {
		const postBodies: any[] = [];
		(globalThis as any).fetch = mock(
			async (input: string, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				const body = init?.body ? JSON.parse(init.body as string) : null;
				if (method === "POST" && url.includes("/contacts/")) {
					postBodies.push(body);
					return new Response(
						JSON.stringify({ contact: { id: "ct_new", email: "a@b.com" } }),
						{ status: 200 },
					);
				}
				if (method === "PUT" && url.includes("/contacts/")) {
					return new Response(JSON.stringify({ contact: { id: "ct_new" } }), {
						status: 200,
					});
				}
				// Any GHL GET (custom-field discovery) — country field is cached so
				// ensureCountryFieldExists short-circuits and this is unused.
				return new Response(JSON.stringify({ customFields: [] }), {
					status: 200,
				});
			},
		);

		// resolveBranchPath: branch directly under country (no state prefix).
		const branchNode = {
			id: "branch_1",
			type: "branch",
			name: "TTDI",
			countryNodeId: "country_1",
			parentId: "country_1",
		};
		const countryNode = {
			id: "country_1",
			type: "country",
			name: "Malaysia",
			countryNodeId: null,
			parentId: null,
		};
		let hcall = 0;
		const hierarchyFindFirst = mock(() => {
			hcall++;
			if (hcall === 1) return Promise.resolve(branchNode); // by branchNodeId
			if (hcall === 2) return Promise.resolve(countryNode); // by countryNodeId
			return Promise.resolve(countryNode); // parent (country) → no statePrefix
		});

		const tenantInsert = mock(() => Promise.resolve());
		const args = {
			...baseArgs,
			customerProfile: { ...baseArgs.customerProfile, gender: "male" },
			controlPanelDb: {
				query: {
					organizations: {
						findFirst: mock(() =>
							Promise.resolve({
								id: "org_1",
								ghlSyncModel: "org-shared",
								ghlLocationId: "loc_1",
								ghlApiKeyEncrypted: "enc_key",
								ghlCountryFieldMap: {
									country_1: {
										ghlFieldId: "cf_country",
										fieldKey: "malaysia_location",
										createdAt: "x",
									},
								},
								ghlGlobalFieldMap: { gender: "cf_g" },
							}),
						),
					},
					ghlBranchLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
			tenantDb: {
				insert: () => ({
					values: () => ({ onConflictDoUpdate: tenantInsert }),
				}),
				query: {
					hierarchyNodes: { findFirst: hierarchyFindFirst },
					ghlContactLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
			decryptApiKey: (s: string) => s,
			// NOTE: no customFieldIds passed → exercises the live-path gap (B4).
		};

		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("synced");
		const created = postBodies.find(Boolean);
		expect(created.customFields).toContainEqual({ id: "cf_g", value: "male" });
	});

	test("org-shared: stamps designated_country + designated_branch (bare) on the contact", async () => {
		const postBodies: any[] = [];
		(globalThis as any).fetch = mock(
			async (input: string, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? "GET";
				const body = init?.body ? JSON.parse(init.body as string) : null;
				if (method === "POST" && url.includes("/contacts/")) {
					postBodies.push(body);
					return new Response(
						JSON.stringify({ contact: { id: "ct_new", email: "a@b.com" } }),
						{ status: 200 },
					);
				}
				if (method === "PUT" && url.includes("/contacts/")) {
					return new Response(JSON.stringify({ contact: { id: "ct_new" } }), {
						status: 200,
					});
				}
				return new Response(JSON.stringify({ customFields: [] }), {
					status: 200,
				});
			},
		);

		// Branch "SS2" under state "Selangor" under country "Malaysia".
		// designated_branch must be the BARE branch name ("SS2"), NOT the
		// composite dropdown label ("Selangor - SS2").
		const branchNode = {
			id: "branch_1",
			type: "branch",
			name: "SS2",
			countryNodeId: "country_1",
			parentId: "state_1",
		};
		const stateNode = {
			id: "state_1",
			type: "state",
			name: "Selangor",
			countryNodeId: "country_1",
			parentId: "country_1",
		};
		const countryNode = {
			id: "country_1",
			type: "country",
			name: "Malaysia",
			countryNodeId: null,
			parentId: null,
		};
		let hcall = 0;
		const hierarchyFindFirst = mock(() => {
			hcall++;
			if (hcall === 1) return Promise.resolve(branchNode); // by branchNodeId
			if (hcall === 2) return Promise.resolve(countryNode); // by countryNodeId
			return Promise.resolve(stateNode); // parent (state) → statePrefix "Selangor"
		});

		const tenantInsert = mock(() => Promise.resolve());
		const args = {
			...baseArgs,
			controlPanelDb: {
				query: {
					organizations: {
						findFirst: mock(() =>
							Promise.resolve({
								id: "org_1",
								ghlSyncModel: "org-shared",
								ghlLocationId: "loc_1",
								ghlApiKeyEncrypted: "enc_key",
								ghlCountryFieldMap: {
									country_1: {
										ghlFieldId: "cf_country",
										fieldKey: "malaysia_location",
										createdAt: "x",
									},
								},
								ghlGlobalFieldMap: {
									designatedCountry: "cf_dc",
									designatedBranch: "cf_db",
								},
							}),
						),
					},
					ghlBranchLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
			tenantDb: {
				insert: () => ({
					values: () => ({ onConflictDoUpdate: tenantInsert }),
				}),
				query: {
					hierarchyNodes: { findFirst: hierarchyFindFirst },
					ghlContactLinks: { findFirst: mock(() => Promise.resolve(null)) },
				},
			} as any,
			decryptApiKey: (s: string) => s,
		};

		const result = await syncCustomerToGhl(args);
		expect(result.status).toBe("synced");
		const created = postBodies.find(Boolean);
		// designated_country = country node name
		expect(created.customFields).toContainEqual({
			id: "cf_dc",
			value: "Malaysia",
		});
		// designated_branch = BARE branch name, not "Selangor - SS2"
		expect(created.customFields).toContainEqual({ id: "cf_db", value: "SS2" });
		// dropdown still gets the composite label
		expect(created.customFields).toContainEqual({
			id: "cf_country",
			value: "Selangor - SS2",
		});
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

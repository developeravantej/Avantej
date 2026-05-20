/**
 * Unit tests for the onboarding service and branch-invite service functions.
 *
 * Covers:
 * - Token generation uniqueness (generateBase64UrlToken via createBranchInvite)
 * - validateBranchInvite: all error branches (NOT_FOUND, REVOKED, EXPIRED, MAX_USES_REACHED)
 * - getInviteContext: valid invite, each invalid-invite error code
 * - redeemBranchInvite: validation branches only (Better-Auth sign-up/sign-in are mocked
 *   because they call a live HTTP server; the integration tests cover the full flow)
 */

import { describe, test, expect, mock } from "bun:test";
import { randomUUID } from "crypto";

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeFakeInvite(overrides: Record<string, unknown> = {}) {
	return {
		id: randomUUID(),
		token: "tok-abc123",
		email: null,
		role: "client",
		hierarchyScopeId: randomUUID(),
		status: "pending",
		kind: "branch_self_signup",
		isActive: true,
		usesCount: 0,
		maxUses: null,
		expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // +10 years
		createdAt: new Date(),
		invitedBy: randomUUID(),
		...overrides,
	};
}

/** Build a mock tenantDb that has `.query.invitations.findFirst` returning the given invite. */
function makeTenantDbWithInvite(invite: ReturnType<typeof makeFakeInvite> | null) {
	return {
		query: {
			invitations: {
				findFirst: mock(() => Promise.resolve(invite ?? undefined)),
				findMany: mock(() => Promise.resolve([])),
			},
			members: {
				findFirst: mock(() => Promise.resolve(undefined)),
				findMany: mock(() => Promise.resolve([])),
			},
			hierarchyNodes: {
				findFirst: mock(() =>
					Promise.resolve({ id: invite?.hierarchyScopeId, name: "Test Branch", address: null })
				),
				findMany: mock(() => Promise.resolve([])),
			},
		},
		insert: mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([invite])) })) })),
		update: mock(() => ({ set: mock(() => ({ where: mock(() => Promise.resolve([])) })) })),
		transaction: mock((cb: (tx: unknown) => Promise<unknown>) => cb({} as unknown)),
	} as any;
}

/** Build a mock controlPanelDb that returns the given org record. */
function makeCpDbWithOrg(orgName = "My Org") {
	return {
		query: {
			organizations: {
				findFirst: mock(() => Promise.resolve({ id: randomUUID(), name: orgName })),
			},
			user: {
				findFirst: mock(() => Promise.resolve(undefined)),
			},
		},
	} as any;
}

// ─── Token generation ─────────────────────────────────────────────────────────

describe("generateBase64UrlToken (via createBranchInvite insert path)", () => {
	/**
	 * We test token generation indirectly because the function is not exported.
	 * We call createBranchInvite with a mock DB and inspect the token passed to insert.
	 */
	test("produces tokens of at least 43 characters (32 bytes base64url no padding)", async () => {
		const { createBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);

		let capturedToken: string | undefined;

		const mockDb = {
			insert: mock(() => ({
				values: mock((vals: { token: string }) => {
					capturedToken = vals.token;
					return {
						returning: mock(() =>
							Promise.resolve([makeFakeInvite({ token: vals.token })])
						),
					};
				}),
			})),
		} as any;

		await createBranchInvite(mockDb, {
			branchId: randomUUID(),
			invitedBy: randomUUID(),
		});

		expect(capturedToken).toBeDefined();
		expect(capturedToken!.length).toBeGreaterThanOrEqual(43);
		// base64url uses -_ instead of +/
		expect(capturedToken).not.toMatch(/[+/=]/);
	});

	test("generates unique tokens — no collisions over 100 calls", async () => {
		const { createBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);

		const seen = new Set<string>();

		for (let i = 0; i < 100; i++) {
			let capturedToken: string | undefined;

			const mockDb = {
				insert: mock(() => ({
					values: mock((vals: { token: string }) => {
						capturedToken = vals.token;
						return {
							returning: mock(() =>
								Promise.resolve([makeFakeInvite({ token: vals.token })])
							),
						};
					}),
				})),
			} as any;

			await createBranchInvite(mockDb, {
				branchId: randomUUID(),
				invitedBy: randomUUID(),
			});

			expect(capturedToken).toBeDefined();
			expect(seen.has(capturedToken!)).toBe(false);
			seen.add(capturedToken!);
		}

		expect(seen.size).toBe(100);
	});
});

// ─── validateBranchInvite ─────────────────────────────────────────────────────

describe("validateBranchInvite", () => {
	test("returns isValid=false, error=NOT_FOUND when no invite row found", async () => {
		const { validateBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);
		const db = makeTenantDbWithInvite(null);

		const result = await validateBranchInvite(db, "missing-token");

		expect(result.isValid).toBe(false);
		expect(result.error).toBe("NOT_FOUND");
	});

	test("returns isValid=false, error=REVOKED when isActive=false", async () => {
		const { validateBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);
		const invite = makeFakeInvite({ isActive: false });
		const db = makeTenantDbWithInvite(invite);

		const result = await validateBranchInvite(db, invite.token);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe("REVOKED");
		expect(result.invite).toBeTruthy();
	});

	test("returns isValid=false, error=EXPIRED when expiresAt is in the past", async () => {
		const { validateBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);
		const invite = makeFakeInvite({
			expiresAt: new Date(Date.now() - 1000), // 1 second ago
		});
		const db = makeTenantDbWithInvite(invite);

		const result = await validateBranchInvite(db, invite.token);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe("EXPIRED");
	});

	test("returns isValid=false, error=MAX_USES_REACHED when usesCount >= maxUses", async () => {
		const { validateBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);
		const invite = makeFakeInvite({ maxUses: 2, usesCount: 2 });
		const db = makeTenantDbWithInvite(invite);

		const result = await validateBranchInvite(db, invite.token);

		expect(result.isValid).toBe(false);
		expect(result.error).toBe("MAX_USES_REACHED");
	});

	test("returns isValid=true for a valid unlimited invite", async () => {
		const { validateBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);
		const invite = makeFakeInvite({ maxUses: null, usesCount: 999 });
		const db = makeTenantDbWithInvite(invite);

		const result = await validateBranchInvite(db, invite.token);

		expect(result.isValid).toBe(true);
		expect(result.error).toBeUndefined();
	});

	test("returns isValid=true when usesCount is one below maxUses", async () => {
		const { validateBranchInvite } = await import(
			"@avantej-core/services/branch-invite.service"
		);
		const invite = makeFakeInvite({ maxUses: 5, usesCount: 4 });
		const db = makeTenantDbWithInvite(invite);

		const result = await validateBranchInvite(db, invite.token);

		expect(result.isValid).toBe(true);
	});
});

// ─── getInviteContext ─────────────────────────────────────────────────────────

describe("getInviteContext", () => {
	test("returns orgName and branchName for a valid invite", async () => {
		const { getInviteContext } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite();
		const tenantDb = makeTenantDbWithInvite(invite);
		const controlPanelDb = makeCpDbWithOrg("Fitness Co");

		const result = await getInviteContext({
			token: invite.token,
			tenantDb,
			controlPanelDb,
			organizationId: randomUUID(),
		});

		expect(result.orgName).toBe("Fitness Co");
		expect(result.branchName).toBe("Test Branch");
	});

	test("throws NOT_FOUND error (code=NOT_FOUND) when invite is missing", async () => {
		const { getInviteContext } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const tenantDb = makeTenantDbWithInvite(null);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			getInviteContext({
				token: "ghost-token",
				tenantDb,
				controlPanelDb,
				organizationId: randomUUID(),
			})
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	test("throws GONE error (code=GONE) when invite is revoked", async () => {
		const { getInviteContext } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite({ isActive: false });
		const tenantDb = makeTenantDbWithInvite(invite);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			getInviteContext({
				token: invite.token,
				tenantDb,
				controlPanelDb,
				organizationId: randomUUID(),
			})
		).rejects.toMatchObject({ code: "GONE" });
	});

	test("throws GONE error when invite is expired", async () => {
		const { getInviteContext } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite({ expiresAt: new Date(Date.now() - 1000) });
		const tenantDb = makeTenantDbWithInvite(invite);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			getInviteContext({
				token: invite.token,
				tenantDb,
				controlPanelDb,
				organizationId: randomUUID(),
			})
		).rejects.toMatchObject({ code: "GONE" });
	});

	test("throws GONE error when max uses reached", async () => {
		const { getInviteContext } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite({ maxUses: 10, usesCount: 10 });
		const tenantDb = makeTenantDbWithInvite(invite);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			getInviteContext({
				token: invite.token,
				tenantDb,
				controlPanelDb,
				organizationId: randomUUID(),
			})
		).rejects.toMatchObject({ code: "GONE" });
	});

	test("falls back to safe defaults when hierarchy node and org are missing", async () => {
		const { getInviteContext } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite();

		// No branch node, no org
		const tenantDb = {
			...makeTenantDbWithInvite(invite),
			query: {
				invitations: {
					findFirst: mock(() => Promise.resolve(invite)),
					findMany: mock(() => Promise.resolve([])),
				},
				hierarchyNodes: {
					findFirst: mock(() => Promise.resolve(undefined)),
					findMany: mock(() => Promise.resolve([])),
				},
			},
		} as any;

		const controlPanelDb = {
			query: {
				organizations: {
					findFirst: mock(() => Promise.resolve(undefined)),
				},
			},
		} as any;

		const result = await getInviteContext({
			token: invite.token,
			tenantDb,
			controlPanelDb,
			organizationId: randomUUID(),
		});

		// graceful fallback strings from the service
		expect(result.orgName).toBe("the organization");
		expect(result.branchName).toBe("our branch");
	});
});

// ─── redeemBranchInvite — validation branches ────────────────────────────────

describe("redeemBranchInvite — validation branches", () => {
	/**
	 * The Better-Auth HTTP calls (signUpViaBetterAuth / signInViaBetterAuth) are NOT
	 * mocked here — we only test the pre-auth validation gates that throw before
	 * any fetch() is made. Full lifecycle tests are in the integration suite.
	 */

	function makeRedeemParams(
		tenantDb: unknown,
		controlPanelDb: unknown,
		overrides: Record<string, unknown> = {}
	) {
		return {
			token: "some-token",
			organizationId: randomUUID(),
			email: "user@example.com",
			password: "password123",
			fullName: "Test User",
			tenantDb,
			controlPanelDb,
			betterAuthBaseUrl: "http://localhost:3000",
			rawRequest: new Request("http://localhost:3000/test"),
			...overrides,
		};
	}

	test("throws GONE when invite is inactive (revoked)", async () => {
		const { redeemBranchInvite } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite({ isActive: false });
		const tenantDb = makeTenantDbWithInvite(invite);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			redeemBranchInvite(makeRedeemParams(tenantDb, controlPanelDb) as any)
		).rejects.toMatchObject({ code: "GONE" });
	});

	test("throws GONE when invite is expired", async () => {
		const { redeemBranchInvite } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite({ expiresAt: new Date(Date.now() - 5000) });
		const tenantDb = makeTenantDbWithInvite(invite);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			redeemBranchInvite(makeRedeemParams(tenantDb, controlPanelDb) as any)
		).rejects.toMatchObject({ code: "GONE" });
	});

	test("throws GONE when max uses are reached", async () => {
		const { redeemBranchInvite } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const invite = makeFakeInvite({ maxUses: 3, usesCount: 3 });
		const tenantDb = makeTenantDbWithInvite(invite);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			redeemBranchInvite(makeRedeemParams(tenantDb, controlPanelDb) as any)
		).rejects.toMatchObject({ code: "GONE" });
	});

	test("throws NOT_FOUND when invite does not exist", async () => {
		const { redeemBranchInvite } = await import(
			"@avantej-core/services/onboarding.service"
		);

		const tenantDb = makeTenantDbWithInvite(null);
		const controlPanelDb = makeCpDbWithOrg();

		await expect(
			redeemBranchInvite(makeRedeemParams(tenantDb, controlPanelDb) as any)
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

/**
 * customer-profiles router — unit tests for the 4 refactored procedures:
 *   addEmailAndDispatchMagicLink (line 456)
 *   resendMagicLink              (line 572)
 *   createUnclaimed              (line 668)
 *   sendClaimLink                (line 845)
 *
 * Pattern: mock all external dependencies via mock.module BEFORE importing the
 * SUT so Bun's module registry sees the stubs first.
 */

import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";

// ─── Shared mock state ────────────────────────────────────────────────────────

const mockSignInMagicLink = mock(async () => ({}));
const mockAuth = {
	api: { signInMagicLink: mockSignInMagicLink },
};

const mockRequirePermission = mock(async () => undefined);
const mockUpsertCustomerProfile = mock(async () => ({}));
const mockFireCustomerSync = mock(async () => ({}));
const mockMembershipServiceCreateMember = mock(async () => ({}));

// ─── Module mocks (must precede SUT import) ───────────────────────────────────

mock.module("../lib/better-auth", () => ({
	getBetterAuth: (_c?: unknown) => mockAuth,
}));

// NOTE: bun:test's `mock.module` is process-global — when multiple test files
// mock the same module, the FIRST registration wins for the whole run. Because
// `payments.test.ts` also mocks @avantej-core/services and needs additional
// exports (assertBranchAccessible, PermissionDeniedError, etc.) consumed by
// packages/api/src/guards.ts, this factory must be a SUPERSET of every export
// any sprint test file pulls from this module. Don't trim keys unless you've
// confirmed no other test file imports them.
class _SharedPermissionDeniedError extends Error {
	resource: string;
	action: string;
	role: string;
	constructor(resource: string, action: string, role: string) {
		super(`Permission denied: ${resource}:${action} for role ${role}`);
		this.name = "PermissionDeniedError";
		this.resource = resource;
		this.action = action;
		this.role = role;
	}
}

mock.module("@avantej-core/services", () => ({
	requirePermission: mockRequirePermission,
	upsertCustomerProfile: mockUpsertCustomerProfile,
	// createMember is imported by gohighlevel.service.ts which is in the SUT's load chain
	createMember: mock(async () => undefined),
	// getDescendantNodeIds is imported by @avantej-core/api/src/context.ts
	getDescendantNodeIds: mock(async () => []),
	// ─── Required by payments.test.ts (cross-file mock pollution workaround) ──
	createPackageInstance: mock(async () => ({
		id: "pkg_inst_abc",
		serviceId: "svc-1",
		status: "pending",
	})),
	assertBranchAccessible: (branchId: string, accessibleNodeIds: string[]) => {
		if (!accessibleNodeIds.includes(branchId)) {
			throw new _SharedPermissionDeniedError("branch", "access", "staff");
		}
	},
	isBranchAccessDeniedError: (err: unknown) =>
		err instanceof _SharedPermissionDeniedError,
	PermissionDeniedError: _SharedPermissionDeniedError,
}));

mock.module("../services/ghl/customer-sync-trigger", () => ({
	fireCustomerSync: mockFireCustomerSync,
}));

// Mock gohighlevel.service so Bun does not load it and pull in @/lib/db, @avantej-core/db, etc.
// isPlaceholderEmail: real logic is "email ends with @ghl.placeholder" — replicate it in the mock.
mock.module("../services/gohighlevel.service", () => ({
	isPlaceholderEmail: (email: string | null | undefined) =>
		!!email && email.endsWith("@ghl.placeholder"),
	GhlWebhookError: class GhlWebhookError extends Error {
		status: number;
		constructor(message: string, status = 500) {
			super(message);
			this.status = status;
		}
	},
}));

// MembershipService — stub the class so new MembershipService(cpDb).createMember delegates
// to our spy without touching any real DB layer.
mock.module("@avantej-core/db/services/membership.service", () => ({
	MembershipService: class {
		constructor(_cpDb: unknown) {}
		createMember = mockMembershipServiceCreateMember;
	},
}));

// ─── SUT import (after all mocks) ─────────────────────────────────────────────

const { serverCustomerProfilesRouter } = await import("./customer-profiles");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Drive an oRPC procedure handler directly, bypassing the HTTP layer.
 */
function callProcedure(
	procedure: unknown,
	input: unknown,
	context: Record<string, unknown>,
) {
	// biome-ignore lint/suspicious/noExplicitAny: test helper
	return (procedure as any)["~orpc"].handler({ input, context });
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REAL_EMAIL = "customer@example.com";
const PLACEHOLDER_EMAIL = `ghl-abc123@ghl.placeholder`;
const UNCLAIMED_PLACEHOLDER = `unclaimed-xyz@avantej.placeholder`;

const MOCK_MEMBER = {
	id: "member-1",
	role: "admin",
	hierarchyScopeId: "scope-1",
	userId: "user-1",
};

// ─── Per-test mock functions (reset in afterEach) ─────────────────────────────

const profileFindFirst = mock(async () => null as unknown);
const memberFindFirst = mock(async () => null as unknown);
const cpUserFindFirst = mock(async () => null as unknown);

// cpDb.update chain for user table
const cpUserUpdateWhere = mock(async () => undefined);
const cpUserUpdateSet = mock(() => ({ where: cpUserUpdateWhere }));
const cpUserUpdateChain = mock(() => ({ set: cpUserUpdateSet }));

// cpDb.insert chain
const cpUserInsertValues = mock(async () => undefined);
const cpUserInsertChain = mock(() => ({ values: cpUserInsertValues }));

// cpDb.delete chain
const cpUserDeleteWhere = mock(async () => undefined);
const cpUserDeleteChain = mock(() => ({ where: cpUserDeleteWhere }));

// tenantDb.insert chain (customerProfiles)
const tenantInsertReturning = mock(
	async () => [{ id: PROFILE_ID }] as unknown[],
);
const tenantInsertValues = mock(() => ({ returning: tenantInsertReturning }));
const tenantInsertChain = mock(() => ({ values: tenantInsertValues }));

// tenantDb.update chain (customerProfiles)
const tenantUpdateWhere = mock(async () => undefined);
const tenantUpdateSet = mock(() => ({ where: tenantUpdateWhere }));
const tenantUpdateChain = mock(() => ({ set: tenantUpdateSet }));

// tenantDb.delete chain
const tenantDeleteWhere = mock(async () => undefined);
const tenantDeleteChain = mock(() => ({ where: tenantDeleteWhere }));

function makeMockTenantDb() {
	return {
		query: {
			customerProfiles: { findFirst: profileFindFirst },
			members: { findFirst: memberFindFirst },
		},
		insert: tenantInsertChain,
		update: tenantUpdateChain,
		delete: tenantDeleteChain,
	};
}

function makeMockCpDb() {
	return {
		query: {
			user: { findFirst: cpUserFindFirst },
		},
		insert: cpUserInsertChain,
		update: cpUserUpdateChain,
		delete: cpUserDeleteChain,
	};
}

function makeHonoContext(cpDb: unknown) {
	return {
		get: (key: string) => (key === "controlPanelDb" ? cpDb : undefined),
		req: { raw: { headers: new Headers() } },
	};
}

function makeBaseContext(overrides: Record<string, unknown> = {}) {
	const cpDb = makeMockCpDb();
	return {
		organizationId: ORG_ID,
		tenantDb: makeMockTenantDb(),
		member: MOCK_MEMBER,
		honoContext: makeHonoContext(cpDb),
		accessibleNodeIds: ["scope-1"],
		...overrides,
	};
}

afterEach(() => {
	profileFindFirst.mockReset();
	memberFindFirst.mockReset();
	cpUserFindFirst.mockReset();
	cpUserUpdateWhere.mockReset();
	cpUserUpdateSet.mockReset();
	cpUserUpdateChain.mockReset();
	cpUserInsertValues.mockReset();
	cpUserInsertChain.mockReset();
	cpUserDeleteWhere.mockReset();
	cpUserDeleteChain.mockReset();
	tenantInsertReturning.mockReset();
	tenantInsertValues.mockReset();
	tenantInsertChain.mockReset();
	tenantUpdateWhere.mockReset();
	tenantUpdateSet.mockReset();
	tenantUpdateChain.mockReset();
	tenantDeleteWhere.mockReset();
	tenantDeleteChain.mockReset();
	mockSignInMagicLink.mockReset();
	mockRequirePermission.mockReset();
	mockMembershipServiceCreateMember.mockReset();
});

// ─── addEmailAndDispatchMagicLink ─────────────────────────────────────────────

describe("serverCustomerProfilesRouter.addEmailAndDispatchMagicLink", () => {
	const INPUT = {
		organizationId: ORG_ID,
		customerProfileId: PROFILE_ID,
		email: REAL_EMAIL,
	};

	beforeEach(() => {
		mockRequirePermission.mockImplementation(async () => undefined);
		mockSignInMagicLink.mockImplementation(async () => ({}));
		// Default: cpDb.update chain restores per test
		cpUserUpdateChain.mockImplementation(() => ({ set: cpUserUpdateSet }));
		cpUserUpdateSet.mockImplementation(() => ({ where: cpUserUpdateWhere }));
		cpUserUpdateWhere.mockImplementation(async () => undefined);
	});

	it("happy path — updates email and dispatches magic link, returns {success, email}", async () => {
		const profileWithUser = { id: PROFILE_ID, userId: USER_ID };
		const existingUser = { id: USER_ID, email: PLACEHOLDER_EMAIL };

		profileFindFirst.mockImplementation(async () => profileWithUser);
		// First call: existingUser lookup; second call: collision check (no collision)
		cpUserFindFirst
			.mockImplementationOnce(async () => existingUser)
			.mockImplementationOnce(async () => null);

		const cpDb = makeMockCpDb();
		const context = makeBaseContext({ honoContext: makeHonoContext(cpDb) });
		(
			context.tenantDb as ReturnType<typeof makeMockTenantDb>
		).query.customerProfiles.findFirst = profileFindFirst;

		const result = await callProcedure(
			serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
			INPUT,
			context,
		);

		expect(result).toEqual({ success: true, email: REAL_EMAIL });
		expect(mockSignInMagicLink).toHaveBeenCalledTimes(1);
	});

	it("missing member → UNAUTHORIZED", async () => {
		const context = makeBaseContext({ member: undefined });

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
				INPUT,
				context,
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("missing tenantDb + honoContext → INTERNAL_SERVER_ERROR", async () => {
		const context = makeBaseContext({
			tenantDb: undefined,
			honoContext: undefined,
		});

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
				INPUT,
				context,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("profile not found → NOT_FOUND", async () => {
		profileFindFirst.mockImplementation(async () => undefined);

		const context = makeBaseContext();

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
				INPUT,
				context,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("profile has no userId (dependent) → BAD_REQUEST", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: null,
		}));

		const context = makeBaseContext();

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
				INPUT,
				context,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("cpDb missing (getControlPanelDb throws) → INTERNAL_SERVER_ERROR", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));

		// honoContext.get("controlPanelDb") returns null → getControlPanelDb throws
		const context = makeBaseContext({ honoContext: makeHonoContext(null) });

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
				INPUT,
				context,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("existing user has real (non-placeholder) email → BAD_REQUEST", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));
		cpUserFindFirst.mockImplementationOnce(async () => ({
			id: USER_ID,
			email: "already.real@example.com",
		}));

		const context = makeBaseContext();

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
				INPUT,
				context,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("email collision with another user → CONFLICT", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));
		// First call: existingUser (placeholder email); second call: collision (different user)
		cpUserFindFirst
			.mockImplementationOnce(async () => ({
				id: USER_ID,
				email: PLACEHOLDER_EMAIL,
			}))
			.mockImplementationOnce(async () => ({
				id: "other-user",
				email: REAL_EMAIL,
			}));

		const context = makeBaseContext();

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
				INPUT,
				context,
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("Better-Auth dispatch throws → INTERNAL_SERVER_ERROR (console.error called)", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));
		cpUserFindFirst
			.mockImplementationOnce(async () => ({
				id: USER_ID,
				email: PLACEHOLDER_EMAIL,
			}))
			.mockImplementationOnce(async () => null);

		mockSignInMagicLink.mockImplementation(async () => {
			throw new Error("SMTP failure");
		});

		const errors: unknown[][] = [];
		const originalConsoleError = console.error;
		console.error = (...args: unknown[]) => errors.push(args);

		const context = makeBaseContext();

		try {
			await expect(
				callProcedure(
					serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
					INPUT,
					context,
				),
			).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		} finally {
			console.error = originalConsoleError;
		}

		expect(errors.length).toBeGreaterThan(0);
	});
});

// ─── resendMagicLink ──────────────────────────────────────────────────────────

describe("serverCustomerProfilesRouter.resendMagicLink", () => {
	const INPUT = {
		organizationId: ORG_ID,
		customerProfileId: PROFILE_ID,
	};

	beforeEach(() => {
		mockRequirePermission.mockImplementation(async () => undefined);
		mockSignInMagicLink.mockImplementation(async () => ({}));
	});

	it("happy path — dispatches magic link to existing real email, returns {success, email}", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));
		cpUserFindFirst.mockImplementation(async () => ({
			id: USER_ID,
			email: REAL_EMAIL,
		}));

		const result = await callProcedure(
			serverCustomerProfilesRouter.resendMagicLink,
			INPUT,
			makeBaseContext(),
		);

		expect(result).toEqual({ success: true, email: REAL_EMAIL });
		expect(mockSignInMagicLink).toHaveBeenCalledTimes(1);
	});

	it("missing member → UNAUTHORIZED", async () => {
		await expect(
			callProcedure(
				serverCustomerProfilesRouter.resendMagicLink,
				INPUT,
				makeBaseContext({ member: undefined }),
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("missing tenantDb → INTERNAL_SERVER_ERROR", async () => {
		await expect(
			callProcedure(
				serverCustomerProfilesRouter.resendMagicLink,
				INPUT,
				makeBaseContext({ tenantDb: undefined, honoContext: undefined }),
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("profile not found → NOT_FOUND", async () => {
		profileFindFirst.mockImplementation(async () => undefined);

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.resendMagicLink,
				INPUT,
				makeBaseContext(),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("cpDb missing → INTERNAL_SERVER_ERROR", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.resendMagicLink,
				INPUT,
				makeBaseContext({ honoContext: makeHonoContext(null) }),
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("linked user has placeholder email → BAD_REQUEST", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));
		cpUserFindFirst.mockImplementation(async () => ({
			id: USER_ID,
			email: PLACEHOLDER_EMAIL,
		}));

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.resendMagicLink,
				INPUT,
				makeBaseContext(),
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("Better-Auth dispatch throws → INTERNAL_SERVER_ERROR (console.error called)", async () => {
		profileFindFirst.mockImplementation(async () => ({
			id: PROFILE_ID,
			userId: USER_ID,
		}));
		cpUserFindFirst.mockImplementation(async () => ({
			id: USER_ID,
			email: REAL_EMAIL,
		}));

		mockSignInMagicLink.mockImplementation(async () => {
			throw new Error("timeout");
		});

		const errors: unknown[][] = [];
		const originalConsoleError = console.error;
		console.error = (...args: unknown[]) => errors.push(args);

		try {
			await expect(
				callProcedure(
					serverCustomerProfilesRouter.resendMagicLink,
					INPUT,
					makeBaseContext(),
				),
			).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		} finally {
			console.error = originalConsoleError;
		}

		expect(errors.length).toBeGreaterThan(0);
	});
});

// ─── createUnclaimed ──────────────────────────────────────────────────────────

describe("serverCustomerProfilesRouter.createUnclaimed", () => {
	const SCOPE_ID = "scope-1";
	const INPUT = {
		organizationId: ORG_ID,
		firstName: "Jane",
		lastName: "Doe",
		phone: "+60123456789",
		hierarchyScopeId: SCOPE_ID,
	};

	beforeEach(() => {
		mockRequirePermission.mockImplementation(async () => undefined);
		mockMembershipServiceCreateMember.mockImplementation(async () => ({}));
		// No phone conflict by default
		profileFindFirst.mockImplementation(async () => undefined);
		// memberFindFirst after insert — returns a created member
		memberFindFirst.mockImplementation(async () => ({
			id: "new-member-id",
			userId: USER_ID,
		}));
		// cpDb.insert chain
		cpUserInsertChain.mockImplementation(() => ({
			values: cpUserInsertValues,
		}));
		cpUserInsertValues.mockImplementation(async () => undefined);
		// tenantDb.insert → returning profile id
		tenantInsertChain.mockImplementation(() => ({
			values: tenantInsertValues,
		}));
		tenantInsertValues.mockImplementation(() => ({
			returning: tenantInsertReturning,
		}));
		tenantInsertReturning.mockImplementation(async () => [{ id: PROFILE_ID }]);
	});

	it("happy path — creates CP user + member + profile, returns {memberId, profileId, userId}", async () => {
		const result = await callProcedure(
			serverCustomerProfilesRouter.createUnclaimed,
			INPUT,
			makeBaseContext(),
		);

		expect(result).toMatchObject({
			profileId: PROFILE_ID,
			memberId: "new-member-id",
		});
		// userId is generated; just check it's a non-empty string
		expect(typeof result.userId).toBe("string");
		expect(result.userId.length).toBeGreaterThan(0);
	});

	it("missing member → UNAUTHORIZED", async () => {
		await expect(
			callProcedure(
				serverCustomerProfilesRouter.createUnclaimed,
				INPUT,
				makeBaseContext({ member: undefined }),
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("missing tenantDb → INTERNAL_SERVER_ERROR", async () => {
		await expect(
			callProcedure(
				serverCustomerProfilesRouter.createUnclaimed,
				INPUT,
				makeBaseContext({ tenantDb: undefined, honoContext: undefined }),
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("phone already in use → returns existing profile idempotently (CU-006)", async () => {
		// CU-006: phone dedup is idempotent rather than CONFLICT — double-submitting
		// the Quick Add form (network retry, accidental re-click) must not create
		// two profiles for the same person. The procedure now returns the existing
		// profile's IDs so the caller can navigate to it.
		profileFindFirst.mockImplementation(async () => ({
			id: "existing-profile",
			phone: INPUT.phone,
			isDeleted: false,
			userId: USER_ID,
		}));
		memberFindFirst.mockImplementation(async () => ({
			id: "existing-member",
			userId: USER_ID,
		}));

		const result = await callProcedure(
			serverCustomerProfilesRouter.createUnclaimed,
			INPUT,
			makeBaseContext(),
		);

		expect(result).toMatchObject({
			profileId: "existing-profile",
			memberId: "existing-member",
			userId: USER_ID,
		});
		// Membership service must NOT have been called (no new member created)
		expect(mockMembershipServiceCreateMember.mock.calls.length).toBe(0);
	});

	it("cpDb missing → INTERNAL_SERVER_ERROR", async () => {
		await expect(
			callProcedure(
				serverCustomerProfilesRouter.createUnclaimed,
				INPUT,
				makeBaseContext({ honoContext: makeHonoContext(null) }),
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("supplied email already taken → CONFLICT", async () => {
		// No phone conflict, but email collision
		cpUserFindFirst.mockImplementation(async () => ({
			id: "other",
			email: REAL_EMAIL,
		}));

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.createUnclaimed,
				{ ...INPUT, email: REAL_EMAIL },
				makeBaseContext(),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});
});

// ─── sendClaimLink ────────────────────────────────────────────────────────────

describe("serverCustomerProfilesRouter.sendClaimLink", () => {
	const INPUT = {
		organizationId: ORG_ID,
		customerProfileId: PROFILE_ID,
		email: REAL_EMAIL,
	};

	const UNCLAIMED_PROFILE = {
		id: PROFILE_ID,
		userId: USER_ID,
		isUnclaimed: true,
	};

	const PLACEHOLDER_USER = {
		id: USER_ID,
		email: UNCLAIMED_PLACEHOLDER,
	};

	beforeEach(() => {
		mockRequirePermission.mockImplementation(async () => undefined);
		mockSignInMagicLink.mockImplementation(async () => ({}));
		cpUserUpdateChain.mockImplementation(() => ({ set: cpUserUpdateSet }));
		cpUserUpdateSet.mockImplementation(() => ({ where: cpUserUpdateWhere }));
		cpUserUpdateWhere.mockImplementation(async () => undefined);
		tenantUpdateChain.mockImplementation(() => ({ set: tenantUpdateSet }));
		tenantUpdateSet.mockImplementation(() => ({ where: tenantUpdateWhere }));
		tenantUpdateWhere.mockImplementation(async () => undefined);
	});

	it("happy path — updates CP email, dispatches magic link, clears isUnclaimed, returns {success, email}", async () => {
		profileFindFirst.mockImplementation(async () => UNCLAIMED_PROFILE);
		// First findFirst: existingUser; second: collision check (no collision)
		cpUserFindFirst
			.mockImplementationOnce(async () => PLACEHOLDER_USER)
			.mockImplementationOnce(async () => null);

		const result = await callProcedure(
			serverCustomerProfilesRouter.sendClaimLink,
			INPUT,
			makeBaseContext(),
		);

		expect(result).toEqual({ success: true, email: REAL_EMAIL });
		expect(mockSignInMagicLink).toHaveBeenCalledTimes(1);
	});

	it("missing member → UNAUTHORIZED", async () => {
		await expect(
			callProcedure(
				serverCustomerProfilesRouter.sendClaimLink,
				INPUT,
				makeBaseContext({ member: undefined }),
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("missing tenantDb → INTERNAL_SERVER_ERROR", async () => {
		await expect(
			callProcedure(
				serverCustomerProfilesRouter.sendClaimLink,
				INPUT,
				makeBaseContext({ tenantDb: undefined, honoContext: undefined }),
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("profile not found → NOT_FOUND", async () => {
		profileFindFirst.mockImplementation(async () => undefined);

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.sendClaimLink,
				INPUT,
				makeBaseContext(),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("cpDb missing → INTERNAL_SERVER_ERROR", async () => {
		profileFindFirst.mockImplementation(async () => UNCLAIMED_PROFILE);

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.sendClaimLink,
				INPUT,
				makeBaseContext({ honoContext: makeHonoContext(null) }),
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("profile already claimed (isUnclaimed=false) → BAD_REQUEST", async () => {
		profileFindFirst.mockImplementation(async () => ({
			...UNCLAIMED_PROFILE,
			isUnclaimed: false,
		}));

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.sendClaimLink,
				INPUT,
				makeBaseContext(),
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("CP user already has real email → BAD_REQUEST", async () => {
		profileFindFirst.mockImplementation(async () => UNCLAIMED_PROFILE);
		cpUserFindFirst.mockImplementation(async () => ({
			id: USER_ID,
			email: REAL_EMAIL,
		}));

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.sendClaimLink,
				INPUT,
				makeBaseContext(),
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("email collision with another user → CONFLICT", async () => {
		profileFindFirst.mockImplementation(async () => UNCLAIMED_PROFILE);
		cpUserFindFirst
			.mockImplementationOnce(async () => PLACEHOLDER_USER)
			.mockImplementationOnce(async () => ({
				id: "someone-else",
				email: REAL_EMAIL,
			}));

		await expect(
			callProcedure(
				serverCustomerProfilesRouter.sendClaimLink,
				INPUT,
				makeBaseContext(),
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("Better-Auth dispatch throws → INTERNAL_SERVER_ERROR (console.error called)", async () => {
		profileFindFirst.mockImplementation(async () => UNCLAIMED_PROFILE);
		cpUserFindFirst
			.mockImplementationOnce(async () => PLACEHOLDER_USER)
			.mockImplementationOnce(async () => null);

		mockSignInMagicLink.mockImplementation(async () => {
			throw new Error("network error");
		});

		const errors: unknown[][] = [];
		const originalConsoleError = console.error;
		console.error = (...args: unknown[]) => errors.push(args);

		try {
			await expect(
				callProcedure(
					serverCustomerProfilesRouter.sendClaimLink,
					INPUT,
					makeBaseContext(),
				),
			).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		} finally {
			console.error = originalConsoleError;
		}

		expect(errors.length).toBeGreaterThan(0);
	});
});

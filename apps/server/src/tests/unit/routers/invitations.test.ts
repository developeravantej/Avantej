/**
 * Unit tests for the invitations router
 *
 * Focused on:
 *   create — permission check, duplicate-invite guard, response shape
 *   revoke  — permission check, delegates to revokeInvitation service
 *   accept  — token validation, email mismatch, already-member guard
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
	createAdminContext,
	createStaffContext,
} from "../../helpers/context.factory";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeMember } from "../../helpers/fixtures";

// Import the REAL service subpath modules so we can spread their genuine
// exports and override only the functions under test. NOTE: mocking the
// `@avantej-core/services` BARREL directly breaks Bun's named-export resolution
// for `export *` re-exports (the router/guards import `createInvitation`,
// `PermissionDeniedError`, etc. from the barrel — including via runtime dynamic
// `await import("@avantej-core/services")` — and fail to load with "Export
// named X not found"). Mocking the specific subpath modules the barrel
// re-exports keeps those named exports resolvable (the barrel re-export picks
// up the mocked subpath) while still intercepting the functions under test.
import * as realPermissionService from "@avantej-core/services/permission.service";
import * as realHierarchyService from "@avantej-core/services/hierarchy.service";
import * as realHierarchyValidationService from "@avantej-core/services/hierarchy-validation.service";
import * as realInvitationService from "@avantej-core/services/invitation.service";

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockRequirePermission = mock(() => Promise.resolve());
const mockGetDescendantNodeIds = mock(() => Promise.resolve([]));
const mockValidateParentAccess = mock(() => {});
const mockCheckSoftDeletedCustomerBlock = mock(() =>
	Promise.resolve({ blocked: false }),
);

const CREATED_INVITATION = {
	id: "inv-0001",
	email: "new@example.com",
	role: "staff" as const,
	hierarchyScopeId: "aaaaaaaa-0000-4000-8000-000000000001",
	token: "tok-abc",
	status: "pending" as const,
	expiresAt: new Date(Date.now() + 86400_000),
	createdAt: new Date(),
};

const mockCreateInvitation = mock(() => Promise.resolve(CREATED_INVITATION));
const mockRevokeInvitation = mock(() =>
	Promise.resolve({
		id: "inv-0001",
		email: "new@example.com",
		status: "declined",
	}),
);
const mockGetInvitationByToken = mock(() =>
	Promise.resolve(CREATED_INVITATION),
);
const mockValidateInvitation = mock(() => ({ isValid: true, error: null }));
const mockListInvitations = mock(() => Promise.resolve([]));
const mockResendInvitation = mock(() => Promise.resolve(CREATED_INVITATION));

const mockCreateMember = mock(() => Promise.resolve());
class MockMembershipService {
	createMember = mockCreateMember;
}

mock.module("@avantej-core/services/permission.service", () => ({
	...realPermissionService,
	requirePermission: mockRequirePermission,
}));

mock.module("@avantej-core/services/hierarchy.service", () => ({
	...realHierarchyService,
	getDescendantNodeIds: mockGetDescendantNodeIds,
}));

mock.module("@avantej-core/services/hierarchy-validation.service", () => ({
	...realHierarchyValidationService,
	validateParentAccess: mockValidateParentAccess,
}));

mock.module("@avantej-core/services/invitation.service", () => ({
	...realInvitationService,
	createInvitation: mockCreateInvitation,
	revokeInvitation: mockRevokeInvitation,
	getInvitationByToken: mockGetInvitationByToken,
	validateInvitation: mockValidateInvitation,
	listInvitations: mockListInvitations,
	resendInvitation: mockResendInvitation,
	checkSoftDeletedCustomerBlock: mockCheckSoftDeletedCustomerBlock,
}));

mock.module("@avantej-core/db/services/membership.service", () => ({
	MembershipService: MockMembershipService,
}));

import { invitationRouter } from "@avantej-core/api/routers/invitations";

// biome-ignore lint/suspicious/noExplicitAny: test helper
function call(procedure: any, input: unknown, context: unknown) {
	return procedure["~orpc"].handler({ input, context });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const BRANCH_ID = "aaaaaaaa-0000-4000-8000-000000000001";

function makeControlPanelDbStub() {
	return {
		query: {
			user: { findFirst: mock(() => Promise.resolve(undefined)) },
			users: { findFirst: mock(() => Promise.resolve(undefined)) },
			organizationMembers: {
				findFirst: mock(() => Promise.resolve(undefined)),
			},
		},
		update: mock(() => ({
			set: mock(() => ({ where: mock(() => Promise.resolve()) })),
		})),
	};
}

function makeHonoContext(controlPanelDb: unknown = makeControlPanelDbStub()) {
	const store = new Map<string, unknown>([["controlPanelDb", controlPanelDb]]);
	return { get: (key: string) => store.get(key) };
}

// ── create ────────────────────────────────────────────────────────────────────

describe("invitationRouter.create", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockCreateInvitation.mockClear();
		mockCheckSoftDeletedCustomerBlock.mockClear();
	});

	it("happy path — admin creates invitation, returns token and org info", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.invitations = {
			findFirst: mock(() => Promise.resolve(undefined)),
		} as any;

		const result = await call(
			invitationRouter.create,
			{
				organizationId: ORG_ID,
				email: "new@example.com",
				role: "staff",
				hierarchyScopeId: BRANCH_ID,
			},
			{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
		);

		expect(result.invitation.token).toBe("tok-abc");
		expect(result.invitation.email).toBe("new@example.com");
		expect(result.organizationId).toBe(ORG_ID);
		expect(mockCreateInvitation).toHaveBeenCalledTimes(1);
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				invitationRouter.create,
				{
					organizationId: ORG_ID,
					email: "new@example.com",
					role: "staff",
					hierarchyScopeId: BRANCH_ID,
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (staff lacks user_management:create)", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				invitationRouter.create,
				{
					organizationId: ORG_ID,
					email: "new@example.com",
					role: "staff",
					hierarchyScopeId: BRANCH_ID,
				},
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("CONFLICT when a pending invitation already exists for the email", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.invitations = {
			findFirst: mock(() =>
				Promise.resolve({
					id: "existing-inv",
					email: "new@example.com",
					status: "pending",
				}),
			),
		} as any;

		await expect(
			call(
				invitationRouter.create,
				{
					organizationId: ORG_ID,
					email: "new@example.com",
					role: "staff",
					hierarchyScopeId: BRANCH_ID,
				},
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("BAD_REQUEST when target email belongs to a soft-deleted customer", async () => {
		mockCheckSoftDeletedCustomerBlock.mockResolvedValueOnce({
			blocked: true,
			userId: "u-del",
			profileId: "p-del",
		} as any);
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.invitations = {
			findFirst: mock(() => Promise.resolve(undefined)),
		} as any;

		await expect(
			call(
				invitationRouter.create,
				{
					organizationId: ORG_ID,
					email: "deleted@example.com",
					role: "staff",
					hierarchyScopeId: BRANCH_ID,
				},
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const ctx = { ...createAdminContext(), tenantDb: null };

		await expect(
			call(
				invitationRouter.create,
				{
					organizationId: ORG_ID,
					email: "new@example.com",
					role: "staff",
					hierarchyScopeId: BRANCH_ID,
				},
				ctx,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

// ── revoke ────────────────────────────────────────────────────────────────────

describe("invitationRouter.revoke", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockRevokeInvitation.mockClear();
	});

	it("happy path — admin revokes invitation, returns success with status", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();

		const result = await call(
			invitationRouter.revoke,
			{ organizationId: ORG_ID, invitationId: "inv-0001" },
			{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
		);

		expect(result.success).toBe(true);
		expect(result.invitation.status).toBe("declined");
		expect(mockRevokeInvitation).toHaveBeenCalledTimes(1);
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				invitationRouter.revoke,
				{ organizationId: ORG_ID, invitationId: "inv-0001" },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (needs user_management:delete)", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				invitationRouter.revoke,
				{ organizationId: ORG_ID, invitationId: "inv-0001" },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ── accept ────────────────────────────────────────────────────────────────────

describe("invitationRouter.accept", () => {
	beforeEach(() => {
		mockGetInvitationByToken.mockClear();
		mockValidateInvitation.mockClear();
		mockCreateMember.mockClear();
	});

	it("happy path — logged-in user with matching email accepts invitation", async () => {
		const db = createMockTenantDb();
		db.query.members = {
			findFirst: mock(() => Promise.resolve(undefined)),
		} as any;

		const result = await call(
			invitationRouter.accept,
			{ token: "tok-abc", organizationId: ORG_ID },
			{
				tenantDb: db,
				session: { user: { id: "u-1", email: "new@example.com" } },
				honoContext: makeHonoContext(),
			},
		);

		expect(result.success).toBe(true);
		expect(result.organizationId).toBe(ORG_ID);
		expect(mockCreateMember).toHaveBeenCalledTimes(1);
	});

	it("UNAUTHORIZED when no session (user not logged in)", async () => {
		const db = createMockTenantDb();

		await expect(
			call(
				invitationRouter.accept,
				{ token: "tok-abc", organizationId: ORG_ID },
				{ tenantDb: db, session: null, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("FORBIDDEN when logged-in user email does not match invitation email", async () => {
		const db = createMockTenantDb();

		await expect(
			call(
				invitationRouter.accept,
				{ token: "tok-abc", organizationId: ORG_ID },
				{
					tenantDb: db,
					session: { user: { id: "u-2", email: "other@example.com" } },
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("CONFLICT when user is already a member of the organization", async () => {
		const db = createMockTenantDb();
		db.query.members = {
			findFirst: mock(() => Promise.resolve(makeMember({ userId: "u-1" }))),
		} as any;

		await expect(
			call(
				invitationRouter.accept,
				{ token: "tok-abc", organizationId: ORG_ID },
				{
					tenantDb: db,
					session: { user: { id: "u-1", email: "new@example.com" } },
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("BAD_REQUEST when invitation token is invalid (validateInvitation returns false)", async () => {
		mockValidateInvitation.mockReturnValueOnce({
			isValid: false,
			error: "Invitation has expired",
		} as any);
		const db = createMockTenantDb();

		await expect(
			call(
				invitationRouter.accept,
				{ token: "tok-expired", organizationId: ORG_ID },
				{
					tenantDb: db,
					session: { user: { id: "u-1", email: "new@example.com" } },
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

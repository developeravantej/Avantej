/**
 * Unit tests for the members router
 *
 * Focused on procedures that mutate state or enforce permissions:
 *   deactivate, reactivate, softDelete, updateRole
 *
 * Strategy:
 *   - Mock @avantej-core/services so requirePermission / deactivateMember
 *     are fully controlled per test.
 *   - Mock @avantej-core/db/services/membership.service so MembershipService
 *     dual-writes are not exercised here.
 *   - Inline tenantDb overrides using createMockTenantDb() from the shared factory.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { ORPCError } from "@orpc/server";
import {
	createAdminContext,
	createStaffContext,
} from "../../helpers/context.factory";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeMember } from "../../helpers/fixtures";

// Import the REAL service subpath modules so we can spread their genuine
// exports (classes, types, helpers) and override only the functions under test.
// NOTE: mocking the `@avantej-core/services` BARREL directly breaks Bun's
// named-export resolution for `export *` re-exports (the router/guards import
// `getMembersNewToday`, `PermissionDeniedError`, etc. from the barrel and fail
// to load). Mocking the specific subpath modules the barrel re-exports keeps
// those named exports resolvable while still intercepting the functions.
import * as realPermissionService from "@avantej-core/services/permission.service";
import * as realHierarchyService from "@avantej-core/services/hierarchy.service";
import * as realHierarchyValidationService from "@avantej-core/services/hierarchy-validation.service";
import * as realMemberService from "@avantej-core/services/member.service";
import * as realMemberStatsService from "@avantej-core/services/member-stats.service";

// ── Mock external service dependencies ──────────────────────────────────────

// Mirror the real requirePermission contract closely enough for the router
// guards: a missing tenantDb is an internal error, a missing member is a
// permission failure (maps to FORBIDDEN via the "Permission denied" prefix in
// guards.mapToOrpcForbidden). Individual tests override with mockResolved/
// RejectedValueOnce as needed.
const mockRequirePermission = mock(
	async (tenantDb: unknown, member: unknown) => {
		if (!tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available",
			});
		}
		if (!member) {
			throw new Error("Permission denied: user is not a member");
		}
	},
);
const mockDeactivateMember = mock(
	async (_db: unknown, memberId: string, _actor: unknown) => ({
		id: memberId,
		userId: "u-1",
		role: "staff" as const,
		hierarchyScopeId: "aaaaaaaa-0000-4000-8000-000000000001",
		status: "inactive" as const,
		joinedAt: new Date(),
	}),
);
const mockWriteAudit = mock(() => Promise.resolve());
const mockGetDescendantNodeIds = mock(() => Promise.resolve([]));
const mockValidateParentAccess = mock(() => {});
const mockGetMembersNewToday = mock(() =>
	Promise.resolve({ count: 0, members: [] }),
);

const mockUpdateMemberRole = mock(() => Promise.resolve());
const mockReactivateMember = mock(() => Promise.resolve());
class MockMembershipService {
	updateMemberRole = mockUpdateMemberRole;
	reactivateMember = mockReactivateMember;
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

mock.module("@avantej-core/services/member.service", () => ({
	...realMemberService,
	deactivateMember: mockDeactivateMember,
}));

mock.module("@avantej-core/services/member-stats.service", () => ({
	...realMemberStatsService,
	getMembersNewToday: mockGetMembersNewToday,
}));

mock.module("@avantej-core/services/audit-log.service", () => ({
	writeAudit: mockWriteAudit,
}));

mock.module("@avantej-core/db/services/membership.service", () => ({
	MembershipService: MockMembershipService,
}));

import { memberRouter } from "@avantej-core/api/routers/members";

// oRPC stores the raw handler at procedure['~orpc'].handler. Calling it directly
// bypasses the auth middleware, letting tests inject any context they need.
// biome-ignore lint/suspicious/noExplicitAny: test helper
function call(procedure: any, input: unknown, context: unknown) {
	return procedure["~orpc"].handler({ input, context });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const BRANCH_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000002";

function makeHonoContextStub(extras: Record<string, unknown> = {}) {
	const store = new Map<string, unknown>([
		["controlPanelDb", {} as any],
		...Object.entries(extras),
	]);
	return { get: (key: string) => store.get(key) };
}

// ── deactivate ────────────────────────────────────────────────────────────────

describe("memberRouter.deactivate", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockDeactivateMember.mockClear();
	});

	it("happy path — admin calls deactivateMember service and returns result", async () => {
		const ctx = createAdminContext();
		const input = { organizationId: ORG_ID, memberId: MEMBER_ID };

		mockDeactivateMember.mockResolvedValueOnce({
			id: MEMBER_ID,
			userId: "u-1",
			role: "staff",
			hierarchyScopeId: BRANCH_ID,
			status: "inactive",
			joinedAt: new Date(),
		});

		const result = await call(memberRouter.deactivate, input, {
			...ctx,
			honoContext: makeHonoContextStub(),
		});

		expect(result.status).toBe("inactive");
		expect(mockDeactivateMember).toHaveBeenCalledTimes(1);
		const [, calledMemberId] = mockDeactivateMember.mock.calls[0] as [
			unknown,
			string,
			unknown,
		];
		expect(calledMemberId).toBe(MEMBER_ID);
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				memberRouter.deactivate,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (staff without permission)", async () => {
		mockRequirePermission.mockRejectedValueOnce(
			new Error("Permission denied: staff role"),
		);
		const ctx = createStaffContext();

		await expect(
			call(
				memberRouter.deactivate,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ ...ctx, honoContext: makeHonoContextStub() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("NOT_FOUND when deactivateMember service throws 'not found'", async () => {
		const ctx = createAdminContext();
		mockDeactivateMember.mockRejectedValueOnce(
			new Error("Member not found: " + MEMBER_ID),
		);

		await expect(
			call(
				memberRouter.deactivate,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ ...ctx, honoContext: makeHonoContextStub() },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const ctx = { ...createAdminContext(), tenantDb: null };

		await expect(
			call(
				memberRouter.deactivate,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				ctx,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

// ── reactivate ────────────────────────────────────────────────────────────────

describe("memberRouter.reactivate", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockReactivateMember.mockClear();
		mockWriteAudit.mockClear();
	});

	it("happy path — calls MembershipService.reactivateMember and returns success", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		const targetMember = makeMember({
			id: MEMBER_ID,
			status: "suspended",
			hierarchyScopeId: BRANCH_ID,
		});
		const updatedMember = { ...targetMember, status: "active" };

		db.query.members.findFirst
			.mockResolvedValueOnce(targetMember)
			.mockResolvedValueOnce(updatedMember);

		const result = await call(
			memberRouter.reactivate,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ ...ctx, tenantDb: db, honoContext: makeHonoContextStub() },
		);

		expect(result.success).toBe(true);
		expect(result.member.status).toBe("active");
		expect(mockReactivateMember).toHaveBeenCalledTimes(1);
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				memberRouter.reactivate,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();

		await expect(
			call(
				memberRouter.reactivate,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ ...ctx, honoContext: makeHonoContextStub() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("NOT_FOUND when target member does not exist", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.members.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			call(
				memberRouter.reactivate,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContextStub() },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ── softDelete ────────────────────────────────────────────────────────────────

describe("memberRouter.softDelete", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
	});

	it("happy path — stamps deletedAt and returns ok:true", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		const targetMember = makeMember({
			id: MEMBER_ID,
			hierarchyScopeId: BRANCH_ID,
			deletedAt: null,
		});
		const deletedMember = { ...targetMember, deletedAt: new Date() };

		db.query.members.findFirst.mockResolvedValueOnce(targetMember);
		const returningMock = mock(() => Promise.resolve([deletedMember]));
		const whereMock = mock(() => ({ returning: returningMock }));
		const setMock = mock(() => ({ where: whereMock }));
		db.update.mockReturnValueOnce({ set: setMock });

		const result = await call(
			memberRouter.softDelete,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ ...ctx, tenantDb: db },
		);

		expect(result.ok).toBe(true);
		expect(result.memberId).toBe(MEMBER_ID);
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				memberRouter.softDelete,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
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
				memberRouter.softDelete,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ ...ctx, tenantDb: db },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("NOT_FOUND when target member does not exist", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.members.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			call(
				memberRouter.softDelete,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ ...ctx, tenantDb: db },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("FORBIDDEN for staff attempting to soft-delete a member outside their scope", async () => {
		const ctx = createStaffContext(); // accessibleNodeIds = [BRANCH_ID]
		const db = createMockTenantDb();
		const outOfScopeMember = makeMember({
			id: MEMBER_ID,
			hierarchyScopeId: "ffffffff-0000-4000-8000-000000000099",
			deletedAt: null,
		});
		db.query.members.findFirst.mockResolvedValueOnce(outOfScopeMember);

		await expect(
			call(
				memberRouter.softDelete,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ ...ctx, tenantDb: db },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ── updateRole ────────────────────────────────────────────────────────────────

describe("memberRouter.updateRole", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockUpdateMemberRole.mockClear();
		mockWriteAudit.mockClear();
	});

	it("happy path — calls MembershipService.updateMemberRole and returns success", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		const targetMember = makeMember({
			id: MEMBER_ID,
			role: "staff",
			hierarchyScopeId: BRANCH_ID,
		});
		const updatedMember = { ...targetMember, role: "trainer" };

		db.query.members.findFirst
			.mockResolvedValueOnce(targetMember)
			.mockResolvedValueOnce(updatedMember);

		const result = await call(
			memberRouter.updateRole,
			{ organizationId: ORG_ID, memberId: MEMBER_ID, newRole: "trainer" },
			{ ...ctx, tenantDb: db, honoContext: makeHonoContextStub() },
		);

		expect(result.success).toBe(true);
		expect(result.member.role).toBe("trainer");
		expect(mockUpdateMemberRole).toHaveBeenCalledTimes(1);
	});

	it("writes audit log entry on successful role change", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		const targetMember = makeMember({
			id: MEMBER_ID,
			role: "staff",
			hierarchyScopeId: BRANCH_ID,
		});
		const updatedMember = { ...targetMember, role: "admin" };

		db.query.members.findFirst
			.mockResolvedValueOnce(targetMember)
			.mockResolvedValueOnce(updatedMember);

		await call(
			memberRouter.updateRole,
			{ organizationId: ORG_ID, memberId: MEMBER_ID, newRole: "admin" },
			{ ...ctx, tenantDb: db, honoContext: makeHonoContextStub() },
		);

		expect(mockWriteAudit).toHaveBeenCalledTimes(1);
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				memberRouter.updateRole,
				{ organizationId: ORG_ID, memberId: MEMBER_ID, newRole: "trainer" },
				ctx,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				memberRouter.updateRole,
				{ organizationId: ORG_ID, memberId: MEMBER_ID, newRole: "trainer" },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContextStub() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("NOT_FOUND when target member does not exist", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.members.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			call(
				memberRouter.updateRole,
				{ organizationId: ORG_ID, memberId: MEMBER_ID, newRole: "trainer" },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContextStub() },
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("INTERNAL_SERVER_ERROR when controlPanelDb is missing from context", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		const targetMember = makeMember({
			id: MEMBER_ID,
			hierarchyScopeId: BRANCH_ID,
		});
		db.query.members.findFirst.mockResolvedValueOnce(targetMember);

		const emptyHonoContext = { get: () => undefined };

		await expect(
			call(
				memberRouter.updateRole,
				{ organizationId: ORG_ID, memberId: MEMBER_ID, newRole: "trainer" },
				{ ...ctx, tenantDb: db, honoContext: emptyHonoContext },
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

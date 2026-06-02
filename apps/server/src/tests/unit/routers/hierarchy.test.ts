/**
 * Unit tests for the hierarchy router
 *
 * Focused on:
 *   createNode — permission check, validateHierarchyRules, response shape
 *   updateNode — node-access guard (accessibleNodeIds), permission check, not-found
 *   deleteNode — node-access guard, permission check, delegates to deleteHierarchyNode
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import {
	createAdminContext,
	createStaffContext,
} from "../../helpers/context.factory";
import { createMockTenantDb } from "../../helpers/db-mock.factory";

// Import the REAL service subpath modules so we can spread their genuine
// exports and override only the functions under test. NOTE: mocking the
// `@avantej-core/services` BARREL directly breaks Bun's named-export resolution
// for `export *` re-exports (the router/guards import `listNodesWithStats`,
// `PermissionDeniedError`, etc. from the barrel and fail to load with "Export
// named X not found"). Mocking the specific subpath modules the barrel
// re-exports keeps those named exports resolvable while still intercepting the
// functions under test.
import * as realPermissionService from "@avantej-core/services/permission.service";
import * as realHierarchyService from "@avantej-core/services/hierarchy.service";
import * as realHierarchyValidationService from "@avantej-core/services/hierarchy-validation.service";
import * as realMemberService from "@avantej-core/services/member.service";

// ── Service mocks ─────────────────────────────────────────────────────────────

const mockRequirePermission = mock(() => Promise.resolve());
const mockGetDescendantNodeIds = mock(() => Promise.resolve([]));
const mockValidateParentAccess = mock(() => {});
const mockValidateHierarchyRules = mock(() => Promise.resolve());

const CREATED_NODE = {
	id: "node-0001",
	name: "KL Branch",
	type: "branch" as const,
	depth: 3,
	parentId: "node-parent-01",
	countryNodeId: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const mockCreateHierarchyNode = mock(() => Promise.resolve(CREATED_NODE));
const UPDATED_NODE = { ...CREATED_NODE, name: "KL Branch Updated" };
const mockUpdateHierarchyNode = mock(() => Promise.resolve(UPDATED_NODE));
const mockDeleteHierarchyNode = mock(() => Promise.resolve());
const mockMoveHierarchyNode = mock(() => Promise.resolve(CREATED_NODE));
const mockListNodesWithStats = mock(() => Promise.resolve([]));
const mockGetMembersByHierarchyScope = mock(() => Promise.resolve([]));
const mockUpdateMemberHierarchyScope = mock(() => Promise.resolve({}));
const mockBulkUpdateMemberHierarchyScope = mock(() => Promise.resolve([]));
const mockGetAllOrganizationMembersWithUserDetails = mock(() =>
	Promise.resolve([]),
);

mock.module("@avantej-core/services/permission.service", () => ({
	...realPermissionService,
	requirePermission: mockRequirePermission,
}));

mock.module("@avantej-core/services/hierarchy.service", () => ({
	...realHierarchyService,
	getDescendantNodeIds: mockGetDescendantNodeIds,
	createHierarchyNode: mockCreateHierarchyNode,
	updateHierarchyNode: mockUpdateHierarchyNode,
	deleteHierarchyNode: mockDeleteHierarchyNode,
	moveHierarchyNode: mockMoveHierarchyNode,
	listNodesWithStats: mockListNodesWithStats,
}));

mock.module("@avantej-core/services/hierarchy-validation.service", () => ({
	...realHierarchyValidationService,
	validateParentAccess: mockValidateParentAccess,
	validateHierarchyRules: mockValidateHierarchyRules,
}));

mock.module("@avantej-core/services/member.service", () => ({
	...realMemberService,
	getMembersByHierarchyScope: mockGetMembersByHierarchyScope,
	updateMemberHierarchyScope: mockUpdateMemberHierarchyScope,
	bulkUpdateMemberHierarchyScope: mockBulkUpdateMemberHierarchyScope,
	getAllOrganizationMembersWithUserDetails:
		mockGetAllOrganizationMembersWithUserDetails,
}));

import { hierarchyRouter } from "@avantej-core/api/routers/hierarchy";

// biome-ignore lint/suspicious/noExplicitAny: test helper
function call(procedure: any, input: unknown, context: unknown) {
	return procedure["~orpc"].handler({ input, context });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const BRANCH_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const PARENT_NODE_ID = "node-parent-01";

function makeHonoContext() {
	return { get: (_key: string) => undefined };
}

// ── createNode ────────────────────────────────────────────────────────────────

describe("hierarchyRouter.createNode", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockCreateHierarchyNode.mockClear();
		mockValidateHierarchyRules.mockClear();
		mockValidateParentAccess.mockClear();
	});

	it("happy path — admin creates a branch node, returns node shape", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.hierarchyNodes.findFirst.mockResolvedValueOnce({
			id: PARENT_NODE_ID,
			name: "Kuala Lumpur",
			type: "state",
			depth: 2,
			parentId: "country-001",
		});
		db.query.branchDetails = {
			findFirst: mock(() => Promise.resolve(undefined)),
		} as any;

		const result = await call(
			hierarchyRouter.createNode,
			{
				organizationId: ORG_ID,
				type: "branch",
				name: "KL Branch",
				parentId: PARENT_NODE_ID,
			},
			{
				...ctx,
				tenantDb: db,
				organizationId: ORG_ID,
				honoContext: makeHonoContext(),
			},
		);

		expect(result.id).toBe("node-0001");
		expect(result.name).toBe("KL Branch");
		expect(result.type).toBe("branch");
		expect(mockCreateHierarchyNode).toHaveBeenCalledTimes(1);
		expect(mockValidateHierarchyRules).toHaveBeenCalledTimes(1);
	});

	it("happy path — admin creates a root country node (no parentId)", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		const countryNode = {
			...CREATED_NODE,
			type: "country" as const,
			parentId: null,
		} as any;
		mockCreateHierarchyNode.mockResolvedValueOnce(countryNode);

		const result = await call(
			hierarchyRouter.createNode,
			{ organizationId: ORG_ID, type: "country", name: "Malaysia" },
			{
				...ctx,
				tenantDb: db,
				organizationId: ORG_ID,
				honoContext: makeHonoContext(),
			},
		);

		expect(result.type).toBe("country");
		// validateParentAccess must NOT be called when no parentId
		expect(mockValidateParentAccess).not.toHaveBeenCalled();
	});

	it("FORBIDDEN when context has no member", async () => {
		const ctx = { ...createAdminContext(), member: null };

		await expect(
			call(
				hierarchyRouter.createNode,
				{ organizationId: ORG_ID, type: "branch", name: "KL Branch" },
				{ ...ctx, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (needs hierarchy_management:create)", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				hierarchyRouter.createNode,
				{ organizationId: ORG_ID, type: "branch", name: "KL Branch" },
				{
					...ctx,
					tenantDb: db,
					organizationId: ORG_ID,
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("NOT_FOUND when parentId is specified but parent node does not exist", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.hierarchyNodes.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			call(
				hierarchyRouter.createNode,
				{
					organizationId: ORG_ID,
					type: "branch",
					name: "Ghost Branch",
					parentId: "nonexistent-parent",
				},
				{
					...ctx,
					tenantDb: db,
					organizationId: ORG_ID,
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("BAD_REQUEST when validateHierarchyRules throws a validation error", async () => {
		mockValidateHierarchyRules.mockRejectedValueOnce(
			new Error("Cannot create a state under a branch"),
		);
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.hierarchyNodes.findFirst.mockResolvedValueOnce({
			id: PARENT_NODE_ID,
			name: "KL Branch",
			type: "branch",
			depth: 3,
			parentId: null,
		});

		await expect(
			call(
				hierarchyRouter.createNode,
				{
					organizationId: ORG_ID,
					type: "state",
					name: "Sub-State",
					parentId: PARENT_NODE_ID,
				},
				{
					...ctx,
					tenantDb: db,
					organizationId: ORG_ID,
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const ctx = { ...createAdminContext(), tenantDb: null };

		await expect(
			call(
				hierarchyRouter.createNode,
				{ organizationId: ORG_ID, type: "branch", name: "KL Branch" },
				ctx,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

// ── updateNode ────────────────────────────────────────────────────────────────

describe("hierarchyRouter.updateNode", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockUpdateHierarchyNode.mockClear();
	});

	it("happy path — updates node name, returns updated node shape", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.hierarchyNodes.findFirst.mockResolvedValueOnce(CREATED_NODE);
		db.query.branchDetails = {
			findFirst: mock(() => Promise.resolve(undefined)),
		} as any;

		const result = await call(
			hierarchyRouter.updateNode,
			{ organizationId: ORG_ID, nodeId: BRANCH_ID, name: "KL Branch Updated" },
			{
				...ctx,
				accessibleNodeIds: [BRANCH_ID],
				tenantDb: db,
				organizationId: ORG_ID,
				honoContext: makeHonoContext(),
			},
		);

		expect(result.name).toBe("KL Branch Updated");
		expect(mockUpdateHierarchyNode).toHaveBeenCalledTimes(1);
	});

	it("FORBIDDEN when nodeId is not in caller's accessibleNodeIds", async () => {
		const ctx = createStaffContext(); // accessibleNodeIds = [BRANCH_ID]
		const db = createMockTenantDb();
		const otherNodeId = "ffffffff-0000-4000-8000-999999999999";

		await expect(
			call(
				hierarchyRouter.updateNode,
				{ organizationId: ORG_ID, nodeId: otherNodeId, name: "Attempt rename" },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (needs hierarchy_management:update)", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				hierarchyRouter.updateNode,
				{ organizationId: ORG_ID, nodeId: BRANCH_ID, name: "New Name" },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("NOT_FOUND when updateHierarchyNode service throws not-found error", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		db.query.hierarchyNodes.findFirst.mockResolvedValueOnce(undefined);
		mockUpdateHierarchyNode.mockRejectedValueOnce(new Error("Node not found"));

		await expect(
			call(
				hierarchyRouter.updateNode,
				{ organizationId: ORG_ID, nodeId: BRANCH_ID, name: "Ghost" },
				{
					...ctx,
					accessibleNodeIds: [BRANCH_ID],
					tenantDb: db,
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const ctx = { ...createAdminContext(), tenantDb: null };

		await expect(
			call(
				hierarchyRouter.updateNode,
				{ organizationId: ORG_ID, nodeId: BRANCH_ID, name: "Name" },
				ctx,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

// ── deleteNode ────────────────────────────────────────────────────────────────

describe("hierarchyRouter.deleteNode", () => {
	beforeEach(() => {
		mockRequirePermission.mockClear();
		mockDeleteHierarchyNode.mockClear();
		mockGetDescendantNodeIds.mockClear();
	});

	it("happy path — admin deletes node, returns success:true", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		mockGetDescendantNodeIds.mockResolvedValueOnce([BRANCH_ID] as any);
		(db.query.hierarchyNodes as any).findMany = mock(() =>
			Promise.resolve([{ id: BRANCH_ID, type: "branch" }]),
		);

		const result = await call(
			hierarchyRouter.deleteNode,
			{ organizationId: ORG_ID, nodeId: BRANCH_ID },
			{
				...ctx,
				accessibleNodeIds: [BRANCH_ID],
				tenantDb: db,
				organizationId: ORG_ID,
				honoContext: makeHonoContext(),
			},
		);

		expect(result.success).toBe(true);
		expect(mockDeleteHierarchyNode).toHaveBeenCalledTimes(1);
	});

	it("FORBIDDEN when nodeId is not in caller's accessibleNodeIds", async () => {
		const ctx = createStaffContext(); // accessibleNodeIds = [BRANCH_ID]
		const db = createMockTenantDb();
		const alienNodeId = "ffffffff-0000-4000-8000-999999999999";

		await expect(
			call(
				hierarchyRouter.deleteNode,
				{ organizationId: ORG_ID, nodeId: alienNodeId },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("FORBIDDEN when requirePermission throws (needs hierarchy_management:delete)", async () => {
		mockRequirePermission.mockRejectedValueOnce(new Error("Permission denied"));
		const ctx = createStaffContext();
		const db = createMockTenantDb();

		await expect(
			call(
				hierarchyRouter.deleteNode,
				{ organizationId: ORG_ID, nodeId: BRANCH_ID },
				{ ...ctx, tenantDb: db, honoContext: makeHonoContext() },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("NOT_FOUND when deleteHierarchyNode service throws not-found error", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		mockGetDescendantNodeIds.mockResolvedValueOnce([]);
		mockDeleteHierarchyNode.mockRejectedValueOnce(new Error("Node not found"));

		await expect(
			call(
				hierarchyRouter.deleteNode,
				{ organizationId: ORG_ID, nodeId: BRANCH_ID },
				{
					...ctx,
					accessibleNodeIds: [BRANCH_ID],
					tenantDb: db,
					organizationId: ORG_ID,
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("CONFLICT when deleteHierarchyNode throws a child-node blocking error", async () => {
		const ctx = createAdminContext();
		const db = createMockTenantDb();
		mockGetDescendantNodeIds.mockResolvedValueOnce([]);
		mockDeleteHierarchyNode.mockRejectedValueOnce(
			new Error("Cannot delete: child node exists"),
		);

		await expect(
			call(
				hierarchyRouter.deleteNode,
				{
					organizationId: ORG_ID,
					nodeId: BRANCH_ID,
					options: { autoDeleteChildren: false },
				},
				{
					...ctx,
					accessibleNodeIds: [BRANCH_ID],
					tenantDb: db,
					organizationId: ORG_ID,
					honoContext: makeHonoContext(),
				},
			),
		).rejects.toMatchObject({ code: "CONFLICT" });
	});

	it("INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const ctx = { ...createAdminContext(), tenantDb: null };

		await expect(
			call(
				hierarchyRouter.deleteNode,
				{ organizationId: ORG_ID, nodeId: BRANCH_ID },
				ctx,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

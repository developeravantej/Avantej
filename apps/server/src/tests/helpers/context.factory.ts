import { createMockTenantDb } from "./db-mock.factory";

export type MockMember = {
	id: string;
	userId: string;
	organizationId: string;
	role: "admin" | "trainer" | "staff" | "client";
	status: "active" | "suspended" | "inactive";
	hierarchyScopeId: string | null;
};

export type MockContext = {
	tenantDb: ReturnType<typeof createMockTenantDb>;
	member: MockMember;
	organizationId: string;
	accessibleNodeIds: string[];
	session: { user: { id: string; email: string; name: string } };
};

const DEFAULT_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const DEFAULT_BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const DEFAULT_MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const DEFAULT_USER_ID = "cccccccc-0000-4000-8000-000000000001";

/**
 * Create a mock admin context (admin sees all nodes)
 */
export function createAdminContext(
	overrides: Partial<MockContext> = {},
): MockContext {
	return {
		tenantDb: createMockTenantDb(),
		organizationId: DEFAULT_ORG_ID,
		accessibleNodeIds: [], // Admin: empty means "all nodes"
		member: {
			id: DEFAULT_MEMBER_ID,
			userId: DEFAULT_USER_ID,
			organizationId: DEFAULT_ORG_ID,
			role: "admin",
			status: "active",
			hierarchyScopeId: null,
		},
		session: {
			user: { id: DEFAULT_USER_ID, email: "admin@test.com", name: "Test Admin" },
		},
		...overrides,
	};
}

/**
 * Create a mock staff context (staff sees only their scoped nodes)
 */
export function createStaffContext(
	overrides: Partial<MockContext> = {},
): MockContext {
	return {
		tenantDb: createMockTenantDb(),
		organizationId: DEFAULT_ORG_ID,
		accessibleNodeIds: [DEFAULT_BRANCH_NODE_ID],
		member: {
			id: "dddddddd-0000-4000-8000-000000000001",
			userId: "eeeeeeee-0000-4000-8000-000000000001",
			organizationId: DEFAULT_ORG_ID,
			role: "staff",
			status: "active",
			hierarchyScopeId: DEFAULT_BRANCH_NODE_ID,
		},
		session: {
			user: {
				id: "eeeeeeee-0000-4000-8000-000000000001",
				email: "staff@test.com",
				name: "Test Staff",
			},
		},
		...overrides,
	};
}

/**
 * Create a context with no tenant DB (to test DB-missing error handling)
 */
export function createContextWithNoDb(): Omit<MockContext, "tenantDb"> & {
	tenantDb: null;
} {
	const ctx = createAdminContext();
	return { ...ctx, tenantDb: null };
}

/**
 * Create a context with no member (to test FORBIDDEN path)
 */
export function createContextWithNoMember(): Omit<MockContext, "member"> & {
	member: null;
} {
	const ctx = createAdminContext();
	return { ...ctx, member: null };
}

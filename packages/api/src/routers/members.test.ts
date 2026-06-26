/**
 * Example test exercising the `members` router via the test harness in
 * `../test-utils/mock-context.ts`. Covers `retryGhlSync` because it has a
 * minimal mocking surface (one tenantDb null check + two honoContext lookups).
 *
 * This file is intentionally small — its purpose is to prove the harness is
 * usable. Per-procedure coverage will be added in follow-up tasks.
 */

import { describe, expect, it, mock } from "bun:test";
import { call, ORPCError } from "@orpc/server";
import { memberRouter } from "./members";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Build a stub tenantDb with only the surface that softDelete / restore
 * touch:
 *   - `query.members.findFirst` to load the target row.
 *   - chainable `update().set().where().returning()` returning a row.
 *
 * Tests that need to skip permission checks pass an admin member through
 * `createMockContext` (default), so `requirePermission` short-circuits via
 * its admin-priority bypass without hitting the role/permission tables.
 */
function buildSoftDeleteTenantDb({
	target,
	updatedRow,
}: {
	target: {
		id: string;
		hierarchyScopeId: string;
		deletedAt: Date | null;
	} | null;
	updatedRow: {
		id: string;
		hierarchyScopeId: string;
		deletedAt: Date | null;
	} | null;
}) {
	const updateBuilder = {
		set: mock(() => updateBuilder),
		where: mock(() => updateBuilder),
		returning: mock(() => Promise.resolve(updatedRow ? [updatedRow] : [])),
	};
	return {
		query: {
			members: {
				findFirst: mock(() => Promise.resolve(target)),
			},
			// `requirePermission` -> `hasPermission` looks up the member's role
			// row. Returning undefined triggers the fallback path that grants
			// access on `member.role === "admin"` — which is the default mock
			// member's role — without us having to seed permission rows.
			roles: {
				findFirst: mock(() => Promise.resolve(undefined)),
			},
		},
		update: mock(() => updateBuilder),
		select: mock(() => ({
			from: mock(() => ({ where: mock(() => Promise.resolve([])) })),
		})),
	} as unknown as never;
}

describe("memberRouter.retryGhlSync", () => {
	it("returns ghlSync error when GHL dispatcher binding is missing", async () => {
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb: {} as never,
			// no honoBindings — controlPanelDb + dispatchStaffSync absent
		});

		const result = await call(
			memberRouter.retryGhlSync,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(result).toEqual({
			ghlSync: {
				status: "error",
				error: "GHL sync not configured",
			},
		});
	});

	it("invokes dispatchStaffSync with operation=update and returns its result", async () => {
		const dispatchStaffSync = mock(() =>
			Promise.resolve({
				status: "synced" as const,
				ghlUserId: "ghl-user-123",
			}),
		);
		const controlPanelDb = { __marker: "cp-db" };
		const tenantDb = { __marker: "tenant-db" };

		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb: tenantDb as never,
			honoBindings: { controlPanelDb, dispatchStaffSync },
		});

		const result = await call(
			memberRouter.retryGhlSync,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(dispatchStaffSync).toHaveBeenCalledTimes(1);
		const arg = dispatchStaffSync.mock.calls[0][0] as {
			controlPanelDb: unknown;
			tenantDb: unknown;
			organizationId: string;
			memberId: string;
			operation: string;
		};
		expect(arg.controlPanelDb).toBe(controlPanelDb);
		expect(arg.tenantDb).toBe(tenantDb);
		expect(arg.organizationId).toBe(ORG_ID);
		expect(arg.memberId).toBe(MEMBER_ID);
		expect(arg.operation).toBe("update");
		expect(result).toEqual({
			ghlSync: { status: "synced", ghlUserId: "ghl-user-123" },
		});
	});

	it("wraps dispatcher rejections into a ghlSync error result", async () => {
		const dispatchStaffSync = mock(() => Promise.reject(new Error("boom")));
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb: {} as never,
			honoBindings: {
				controlPanelDb: {},
				dispatchStaffSync,
			},
		});

		const result = await call(
			memberRouter.retryGhlSync,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(result).toEqual({
			ghlSync: { status: "error", error: "boom" },
		});
	});

	it("throws INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb: undefined,
		});

		await expect(
			call(
				memberRouter.retryGhlSync,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ context },
			),
		).rejects.toBeInstanceOf(ORPCError);
	});
});

describe("memberRouter.softDelete", () => {
	it("stamps deletedAt and returns { ok, memberId } — no GHL dispatch", async () => {
		const now = new Date();
		const tenantDb = buildSoftDeleteTenantDb({
			target: {
				id: MEMBER_ID,
				hierarchyScopeId: "node-root",
				deletedAt: null,
			},
			updatedRow: {
				id: MEMBER_ID,
				hierarchyScopeId: "node-root",
				deletedAt: now,
			},
		});

		// Spy on dispatcher to assert it's never called (GHL no-op).
		const dispatchStaffSync = mock(() =>
			Promise.resolve({ status: "synced" as const }),
		);

		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			honoBindings: { controlPanelDb: {}, dispatchStaffSync },
		});

		const result = await call(
			memberRouter.softDelete,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(result).toEqual({ ok: true, memberId: MEMBER_ID });
		expect(dispatchStaffSync).not.toHaveBeenCalled();
	});

	it("throws NOT_FOUND when the target member doesn't exist", async () => {
		const tenantDb = buildSoftDeleteTenantDb({
			target: null,
			updatedRow: null,
		});

		const context = createMockContext({ organizationId: ORG_ID, tenantDb });

		await expect(
			call(
				memberRouter.softDelete,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ context },
			),
		).rejects.toBeInstanceOf(ORPCError);
	});

	it("throws INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb: undefined,
		});

		await expect(
			call(
				memberRouter.softDelete,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ context },
			),
		).rejects.toBeInstanceOf(ORPCError);
	});
});

describe("memberRouter.restore", () => {
	it("clears deletedAt and returns { ok, memberId } — no GHL dispatch", async () => {
		const previously = new Date(Date.now() - 60_000);
		const tenantDb = buildSoftDeleteTenantDb({
			target: {
				id: MEMBER_ID,
				hierarchyScopeId: "node-root",
				deletedAt: previously,
			},
			updatedRow: {
				id: MEMBER_ID,
				hierarchyScopeId: "node-root",
				deletedAt: null,
			},
		});

		const dispatchStaffSync = mock(() =>
			Promise.resolve({ status: "synced" as const }),
		);

		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			honoBindings: { controlPanelDb: {}, dispatchStaffSync },
		});

		const result = await call(
			memberRouter.restore,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(result).toEqual({ ok: true, memberId: MEMBER_ID });
		expect(dispatchStaffSync).not.toHaveBeenCalled();
	});

	it("throws BAD_REQUEST 'not-deleted' when member is not soft-deleted", async () => {
		const tenantDb = buildSoftDeleteTenantDb({
			target: {
				id: MEMBER_ID,
				hierarchyScopeId: "node-root",
				deletedAt: null,
			},
			updatedRow: null,
		});

		const context = createMockContext({ organizationId: ORG_ID, tenantDb });

		await expect(
			call(
				memberRouter.restore,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ context },
			),
		).rejects.toMatchObject({
			message: "not-deleted",
		});
	});

	it("throws NOT_FOUND when the target member doesn't exist", async () => {
		const tenantDb = buildSoftDeleteTenantDb({
			target: null,
			updatedRow: null,
		});

		const context = createMockContext({ organizationId: ORG_ID, tenantDb });

		await expect(
			call(
				memberRouter.restore,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ context },
			),
		).rejects.toBeInstanceOf(ORPCError);
	});
});

// --- members.newToday branch-scope guard (tenant isolation) ---

const IN_SCOPE_BRANCH = "33333333-3333-4333-8333-333333333333";
const OUT_OF_SCOPE_BRANCH = "44444444-4444-4444-8444-444444444444";

/**
 * Build a tenantDb covering exactly what `getMembersNewToday` touches:
 *   - `select().from().where()` (count query) -> resolves to [{ cnt }]
 *   - `select().from().where().orderBy().limit()` (recent query) -> rows
 *   - `query.roles.findFirst` for the requirePermission admin-bypass path.
 *
 * The same `select` stub backs both queries; `where()` returns a thenable that
 * also exposes `orderBy().limit()`, so both Promise.all branches resolve.
 */
function buildNewTodayTenantDb() {
	const recentRows = [
		{
			id: MEMBER_ID,
			userId: "user-1",
			joinedAt: new Date(),
		},
	];
	const countRows = [{ cnt: 1 }];

	const whereResult: Record<string, unknown> = {
		orderBy: mock(() => ({
			limit: mock(() => Promise.resolve(recentRows)),
		})),
		// count query awaits `.where(...)` directly — make it a thenable.
		then: (resolve: (v: unknown) => unknown) => resolve(countRows),
	};
	const selectBuilder = {
		from: mock(() => ({ where: mock(() => whereResult) })),
	};

	return {
		query: {
			roles: {
				findFirst: mock(() => Promise.resolve(undefined)),
			},
		},
		select: mock(() => selectBuilder),
	} as unknown as never;
}

describe("memberRouter.newToday", () => {
	it("throws FORBIDDEN when branchId is outside the caller's accessibleNodeIds", async () => {
		const tenantDb = buildNewTodayTenantDb();
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			// Admin role so requirePermission (admin-bypass via the undefined
			// roles.findFirst fallback) passes and the NEW branch guard — which has
			// no admin bypass — is the deciding factor. accessibleNodeIds is scoped
			// to IN_SCOPE_BRANCH so OUT_OF_SCOPE_BRANCH is rejected by the guard.
			member: {
				id: "member-test-1",
				userId: "user-test-1",
				role: "admin" as const,
				status: "active" as const,
				hierarchyScopeId: IN_SCOPE_BRANCH,
			},
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});

		await expect(
			call(
				memberRouter.newToday,
				{ organizationId: ORG_ID, branchId: OUT_OF_SCOPE_BRANCH },
				{ context },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("allows an in-scope branchId", async () => {
		const tenantDb = buildNewTodayTenantDb();
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			member: {
				id: "member-test-1",
				userId: "user-test-1",
				role: "admin" as const,
				status: "active" as const,
				hierarchyScopeId: IN_SCOPE_BRANCH,
			},
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});

		const result = await call(
			memberRouter.newToday,
			{ organizationId: ORG_ID, branchId: IN_SCOPE_BRANCH },
			{ context },
		);

		expect(result.count).toBe(1);
		expect(result.recent).toHaveLength(1);
	});

	it("allows admin with no branchId (guard short-circuits)", async () => {
		const tenantDb = buildNewTodayTenantDb();
		const context = createMockContext({
			organizationId: ORG_ID,
			tenantDb,
			// default admin member. accessibleNodeIds is non-empty so the handler's
			// resolveAccessibleNodeIds short-circuits instead of walking the
			// (unstubbed) hierarchy CTE. With no branchId the new guard is a no-op.
			accessibleNodeIds: [IN_SCOPE_BRANCH],
		});

		const result = await call(
			memberRouter.newToday,
			{ organizationId: ORG_ID },
			{ context },
		);

		expect(result.count).toBe(1);
	});
});

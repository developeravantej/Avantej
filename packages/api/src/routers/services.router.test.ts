/**
 * Services Router — unit tests for create, update, delete (soft-delete via isActive).
 *
 * Permission fast-path: when `roles.findFirst` returns undefined the permission
 * service falls back to `member.role === "admin"` → always passes.
 * Permission denied path: return a role with priority 50 (< 100) so the RBAC
 * table check runs and fails when no rolePermission row exists.
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import { call } from "@orpc/server";
import { servicesRouter } from "./services";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SERVICE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// A role stub whose priority < 100 so requirePermission falls through to
// the permissions table (which will be empty) and denies access.
const LOW_PRIORITY_ROLE = { id: "role-staff", name: "staff", priority: 50 };

function makeAdminDb(overrides: Record<string, unknown> = {}) {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			installmentPlans: { findFirst: mock(() => Promise.resolve(undefined)) },
			services: { findFirst: mock(() => Promise.resolve(null)) },
			...overrides,
		},
		insert: mock(() => ({
			values: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({
					returning: mock(() => Promise.resolve([])),
				})),
			})),
		})),
		select: mock(() => ({
			from: mock(() => ({
				where: mock(() => Promise.resolve([])),
			})),
		})),
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
	} as unknown as never;
}

function makeStaffDb() {
	// role.priority = 50 → passes role lookup, fails permission check
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(LOW_PRIORITY_ROLE)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			installmentPlans: { findFirst: mock(() => Promise.resolve(undefined)) },
			services: { findFirst: mock(() => Promise.resolve(null)) },
		},
		insert: mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([])) })) })),
		update: mock(() => ({ set: mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) })) })),
		select: mock(() => ({ from: mock(() => ({ where: mock(() => Promise.resolve([])) })) })),
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
	} as unknown as never;
}

// ─── create ──────────────────────────────────────────────────────────────────

describe("servicesRouter.create", () => {
	const validInput = {
		organizationId: ORG_ID,
		name: "Personal Training",
		duration: 60,
		maxAttendees: 1,
	};

	it("happy path: delegates to createService and returns result", async () => {
		const createdRow = { id: SERVICE_ID, name: "Personal Training", isActive: true };
		const returningMock = mock(() => Promise.resolve([createdRow]));
		const tenantDb = makeAdminDb();
		// Wire insert chain to return the created row
		(tenantDb as any).insert = mock(() => ({
			values: mock(() => ({ returning: returningMock })),
		}));

		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: [BRANCH_ID],
		});

		const result = await call(servicesRouter.create, validInput, { context: ctx });
		expect(result).toMatchObject({ id: SERVICE_ID, name: "Personal Training" });
	});

	it("rejects when tenantDb is null", async () => {
		const ctx = createMockContext({ tenantDb: null });
		await expect(
			call(servicesRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("rejects when member is missing", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb(), member: null });
		await expect(
			call(servicesRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when caller lacks service_management:create permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: { id: "m1", userId: "u1", role: "staff", status: "active", hierarchyScopeId: null },
		});
		await expect(
			call(servicesRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when branchId is outside caller's accessible nodes", async () => {
		const tenantDb = makeAdminDb();
		const ctx = createMockContext({
			tenantDb,
			accessibleNodeIds: ["other-node"],
		});
		await expect(
			call(servicesRouter.create, { ...validInput, branchId: BRANCH_ID }, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when an installment plan code is unknown", async () => {
		const tenantDb = makeAdminDb({
			installmentPlans: { findFirst: mock(() => Promise.resolve(undefined)) },
		});
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		await expect(
			call(servicesRouter.create, { ...validInput, availablePaymentPlans: ["UNKNOWN_PLAN"] }, { context: ctx }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("validates name must not be empty", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(servicesRouter.create, { ...validInput, name: "" }, { context: ctx }),
		).rejects.toBeDefined();
	});
});

// ─── update ──────────────────────────────────────────────────────────────────

describe("servicesRouter.update", () => {
	const existingService = {
		id: SERVICE_ID,
		name: "Old Name",
		branchId: null,
		isActive: true,
	};

	it("happy path: finds service then calls updateService", async () => {
		const updatedRow = { ...existingService, name: "New Name" };
		const returningMock = mock(() => Promise.resolve([updatedRow]));
		const tenantDb = makeAdminDb({
			services: { findFirst: mock(() => Promise.resolve(existingService)) },
		});
		(tenantDb as any).update = mock(() => ({
			set: mock(() => ({
				where: mock(() => ({ returning: returningMock })),
			})),
		}));

		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		const result = await call(
			servicesRouter.update,
			{ organizationId: ORG_ID, id: SERVICE_ID, name: "New Name" },
			{ context: ctx },
		);
		expect(result).toMatchObject({ name: "New Name" });
	});

	it("throws NOT_FOUND when service does not exist", async () => {
		const tenantDb = makeAdminDb({
			services: { findFirst: mock(() => Promise.resolve(null)) },
		});
		const ctx = createMockContext({ tenantDb });
		await expect(
			call(servicesRouter.update, { organizationId: ORG_ID, id: SERVICE_ID }, { context: ctx }),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("throws FORBIDDEN when caller lacks update permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: { id: "m1", userId: "u1", role: "staff", status: "active", hierarchyScopeId: null },
		});
		await expect(
			call(servicesRouter.update, { organizationId: ORG_ID, id: SERVICE_ID }, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("throws FORBIDDEN when existing service branch is inaccessible", async () => {
		const svcInOtherBranch = { ...existingService, branchId: "other-branch" };
		const tenantDb = makeAdminDb({
			services: { findFirst: mock(() => Promise.resolve(svcInOtherBranch)) },
		});
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [BRANCH_ID] });
		await expect(
			call(servicesRouter.update, { organizationId: ORG_ID, id: SERVICE_ID }, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects an unknown installment plan on update", async () => {
		const tenantDb = makeAdminDb({
			services: { findFirst: mock(() => Promise.resolve(existingService)) },
			installmentPlans: { findFirst: mock(() => Promise.resolve(undefined)) },
		});
		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		await expect(
			call(servicesRouter.update, {
				organizationId: ORG_ID,
				id: SERVICE_ID,
				availablePaymentPlans: ["GHOST_PLAN"],
			}, { context: ctx }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});

// ─── "delete" — soft-delete via update.isActive = false ──────────────────────
// The services router does not expose a hard-delete procedure; callers soft-delete
// by calling update with isActive: false. This test confirms the update path
// handles that case and returns the deactivated row.

describe("servicesRouter.update (soft-delete via isActive=false)", () => {
	it("returns deactivated service when isActive is set to false", async () => {
		const activeService = { id: SERVICE_ID, name: "PT", branchId: null, isActive: true };
		const deactivatedRow = { ...activeService, isActive: false };
		const returningMock = mock(() => Promise.resolve([deactivatedRow]));
		const tenantDb = makeAdminDb({
			services: { findFirst: mock(() => Promise.resolve(activeService)) },
		});
		(tenantDb as any).update = mock(() => ({
			set: mock(() => ({ where: mock(() => ({ returning: returningMock })) })),
		}));

		const ctx = createMockContext({ tenantDb, accessibleNodeIds: [] });
		const result = await call(
			servicesRouter.update,
			{ organizationId: ORG_ID, id: SERVICE_ID, isActive: false },
			{ context: ctx },
		);
		expect(result).toMatchObject({ isActive: false });
	});
});

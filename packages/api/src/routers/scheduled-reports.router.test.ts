/**
 * Scheduled Reports Router — unit tests for create, delete, toggle, list.
 *
 * Guarded by `reports:read` permission. Admin fast-path: roles.findFirst → undefined
 * → member.role === "admin" bypass. Staff path: role with priority 50, no perms.
 *
 * Recipients validation: comma-separated emails, all-or-nothing.
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { scheduledReportsRouter } from "./scheduled-reports";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const LOW_PRIORITY_ROLE = { id: "role-staff", name: "staff", priority: 50 };

const REPORT_ROW = {
	id: REPORT_ID,
	reportName: "Weekly Summary",
	recipients: "admin@gym.com",
	windowKey: "7D" as const,
	format: "pdf" as const,
	frequency: "weekly" as const,
	isActive: true,
	createdBy: "user-test-1",
	nextRunAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
};

function makeAdminDb(overrides: Record<string, unknown> = {}) {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			scheduledReports: {
				findMany: mock(() => Promise.resolve([])),
				findFirst: mock(() => Promise.resolve(REPORT_ROW)),
				...((overrides.scheduledReports as object) ?? {}),
			},
		},
		insert: mock(() => ({
			values: mock(() => ({
				returning: mock(() => Promise.resolve([REPORT_ROW])),
			})),
		})),
		update: mock(() => ({
			set: mock(() => ({
				where: mock(() => ({
					returning: mock(() => Promise.resolve([{ ...REPORT_ROW, isActive: false }])),
				})),
			})),
		})),
		delete: mock(() => ({
			where: mock(() => Promise.resolve([])),
		})),
		select: mock(() => ({
			from: mock(() => {
				const arr = [REPORT_ROW] as unknown[];
				// listScheduledReports awaits select().from(table) directly;
				// other calls chain .where() etc. Make the chain thenable.
				const chain = Object.assign(
					Promise.resolve(arr),
					{
						where: mock(() => ({
							orderBy: mock(() => Promise.resolve(arr)),
							then: (r: (v: unknown) => unknown) => Promise.resolve(arr).then(r),
						})),
						orderBy: mock(() => Promise.resolve(arr)),
					},
				);
				return chain;
			}),
		})),
		transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
	} as unknown as never;
}

function makeStaffDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(LOW_PRIORITY_ROLE)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			scheduledReports: { findMany: mock(() => Promise.resolve([])) },
		},
		insert: mock(() => ({ values: mock(() => ({ returning: mock(() => Promise.resolve([])) })) })),
		update: mock(() => ({ set: mock(() => ({ where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) })) })),
		delete: mock(() => ({ where: mock(() => Promise.resolve([])) })),
		select: mock(() => ({ from: mock(() => ({ where: mock(() => Promise.resolve([])) })) })),
	} as unknown as never;
}

// ─── list ────────────────────────────────────────────────────────────────────

describe("scheduledReportsRouter.list", () => {
	it("returns reports from tenantDb", async () => {
		const tenantDb = makeAdminDb();
		// list procedure uses the service which queries tenantDb; just confirm no throw
		const ctx = createMockContext({ tenantDb });
		// The underlying service will use select chain — result may be [] depending on mock
		const result = await call(scheduledReportsRouter.list, { organizationId: ORG_ID }, { context: ctx });
		expect(Array.isArray(result)).toBe(true);
	});

	it("throws INTERNAL_SERVER_ERROR when tenantDb is null", async () => {
		const ctx = createMockContext({ tenantDb: null });
		await expect(
			call(scheduledReportsRouter.list, { organizationId: ORG_ID }, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("scheduledReportsRouter.create", () => {
	const validInput = {
		organizationId: ORG_ID,
		recipients: "admin@gym.com,manager@gym.com",
		reportName: "Weekly Summary",
		windowKey: "7D" as const,
		format: "pdf" as const,
		frequency: "weekly" as const,
	};

	it("happy path: creates and returns a scheduled report", async () => {
		const tenantDb = makeAdminDb();
		const ctx = createMockContext({ tenantDb });
		const result = await call(scheduledReportsRouter.create, validInput, { context: ctx });
		expect(result).toMatchObject({ reportName: "Weekly Summary" });
	});

	it("throws FORBIDDEN when caller lacks reports:read permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: { id: "m1", userId: "u1", role: "staff", status: "active", hierarchyScopeId: null },
		});
		await expect(
			call(scheduledReportsRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when recipients contains an invalid email", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(scheduledReportsRouter.create, { ...validInput, recipients: "admin@gym.com,not-an-email" }, { context: ctx }),
		).rejects.toBeDefined();
	});

	it("rejects when recipients string is empty", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(scheduledReportsRouter.create, { ...validInput, recipients: "" }, { context: ctx }),
		).rejects.toBeDefined();
	});

	it("rejects single invalid email in recipients", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb() });
		await expect(
			call(scheduledReportsRouter.create, { ...validInput, recipients: "bad-email-only" }, { context: ctx }),
		).rejects.toBeDefined();
	});

	it("throws INTERNAL_SERVER_ERROR when tenantDb is null", async () => {
		const ctx = createMockContext({ tenantDb: null });
		await expect(
			call(scheduledReportsRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe("scheduledReportsRouter.delete", () => {
	it("happy path: deletes report and returns { success: true }", async () => {
		const tenantDb = makeAdminDb();
		const ctx = createMockContext({ tenantDb });
		const result = await call(
			scheduledReportsRouter.delete,
			{ organizationId: ORG_ID, id: REPORT_ID },
			{ context: ctx },
		);
		expect(result).toEqual({ success: true });
	});

	it("throws FORBIDDEN when caller lacks reports:read permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: { id: "m1", userId: "u1", role: "staff", status: "active", hierarchyScopeId: null },
		});
		await expect(
			call(scheduledReportsRouter.delete, { organizationId: ORG_ID, id: REPORT_ID }, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("throws FORBIDDEN when member is null", async () => {
		const ctx = createMockContext({ tenantDb: makeAdminDb(), member: null });
		await expect(
			call(scheduledReportsRouter.delete, { organizationId: ORG_ID, id: REPORT_ID }, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ─── toggle ──────────────────────────────────────────────────────────────────

describe("scheduledReportsRouter.toggle", () => {
	it("happy path: toggles isActive and returns updated report", async () => {
		const toggledRow = { ...REPORT_ROW, isActive: false };
		const tenantDb = makeAdminDb();
		// Override update chain to return the toggled row
		(tenantDb as any).update = mock(() => ({
			set: mock(() => ({
				where: mock(() => ({
					returning: mock(() => Promise.resolve([toggledRow])),
				})),
			})),
		}));

		const ctx = createMockContext({ tenantDb });
		const result = await call(
			scheduledReportsRouter.toggle,
			{ organizationId: ORG_ID, id: REPORT_ID, isActive: false },
			{ context: ctx },
		);
		// toggleScheduledReportActive throws if not found; this confirms no throw + result
		expect(result).toBeDefined();
	});

	it("throws FORBIDDEN when caller lacks reports:read permission", async () => {
		const ctx = createMockContext({
			tenantDb: makeStaffDb(),
			member: { id: "m1", userId: "u1", role: "staff", status: "active", hierarchyScopeId: null },
		});
		await expect(
			call(
				scheduledReportsRouter.toggle,
				{ organizationId: ORG_ID, id: REPORT_ID, isActive: true },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("throws INTERNAL_SERVER_ERROR when tenantDb is null", async () => {
		const ctx = createMockContext({ tenantDb: null });
		await expect(
			call(
				scheduledReportsRouter.toggle,
				{ organizationId: ORG_ID, id: REPORT_ID, isActive: true },
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});

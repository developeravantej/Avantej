/**
 * commission-splits analytics — branch-scope guard on hierarchyNodeId.
 *
 * liabilitySummary and exportLiabilityCsv accept an optional hierarchyNodeId.
 * Before the fix, that node was passed straight to the service with no RBAC
 * check, so a caller could read another branch's commission liability by
 * naming a node outside their accessibleNodeIds. The fix mirrors
 * liabilityByStaff: guardBranchAccessible(input.hierarchyNodeId, ...).
 *
 * The default mock member is role:"admin", which bypasses the permission gate
 * (permission.service.ts: `member.role === "admin"`), so these calls reach the
 * branch guard. The service is mocked so the in-scope path resolves cleanly.
 *
 * Run: cd packages/api && bun test src/routers/commission-splits/analytics.procedures.test.ts
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { createMockContext } from "../../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const IN_SCOPE_NODE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OUT_OF_SCOPE_NODE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const EMPTY_SUMMARY = {
	trainers: [],
	totals: {
		approvedUnpaidCents: 0,
		paidCents: 0,
		manualAdjustmentCents: 0,
		netPayableCents: 0,
		byRoleType: {},
	},
};

const mockLiabilitySummary = mock(() => Promise.resolve(EMPTY_SUMMARY));
const mockExportLiabilityCsv = mock(() =>
	Promise.resolve({ csv: "", rowCount: 0 }),
);

mock.module("@avantej-core/services/commission-splits.service", () => ({
	liabilitySummary: mockLiabilitySummary,
	liabilityByStaff: mock(() =>
		Promise.resolve({ rows: [], totalCount: 0, hasMore: false }),
	),
	exportLiabilityCsv: mockExportLiabilityCsv,
}));

import { commissionSplitsAnalyticsProcedures } from "./analytics.procedures";

// Role/permission lookups all miss → hasPermission() falls back to the
// `member.role === "admin"` rule (default mock member is admin), so the
// OR-permission gate passes and execution reaches the branch guard.
function makeAdminDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			rolePermissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

// The procedures call getControlPanelDb(context), which reads
// honoContext.get("controlPanelDb"). For the positive (in-scope / empty-scope)
// cases that reach past the branch guard into the service, supply a stub CP DB
// so getControlPanelDb does not throw before the (mocked) service runs.
const CP_DB_BINDINGS = { controlPanelDb: {} };

const VALID_RANGE = {
	from: "2026-01-01T00:00:00.000Z",
	to: "2026-01-31T23:59:59.000Z",
};

describe("commissionSplitsAnalytics.liabilitySummary — hierarchyNodeId branch scope", () => {
	it("rejects a hierarchyNodeId outside accessibleNodeIds with FORBIDDEN", async () => {
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
		});

		await expect(
			call(
				commissionSplitsAnalyticsProcedures.liabilitySummary,
				{
					organizationId: ORG_ID,
					...VALID_RANGE,
					hierarchyNodeId: OUT_OF_SCOPE_NODE,
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockLiabilitySummary).not.toHaveBeenCalled();
	});

	it("delegates to the service when hierarchyNodeId is in scope", async () => {
		mockLiabilitySummary.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
			honoBindings: CP_DB_BINDINGS,
		});

		await call(
			commissionSplitsAnalyticsProcedures.liabilitySummary,
			{
				organizationId: ORG_ID,
				...VALID_RANGE,
				hierarchyNodeId: IN_SCOPE_NODE,
			},
			{ context: ctx },
		);
		expect(mockLiabilitySummary).toHaveBeenCalledTimes(1);
	});

	it("delegates when accessibleNodeIds is empty (admin org-wide bypass)", async () => {
		mockLiabilitySummary.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [],
			honoBindings: CP_DB_BINDINGS,
		});

		await call(
			commissionSplitsAnalyticsProcedures.liabilitySummary,
			{
				organizationId: ORG_ID,
				...VALID_RANGE,
				hierarchyNodeId: IN_SCOPE_NODE,
			},
			{ context: ctx },
		);
		expect(mockLiabilitySummary).toHaveBeenCalledTimes(1);
	});
});

describe("commissionSplitsAnalytics.exportLiabilityCsv — hierarchyNodeId branch scope", () => {
	it("rejects a hierarchyNodeId outside accessibleNodeIds with FORBIDDEN", async () => {
		mockExportLiabilityCsv.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
		});

		await expect(
			call(
				commissionSplitsAnalyticsProcedures.exportLiabilityCsv,
				{
					organizationId: ORG_ID,
					...VALID_RANGE,
					hierarchyNodeId: OUT_OF_SCOPE_NODE,
				},
				{ context: ctx },
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(mockExportLiabilityCsv).not.toHaveBeenCalled();
	});

	it("delegates to the service when hierarchyNodeId is in scope", async () => {
		mockExportLiabilityCsv.mockClear();
		const ctx = createMockContext({
			tenantDb: makeAdminDb(),
			organizationId: ORG_ID,
			accessibleNodeIds: [IN_SCOPE_NODE],
			honoBindings: CP_DB_BINDINGS,
		});

		await call(
			commissionSplitsAnalyticsProcedures.exportLiabilityCsv,
			{
				organizationId: ORG_ID,
				...VALID_RANGE,
				hierarchyNodeId: IN_SCOPE_NODE,
			},
			{ context: ctx },
		);
		expect(mockExportLiabilityCsv).toHaveBeenCalledTimes(1);
	});
});

/**
 * Unit tests for audit-log.service.ts
 *
 * Covers:
 * - 1.19: severity filter (3 cases: danger, warning, info)
 * - 1.20: CSV export truncation cap
 * - 1.21 / 1.22: Covered at router level; service does not own scope filtering
 * - 1.37: Actor enrichment with missing control-panel user (graceful null)
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { deriveSeverity } from "@avantej-core/services/audit-log.service";
import type { AuditSeverity } from "@avantej-core/services/audit-log.service";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { randomUUID } from "crypto";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeAuditRow(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: randomUUID(),
		actorUserId: "user-1",
		actorMemberId: null,
		actorRole: "admin",
		action: "sale.create",
		entityType: "sale",
		entityId: null,
		branchId: "branch-1",
		summary: "Sale created",
		changes: null,
		ipAddress: null,
		userAgent: null,
		createdAt: new Date("2026-05-14T00:00:00.000Z"),
		...overrides,
	};
}

// Mock control panel DB that returns name lookups
function makeControlPanelDb(
	users: { id: string; name: string }[] = [],
): Record<string, unknown> {
	return {
		query: {
			user: {
				findMany: mock(() => Promise.resolve(users)),
			},
		},
	};
}

// The shared createMockTenantDb() factory does not register an `auditLogs`
// query table (audit-log.service uses tenantDb.query.auditLogs.findMany). We
// cannot edit the shared helper, so attach a mock findMany here per test.
function attachAuditLogsQuery(
	mockTenantDb: ReturnType<typeof createMockTenantDb>,
) {
	mockTenantDb.query.auditLogs = {
		findMany: mock(() => Promise.resolve([])),
	};
	return mockTenantDb.query.auditLogs.findMany;
}

// ─── 1.19 severity mapping ───────────────────────────────────────────────────

describe("deriveSeverity", () => {
	test("maps danger actions correctly", () => {
		const dangerActions = [
			"refund.approve",
			"refund.approve.partial",
			"sale.void",
			"role.delete",
			"commission.void",
			"member.deactivate",
			"package.terminate",
			"email_domain.deleted",
		];
		for (const action of dangerActions) {
			expect(deriveSeverity(action)).toBe<AuditSeverity>("danger");
		}
	});

	test("maps warning actions correctly", () => {
		const warningActions = [
			"refund.reject",
			"sale.update",
			"commission.mark_paid",
			"role.update",
			"member.update",
		];
		for (const action of warningActions) {
			expect(deriveSeverity(action)).toBe<AuditSeverity>("warning");
		}
	});

	test("maps everything else to info", () => {
		const infoActions = [
			"sale.create",
			"member.suspend",
			"checkin.create",
			"appointment.created",
			"promotion.create",
			"email_domain.registered",
			"unknown.action",
		];
		for (const action of infoActions) {
			expect(deriveSeverity(action)).toBe<AuditSeverity>("info");
		}
	});
});

// ─── 1.37 actor enrichment ───────────────────────────────────────────────────

describe("listAudit — actor enrichment", () => {
	let mockTenantDb: ReturnType<typeof createMockTenantDb>;

	beforeEach(() => {
		mockTenantDb = createMockTenantDb();
		attachAuditLogsQuery(mockTenantDb);
	});

	test("enriches actor name and initials from control panel DB", async () => {
		const row = makeAuditRow({ actorUserId: "user-1" });
		// Both calls to findMany (rows + count) return the row
		mockTenantDb.query.auditLogs.findMany
			.mockResolvedValueOnce([row]) // page rows
			.mockResolvedValueOnce([{ id: row.id }]); // count query

		const cpDb = makeControlPanelDb([{ id: "user-1", name: "Alice Smith" }]);

		const { listAudit } = await import(
			"@avantej-core/services/audit-log.service"
		);

		const result = await listAudit(cpDb as any, mockTenantDb, {
			accessibleNodeIds: ["branch-1"],
		});

		expect(result.rows).toHaveLength(1);
		const firstRow = result.rows[0]!;
		expect(firstRow.actorName).toBe("Alice Smith");
		expect(firstRow.actorInitials).toBe("AS");
	});

	test("returns null actorName and actorInitials when user not found in control panel", async () => {
		const row = makeAuditRow({ actorUserId: "user-unknown" });
		mockTenantDb.query.auditLogs.findMany
			.mockResolvedValueOnce([row])
			.mockResolvedValueOnce([{ id: row.id }]);

		// CP returns empty — user not found
		const cpDb = makeControlPanelDb([]);

		const { listAudit } = await import(
			"@avantej-core/services/audit-log.service"
		);

		const result = await listAudit(cpDb as any, mockTenantDb, {
			accessibleNodeIds: ["branch-1"],
		});

		const row0 = result.rows[0]!;
		expect(row0.actorName).toBeNull();
		expect(row0.actorInitials).toBeNull();
	});

	test("uses ONE batch lookup per page — not per row", async () => {
		const rows = [
			makeAuditRow({ actorUserId: "user-1" }),
			makeAuditRow({ actorUserId: "user-2" }),
			makeAuditRow({ actorUserId: "user-1" }), // duplicate
		];
		mockTenantDb.query.auditLogs.findMany
			.mockResolvedValueOnce(rows)
			.mockResolvedValueOnce(rows.map((r) => ({ id: r.id })));

		const findManyMock = mock(() => Promise.resolve([]));
		const cpDb = {
			query: { user: { findMany: findManyMock } },
		};

		const { listAudit } = await import(
			"@avantej-core/services/audit-log.service"
		);

		await listAudit(cpDb as any, mockTenantDb, {
			accessibleNodeIds: ["branch-1"],
		});

		// Should be called exactly once (batch), not 3 times (per row)
		expect(findManyMock).toHaveBeenCalledTimes(1);
	});
});

// ─── 1.20 CSV export cap / truncation ────────────────────────────────────────

describe("exportAuditCsv — cap and truncation", () => {
	test("sets truncated=false when total < 50_000", async () => {
		const rows = Array.from({ length: 5 }, () => makeAuditRow());
		const mockTenantDb = createMockTenantDb();
		const findMany = attachAuditLogsQuery(mockTenantDb);
		// exportAuditCsv calls listAudit, which issues TWO findMany calls per
		// invocation: (1) page rows, then (2) an id-only count scan. The `total`
		// it returns comes from the SECOND call. The first listAudit (count pass)
		// therefore needs its 2nd call to report 5 rows; the chunk-fetch listAudit
		// then returns the 5 page rows and an empty count so the loop exits.
		findMany
			.mockResolvedValueOnce([]) // count-pass: page rows (limit 1, unused)
			.mockResolvedValueOnce(rows.map((r) => ({ id: r.id }))) // count-pass: count -> total=5
			.mockResolvedValueOnce(rows) // chunk: page rows
			.mockResolvedValue([]); // chunk: count (and any further calls)

		const cpDb = makeControlPanelDb([]);

		const { exportAuditCsv } = await import(
			"@avantej-core/services/audit-log.service"
		);

		const result = await exportAuditCsv(cpDb as any, mockTenantDb, {
			accessibleNodeIds: ["branch-1"],
		});

		expect(result.truncated).toBe(false);
		expect(result.totalMatching).toBe(5);
		// CSV starts with the service's header row (id,createdAt,...)
		expect(result.csv).toContain("id,createdAt");
	});

	test("sets truncated=true and totalMatching > 50_000 when capped", async () => {
		// Simulate 50_001 total matching rows. truncated=true is only set when the
		// chunk loop actually fills up to the hard cap (50_000) AND total exceeds it,
		// so the page-fetch must keep returning full chunks rather than going empty.
		const mockTenantDb = createMockTenantDb();
		attachAuditLogsQuery(mockTenantDb);
		// listAudit issues two findMany shapes: the count scan passes
		// `columns: { id: true }` with no `limit`; the page fetch passes `limit`.
		// Distinguish on that to return the right payload.
		mockTenantDb.query.auditLogs.findMany = mock((args: any) => {
			if (args?.limit === undefined) {
				// count scan -> report 50_001 matching rows
				return Promise.resolve(
					Array.from({ length: 50_001 }, () => ({ id: randomUUID() })),
				);
			}
			// page fetch -> return a full chunk of valid audit rows
			return Promise.resolve(
				Array.from({ length: args.limit }, () => makeAuditRow()),
			);
		});

		const cpDb = makeControlPanelDb([]);

		const { exportAuditCsv } = await import(
			"@avantej-core/services/audit-log.service"
		);

		const result = await exportAuditCsv(cpDb as any, mockTenantDb, {
			accessibleNodeIds: ["branch-1"],
		});

		expect(result.truncated).toBe(true);
		expect(result.totalMatching).toBe(50_001);
	});

	test("CSV contains expected headers", async () => {
		const mockTenantDb = createMockTenantDb();
		const findMany = attachAuditLogsQuery(mockTenantDb);
		findMany.mockResolvedValue([]);

		const cpDb = makeControlPanelDb([]);

		const { exportAuditCsv } = await import(
			"@avantej-core/services/audit-log.service"
		);

		const result = await exportAuditCsv(cpDb as any, mockTenantDb, {
			accessibleNodeIds: [],
		});

		// Header row matches the service's CSV_HEADERS exactly.
		const firstLine = result.csv.split("\n")[0];
		expect(firstLine).toBe(
			"id,createdAt,actorUserId,actorName,actorRole,action,severity,entityType,entityId,branchId,summary,ipAddress",
		);
	});
});

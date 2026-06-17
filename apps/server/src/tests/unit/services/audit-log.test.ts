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
		// Count query returns 5 rows; chunk queries return them
		const mockTenantDb = createMockTenantDb();
		mockTenantDb.query.auditLogs.findMany
			.mockResolvedValueOnce(rows.map((r) => ({ id: r.id }))) // count
			.mockResolvedValueOnce(rows); // first chunk

		const cpDb = makeControlPanelDb([]);

		const { exportAuditCsv } = await import(
			"@avantej-core/services/audit-log.service"
		);

		const result = await exportAuditCsv(cpDb as any, mockTenantDb, {
			accessibleNodeIds: ["branch-1"],
		});

		expect(result.truncated).toBe(false);
		expect(result.totalMatching).toBe(5);
		// CSV starts with headers
		expect(result.csv).toContain("id,actorUserId");
	});

	test("sets truncated=true and totalMatching > 50_000 when capped", async () => {
		// Simulate 50_001 total rows in count query
		const countRows = Array.from({ length: 50_001 }, () => ({
			id: randomUUID(),
		}));

		const mockTenantDb = createMockTenantDb();
		// First call is the count query
		mockTenantDb.query.auditLogs.findMany.mockResolvedValueOnce(countRows);

		// Subsequent chunk calls return empty (we only want to verify truncation flag)
		// The while loop reads effectiveCap=50_000 chunks; to keep test fast,
		// we return empty on the first chunk call so the loop exits immediately.
		mockTenantDb.query.auditLogs.findMany.mockResolvedValue([]);

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
		mockTenantDb.query.auditLogs.findMany.mockResolvedValue([]);

		const cpDb = makeControlPanelDb([]);

		const { exportAuditCsv } = await import(
			"@avantej-core/services/audit-log.service"
		);

		const result = await exportAuditCsv(cpDb as any, mockTenantDb, {
			accessibleNodeIds: [],
		});

		const firstLine = result.csv.split("\n")[0];
		expect(firstLine).toBe(
			"id,actorUserId,actorName,actorInitials,actorMemberId,actorRole,action,entityType,entityId,branchId,summary,ipAddress,createdAt",
		);
	});
});

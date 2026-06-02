/**
 * Tenant Deletion Service — Unit Tests (ADR-0026 / GDPR).
 *
 * This is the most irreversible surface in the app: the `0 3 * * *` sweeper
 * drops Neon projects and deletes organization rows. The invariants that keep
 * it from destroying the wrong data:
 *
 *   - grace window is exactly SOFT_DELETE_GRACE_DAYS from request time
 *   - requestTenantDeletion refuses a second open request (CONFLICT) and an
 *     unknown org (NOT_FOUND)
 *   - the sweep is FAIL-SOFT: one org whose Neon drop throws must NOT be
 *     deleted, must NOT block the others, and must be reported as an error
 *   - a missing Neon key for an org WITH a project aborts that org's delete
 *     (never orphan a half-deleted tenant)
 *   - stamp hard_deleted_at BEFORE deleting the org row
 *
 * The service already injects controlPanelDb / deleteNeonProject / now, so no
 * mock.module is needed.
 *
 * Run: bun test src/services/tenant-deletion.service.test.ts
 */

import { describe, expect, it } from "bun:test";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { tenantDeletions } from "@avantej-core/db/schema/control-panel/tenant-deletions";
import {
	SOFT_DELETE_GRACE_DAYS,
	hardDeleteOverdueTenants,
	requestTenantDeletion,
	restoreTenantDeletion,
} from "./tenant-deletion.service";

type Row = Record<string, unknown>;

interface Op {
	kind: "insert" | "update" | "delete";
	table: unknown;
	values?: Row;
}

/**
 * Mock controlPanelDb covering exactly the surface the service touches:
 *   - select(...).from(...).where(...)[.limit(n)]  → FIFO from `selects`
 *     (both the awaited and the .limit() forms dequeue once)
 *   - insert(table).values(obj)[.returning(...)]   → records + echoes values
 *   - update(table).set(obj).where(...)            → records
 *   - delete(table).where(...)                     → records
 */
function makeCpDb(selects: (Row[] | Error)[]) {
	const queue = [...selects];
	const ops: Op[] = [];
	let lastInsertValues: Row = {};

	// An Error in the queue simulates a DB failure for that select (rejects).
	const next = (): Promise<Row[]> => {
		const v = queue.shift() ?? [];
		return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
	};

	const selectChain: Record<string, unknown> = {
		from: () => selectChain,
		where: () => selectChain,
		limit: () => next(),
		then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
			next().then(res, rej),
	};

	const db = {
		select: () => selectChain,
		insert: (table: unknown) => ({
			values: (v: Row) => {
				lastInsertValues = v;
				ops.push({ kind: "insert", table, values: v });
				const result = {
					returning: () =>
						Promise.resolve([{ id: "del-1", ...lastInsertValues }]),
					then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
						Promise.resolve(undefined).then(res, rej),
				};
				return result;
			},
		}),
		update: (table: unknown) => ({
			set: (v: Row) => ({
				where: () => {
					ops.push({ kind: "update", table, values: v });
					return Promise.resolve();
				},
			}),
		}),
		delete: (table: unknown) => ({
			where: () => {
				ops.push({ kind: "delete", table });
				return Promise.resolve();
			},
		}),
	} as unknown as never;

	return { db, ops };
}

const FIXED_NOW = new Date("2026-06-01T00:00:00.000Z");

// ---------------------------------------------------------------------------
// requestTenantDeletion
// ---------------------------------------------------------------------------

describe("requestTenantDeletion", () => {
	it("sets hard_delete_after exactly SOFT_DELETE_GRACE_DAYS from now", async () => {
		const { db } = makeCpDb([
			[], // open-deletion check → none
			[{ id: "org-1" }], // org existence
		]);
		const result = await requestTenantDeletion({
			controlPanelDb: db,
			organizationId: "org-1",
			requestedByUserId: "admin-1",
			now: FIXED_NOW,
		});
		const expectedMs =
			FIXED_NOW.getTime() + SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000;
		expect((result.hardDeleteAfter as Date).getTime()).toBe(expectedMs);
	});

	it("flips the organization paymentStatus to cancelled and writes an audit row", async () => {
		const { db, ops } = makeCpDb([[], [{ id: "org-1" }]]);
		await requestTenantDeletion({
			controlPanelDb: db,
			organizationId: "org-1",
			requestedByUserId: "admin-1",
			now: FIXED_NOW,
		});
		const orgUpdate = ops.find(
			(o) => o.kind === "update" && o.table === organizations,
		);
		expect(orgUpdate?.values?.paymentStatus).toBe("cancelled");
		// tenant_deletions insert + admin_session_actions audit insert.
		expect(ops.filter((o) => o.kind === "insert")).toHaveLength(2);
	});

	it("refuses with CONFLICT when an open deletion already exists", async () => {
		const { db, ops } = makeCpDb([[{ id: "existing-del" }]]);
		let caught: unknown;
		try {
			await requestTenantDeletion({
				controlPanelDb: db,
				organizationId: "org-1",
				requestedByUserId: "admin-1",
				now: FIXED_NOW,
			});
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("CONFLICT");
		// No mutation on a refused request.
		expect(ops).toHaveLength(0);
	});

	it("throws NOT_FOUND when the organization does not exist", async () => {
		const { db, ops } = makeCpDb([
			[], // no open deletion
			[], // org lookup → empty
		]);
		let caught: unknown;
		try {
			await requestTenantDeletion({
				controlPanelDb: db,
				organizationId: "ghost",
				requestedByUserId: "admin-1",
				now: FIXED_NOW,
			});
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("NOT_FOUND");
		expect(ops).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// restoreTenantDeletion
// ---------------------------------------------------------------------------

describe("restoreTenantDeletion", () => {
	it("stamps restored_at and reactivates the organization", async () => {
		const { db, ops } = makeCpDb([[{ id: "del-1" }]]);
		const result = await restoreTenantDeletion({
			controlPanelDb: db,
			organizationId: "org-1",
			requestedByUserId: "admin-1",
			now: FIXED_NOW,
		});
		expect(result.id).toBe("del-1");
		const delUpdate = ops.find(
			(o) => o.kind === "update" && o.table === tenantDeletions,
		);
		const orgUpdate = ops.find(
			(o) => o.kind === "update" && o.table === organizations,
		);
		expect(delUpdate?.values?.restoredAt).toEqual(FIXED_NOW);
		expect(orgUpdate?.values?.paymentStatus).toBe("active");
	});

	it("throws NOT_FOUND when there is no open deletion to restore", async () => {
		const { db, ops } = makeCpDb([[]]);
		let caught: unknown;
		try {
			await restoreTenantDeletion({
				controlPanelDb: db,
				organizationId: "org-1",
				requestedByUserId: "admin-1",
				now: FIXED_NOW,
			});
		} catch (e) {
			caught = e;
		}
		expect((caught as { code?: string })?.code).toBe("NOT_FOUND");
		expect(ops).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// hardDeleteOverdueTenants — the irreversible sweeper
// ---------------------------------------------------------------------------

describe("hardDeleteOverdueTenants", () => {
	it("drops the Neon project, stamps, then deletes the org — in that order", async () => {
		const { db, ops } = makeCpDb([
			[{ id: "del-1", organizationId: "org-1" }], // overdue list
			[{ id: "org-1", neonProjectId: "proj-1" }], // per-org lookup
		]);
		const dropped: string[] = [];
		const result = await hardDeleteOverdueTenants({
			controlPanelDb: db,
			deleteNeonProject: async (p) => {
				dropped.push(p);
			},
			now: FIXED_NOW,
		});
		expect(result).toEqual({ scanned: 1, deleted: 1, errors: [] });
		expect(dropped).toEqual(["proj-1"]);
		// stamp (update tenant_deletions) must precede the org delete.
		const stampIdx = ops.findIndex(
			(o) => o.kind === "update" && o.table === tenantDeletions,
		);
		const deleteIdx = ops.findIndex(
			(o) => o.kind === "delete" && o.table === organizations,
		);
		expect(stampIdx).toBeGreaterThanOrEqual(0);
		expect(deleteIdx).toBeGreaterThan(stampIdx);
	});

	it("deletes an org that has no Neon project without attempting a drop", async () => {
		const { db, ops } = makeCpDb([
			[{ id: "del-1", organizationId: "org-1" }],
			[{ id: "org-1", neonProjectId: null }],
		]);
		let dropCalls = 0;
		const result = await hardDeleteOverdueTenants({
			controlPanelDb: db,
			deleteNeonProject: async () => {
				dropCalls += 1;
			},
			now: FIXED_NOW,
		});
		expect(dropCalls).toBe(0);
		expect(result.deleted).toBe(1);
		expect(
			ops.some((o) => o.kind === "delete" && o.table === organizations),
		).toBe(true);
	});

	it("is fail-soft: a failed Neon drop skips that org's delete but processes the rest", async () => {
		const { db, ops } = makeCpDb([
			[
				{ id: "del-1", organizationId: "org-A" },
				{ id: "del-2", organizationId: "org-B" },
			],
			[{ id: "org-A", neonProjectId: "proj-A" }],
			[{ id: "org-B", neonProjectId: "proj-B" }],
		]);
		const result = await hardDeleteOverdueTenants({
			controlPanelDb: db,
			deleteNeonProject: async (p) => {
				if (p === "proj-A") throw new Error("neon drop failed");
			},
			now: FIXED_NOW,
		});
		expect(result.scanned).toBe(2);
		expect(result.deleted).toBe(1);
		expect(result.errors).toEqual([
			{ organizationId: "org-A", error: "neon drop failed" },
		]);
		// Exactly one org delete (org-B). org-A must NOT have been deleted.
		expect(
			ops.filter((o) => o.kind === "delete" && o.table === organizations),
		).toHaveLength(1);
	});

	it("aborts an org's delete when it has a Neon project but no key/dropper is provided", async () => {
		const { db, ops } = makeCpDb([
			[{ id: "del-1", organizationId: "org-1" }],
			[{ id: "org-1", neonProjectId: "proj-1" }],
		]);
		const result = await hardDeleteOverdueTenants({
			controlPanelDb: db,
			// no deleteNeonProject, no neonApiKey
			now: FIXED_NOW,
		});
		expect(result.deleted).toBe(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]?.error).toContain("NEON_API_KEY");
		// Never delete the org row if we couldn't drop its data project.
		expect(
			ops.some((o) => o.kind === "delete" && o.table === organizations),
		).toBe(false);
	});

	it("stamps and counts an orphan deletion row whose org is already gone, without a Neon drop", async () => {
		// Edge: the organization row was removed out-of-band, so the per-org
		// lookup returns []. The sweeper stamps hard_deleted_at and counts it as
		// deleted, but performs NO Neon drop and NO org delete. (Latent risk: a
		// Neon project orphaned by that out-of-band deletion would never be
		// cleaned here — pinned so the behavior is visible, not accidental.)
		const { db, ops } = makeCpDb([
			[{ id: "del-1", organizationId: "org-gone" }],
			[], // org lookup → already gone
		]);
		let dropCalls = 0;
		const result = await hardDeleteOverdueTenants({
			controlPanelDb: db,
			deleteNeonProject: async () => {
				dropCalls += 1;
			},
			now: FIXED_NOW,
		});
		expect(result).toEqual({ scanned: 1, deleted: 1, errors: [] });
		expect(dropCalls).toBe(0);
		expect(
			ops.some((o) => o.kind === "update" && o.table === tenantDeletions),
		).toBe(true);
		expect(
			ops.some((o) => o.kind === "delete" && o.table === organizations),
		).toBe(false);
	});

	it("is fail-soft on a mid-sweep DB error, not just Neon failures", async () => {
		// org-A's per-org SELECT throws a DB error; org-B must still be processed.
		const { db, ops } = makeCpDb([
			[
				{ id: "del-1", organizationId: "org-A" },
				{ id: "del-2", organizationId: "org-B" },
			],
			new Error("connection reset"), // org-A lookup fails
			[{ id: "org-B", neonProjectId: null }], // org-B lookup ok
		]);
		const result = await hardDeleteOverdueTenants({
			controlPanelDb: db,
			deleteNeonProject: async () => {},
			now: FIXED_NOW,
		});
		expect(result.scanned).toBe(2);
		expect(result.deleted).toBe(1);
		expect(result.errors).toEqual([
			{ organizationId: "org-A", error: "connection reset" },
		]);
		expect(
			ops.filter((o) => o.kind === "delete" && o.table === organizations),
		).toHaveLength(1);
	});

	it("returns an empty result when nothing is overdue", async () => {
		const { db, ops } = makeCpDb([[]]);
		const result = await hardDeleteOverdueTenants({
			controlPanelDb: db,
			deleteNeonProject: async () => {},
			now: FIXED_NOW,
		});
		expect(result).toEqual({ scanned: 0, deleted: 0, errors: [] });
		expect(ops).toHaveLength(0);
	});
});

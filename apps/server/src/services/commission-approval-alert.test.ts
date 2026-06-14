/**
 * Plan 2 / Job 1 — commission approval-alert sweep.
 *
 * Drives the multi-tenant loop with stub control-panel + tenant DBs. The two agg
 * queries (pending + pending_review), members.findMany, notifications.findFirst
 * (dedupe) and insert are all stubbed so we assert the digest-creation logic
 * without a real DB.
 */

import { describe, expect, it, mock } from "bun:test";

// biome-ignore lint/suspicious/noExplicitAny: test stubs
type AnyDb = any;

type Agg = { count: number; totalCents: number };
const ZERO: Agg = { count: 0, totalCents: 0 };

function makeCpDb(orgs: AnyDb[]): AnyDb {
	return {
		select: () => ({
			from: () => ({ where: () => Promise.resolve(orgs) }),
		}),
	};
}

function makeTenantDb(opts: {
	/** Resolved in order: [0] pending agg, [1] pending_review agg. */
	pendingAgg?: Agg;
	reviewAgg?: Agg;
	admins?: { userId: string }[];
	/** Per-admin dedupe results, in admin order: null = none, {id} = existing. */
	findFirstQueue?: (AnyDb | null)[];
}): AnyDb {
	const inserted: AnyDb[] = [];
	const aggs: Agg[] = [opts.pendingAgg ?? ZERO, opts.reviewAgg ?? ZERO];
	let selIdx = 0;
	let ffIdx = 0;
	const db: AnyDb = {
		__inserted: inserted,
		select: () => ({
			from: () => ({
				where: () => Promise.resolve([aggs[selIdx++] ?? ZERO]),
			}),
		}),
		query: {
			members: { findMany: () => Promise.resolve(opts.admins ?? []) },
			notifications: {
				findFirst: () =>
					Promise.resolve((opts.findFirstQueue ?? [])[ffIdx++] ?? null),
			},
		},
		insert: () => ({
			values: (row: AnyDb) => {
				inserted.push(row);
				return Promise.resolve();
			},
		}),
	};
	return db;
}

const NOW = new Date("2026-06-13T09:00:00.000Z");

describe("runCommissionApprovalAlert", () => {
	it("returns a zero report when there are no active orgs", async () => {
		const cpDb = makeCpDb([]);
		const getTenantDb = mock(() => Promise.resolve(makeTenantDb({})));

		const { runCommissionApprovalAlert } = await import(
			"./commission-approval-alert.service"
		);
		const report = await runCommissionApprovalAlert({
			controlPanelDb: cpDb,
			getTenantDb,
			now: NOW,
		});

		expect(report.orgsScanned).toBe(0);
		expect(report.notificationsCreated).toBe(0);
	});

	it("creates one digest per admin when stale pending splits exist", async () => {
		const tenantDb = makeTenantDb({
			pendingAgg: { count: 5, totalCents: 42100 },
			admins: [{ userId: "admin-1" }, { userId: "admin-2" }],
			findFirstQueue: [null, null],
		});
		const cpDb = makeCpDb([{ id: "org-1", name: "Gym" }]);
		const getTenantDb = mock(() => Promise.resolve(tenantDb));

		const { runCommissionApprovalAlert } = await import(
			"./commission-approval-alert.service"
		);
		const report = await runCommissionApprovalAlert({
			controlPanelDb: cpDb,
			getTenantDb,
			now: NOW,
		});

		expect(report.orgsScanned).toBe(1);
		expect(report.orgsWithBacklog).toBe(1);
		expect(report.notificationsCreated).toBe(2);
		expect(tenantDb.__inserted).toHaveLength(2);
		expect(tenantDb.__inserted[0].type).toBe("commission_pending_digest");
		expect(tenantDb.__inserted[0].userId).toBe("admin-1");
		expect(tenantDb.__inserted[0].message).toContain("RM 421.00");
		expect(tenantDb.__inserted[0].message).toContain("5 commission splits");
		// points to the approval surface (All), not the review surface
		expect(tenantDb.__inserted[0].message).toContain("All (Pending filter)");
	});

	it("surfaces a pending_review backlog pointing to the Review queue", async () => {
		const tenantDb = makeTenantDb({
			reviewAgg: { count: 3, totalCents: 60000 },
			admins: [{ userId: "admin-1" }],
			findFirstQueue: [null],
		});
		const cpDb = makeCpDb([{ id: "org-1", name: "Gym" }]);
		const getTenantDb = mock(() => Promise.resolve(tenantDb));

		const { runCommissionApprovalAlert } = await import(
			"./commission-approval-alert.service"
		);
		const report = await runCommissionApprovalAlert({
			controlPanelDb: cpDb,
			getTenantDb,
			now: NOW,
		});

		expect(report.orgsWithBacklog).toBe(1);
		expect(report.notificationsCreated).toBe(1);
		const msg = tenantDb.__inserted[0].message as string;
		expect(msg).toContain("3 manual adjustments");
		expect(msg).toContain("RM 600.00");
		expect(msg).toContain("Review");
	});

	it("dedupes — skips an admin who already has an unread digest", async () => {
		const tenantDb = makeTenantDb({
			pendingAgg: { count: 2, totalCents: 5000 },
			admins: [{ userId: "admin-1" }, { userId: "admin-2" }],
			findFirstQueue: [{ id: "existing" }, null],
		});
		const cpDb = makeCpDb([{ id: "org-1", name: "Gym" }]);
		const getTenantDb = mock(() => Promise.resolve(tenantDb));

		const { runCommissionApprovalAlert } = await import(
			"./commission-approval-alert.service"
		);
		const report = await runCommissionApprovalAlert({
			controlPanelDb: cpDb,
			getTenantDb,
			now: NOW,
		});

		expect(report.notificationsCreated).toBe(1);
		expect(tenantDb.__inserted).toHaveLength(1);
		expect(tenantDb.__inserted[0].userId).toBe("admin-2");
	});

	it("does nothing for an org with no backlog at all", async () => {
		const tenantDb = makeTenantDb({
			pendingAgg: ZERO,
			reviewAgg: ZERO,
			admins: [{ userId: "admin-1" }],
		});
		const cpDb = makeCpDb([{ id: "org-1", name: "Gym" }]);
		const getTenantDb = mock(() => Promise.resolve(tenantDb));

		const { runCommissionApprovalAlert } = await import(
			"./commission-approval-alert.service"
		);
		const report = await runCommissionApprovalAlert({
			controlPanelDb: cpDb,
			getTenantDb,
			now: NOW,
		});

		expect(report.orgsWithBacklog).toBe(0);
		expect(report.notificationsCreated).toBe(0);
		expect(tenantDb.__inserted).toHaveLength(0);
	});

	it("a per-org failure does not kill the batch", async () => {
		const goodDb = makeTenantDb({
			pendingAgg: { count: 1, totalCents: 1000 },
			admins: [{ userId: "admin-x" }],
			findFirstQueue: [null],
		});
		const cpDb = makeCpDb([
			{ id: "org-bad", name: "Bad" },
			{ id: "org-good", name: "Good" },
		]);
		const getTenantDb = mock((orgId: string) =>
			orgId === "org-bad"
				? Promise.reject(new Error("tenant DB down"))
				: Promise.resolve(goodDb),
		);

		const { runCommissionApprovalAlert } = await import(
			"./commission-approval-alert.service"
		);
		const report = await runCommissionApprovalAlert({
			controlPanelDb: cpDb,
			getTenantDb,
			now: NOW,
		});

		expect(report.orgsScanned).toBe(2);
		expect(report.errors).toBe(1);
		expect(report.notificationsCreated).toBe(1);
	});
});

/**
 * Plan 2 / Job 1 — commission approval-alert sweep.
 *
 * Drives the multi-tenant loop with stub control-panel + tenant DBs. The agg
 * query, members.findMany, notifications.findFirst (dedupe) and insert are all
 * stubbed so we assert the digest-creation logic without a real DB.
 */

import { describe, expect, it, mock } from "bun:test";

// biome-ignore lint/suspicious/noExplicitAny: test stubs
type AnyDb = any;

function makeCpDb(orgs: AnyDb[]): AnyDb {
	return {
		select: () => ({
			from: () => ({ where: () => Promise.resolve(orgs) }),
		}),
	};
}

function makeTenantDb(opts: {
	agg: { count: number; totalCents: number };
	admins?: { userId: string }[];
	/** Per-admin dedupe results, in admin order: null = none, {id} = existing. */
	findFirstQueue?: (AnyDb | null)[];
}): AnyDb {
	const inserted: AnyDb[] = [];
	let ffIdx = 0;
	const db: AnyDb = {
		__inserted: inserted,
		select: () => ({
			from: () => ({ where: () => Promise.resolve([opts.agg]) }),
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
		const getTenantDb = mock(() =>
			Promise.resolve(makeTenantDb({ agg: { count: 0, totalCents: 0 } })),
		);

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
			agg: { count: 5, totalCents: 42100 },
			admins: [{ userId: "admin-1" }, { userId: "admin-2" }],
			findFirstQueue: [null, null], // neither has an outstanding digest
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
		expect(report.orgsWithStalePending).toBe(1);
		expect(report.notificationsCreated).toBe(2);
		expect(tenantDb.__inserted).toHaveLength(2);
		expect(tenantDb.__inserted[0].type).toBe("commission_pending_digest");
		expect(tenantDb.__inserted[0].userId).toBe("admin-1");
		// RM amount + count surfaced in the message
		expect(tenantDb.__inserted[0].message).toContain("RM 421.00");
		expect(tenantDb.__inserted[0].message).toContain("5 commission splits");
	});

	it("dedupes — skips an admin who already has an unread digest", async () => {
		const tenantDb = makeTenantDb({
			agg: { count: 2, totalCents: 5000 },
			admins: [{ userId: "admin-1" }, { userId: "admin-2" }],
			findFirstQueue: [{ id: "existing" }, null], // admin-1 already notified
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

		// Only admin-2 gets a fresh digest.
		expect(report.notificationsCreated).toBe(1);
		expect(tenantDb.__inserted).toHaveLength(1);
		expect(tenantDb.__inserted[0].userId).toBe("admin-2");
	});

	it("does nothing for an org with no stale pending splits", async () => {
		const tenantDb = makeTenantDb({
			agg: { count: 0, totalCents: 0 },
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

		expect(report.orgsWithStalePending).toBe(0);
		expect(report.notificationsCreated).toBe(0);
		expect(tenantDb.__inserted).toHaveLength(0);
	});

	it("a per-org failure does not kill the batch", async () => {
		const goodDb = makeTenantDb({
			agg: { count: 1, totalCents: 1000 },
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

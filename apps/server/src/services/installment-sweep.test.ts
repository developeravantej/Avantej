/**
 * Phase 8.1 — installment sweep service.
 *
 * Mocks @avantej-core/services so `evaluateAndLockIfOverdue` is controlled,
 * then drives the multi-tenant loop with stub control-panel and tenant DBs.
 */

import { describe, expect, it, mock } from "bun:test";

// biome-ignore lint/suspicious/noExplicitAny: test stubs
type AnyDb = any;

const mockEvaluate = mock((_db: AnyDb, _id: string) =>
	Promise.resolve({ id: "pkg-1", isLocked: true } as AnyDb),
);

mock.module("@avantej-core/services", () => ({
	evaluateAndLockIfOverdue: mockEvaluate,
}));

function makeCpDb(orgs: AnyDb[]): AnyDb {
	return {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(orgs),
			}),
		}),
	};
}

function makeTenantDb(candidates: AnyDb[]): AnyDb {
	return {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(candidates),
			}),
		}),
	};
}

describe("runInstallmentSweep", () => {
	it("returns a zero-row report when there are no active orgs", async () => {
		mockEvaluate.mockClear();
		const cpDb = makeCpDb([]);
		const getTenantDb = mock(() => Promise.resolve(makeTenantDb([])));

		const { runInstallmentSweep } = await import("./installment-sweep.service");
		const report = await runInstallmentSweep({
			controlPanelDb: cpDb,
			getTenantDb,
		});

		expect(report.orgsScanned).toBe(0);
		expect(report.candidatesFound).toBe(0);
		expect(report.locked).toBe(0);
		expect(report.errors).toBe(0);
		expect(mockEvaluate).not.toHaveBeenCalled();
	});

	it("evaluates each candidate and counts locks", async () => {
		mockEvaluate.mockClear();
		mockEvaluate.mockImplementation((_db, id: string) =>
			Promise.resolve({ id, isLocked: true } as AnyDb),
		);

		const cpDb = makeCpDb([{ id: "org-1", name: "Test Gym" }]);
		const tenantDb = makeTenantDb([
			{ id: "pkg-a" },
			{ id: "pkg-b" },
			{ id: "pkg-c" },
		]);
		const getTenantDb = mock(() => Promise.resolve(tenantDb));

		const { runInstallmentSweep } = await import("./installment-sweep.service");
		const report = await runInstallmentSweep({
			controlPanelDb: cpDb,
			getTenantDb,
		});

		expect(report.orgsScanned).toBe(1);
		expect(report.candidatesFound).toBe(3);
		expect(report.locked).toBe(3);
		expect(report.skipped).toBe(0);
		expect(mockEvaluate).toHaveBeenCalledTimes(3);
	});

	it("does not let a per-row evaluator failure kill the org loop", async () => {
		mockEvaluate.mockClear();
		mockEvaluate.mockImplementation((_db, id: string) => {
			if (id === "bad") return Promise.reject(new Error("evaluate failed"));
			return Promise.resolve({ id, isLocked: true } as AnyDb);
		});

		const cpDb = makeCpDb([{ id: "org-1", name: "Test Gym" }]);
		const tenantDb = makeTenantDb([
			{ id: "ok-1" },
			{ id: "bad" },
			{ id: "ok-2" },
		]);
		const getTenantDb = mock(() => Promise.resolve(tenantDb));

		const { runInstallmentSweep } = await import("./installment-sweep.service");
		const report = await runInstallmentSweep({
			controlPanelDb: cpDb,
			getTenantDb,
		});

		expect(report.orgsScanned).toBe(1);
		expect(report.candidatesFound).toBe(3);
		expect(report.locked).toBe(2);
		expect(report.errors).toBe(1);
	});
});
